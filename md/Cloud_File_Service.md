# Cloud File Service — Day 1~7 개념 정리

> 이 문서는 실습 가이드(Day1~Day7 md)의 **개념과 흐름만** 모은 공부용 요약본이다.
> 코드 대신 "무엇이 왜 존재하고, 요청이 어떻게 흘러가는가"에 집중한다.
> 목표: 이 문서만 보고 **프로젝트 전체 동작을 말로 설명할 수 있는 것**.

---

## 0. 한눈에 보는 프로젝트

### 한 문장

> Google Drive처럼 폴더/파일을 관리하는 서비스로, **파일 내용은 S3**, **폴더 구조와 파일 정보(메타데이터)는 PostgreSQL**에 저장하고, 애플리케이션은 **상태를 갖지 않는(Stateless) 컨테이너**로 만들어 Docker → ECS → Kubernetes 어디에서든 교체·확장할 수 있게 만든 프로젝트.

### 최종 구조

```text
사용자 브라우저
     │
     ▼
React (Vite) 화면  ──── 로그인 후 JWT 토큰을 들고 API 호출
     │
     ▼
Nginx / ALB / Ingress   (외부 입구, 요청 전달)
     │
     ▼
Spring Boot Backend  (Docker Image → ECS Task 또는 Kubernetes Pod 여러 개)
     │
     ├──▶ PostgreSQL (RDS) : 사용자, 폴더 트리, 파일 이름/크기/위치(s3Key)
     └──▶ Amazon S3         : 실제 파일 바이트

개발/배포 흐름
GitHub push → GitHub Actions (테스트, 빌드, Docker Image) → ECR → ECS / Kubernetes
인프라는 Terraform 코드로 생성 (VPC, RDS, S3, ECR, ECS, IAM, EKS)
```

### 7일 로드맵

| Day | 주제 | 핵심 질문 | 결과 |
|---|---|---|---|
| 1 | Spring Boot 기초 | API는 어떻게 요청을 받아 응답하는가? | 메모리에 저장하는 파일 메타데이터 API |
| 2 | Docker + Nginx + Compose | 어디서나 똑같이 실행하려면? | 컨테이너화된 Backend + Reverse Proxy |
| 3 | AWS S3 | 컨테이너가 죽어도 파일이 남으려면? | 실제 파일을 S3에 업로드/다운로드 |
| 3.5 | PostgreSQL + JPA | 폴더 구조·이름·이동은 어디서 관리? | DB(메타데이터) + S3(내용) 분리 구조 |
| 4 | ECR + ECS Fargate | 내 컴퓨터가 아닌 클라우드에서 돌리려면? | AWS에서 실행되는 Backend |
| 5 | Terraform (IaC) | 손으로 만든 인프라를 재현하려면? | 코드로 관리되는 AWS 인프라 |
| 6 | React Frontend | 사용자는 어떻게 쓰는가? | Google Drive 스타일 웹 화면 |
| 7 | Kubernetes + CI/CD + 장애 대응 | 자동 배포·자가 복구·롤백은? | k8s 배포, GitHub Actions, Rollout/Rollback |

### 7일 전체를 관통하는 원칙 3가지

1. **애플리케이션은 상태를 저장하지 않는다 (Stateless).** 파일은 S3, 데이터는 DB. 그래서 컨테이너를 지우고 다시 만들어도, 여러 개 띄워도 문제가 없다.
2. **역할을 분리한다.** Controller(요청) / Service(규칙) / Repository(저장) / Storage(S3). Execution Role / Task Role. ConfigMap / Secret. Terraform(인프라) / Kubernetes YAML(앱 배포).
3. **비밀값은 코드와 Git에 넣지 않는다.** AWS 키, DB 비밀번호, JWT Secret은 환경변수·Secrets Manager·Kubernetes Secret·GitHub Secrets로 주입한다.

---

## Day 1 — Application Foundation (Spring Boot)

### 목표
Codespaces에서 Spring Boot 프로젝트를 만들고, 파일 **메타데이터**(이름, 크기, 상태)를 등록·조회·삭제하는 REST API를 만든다. 저장소는 일단 **메모리**.

### 왜 처음부터 AWS를 안 쓰는가?
기초 없이 클라우드부터 붙이면 에러가 났을 때 "코드 문제인지, 네트워크인지, 권한인지"를 구분할 수 없다. 먼저 로컬에서 **애플리케이션 자체**가 정확히 동작하는지 확인하는 것이 모든 단계의 기반이다.

### 개발 환경
- **GitHub Codespaces**: 브라우저에서 쓰는 클라우드 리눅스 개발 환경. 모두 같은 환경을 쓰므로 "내 컴퓨터에선 되는데" 문제가 줄어든다.
- **Git**: 변경 이력 관리. 작업 단위별로 의미 있는 Commit을 남겨서 되돌릴 수 있게 한다.
- **JDK / JVM**: JDK는 개발 도구(컴파일러 포함), JVM은 Java 바이트코드를 실행하는 가상 머신.
- **Gradle / Gradle Wrapper**: 빌드·의존성 관리 도구. Wrapper(`gradlew`)를 쓰면 누구나 같은 Gradle 버전으로 빌드한다.

### Spring Boot 핵심
- **Spring Boot**: 웹 서버(Tomcat)가 내장된 Java 웹 프레임워크. 실행하면 8080 포트에서 HTTP 요청을 기다린다.
- **@SpringBootApplication**: 이 클래스를 시작점으로 하위 패키지의 컴포넌트를 자동으로 찾아 등록하라는 표시.
- **application.properties**: 포트, DB 주소, 버킷 이름 같은 설정. 값은 환경변수로 덮어쓸 수 있게 만들어 둔다 (나중에 Docker/ECS/k8s에서 주입).

### HTTP 기본
- **메서드**: GET(조회), POST(생성), PATCH(일부 수정), DELETE(삭제).
- **상태 코드**: 200 성공, 201 생성됨, 204 내용 없음(삭제 성공), 400 잘못된 요청, 401 인증 필요, 403 권한 없음, 404 없음, 409 충돌, 500 서버 오류.
- **JSON**: Frontend와 Backend가 데이터를 주고받는 형식.

### 계층 구조 (가장 중요)

