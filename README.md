# Cloud File Service

Spring Boot, PostgreSQL, Amazon S3, React, Docker Compose, Nginx, ECS Fargate와 Terraform을 사용한 클라우드 파일 관리 서비스입니다.

파일 자체는 S3에 저장하고 파일명, 크기, MIME 타입, 폴더 관계와 같은 metadata는 PostgreSQL에 저장합니다. 사용자는 React 화면에서 폴더를 만들고 파일을 업로드·다운로드·이름 변경·이동·삭제할 수 있습니다.

## 주요 기능

- 서비스 health check
- 폴더 생성, 조회, 이름 변경, 삭제
- 파일 업로드와 PostgreSQL metadata 저장
- S3 파일 다운로드
- 파일 목록 조회
- 파일 이름 변경과 폴더 이동
- 파일 삭제 시 S3와 metadata 정리
- Docker Compose 기반 로컬 실행
- Terraform 기반 AWS 인프라 구성

## 아키텍처

```text
Browser
  |
  +-- React + Vite frontend
  |
  +-- Nginx :80
	  |
	  +-- Spring Boot backend :8080
		  |
		  +-- PostgreSQL  (metadata)
		  +-- Amazon S3   (file contents)
```

로컬 Docker Compose에서는 다음 주소를 사용합니다.

| 구성 요소 | 주소 |
|---|---|
| Nginx 및 애플리케이션 진입점 | `http://localhost` |
| Backend 직접 접근 | `http://localhost:18080` |
| PostgreSQL | `localhost:5432` |

Nginx는 `/api` 요청을 backend로 전달합니다. Compose의 backend 컨테이너는 호스트의 PostgreSQL에 `host.docker.internal:5432`로 연결합니다.

## 디렉터리 구조

```text
.
├── backend/                 # Spring Boot API
├── frontend/                # React + Vite UI
├── nginx/nginx.conf         # Reverse proxy 설정
├── docker-compose.yml       # Backend, Nginx, PostgreSQL
├── Dockerfile               # Backend 이미지
├── infra/                   # ECS task definition 및 Terraform
├── k8s/                     # Kubernetes 관련 파일
├── observability/           # 관측성 관련 구성
└── md/                      # 단계별 개발 및 학습 문서
```

## 사전 요구사항

로컬 Docker 실행에는 다음 도구가 필요합니다.

- Docker Engine 또는 Docker Desktop
- Docker Compose v2
- Git

Backend와 frontend를 개별 실행하려면 추가로 다음이 필요합니다.

- Java 25 이상
- Node.js 22 이상
- npm
- PostgreSQL 16 또는 접근 가능한 PostgreSQL 인스턴스

파일 업로드까지 테스트하려면 AWS SDK가 사용할 수 있는 credential과 S3 bucket이 필요합니다. credential은 소스 코드나 문서에 기록하지 말고 AWS credential provider chain, 로컬 AWS profile 또는 실행 환경의 IAM role을 사용합니다.

## Docker Compose로 실행

프로젝트 루트에서 실행합니다.

```bash
docker compose up --build
```

실행 후 브라우저에서 `http://localhost`를 엽니다. API health check는 다음과 같이 확인할 수 있습니다.

```bash
curl http://localhost/health
```

주요 관리 명령은 다음과 같습니다.

```bash
# 백그라운드 실행
docker compose up --build -d

# 전체 로그
docker compose logs -f

# Backend 로그
docker compose logs -f cloud-file-service

# 상태 확인
docker compose ps

# 중지
docker compose down

# PostgreSQL volume까지 삭제할 때만 사용
docker compose down -v
```

Compose 설정은 PostgreSQL healthcheck가 통과한 뒤 backend가 시작되도록 구성되어 있습니다. 로컬 기본 설정은 개발 편의를 위한 값이므로 운영 환경에서는 DB 비밀번호와 AWS credential을 반드시 별도 secret 관리 방식으로 변경해야 합니다.

## Backend 개별 실행

PostgreSQL을 먼저 실행하고, backend가 사용할 연결 정보를 환경변수로 설정합니다.

```bash
cd backend
./gradlew test
./gradlew bootRun
```

기본 backend 주소는 `http://localhost:8080`입니다. 주요 설정 환경변수는 다음과 같습니다.

| 환경변수 | 설명 |
|---|---|
| `SPRING_DATASOURCE_URL` | PostgreSQL JDBC URL |
| `SPRING_DATASOURCE_USERNAME` | DB 사용자명 |
| `SPRING_DATASOURCE_PASSWORD` | DB 비밀번호 |
| `AWS_REGION` | AWS 리전 |
| `S3_BUCKET` | 파일을 저장할 S3 bucket 이름 |

예시의 값은 실제 credential이 아닌 실행 환경의 환경변수로 제공해야 합니다.

