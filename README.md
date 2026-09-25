# Cloud File Service

Spring Boot, PostgreSQL, Amazon S3, React로 만든 **Google Drive 스타일 개인 클라우드 드라이브**입니다. 회원마다 자신만의 드라이브를 가지며, Docker Compose · Kubernetes(kind/EKS) · ECS Fargate · Terraform · GitHub Actions로 로컬 개발부터 AWS 배포까지 단계별로 구성했습니다.

파일 내용은 S3에, 파일명·크기·폴더 구조·소유자·휴지통 상태 같은 metadata는 PostgreSQL에 저장합니다. 모든 API는 JWT로 인증하고, 사용자는 자기 파일과 폴더에만 접근할 수 있습니다.

## 주요 기능

**계정**
- 회원가입, 로그인 (이메일 + 비밀번호, BCrypt 해시, JWT)
- 내 계정: 이름 변경, 비밀번호 변경, 회원 탈퇴 (내 파일 전체 삭제)
- 관리자: 회원 목록(사용량·파일 수), 회원 삭제 — `ADMIN_EMAILS`로 지정한 이메일이 관리자

**드라이브**
- 사용자별 드라이브 (S3 key `users/{userId}/files/{uuid}`, 남의 리소스는 404)
- 폴더 생성·이름 변경·이동(순환 방지)·경로(breadcrumb)
- 파일 업로드(여러 개, 드래그 & 드롭, 진행률) · 다운로드(한글 파일명) · 미리보기(이미지/PDF/동영상/오디오/텍스트)
- 이름 변경, 이동, 중요 표시(즐겨찾기)
- 휴지통: 폴더째 이동, 복원, 영구 삭제, 휴지통 비우기
- 검색, 최근 문서함, 저장 용량 표시(기본 1GB/사용자)

**UI**
- 목록/바둑판 보기, 정렬, 우클릭 메뉴, 토스트, 확인 창
- 해시 라우팅으로 새로고침해도 현재 폴더 유지 (`#/folders/12`)
- 라이트/다크 모드, 모바일 반응형

**인프라**
- Docker Compose 로컬 실행, Kubernetes(kind / 선택: EKS) 배포
- Terraform: VPC, RDS, S3, ECR, ECS Fargate, Secrets Manager(DB 비밀번호, JWT 키), 선택적 EKS(`enable_eks`)
- GitHub Actions: Backend CI(테스트), ECR 이미지 빌드·푸시

## 아키텍처

```text
Browser (React + Vite, JWT는 localStorage)
   │  Authorization: Bearer <JWT>
   ▼
Spring Boot API :8080  ── Spring Security (JWT 검증, 소유자 확인)
   ├── PostgreSQL   users / folders / files (metadata, 소유자, 휴지통)
   └── Amazon S3    users/{userId}/files/{uuid} (파일 내용)

실행 환경
- 로컬 개발 : Vite(5173) ─proxy /api→ bootRun(8080) 또는 kind port-forward(8080)
- Compose   : Nginx(80) → backend(18080) → PostgreSQL(5432)
- kind/EKS  : Deployment(2 Pod) + Service, Secret/ConfigMap으로 설정 주입
- AWS       : ECS Fargate + RDS + S3 (Terraform), 이미지: ECR
```

## 디렉터리 구조

```text
.
├── backend/                 # Spring Boot API (Java 25, Spring Boot 4)
│   └── src/main/java/com/example/backend/
│       ├── config/          # Security, S3
│       ├── security/        # JWT 발급·검증, 현재 사용자
│       ├── controller/      # Auth, User, Admin, File, Folder, Drive
│       ├── service/         # 비즈니스 로직 (소유권, 휴지통, 용량)
│       ├── entity/          # User, Folder, File
│       └── storage/         # S3StorageService
├── frontend/                # React 19 + Vite UI (api/, hooks/, components/, pages/)
├── nginx/nginx.conf         # Compose용 reverse proxy
├── docker-compose.yml       # Backend, Nginx, PostgreSQL
├── Dockerfile               # Backend 이미지 (multi-stage)
├── infra/terraform/         # AWS 인프라 (ECS, RDS, S3, ECR, EKS 선택)
├── infra/*.json             # Day 4 수동 ECS 배포용 예시
├── k8s/                     # Namespace, ConfigMap, Secret 예시, Deployment(kind/EKS), Service, HPA, Ingress
├── .github/workflows/       # backend-ci.yml, backend-deploy.yml
└── md/                      # 단계별 학습 문서 (Day 1 ~ Day 7.5)
```

## 사전 요구사항

- Docker Engine / Docker Compose v2, Git
- Java 25, Node.js 22 이상, npm
- PostgreSQL 16 (Compose의 `postgres` 서비스 사용 가능)
- 파일 업로드 테스트용 AWS credential과 S3 bucket (credential은 코드·문서에 기록하지 않고 AWS profile 또는 IAM role 사용)
- (선택) kind, kubectl, Terraform, AWS CLI