```text
요청 → Controller → Service → Repository → 저장소
                ↘ 예외 발생 시 → GlobalExceptionHandler → 에러 JSON 응답
```

| 계층 | 책임 |
|---|---|
| Controller | HTTP 요청을 받고, 입력을 검증하고, 응답 형태(상태 코드)를 정한다 |
| Service | 비즈니스 규칙 (없는 파일이면 예외, 생성 시 상태 지정 등) |
| Repository | 데이터를 저장/조회. Interface로 정의해서 구현(메모리 → DB)을 바꿔 끼울 수 있게 함 |
| Domain / Entity | 시스템이 다루는 핵심 데이터 |
| DTO | 요청/응답 전용 객체. 내부 구조를 외부에 그대로 노출하지 않기 위해 분리 |

### 주요 개념
- **Health API**: 서버가 살아있는지 확인하는 엔드포인트. 나중에 ECS 헬스체크, Kubernetes Probe, 로드밸런서가 이걸 호출한다.
- **메타데이터 vs 파일 내용**: Day 1부터 "파일 내용"과 "파일 정보"를 구분해서 설계한다. 이것이 Day 3.5의 DB+S3 구조로 이어진다.
- **fileName과 objectKey**: 사용자가 보는 이름과 저장소 안의 실제 위치(키)는 다르다. 이름이 바뀌어도 키는 그대로.
- **Enum(FileStatus)**: 정해진 값만 가질 수 있는 타입 (예: 업로드 중, 완료).
- **Record**: 값만 담는 불변 데이터 클래스. DTO에 적합.
- **Validation (@Valid, @NotBlank, @Size, @Positive)**: 잘못된 입력을 Controller 입구에서 막고 400으로 응답.
- **Dependency Injection (생성자 주입)**: 객체가 필요한 부품을 스스로 만들지 않고 Spring이 넣어준다. 테스트하기 쉽고, 필수 의존성이 빠질 수 없다.
- **ConcurrentHashMap / AtomicLong**: 여러 요청이 동시에 와도 안전하게 저장하고 ID를 증가시키는 도구 (In-Memory 저장소용).
- **Optional**: "값이 없을 수도 있음"을 명시적으로 표현. 없으면 404 예외로 연결.
- **GlobalExceptionHandler**: 여러 곳에서 발생한 예외를 한 곳에서 일관된 에러 응답으로 바꾼다.

### 핵심 실험 — In-Memory의 한계
서버를 재시작하면 등록한 데이터가 전부 사라진다. 데이터가 **프로세스 메모리**에 있었기 때문이다.
→ 이 문제가 Day 2(컨테이너 재생성), Day 3(S3), Day 3.5(DB), Day 7(Pod 교체)로 이어지는 **프로젝트 전체의 출발점**이다.

### 설명할 수 있어야 하는 것
- Controller / Service / Repository를 왜 나누는가? → 책임 분리. 저장소를 바꿔도(메모리→DB) Controller는 그대로.
- DTO를 왜 쓰는가? → 외부 API 모양과 내부 데이터 구조를 독립적으로 바꾸기 위해, 민감한 필드를 숨기기 위해.
- 왜 서버 재시작 후 데이터가 사라졌는가? → 메모리에만 있었기 때문.

---

## Day 2 — Docker + Nginx + Docker Compose

### 목표
Backend를 **Docker Image**로 만들고, 앞에 **Nginx(Reverse Proxy)**를 두어 Compose로 함께 실행한다.

### Docker 핵심
- **Image**: 실행에 필요한 모든 것(OS 일부, Java, JAR)을 담은 **읽기 전용 설계도**.
- **Container**: Image를 실행한 **인스턴스**. 지우면 내부 변경 사항은 사라진다.
- **Dockerfile**: Image를 만드는 레시피.
  - FROM: 기반 이미지 (예: Java 런타임)
  - WORKDIR: 작업 폴더
  - COPY: 파일 복사
  - EXPOSE: 앱이 사용하는 포트 표시(문서 역할)
  - ENTRYPOINT: 컨테이너 시작 시 실행할 명령 (JAR 실행)
- **Build Context**: 빌드할 때 Docker에게 보내는 폴더. `.dockerignore`로 불필요/민감 파일을 제외한다.
- **Multi-stage Build**: 1단계(JDK)에서 빌드하고 2단계(JRE)에는 결과물 JAR만 복사. 이미지가 작아지고, 소스코드·빌드 도구가 최종 이미지에 남지 않는다. (이 프로젝트의 루트 Dockerfile이 이 방식)
- **Layer & Build Cache**: Dockerfile 한 줄마다 레이어가 생긴다. 잘 안 바뀌는 것(의존성)을 먼저, 자주 바뀌는 것(소스)을 나중에 복사하면 재빌드가 빠르다.

### 포트와 네트워크
- **포트 매핑 (호스트:컨테이너)**: 외부의 포트를 컨테이너 내부 포트로 연결한다. 연결하지 않으면 컨테이너 밖에서 접근할 수 없다.
- **컨테이너의 localhost ≠ 호스트의 localhost**: 컨테이너 안의 localhost는 그 컨테이너 자신이다. 가장 흔한 실수 포인트.
- **Docker Network / Docker DNS**: 같은 네트워크에 있는 컨테이너끼리는 **서비스 이름**으로 서로를 찾는다 (IP가 바뀌어도 이름은 그대로).

### Nginx / Reverse Proxy
- **Reverse Proxy**: 사용자는 Nginx(80)에만 요청하고, Nginx가 뒤의 Backend(8080)로 전달한다.
- **왜 쓰는가?** Backend를 외부에 직접 노출하지 않음, 입구를 하나로 통일, 나중에 HTTPS·로드밸런싱·정적 파일 서빙 가능.
- **upstream**: 요청을 보낼 뒤쪽 서버 목록.
- **location / proxy_pass**: 어떤 경로의 요청을 어디로 넘길지.
- **Proxy Header (Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto)**: Backend가 원래 요청자의 정보를 알 수 있도록 전달.
- **Volume Mount**: 호스트의 설정 파일(nginx.conf)을 컨테이너 안에 연결.