## Frontend 개별 실행

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Vite 개발 서버는 기본적으로 `http://localhost:5173`에서 실행됩니다. frontend의 `/api` proxy 대상은 `VITE_API_TARGET`으로 지정합니다.

```bash
cd frontend
VITE_API_TARGET=http://localhost:18080 npm run dev -- --host 0.0.0.0
```

프론트엔드 검증과 production build는 다음 명령으로 실행합니다.

```bash
npm run lint
npm run build
```

## API

모든 파일 API는 `/api/files`, 폴더 API는 `/api/folders`를 사용합니다. 현재 구현에는 파일 metadata 단건 조회 endpoint가 없으며, 다운로드 endpoint가 파일 내용을 반환합니다.

### Health

```text
GET /health
```

### Files

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/files` | `file` multipart와 선택적 `folderId`로 업로드 |
| `GET` | `/api/files?folderId={id}` | 폴더의 파일 목록 조회. root는 `folderId` 생략 |
| `GET` | `/api/files/{id}/download` | 파일 다운로드 |
| `PATCH` | `/api/files/{id}/rename?name={name}` | 파일 이름 변경 |
| `PATCH` | `/api/files/{id}/move?folderId={id}` | 파일 이동. root 이동은 `folderId` 생략 |
| `DELETE` | `/api/files/{id}` | 파일 삭제 |

업로드 응답은 파일 ID, 이름, 원본 이름, 크기, content type, folder ID, 생성 시각과 수정 시각을 포함합니다. 파일 크기 제한은 요청 기준 10MB입니다.

### Folders

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/folders` | JSON body의 `name`으로 폴더 생성 |
| `GET` | `/api/folders?parentFolderId={id}` | 하위 폴더 조회. root는 parameter 생략 |
| `PATCH` | `/api/folders/{id}` | JSON body의 `name`으로 이름 변경 |
| `DELETE` | `/api/folders/{id}` | 폴더 삭제 |

## AWS 및 Terraform

`infra/terraform`에는 VPC, subnet, security group, S3, ECR, RDS, ECS, IAM, CloudWatch Logs와 Secrets Manager 구성이 있습니다.

기본 흐름은 다음과 같습니다.

```bash
cd infra/terraform
terraform init
terraform fmt -check
terraform validate
terraform plan
terraform apply
```

배포 전에 `terraform.tfvars`에 필요한 리전, DB 설정, CIDR, 이미지와 secret 관련 변수를 환경에 맞게 제공해야 합니다. 실제 비밀번호, AWS access key, 계정 ID는 문서나 Git에 저장하지 않습니다.

수동 ECS task definition을 사용하는 경우에도 DB 연결 정보와 secret은 placeholder로 작성하고, 운영에서는 Secrets Manager 또는 task role을 사용합니다. 현재 Terraform 경로와 별도 ECS JSON 경로는 리소스 이름과 네트워크 구성이 다를 수 있으므로 두 배포 방식을 한 번에 혼용하지 않습니다.

## 테스트 및 검증

```bash
cd backend
./gradlew test

cd ../frontend
npm run lint
npm run build

cd ..
docker compose config
```

## 보안 주의사항

- AWS access key, secret key, DB password, token을 소스 코드·README·markdown 문서에 기록하지 않습니다.
- 장기 AWS key 대신 로컬 profile 또는 배포 환경의 IAM role을 우선 사용합니다.
- S3 bucket을 public으로 열지 않고 backend를 통해 파일을 제공합니다.
- 운영 환경의 DB password와 secret은 Secrets Manager 등으로 관리합니다.
- Terraform state에는 secret 값이 포함될 수 있으므로 state 파일을 Git에 커밋하지 않고 접근 권한을 제한합니다.
- 초기 테스트 목적의 공인 IP 및 광범위한 inbound 규칙은 운영 전에 private subnet, 제한된 security group, ALB 등의 구조로 변경합니다.

## 단계별 문서

- [Day 1: Spring Boot REST 기초](md/Cloud_File_Service_Day1_GitHub_Codespaces_ULTRA_DETAILED.md)
- [Day 2: Docker와 Nginx](md/Cloud_File_Service_Day2_GitHub_Codespaces_DETAILED.md)
- [Day 3: S3 연동](md/Cloud_File_Service_Day3_GitHub_Codespaces_DETAILED_REBUILT.md)
- [Day 3.5: PostgreSQL과 폴더 기능](md/Cloud_File_Service_Day3_5_GitHub_Codespaces_DETAILED.md)
- [Day 4: ECS 배포](md/Cloud_File_Service_Day4_GitHub_Codespaces_DETAILED.md)
- [Day 5: Terraform 인프라](md/Cloud_File_Service_Day5_GitHub_Codespaces_DETAILED.md)
- [Day 6: React frontend](md/Cloud_File_Service_Day6_GitHub_Codespaces_DETAILED%20(1).md)