## 빠른 시작 (로컬 개발)

```bash
# 1. PostgreSQL
docker compose up -d postgres

# 2. Backend (터미널 1)
export AWS_REGION=ap-northeast-2
export S3_BUCKET=<your-bucket>
cd backend
./gradlew bootRun            # http://localhost:8080

# 3. Frontend (터미널 2)
cd frontend
cp .env.example .env.local   # VITE_API_TARGET=http://localhost:8080
npm install
npm run dev -- --host 0.0.0.0   # http://localhost:5173
```

브라우저에서 `http://localhost:5173`을 열고 **회원가입** 후 사용합니다. 관리자 계정이 필요하면 Backend 실행 전에 `export ADMIN_EMAILS=you@example.com`을 설정하고 그 이메일로 가입합니다.

## 환경변수 (Backend)

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `DB_URL` / `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/cloud_file` | PostgreSQL JDBC URL |
| `DB_USERNAME` / `SPRING_DATASOURCE_USERNAME` | `cloud_user` | DB 사용자 |
| `DB_PASSWORD` / `SPRING_DATASOURCE_PASSWORD` | `cloud_password` | DB 비밀번호 |
| `AWS_REGION` | `ap-northeast-2` | AWS 리전 |
| `S3_BUCKET` | `local-cloud-file-service` | 파일 저장 bucket |
| `JWT_SECRET` | 개발 전용 값 | **운영 필수.** JWT 서명 키(32바이트 이상, 예: `openssl rand -hex 32`) |
| `JWT_EXPIRATION_MINUTES` | `1440` | 로그인 유지 시간(분) |
| `ADMIN_EMAILS` | (빈 값) | 관리자 이메일(쉼표 구분). 권한 변경은 다시 로그인해야 반영 |
| `STORAGE_LIMIT_BYTES` | `1073741824` | 사용자별 저장 용량(1GB) |

업로드 최대 크기는 파일당 50MB입니다.

## Docker Compose

```bash
docker compose up --build -d   # Nginx http://localhost, Backend http://localhost:18080
docker compose ps
docker compose logs -f cloud-file-service
docker compose down            # -v 는 DB 데이터까지 삭제하므로 주의
```

## Kubernetes (kind)

```bash
kind create cluster --name cloud-file-service
docker build -t cloud-file-service:latest .
kind load docker-image cloud-file-service:latest --name cloud-file-service

kubectl apply -f k8s/namespace.yaml -f k8s/configmap.yaml
# Secret: DB_*, JWT_SECRET, (kind 전용) AWS 키 — 자세한 방법은 Day 7 §13, Day 7.5 참고
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml
kubectl port-forward -n cloud-file-service svc/cloud-file-service 8080:8080
```