### Docker Compose
여러 컨테이너(backend, nginx, 이후 postgres)를 **하나의 파일로 정의하고 한 번에 실행**하는 도구.
- **services**: 실행할 컨테이너들.
- **build vs image**: 직접 빌드할지, 만들어진 이미지를 쓸지.
- **ports vs expose**: ports는 외부 공개, expose는 내부 네트워크에만 공개.
- **depends_on (+ healthcheck)**: 시작 순서. DB가 준비된 뒤 Backend 시작.
- **Compose vs Terraform**: Compose는 **로컬에서 컨테이너**를 묶어 실행, Terraform은 **클라우드 인프라**를 생성.

### 장애 실험과 의미
| 실험 | 결과 | 배운 점 |
|---|---|---|
| Backend 중지 | Nginx가 502 Bad Gateway | 입구는 살아있지만 뒤가 죽음 → 계층별로 원인 분리 |
| Nginx 중지 | 연결 자체가 안 됨 | 입구가 죽으면 전체 접근 불가 |
| 잘못된 Backend 주소 | 502 / 연결 실패 | 설정 오류도 장애가 된다 |
| 컨테이너 재생성 | 메모리 데이터 사라짐 | **컨테이너는 언제든 버려질 수 있다 → Stateless 설계 필요** |

### Day 2 이후와의 연결
- Compose의 "여러 컨테이너 묶기" → Kubernetes Deployment/Service의 축소판.
- 컨테이너 재생성 시 데이터 소실 → Day 3에서 S3로 해결.
- 환경변수로 설정 주입 → ECS Task Definition, Kubernetes ConfigMap/Secret과 같은 개념.

---

## Day 3 — AWS S3 (실제 파일 저장)

### 목표
업로드된 파일을 컨테이너 디스크가 아닌 **Amazon S3**에 저장한다.

### S3 핵심 개념
- **Bucket**: 파일을 담는 최상위 컨테이너. 이름은 전 세계에서 유일해야 한다.
- **Object**: 저장된 파일 하나 (내용 + 메타데이터).
- **Object Key**: 버킷 안에서 파일을 찾는 고유한 경로 문자열. 폴더처럼 보이지만 사실 그냥 문자열이다.
- **Region**: 데이터가 저장되는 물리적 위치 (이 프로젝트는 서울 ap-northeast-2).
- **Public Access Block**: 버킷을 외부에 공개하지 않는다. 파일은 항상 **Backend를 거쳐서만** 접근.

### 인증과 권한 (IAM)
- **IAM**: AWS에서 "누가 무엇을 할 수 있는가"를 관리.
- **Credentials**: Access Key / Secret Key. 로컬에서는 `~/.aws/credentials`(프로젝트 폴더 밖)에 둔다. **절대 Git에 올리지 않는다.**
- **AWS SDK의 Credential 탐색 순서**: 환경변수 → 설정 파일 → (클라우드에서는) 역할(Role). 그래서 코드를 바꾸지 않고도 로컬과 ECS에서 모두 동작한다.
- **최소 권한 원칙**: 필요한 동작(PutObject, GetObject, DeleteObject, ListBucket)만 허용.
- **Bucket ARN vs Object ARN**: 버킷 자체에 대한 권한(목록 보기)과 버킷 안 객체에 대한 권한(읽기/쓰기)은 대상이 다르므로 따로 지정한다.

### Spring에서 S3 연결
- **S3Config (@Configuration, @Bean)**: S3 클라이언트를 한 번 만들어 Spring이 관리하게 한다.
- **@Value**: 설정 파일(리전, 버킷 이름)의 값을 코드에 주입.
- **S3StorageService**: S3와의 통신(업로드, 다운로드, 삭제, 존재 확인)만 담당. Controller/Service는 S3의 세부 사항을 몰라도 된다.
- **Content-Type**: 파일 종류(이미지, PDF 등). 다운로드/미리보기 시 브라우저가 올바르게 처리하게 해준다.
- **Multipart**: 파일 업로드 요청 형식. 파일 크기 제한을 설정한다 (현재 50MB).

### 왜 Object Key에 UUID를 쓰는가?
- 같은 이름의 파일이 여러 개 있어도 덮어쓰지 않는다.
- 사용자가 입력한 파일명(`../` 같은 위험 문자)을 저장 경로에 쓰지 않아 보안상 안전하다.
- 이름을 바꿔도 S3 객체를 옮길 필요가 없다.

### 핵심 실험 — 컨테이너 재시작
컨테이너를 지우고 새로 띄워도 S3에 올린 파일은 그대로 다운로드된다.
→ **"컨테이너 = 계산, S3 = 저장"** 분리가 완성된 순간.

### 알아둘 확장 개념
- **Presigned URL**: Backend를 거치지 않고 브라우저가 S3에 직접 올리고/받을 수 있는 임시 URL. 대용량에 유리.
- **Multipart Upload(S3)**: 큰 파일을 조각내 병렬 업로드.

### 자주 만나는 오류
| 오류 | 의미 |
|---|---|
| AccessDenied | 권한(IAM Policy) 부족 |
| Credentials 오류 | 인증 정보를 못 찾음 |
| NoSuchBucket / Region 오류 | 버킷 이름 또는 리전이 틀림 |
| NoSuchKey | 해당 키의 객체가 없음 |

---

## Day 3.5 — PostgreSQL + JPA (진짜 파일 시스템)

### 목표
S3만으로는 "폴더 구조, 이름 변경, 이동, 목록"을 효율적으로 할 수 없다. **PostgreSQL에 메타데이터**를 저장해서 Google Drive 같은 파일 시스템을 만든다.

### 왜 S3만으로 안 되는가?
S3는 "키로 파일을 넣고 꺼내는" 저장소일 뿐이다. 이름 변경은 복사+삭제가 필요하고, 폴더 트리 조회·검색·정렬·사용자별 필터링에 적합하지 않다. 반면 DB는 관계와 조회에 강하다.

### 가장 중요한 그림

```text
PostgreSQL (메타데이터)                    S3 (실제 내용)
┌─────────────────────────┐
│ folders                 │
│  id, name, parent_id ───┼─ 자기 자신을 가리켜 트리 구성
│                         │
│ files                   │
│  id, name, size,        │
│  content_type,          │
│  folder_id,             │
│  s3_key ────────────────┼──────────────▶  객체 (파일 바이트)
└─────────────────────────┘
```