GitHub Codespaces에서는 kind Pod의 외부 통신(S3 등)을 위해 `iptables-legacy` 허용 규칙이 필요합니다 — [Day 7 §6-1](md/Cloud_File_Service_Day7_GitHub_Codespaces_DETAILED.md#6-1-codespaces에서-kind-pod의-외부-통신-열기-필수).

## API 요약

`/api/auth/signup`, `/api/auth/login`, `/health`, `/actuator/health`를 제외한 모든 API는 `Authorization: Bearer <JWT>`가 필요합니다. 오류 응답은 `{"message": "..."}` 형식입니다.

| 영역 | Method · Path | 설명 |
|---|---|---|
| 인증 | `POST /api/auth/signup` · `POST /api/auth/login` · `GET /api/auth/me` | 가입/로그인(토큰 발급), 내 정보 |
| 계정 | `PATCH /api/users/me` · `PATCH /api/users/me/password` · `DELETE /api/users/me` | 이름·비밀번호 변경, 탈퇴 |
| 관리자 | `GET /api/admin/users` · `DELETE /api/admin/users/{id}` | 회원 목록·삭제 (ADMIN) |
| 파일 | `GET /api/files?folderId=` · `POST /api/files` (multipart `file`, `folderId`) | 목록, 업로드 |
| 파일 | `GET /api/files/{id}/download` · `GET /api/files/{id}/preview` | 다운로드, 미리보기 |
| 파일 | `PATCH /api/files/{id}/rename?name=` · `/move?folderId=` · `/star?starred=` | 이름·위치·중요 표시 |
| 파일 | `DELETE /api/files/{id}` | 휴지통으로 이동 |
| 폴더 | `GET /api/folders?parentFolderId=` · `POST /api/folders` · `GET /api/folders/{id}` | 목록, 생성, 조회 |
| 폴더 | `GET /api/folders/{id}/path` · `GET /api/folders/tree` | 경로(breadcrumb), 전체 트리 |
| 폴더 | `PATCH /api/folders/{id}` · `/move?parentFolderId=` · `/star?starred=` · `DELETE /api/folders/{id}` | 이름·이동·중요·휴지통 |
| 드라이브 | `GET /api/drive/search?q=` · `/recent` · `/starred` · `/storage` | 검색, 최근, 중요, 용량 |
| 휴지통 | `GET /api/drive/trash` · `POST /api/drive/trash/{files\|folders}/{id}/restore` | 목록, 복원 |
| 휴지통 | `DELETE /api/drive/trash/{files\|folders}/{id}` · `DELETE /api/drive/trash` | 영구 삭제, 비우기 |

전체 요청/응답 형식은 [Day 7.5 문서](md/Cloud_File_Service_Day7_5_GitHub_Codespaces_DETAILED.md)를 참고하세요.

## AWS (Terraform)

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # db_password 등 입력 (Git에 올라가지 않음)
terraform init
terraform plan
terraform apply
```

- JWT 서명 키는 Terraform이 무작위로 생성해 Secrets Manager에 저장하고 ECS Task에 `JWT_SECRET`으로 주입합니다.
- 관리자 이메일: `terraform.tfvars`에 `admin_emails = "you@example.com"`.
- EKS는 비용이 크므로 기본으로 만들지 않습니다. `enable_eks = true`로 켜고, `false`로 되돌려 apply하면 삭제됩니다 — [Day 7 §48-1](md/Cloud_File_Service_Day7_GitHub_Codespaces_DETAILED.md#48-1-선택-eks에-배포하기).
- 사용하지 않을 때는 비용이 계속 나가므로 `terraform destroy`로 정리합니다(S3 bucket은 먼저 비워야 함).

## 테스트 및 검증

```bash
docker compose up -d postgres     # Backend 테스트는 PostgreSQL이 필요
cd backend && ./gradlew clean build

cd ../frontend && npm run lint && npm run build
```

GitHub Actions `Backend CI`가 `main` push/PR마다 PostgreSQL 서비스와 함께 테스트를 실행하고, `Backend Docker Build`가 ECR로 이미지를 push합니다(GitHub Secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` 필요).

## 보안 주의사항

- AWS 키, DB 비밀번호, `JWT_SECRET`을 코드·README·문서·Git에 기록하지 않습니다. `k8s/secret.yaml`, `terraform.tfvars`, `*.tfstate`는 `.gitignore` 대상입니다.
- 운영에서는 반드시 `JWT_SECRET`을 주입합니다. 기본값은 개발 전용이며, 키가 바뀌면 기존 로그인 토큰은 모두 무효가 됩니다.
- S3 bucket은 public으로 열지 않고 인증된 Backend를 통해서만 파일을 제공합니다.
- 미리보기는 HTML/SVG 같은 실행 가능한 형식을 텍스트로만 보여줍니다.
- 학습용 public subnet · 8080 공개 규칙은 운영 전에 ALB, private subnet, HTTPS 구조로 바꿉니다.

## 단계별 문서

| Day | 문서 | 내용 |
|---|---|---|
| 1 | [Day 1](md/Cloud_File_Service_Day1_GitHub_Codespaces_ULTRA_DETAILED.md) | Codespaces, Spring Boot REST 기초 |
| 2 | [Day 2](md/Cloud_File_Service_Day2_GitHub_Codespaces_DETAILED.md) | Docker, Nginx, Docker Compose |
| 3 | [Day 3](md/Cloud_File_Service_Day3_GitHub_Codespaces_DETAILED_REBUILT.md) | Amazon S3 연동 |
| 3.5 | [Day 3.5](md/Cloud_File_Service_Day3_5_GitHub_Codespaces_DETAILED.md) | PostgreSQL, 폴더 구조 |
| 4 | [Day 4](md/Cloud_File_Service_Day4_GitHub_Codespaces_DETAILED.md) | ECR, ECS Fargate 수동 배포 |
| 5 | [Day 5](md/Cloud_File_Service_Day5_GitHub_Codespaces_DETAILED.md) | Terraform으로 인프라 코드화 |
| 6 | [Day 6](md/Cloud_File_Service_Day6_GitHub_Codespaces_DETAILED.md) | React Frontend |
| 7 | [Day 7](md/Cloud_File_Service_Day7_GitHub_Codespaces_DETAILED.md) | Kubernetes(kind/EKS), GitHub Actions, 장애 대응 |
| 7.5 | [Day 7.5](md/Cloud_File_Service_Day7_5_GitHub_Codespaces_DETAILED.md) | 로그인·회원 관리, 사용자별 드라이브, 휴지통·검색 등, UI 개편 |

개념만 빠르게 복습하려면 [Day 1~7 개념 정리](md/Cloud_File_Service.md)를 보세요.