### 핵심 개념
- **JPA / Hibernate**: Java 객체(Entity)를 DB 테이블에 자동으로 매핑. SQL을 직접 쓰지 않고도 저장/조회.
- **Entity**: 테이블과 1:1로 대응하는 클래스 (FolderEntity, FileEntity).
- **ddl-auto=update**: Entity를 보고 테이블을 자동 생성/수정. 개발용으로 편하지만 운영에선 마이그레이션 도구(Flyway 등)를 쓰는 것이 일반적.
- **자기 참조 (parent)**: 폴더가 부모 폴더를 가리킨다. 부모가 없으면(null) 루트 폴더.
- **File ↔ Folder 관계**: 파일은 하나의 폴더에 속한다 (다대일). 폴더가 없으면 루트에 있는 파일.
- **Spring Data Repository의 메서드 이름 쿼리**: "부모 ID로 찾기", "부모가 없는 것 찾기" 같은 메서드 이름만으로 쿼리를 만들어준다.

### 동작 방식 (가장 중요한 변화)
| 동작 | DB | S3 |
|---|---|---|
| 업로드 | 파일 정보 행 추가 (s3Key 포함) | 객체 저장 |
| 목록 / 폴더 이동 탐색 | 조회 | 건드리지 않음 |
| 이름 변경 | name만 수정 | **그대로** |
| 파일 이동 | folder_id만 수정 | **그대로** |
| 다운로드 | s3Key 조회 | 해당 키의 객체 읽기 |
| 삭제 | 행 삭제 (현재는 휴지통 처리) | 객체 삭제 (영구 삭제 시) |

→ **이름 변경과 이동은 DB만 바꾸면 된다.** 이것이 메타데이터 분리의 가장 큰 장점.

### 설계 이슈 (발표에서 나오면 좋은 포인트)
- **DB + S3 정합성 문제**: 업로드는 "S3 저장 → DB 저장" 순서. S3는 성공했는데 DB가 실패하면 S3에 **고아 파일**이 남는다. 개선 방향: 실패 시 S3 삭제(보상 처리), 주기적 정리 작업.
- **폴더 삭제 정책**: 안에 내용이 있는 폴더를 어떻게 처리할지 (현재는 휴지통으로 하위까지 이동).
- **대용량 파일**: Backend 메모리를 거치지 않게 Presigned URL/스트리밍이 필요.
- **409 Conflict**: 같은 위치에 같은 이름 등 규칙 위반 시 응답.

### Docker Compose에서의 DB
PostgreSQL 컨테이너를 Compose에 추가하고, 데이터는 **Volume**에 저장해 컨테이너를 지워도 유지. Backend는 환경변수로 DB 주소/계정을 받는다.

### 이 단계 이후 절대 기준
**"애플리케이션 코드는 거의 바꾸지 않고, 실행 환경만 바꾼다."** Day 4~7은 같은 JAR/이미지를 ECS, Terraform, k8s 위로 옮기는 과정이다.

---

## Day 4 — ECR + ECS Fargate (클라우드에서 실행)

### 목표
Docker Image를 **ECR**에 올리고, **ECS Fargate**에서 실행해서 RDS와 S3를 사용하는 Backend를 AWS에 띄운다.

### 핵심 서비스
- **ECR (Elastic Container Registry)**: AWS의 Docker Image 저장소. "이미지의 GitHub".
- **ECS (Elastic Container Service)**: 컨테이너를 실행·관리하는 AWS 서비스.
- **Fargate**: 서버(EC2)를 직접 관리하지 않고 컨테이너만 실행하는 방식 (서버리스 컨테이너).
- **RDS**: AWS가 관리해주는 PostgreSQL. 백업, 패치를 AWS가 처리.
- **CloudWatch Logs**: 컨테이너의 로그를 모아 보는 곳. 컨테이너가 죽어도 로그는 남는다.

### ECS의 4가지 핵심

```text
Cluster ─ 컨테이너를 실행하는 논리적 그룹
  └─ Service ─ "이 Task를 항상 N개 유지해라" (죽으면 새로 띄움)
       └─ Task ─ 실제로 실행 중인 컨테이너(들)
            ▲
     Task Definition ─ Task의 설계도: 이미지, CPU/메모리, 포트, 환경변수, 로그, 역할
                       수정할 때마다 Revision(버전)이 올라간다
```

### Execution Role vs Task Role (반드시 구분)

| | Execution Role | Task Role |
|---|---|---|
| 누가 쓰나 | ECS(에이전트)가 Task를 **시작할 때** | 컨테이너 안 **애플리케이션**이 |
| 무엇을 하나 | ECR에서 이미지 Pull, CloudWatch로 로그 전송, Secret 읽기 | S3 업로드/다운로드/삭제 |
| 틀리면 | 이미지 Pull 실패, 로그 없음 | S3 AccessDenied |

→ 컨테이너 안에 Access Key를 넣지 않는다. **역할(Role)이 임시 자격 증명을 자동으로 준다.**

### 네트워크
- **VPC**: AWS 안의 나만의 격리된 네트워크.
- **Subnet**: VPC를 나눈 구역. **Public**(인터넷 연결 가능) / **Private**(외부에서 직접 접근 불가).
- **Security Group**: 인스턴스 단위 방화벽. "어디서 어떤 포트로 들어올 수 있는가".
  - ECS SG: 8080 허용.
  - RDS SG: **ECS SG에서 오는 5432만** 허용 (IP가 아니라 보안 그룹을 출처로 지정).
- Day 4는 단순화를 위해 Public Subnet + Public IP로 접근. 운영에서는 ALB + Private Subnet이 정석.

### 핵심 실험
1. **Task 강제 종료** → Service가 자동으로 새 Task를 띄운다. 새 Task의 IP는 바뀌지만 **S3의 파일과 RDS의 데이터는 그대로**.
2. **Scale Out (Task 2개 이상)** → 어느 Task가 요청을 받아도 같은 파일이 보인다. 저장소가 외부(S3/RDS)에 있기 때문.
3. **Container RUNNING ≠ 애플리케이션 정상**: 컨테이너는 떴는데 DB 연결 실패로 앱이 죽을 수 있다 → Health Check와 로그로 확인.

### 장애 대응 순서 (코드부터 고치지 않는다)
Service Events → Task 상태(STOPPED 이유) → CloudWatch 로그 → 네트워크/보안 그룹 → IAM 권한 → 마지막으로 코드.

| 증상 | 의심할 곳 |
|---|---|
| CannotPullContainerError | ECR 주소/태그, Execution Role, 네트워크 |
| S3 AccessDenied | Task Role 정책 |
| Connection timed out | Security Group, Public IP |
| Connection refused | 앱이 안 떴거나 포트 불일치 |
| Task 계속 STOPPED | 로그 확인 (DB 연결 실패, 환경변수 누락 등) |

### 이미지 태그
`latest`만 쓰면 어떤 버전이 배포됐는지 알 수 없다. **버전 태그 또는 Git SHA 태그**를 함께 쓴다.

---

## Day 5 — Terraform (Infrastructure as Code)

### 목표
Day 4에서 CLI/콘솔로 손수 만든 AWS 리소스를 **Terraform 코드**로 정의해서, 언제든 똑같이 재생성·수정·삭제할 수 있게 만든다.

### IaC가 필요한 이유
- 손으로 만든 인프라는 **재현이 불가능**하고, 누가 무엇을 바꿨는지 알 수 없다.
- 코드로 관리하면 Git으로 리뷰·이력 관리, 환경 복제(dev/prod), 실수 방지가 가능.

### Terraform 핵심 개념
- **Provider**: Terraform이 AWS와 대화하게 해주는 플러그인.
- **Resource**: 만들 대상 (VPC, S3 버킷, RDS 등).
- **Variable / tfvars**: 바뀌는 값(리전, 프로젝트 이름, 이미지 태그)을 밖으로 뺀다. 실제 값이 담긴 `terraform.tfvars`는 Git에 올리지 않고 예시 파일만 올린다.
- **Locals**: 코드 안에서 반복되는 값(이름 접두어 등)을 정리.
- **Output**: 생성 후 필요한 값(ECR 주소, RDS 엔드포인트, 버킷 이름) 출력.
- **State**: Terraform이 "현재 실제로 무엇을 만들었는지" 기록한 파일. 비밀값이 들어있을 수 있어 **Git에 올리면 안 된다**. 팀에서는 S3 원격 State + 잠금을 쓴다.

### 워크플로우

```text
init  → 프로바이더 다운로드
fmt   → 코드 정리
validate → 문법 검사
plan  → "무엇이 생성/변경/삭제될지" 미리보기  (가장 중요, 반드시 읽는다)
apply → 실제 반영
```
- plan에서 **destroy/replace**가 보이면 멈추고 이유를 확인한다.
- 이미 존재하는 리소스는 **import**로 State에 가져올 수 있지만, 코드를 자동으로 써주지는 않는다.
- **두 번째 plan이 "변경 없음"**이면 코드와 실제 인프라가 일치한다는 뜻 → Terraform의 핵심 (선언형: "원하는 최종 상태"를 적는다).

### 이 프로젝트가 Terraform으로 만드는 것 (`infra/terraform/`)

| 파일 | 리소스 | 역할 |
|---|---|---|
| vpc.tf | VPC, Internet Gateway, Public/Private Subnet, Route Table | 네트워크 |
| security_groups.tf | ECS SG, RDS SG | 방화벽 (RDS는 ECS에서만 접근) |
| s3.tf | 버킷(랜덤 접미사), 퍼블릭 차단, 버전관리, 암호화 | 파일 저장소 |
| ecr.tf | ECR 저장소 | 이미지 저장소 |
| logs.tf | CloudWatch Log Group | 로그 |
| iam.tf | Task Role(S3 권한), Execution Role(ECR/로그/Secret 권한) | 권한 |
| secrets.tf | Secrets Manager (DB 비밀번호, JWT Secret) | 비밀값 |
| rds.tf | DB Subnet Group, PostgreSQL 인스턴스 | DB (Private Subnet) |
| ecs.tf | Cluster, Task Definition, Service | 실행 |
| eks.tf | EKS Cluster, Node Group, Pod Identity | Day 7 Kubernetes 확장 |

### 설계 포인트
- **RDS는 Private Subnet**: 인터넷에서 직접 접근 불가, ECS만 접근.
- **Secrets Manager**: DB 비밀번호를 Task Definition에 평문으로 넣지 않고, Execution Role이 시작 시 읽어 환경변수로 주입.
- **이름 연결 자동화**: S3 버킷 이름, RDS 주소가 Terraform 리소스 간 참조로 Task Definition 환경변수에 자동으로 들어간다.
- **Spring 설정 이름과 환경변수 이름을 맞춰야 한다** (DB_URL, S3_BUCKET 등).
- **Scale Out도 코드로**: 원하는 Task 수 변수를 바꾸고 apply.
- 애플리케이션 코드는 거의 바뀌지 않는다. **인프라만 코드화**한 것.

---

## Day 6 — React Frontend (Google Drive 스타일)

### 목표
Backend API를 사용하는 **웹 화면**을 만든다. Backend는 다시 만들지 않고, 실제 API 표를 먼저 확인한 뒤 연결한다.

### 역할 분리
| | Frontend (React) | Backend (Spring Boot) |
|---|---|---|
| 역할 | 화면 표시, 사용자 입력, API 호출 | 규칙 검증, DB/S3 접근, 권한 확인 |
| 비밀값 | **절대 없음** | 환경변수/Role로 보유 |
| 실행 위치 | 사용자 브라우저 | 서버(컨테이너) |

- **왜 React가 RDS/S3에 직접 붙으면 안 되는가?** 브라우저 코드는 누구나 볼 수 있다. DB 비밀번호나 AWS 키를 넣는 순간 모두에게 공개된다. 모든 접근은 Backend를 거쳐 권한 검사를 받아야 한다.

### 핵심 개념
- **Vite**: 빠른 개발 서버와 빌드 도구.
- **컴포넌트**: 화면 조각 (Sidebar, Breadcrumb, 파일 목록, 모달 등).
- **useState**: 화면 상태 (현재 폴더, 목록, 로딩 여부).
- **useEffect**: 상태가 바뀌면 부수 효과 실행 (예: 현재 폴더가 바뀌면 목록 다시 불러오기).
- **Custom Hook**: 데이터 로딩·업로드 같은 로직을 재사용 가능하게 분리.
- **API 계층 분리 (client / fileApi / folderApi…)**: 주소·헤더·에러 처리를 한 곳에서 관리. 화면 코드는 "무엇을 할지"만.
- **FormData**: 파일 업로드 시 사용하는 multipart 요청 형식.
- **currentFolderId**: 지금 보고 있는 폴더. 업로드·폴더 생성 시 "어디에" 만들지를 결정. 없으면 루트.
- **Breadcrumb**: "내 드라이브 > 문서 > 과제" 경로 표시. 폴더의 부모를 따라 올라가 경로를 만든다.
- **환경변수 (VITE_ 접두어)**: API 주소 등. **빌드 시점에 코드에 박힌다** → 공개돼도 되는 값만 넣는다.

### CORS
브라우저는 다른 출처(도메인/포트)로의 요청을 기본적으로 막는다. 해결 방법:
- 개발: **Vite Proxy** (같은 출처처럼 보이게 개발 서버가 대신 전달).
- 운영: 같은 도메인 뒤에 Frontend와 API를 두거나, Backend에서 허용 출처를 명시.

### 업로드 / 다운로드 흐름

```text
업로드:  파일 선택 → FormData(file, folderId) → POST → Backend → S3 저장 → DB 저장 → 목록 새로고침
다운로드: 클릭 → GET → Backend가 DB에서 s3Key 조회 → S3에서 읽기 → 브라우저로 전달
```
다운로드에 **브라우저의 AWS 자격 증명은 필요 없다.** Backend(Task Role)가 대신 읽는다.

### 디버깅 (브라우저 개발자 도구 Network 탭)
| 증상 | 의미 |
|---|---|
| Failed to fetch | 서버 연결 불가 / CORS / 주소 오류 |
| 404 | 경로(URL) 틀림 |
| 405 | 메서드(GET/POST…) 틀림 |
| 400 | 요청 데이터 형식/검증 실패 |
| 500 | Backend 내부 오류 → Backend 로그 확인 |
| S3엔 있는데 화면에 없음 | DB 저장 실패 (정합성 문제) |
| DB엔 있는데 S3에 없음 | 다운로드 시 NoSuchKey |

### 배포 관련
- **Production Build**: 정적 파일(HTML/JS/CSS)로 변환 → Nginx 컨테이너 또는 **S3 + CloudFront**로 서빙.
- **ECS Public IP의 한계**: Task가 바뀔 때마다 IP가 바뀐다 → 고정 주소를 위해 **ALB**가 필요.
- **핵심 실험**: ECS Task를 재시작해도 새로고침하면 파일/폴더가 그대로 → Stateless 구조 증명.

---

## Day 7 — Kubernetes + CI/CD + 장애 대응

### 목표
같은 Backend 이미지를 **Kubernetes**(Codespaces의 kind, 확장으로 AWS EKS)에 배포하고, **GitHub Actions**로 테스트·이미지 빌드를 자동화하며, **Rollout/Rollback과 장애 대응**을 실습한다.

### Kubernetes 핵심 객체 (`k8s/`)

| 객체 | 역할 | 이 프로젝트 |
|---|---|---|
| Namespace | 리소스를 묶는 논리적 공간 | cloud-file-service |
| Pod | 컨테이너가 실행되는 최소 단위. 언제든 죽고 새로 생긴다 | Spring Boot 컨테이너 |
| Deployment | "이 Pod를 N개 유지", 이미지 교체 시 무중단 교체 | replicas 2 |
| Service | 바뀌는 Pod IP 대신 **고정된 이름/주소** 제공, Pod들에 부하 분산 | ClusterIP 8080 |
| ConfigMap | 일반 설정 (리전, 버킷 이름) | AWS_REGION, S3_BUCKET |
| Secret | 민감 설정 (DB 계정, JWT Secret) | secret.yaml은 Git 제외, example만 |
| ServiceAccount | Pod의 신원. EKS에서는 Pod Identity로 IAM 역할과 연결 → S3 권한 | |
| HPA | CPU 사용률에 따라 Pod 수 자동 조절 | 2~5개, CPU 70% |
| Ingress | 외부 HTTP 요청을 Service로 라우팅 (AWS에서는 ALB) | cloud-file.local |

### 비교로 이해하기
| Docker Compose | ECS | Kubernetes |
|---|---|---|
| service 정의 | Task Definition | Deployment의 Pod Template |
| 컨테이너 | Task | Pod |
| (없음) | ECS Service (개수 유지) | Deployment + ReplicaSet |
| 서비스 이름 DNS | (ALB) | Service |
| environment | 환경변수 / Secrets Manager | ConfigMap / Secret |

- **kind**: Docker 컨테이너 안에서 돌아가는 로컬 Kubernetes. 비용 없이 개념 실습.
- **EKS**: AWS의 관리형 Kubernetes. 켜두면 시간당 비용이 나오므로 실습 후 반드시 삭제.

### Health Check와 Probe
- **Spring Boot Actuator**: `/actuator/health`로 앱 상태(DB 연결 포함)를 보고.
- **Readiness Probe**: "요청 받을 준비 됐나?" → 실패하면 Service가 트래픽을 보내지 않음 (0/1 Ready).
- **Liveness Probe**: "살아있나?" → 계속 실패하면 컨테이너를 재시작.
- **resources (requests / limits)**: 스케줄링 기준(requests)과 최대 사용량(limits). HPA 계산의 기준이 된다.

### CI/CD (`.github/workflows/`)
- **CI (Continuous Integration)**: 코드가 올라올 때마다 자동으로 테스트·빌드해서 깨졌는지 확인.
  - backend-ci: main push/PR 시 PostgreSQL 서비스 컨테이너를 띄우고 Gradle test + build.
  - Java 버전은 실제 프로젝트와 반드시 일치시킨다.
- **CD (Continuous Delivery/Deployment)**: 검증된 결과를 배포 가능한 형태로 만들고 배포.
  - backend-deploy: Docker 이미지를 빌드해서 **Git SHA 태그 + latest 태그**로 ECR에 Push.
- **GitHub Secrets**: AWS 키를 워크플로 파일에 직접 쓰지 않고 저장소 Secret으로 주입.
- **OIDC (더 안전한 방법)**: 장기 Access Key 없이 GitHub이 AWS에서 임시 권한을 받는 방식.
- **왜 github.sha 태그?** 어떤 커밋의 코드가 배포됐는지 정확히 추적되고, 이전 이미지로 롤백하기 쉽다.

### Rollout / Rollback
- **Rollout**: 새 이미지로 Deployment를 업데이트하면 새 Pod가 Ready된 뒤 옛 Pod를 줄이는 **롤링 업데이트** (무중단).
- **Rollout History**: Deployment의 배포 이력(Revision).
- **Rollback (undo)**: 문제가 생기면 직전 Revision으로 즉시 되돌림.

### 장애 실습과 진단
| 증상 | 원인 | 확인 |
|---|---|---|
| ImagePullBackOff | 이미지 이름/태그 틀림, 레지스트리 권한 | Pod describe의 Events |
| CrashLoopBackOff | 앱이 시작하자마자 죽음 (DB 연결 실패, 환경변수 누락) | Pod 로그 (이전 컨테이너 로그 포함) |
| 0/1 Ready | Readiness Probe 실패 | Health 엔드포인트, 로그 |
| Pod 삭제 | Deployment가 즉시 새 Pod 생성 | 파일은 그대로 (S3/RDS) |

**진단 순서**: Pod 상태 → describe(Events) → logs → Service/Endpoint → ConfigMap/Secret → 외부 의존성(RDS/S3) → 코드.

### Monitoring / Observability (선택 범위)
- 기본: Health, Logs, Events, Metrics (CloudWatch, kubectl).
- **Prometheus + Grafana**: 메트릭 수집·대시보드.
- **OpenTelemetry**: 트레이스/메트릭/로그를 표준 방식으로 수집.
- **Argo CD / GitOps**: Git에 있는 YAML을 "원하는 상태"로 보고 클러스터를 자동으로 맞춘다. 배포 = Git 커밋.

### Terraform vs Kubernetes YAML
- **Terraform**: 클러스터, 네트워크, DB, S3, IAM 같은 **인프라**.
- **Kubernetes YAML**: 그 위에서 도는 **애플리케이션 배포 방식** (Pod 수, 이미지, 설정, Probe).

---

## 현재 프로젝트에 추가된 기능 (Day 7 이후 확장)

Day 1~7 가이드 이후 실제 코드에는 다음 기능이 더해져 있다. 발표 때 "실제 서비스처럼 만든 부분"으로 설명할 수 있다.

### 1. 회원가입 / 로그인 (JWT)
```text
회원가입: 이메일+비밀번호 → 비밀번호는 BCrypt로 해시해서 저장 (원문 저장 안 함)
로그인:   검증 성공 → Backend가 JWT(서명된 토큰) 발급
이후 요청: Frontend가 토큰을 저장해 두고 모든 API 요청 헤더에 Bearer 토큰으로 첨부
Backend: 토큰 서명·만료 확인 → 토큰 안의 사용자 ID로 "누구의 요청인지" 판단
```
- **세션을 서버에 저장하지 않는다 (Stateless 인증)** → Pod가 여러 개여도 어느 Pod든 토큰만 보면 사용자를 알 수 있다. Day 1~7의 Stateless 원칙과 같은 이유.
- 공개 경로: 회원가입, 로그인, Health. 나머지는 모두 인증 필요. 관리자 API는 ADMIN 역할만.
- JWT Secret은 Secrets Manager / k8s Secret으로 주입 (코드의 기본값은 로컬 개발 전용).

### 2. 사용자별 데이터 격리
- 폴더와 파일에 **소유자(owner)**가 있고, 모든 조회/수정은 "내 것"만 대상으로 한다.
- S3 키도 사용자별 경로 아래 UUID로 저장 → 사용자별 정리·삭제가 쉽다.

### 3. 휴지통 (Soft Delete)
- 삭제하면 바로 지우지 않고 **trashed 표시 + 삭제 시각**만 기록 → 복원 가능.
- 폴더를 삭제하면 하위 항목도 함께 휴지통으로. "trashRoot"는 사용자가 직접 삭제한 최상위 항목을 표시해서, 복원할 때 그 단위로 되돌린다.
- 휴지통에서 **영구 삭제**할 때 S3 객체도 삭제.

### 4. 그 외 Drive 기능
- 별표(Starred), 최근 항목, 검색, 폴더 트리/경로 조회, 파일 미리보기.
- **사용자별 저장 용량 제한** (기본 1GB): 업로드 전에 사용량 + 파일 크기가 한도를 넘으면 거절.
- 계정 페이지(프로필 수정, 비밀번호 변경, 탈퇴 시 데이터 정리), 관리자 페이지(사용자 관리).

### API 묶음 (경로 기준)
| 경로 | 내용 |
|---|---|
| /api/auth | 회원가입, 로그인 |
| /api/users/me | 내 정보, 수정, 비밀번호 변경, 탈퇴, 저장 용량 |
| /api/folders | 폴더 생성/조회/이름변경/이동/별표/삭제, 경로 |
| /api/files | 업로드, 목록, 다운로드, 미리보기, 이름변경, 이동, 별표, 삭제 |
| /api/drive | 최근, 별표, 검색, 트리, 휴지통(조회/복원/영구삭제/비우기) |
| /api/admin | 사용자 목록/삭제 (ADMIN 전용) |
| /health, /actuator/health | 상태 확인 |

---

## 전체 요청 흐름 — 파일 업로드 한 번을 끝까지 따라가기

1. 사용자가 브라우저에서 "파일 업로드"를 누른다.
2. React가 현재 폴더 ID와 파일을 FormData로 묶고, 저장해 둔 JWT를 헤더에 붙여 POST 요청을 보낸다.
3. 요청은 입구(Nginx / ALB / Ingress)를 거쳐 Kubernetes Service(또는 ECS)로 간다.
4. Service는 Ready 상태인 Pod 중 하나로 요청을 보낸다.
5. Spring Security가 JWT를 검증하고 사용자 ID를 꺼낸다. (실패 시 401)
6. Controller가 요청을 받아 Service로 넘긴다.
7. Service가 규칙을 검사한다: 폴더가 내 것인가? 용량 한도를 넘지 않는가? (실패 시 404/409 등)
8. 사용자별 경로 + UUID로 S3 키를 만들고 **S3에 파일 내용을 저장**한다. (권한은 Task Role / Pod Identity)
9. **RDS(PostgreSQL)에 파일 정보**(이름, 크기, 타입, 폴더, 소유자, s3Key)를 저장한다.
10. 201 응답과 파일 정보 JSON을 돌려주고, React가 목록을 갱신한다.

→ 이 Pod가 지금 바로 죽어도, 다음 요청은 다른 Pod가 받고, 파일은 S3에, 정보는 RDS에 그대로 있다.

---

## 발표용 1분 설명

> "Cloud File Service는 Google Drive 같은 파일 관리 서비스입니다.
> 핵심 설계는 **저장 책임의 분리**입니다. 파일 내용은 S3에, 폴더 구조와 파일 정보는 PostgreSQL에 저장하고, Spring Boot 서버는 아무 상태도 갖지 않습니다.
> 그래서 이름 변경이나 이동은 DB만 수정하면 되고, 서버 컨테이너가 죽거나 여러 개로 늘어나도 데이터는 안전합니다.
> 이 서버를 Docker 이미지로 만들어 ECR에 올리고, ECS Fargate와 Kubernetes에서 실행했습니다. AWS 인프라(VPC, RDS, S3, IAM, ECS, EKS)는 Terraform 코드로 관리하고, GitHub Actions가 테스트와 이미지 빌드·배포를 자동화합니다.
> 권한은 Access Key 대신 IAM Role로 부여하고, 비밀값은 Secrets Manager와 Kubernetes Secret으로 주입합니다. 사용자는 JWT로 인증되며, 각자의 파일만 볼 수 있습니다.
> 장애 실습으로 Pod 삭제, 잘못된 이미지 배포, 롤백을 해보며 자가 복구와 무중단 배포를 확인했습니다."

---

## 예상 질문과 짧은 답

| 질문 | 답 |
|---|---|
| 왜 파일을 DB에 안 넣나? | 큰 바이너리는 DB를 무겁게 하고 백업/확장이 어렵다. 저렴하고 내구성 높은 S3가 적합. DB에는 찾기 위한 정보만. |
| 왜 S3만으로 안 하나? | 폴더 트리, 이름 변경, 이동, 검색, 사용자별 조회는 DB가 훨씬 효율적. |
| Stateless가 왜 중요한가? | 컨테이너는 언제든 교체된다. 상태가 밖에 있어야 재시작·확장·롤링 배포가 안전하다. |
| Image vs Container? | 이미지는 설계도, 컨테이너는 실행 중인 인스턴스. |
| Execution Role vs Task Role? | 실행 준비(이미지 Pull, 로그) vs 앱의 AWS 사용(S3). |
| Security Group을 어떻게 구성했나? | RDS는 ECS(또는 노드) 보안 그룹에서 오는 5432만 허용, Private Subnet에 둠. |
| Terraform State를 왜 Git에 안 올리나? | 비밀값이 들어있을 수 있고, 여러 명이 동시에 수정하면 꼬인다 → 원격 State + 잠금. |
| Pod IP를 직접 쓰면 안 되는 이유? | Pod는 재생성될 때마다 IP가 바뀐다 → Service로 고정 주소 사용. |
| Readiness vs Liveness? | 트래픽을 받을지 vs 재시작할지. |
| ConfigMap vs Secret? | 일반 설정 vs 민감 정보. |
| CI vs CD? | 자동 검증(테스트/빌드) vs 자동 배포. |
| 왜 Git SHA 태그? | 배포된 코드 추적, 정확한 롤백. |
| CrashLoopBackOff면? | 로그부터. 대부분 DB 연결·환경변수 문제. |
| ImagePullBackOff면? | 이미지 이름/태그, 레지스트리 권한 확인. |
| ECS와 Kubernetes 관계? | 둘 다 컨테이너 오케스트레이터. ECS는 AWS 전용·단순, k8s는 표준·이식성·생태계. 같은 이미지를 둘 다에서 실행. |
| Frontend에 AWS 키를 넣으면? | 브라우저 코드는 공개되므로 누구나 키를 탈취할 수 있다. |
| JWT를 쓴 이유? | 서버에 세션을 저장하지 않아 여러 Pod에서도 인증이 동작 (Stateless). |
| DB와 S3가 어긋나면? | S3 성공·DB 실패 시 고아 파일 발생 → 보상 삭제, 정리 배치로 개선 가능. |
| 삭제를 왜 바로 안 하나? | 휴지통(Soft Delete)으로 복원 가능하게, 영구 삭제 시에만 S3에서 제거. |

---

## Day별 한 문장

- **Day 1**: 요청을 받는 애플리케이션의 뼈대(Controller-Service-Repository)를 만들고, 메모리 저장의 한계를 확인했다.
- **Day 2**: 애플리케이션을 컨테이너로 포장하고 Nginx를 입구로 세워, 어디서나 똑같이 실행되게 했다.
- **Day 3**: 파일 내용을 컨테이너 밖 S3에 저장해 컨테이너가 사라져도 파일이 남게 했다.
- **Day 3.5**: 메타데이터를 PostgreSQL에 두어 폴더·이름·이동이 되는 진짜 파일 시스템을 만들었다.
- **Day 4**: 이미지를 ECR에 올리고 ECS Fargate에서 실행해, IAM Role로 S3·RDS를 쓰는 클라우드 서비스가 되었다.
- **Day 5**: 손으로 만든 AWS 인프라를 Terraform 코드로 옮겨 재현·검토 가능한 인프라가 되었다.
- **Day 6**: 사용자가 실제로 쓰는 Google Drive 스타일 화면을 만들어 API와 연결했다.
- **Day 7**: Kubernetes로 자가 복구·무중단 배포를, GitHub Actions로 자동 빌드를 붙이고 장애를 직접 일으켜 복구해봤다.
