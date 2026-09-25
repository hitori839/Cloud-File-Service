# Cloud File Service — Day 2
# Docker + Nginx 완전 상세 실습 가이드
# GitHub Codespaces 초보자용

> 참고: 로컬 Docker 실습은 유지되지만, 현재 실제 배포 환경은 AWS ECR/ECS와 S3를 포함하는 경로를 기준으로 진행한다. Container 내부에서 DB 주소는 `localhost`가 아니라 실제 서비스 주소를 사용해야 한다.

> **현재 구현 기준:** 현재 Compose 서비스명은 `cloud-file-service`이며 backend 컨테이너 포트는 `18080:8080`, Nginx 진입점은 `80:80`이다. PostgreSQL은 `postgres` 서비스로 실행되며, 현재 Nginx 설정(`nginx/nginx.conf`)은 `location /`의 모든 요청을 `upstream backend { server host.docker.internal:18080; }`으로 전달한다(Compose의 `extra_hosts: host.docker.internal:host-gateway` 필요). 이 문서의 Day 2 시점 예제(서비스명 `backend`, `cloud-file-service:8080` upstream, In-Memory JSON API)는 학습 단계의 초기 버전이며, Day 3.5에서 PostgreSQL을 추가하며 현재 형태로 바뀐다. 최종 실행은 루트 `README.md`와 `docker-compose.yml`을 기준으로 한다.
>
> **Java 버전:** 현재 `backend/build.gradle`의 toolchain은 **Java 25**이고 루트 `Dockerfile`도 `eclipse-temurin:25-jdk`/`25-jre`를 사용한다. 이 문서의 Dockerfile 예제도 25를 기준으로 한다. (JAR을 Java 25로 컴파일했는데 21 JRE Image에서 실행하면 `UnsupportedClassVersionError`로 즉시 종료된다.)

> **개인정보 보호:** 예시에는 실제 사용자 정보, AWS 계정 정보, credential 또는 비밀번호를 넣지 않는다.

> Day 1에서 만든 Spring Boot Cloud File Service를 그대로 가져와서, 오늘은 Docker Container로 패키징하고 실행한 다음 Nginx Reverse Proxy를 앞에 붙인다.
>
> 핵심 목표는 `docker build`을 외우는 것이 아니라 **애플리케이션이 Docker 안에서 어떻게 실행되고, Nginx를 통해 어떻게 Backend로 요청이 전달되는지** 직접 이해하는 것이다.

---

# 0. Day 2 최종 결과

Day 1:

```text
Client
   |
   v
Spring Boot
   |
   v
In-Memory Repository
```

Day 2:

```text
                    Docker Network
                         |
Client                   |
  |                      |
  | HTTP                 |
  v                      v
Nginx Container ---> Spring Boot Container
      :80                  :8080
                              |
                              v
                       In-Memory Repository
```

최종적으로:

```text
http://localhost
```

로 요청하면:

```text
Client
  ↓
Nginx :80
  ↓
Spring Boot :8080
  ↓
Controller
  ↓
Service
  ↓
Repository
```

로 전달되는 것을 확인한다.

---

# 1. 오늘 배울 것

- Docker
- Docker Image
- Docker Container
- Dockerfile
- Docker Build Context
- Port
- Host Port / Container Port
- Docker Network
- Docker DNS
- Environment Variable
- Volume
- Health Check 개념
- Image Layer
- Build Cache
- Multi-stage Build
- Nginx
- Reverse Proxy
- Load Balancing 기초
- Docker Compose

그리고 실제로:

1. Day 1 애플리케이션 확인
2. Docker 확인
3. Dockerfile 작성
4. Image Build
5. Container 실행
6. Port Mapping 확인
7. 로그 확인
8. Container 내부 확인
9. Docker Network 생성
10. Nginx 연결
11. Reverse Proxy 확인
12. Docker Compose 구성
13. 장애 실험
14. Multi-stage Build
15. `.dockerignore`
16. Git commit/push

까지 한다.

---

# 2. Day 1과 Day 2의 차이

## Day 1

```bash
./gradlew bootRun
```

으로 Spring Boot를 직접 실행했다.

```text
Codespace
 ├── Java
 ├── Gradle
 └── Spring Boot
```

## Day 2

```text
Codespace
 └── Docker
      └── Spring Boot Container
```

즉 애플리케이션 실행 방식을:

```text
./gradlew bootRun
```

에서:

```text
Docker Image
   ↓
Docker Container
```

로 발전시킨다.

---

# 3. Docker란?

초보자 관점에서:

> Docker는 애플리케이션과 필요한 실행 환경을 Image로 패키징하고, 그 Image를 Container라는 실행 단위로 실행할 수 있게 해주는 기술이다.

개념:

```text
Application
    +
Runtime
    +
Dependencies
    ↓
Docker Image
    ↓
Container
```

---

# 4. Image와 Container

## Image

실행에 필요한 내용을 담은 패키지/템플릿이라고 생각한다.

예:

```text
cloud-file-service:day2
```

## Container

Image를 실제 실행한 것이다.

```text
Image
  |
  | docker run
  v
Container
```

간단히:

```text
Image = 실행할 재료
Container = 실행 중인 인스턴스
```

하나의 Image에서 여러 Container를 실행할 수도 있다.

```text
cloud-file-service:day2
        |
        +-- Container A
        +-- Container B
        +-- Container C
```

이 개념은 나중에 Kubernetes Replica/Pod로 이어진다.

---

# 5. Docker 기본 구조

```text
Developer
    |
    | Dockerfile
    v
docker build
    |
    v
Docker Image
    |
    | docker run
    v
Docker Container
```

Docker CLI는 Docker Engine과 통신한다.

```text
Terminal
   |
   v
Docker CLI
   |
   v
Docker Engine
   |
   +-- Image
   +-- Container
   +-- Network
   +-- Volume
```

---

# 6. GitHub Codespaces에서 Docker 확인

```bash
docker --version
```

그리고:

```bash
docker info
```

실행한다.

실행 중인 Container:

```bash
docker ps
```

모든 Container:

```bash
docker ps -a
```

Image:

```bash
docker images
```

---

# 7. Day 1 프로젝트 먼저 검증

프로젝트의 Backend로 이동:

```bash
cd backend
```

테스트:

```bash
./gradlew test
```

Build:

```bash
./gradlew clean build
```

성공해야 Day 2를 진행한다.

> **참고:** Day 1 시점(In-Memory) 코드는 DB 없이 테스트가 통과한다. 이미 Day 3.5 이후의 JPA/PostgreSQL 코드로 이 문서를 다시 따라가는 경우에는 `./gradlew test`/`build`와 JAR 실행 전에 PostgreSQL(`localhost:5432/cloud_file`)이 실행 중이어야 한다.

JAR 확인:

```bash
ls -la build/libs
```

보통 JAR이 **두 개** 생긴다.

```text
backend-0.0.1-SNAPSHOT-plain.jar   ← 의존성이 없는 plain JAR (실행 불가)
backend-0.0.1-SNAPSHOT.jar         ← Spring Boot 실행 JAR (이것을 사용)
```

파일 이름은 `settings.gradle`의 `rootProject.name`과 `build.gradle`의 `version`에 따라 달라질 수 있다. 항상 `-plain`이 **없는** JAR을 실행한다.

---

# 8. JAR 직접 실행

Docker 이전에 애플리케이션 자체를 확인한다.

```bash
java -jar build/libs/backend-0.0.1-SNAPSHOT.jar
```

> `java -jar build/libs/*.jar`는 JAR이 두 개일 때 `-plain.jar`가 먼저 선택되어 `no main manifest attribute` 오류가 날 수 있으므로 쓰지 않는다.

새 터미널에서:

```bash
curl -i http://localhost:8080/health
```

정상이라면:

```json
{"status":"UP"}
```

가 나온다.

이 테스트가 중요한 이유:

```text
JAR 실행 실패
→ Java/Spring Boot/Build 문제

JAR 실행 성공
→ Docker 문제를 별도로 조사
```

처럼 원인을 분리할 수 있기 때문이다.

확인이 끝나면 JAR을 실행한 터미널에서 `Ctrl + C`로 **반드시 종료**한다. 종료하지 않으면 18번의 `docker run -p 8080:8080`이 `port is already allocated` 오류로 실패한다.

---

# 9. 프로젝트 구조

Day 2 목표:

```text
cloud-file-service/
├── backend/
├── nginx/
│   └── nginx.conf
├── infra/            # (Day 4~5) ECS task definition, infra/terraform/
├── k8s/              # (Day 7)
├── frontend/         # (Day 6)
├── docs/             # (선택) 학습 기록
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .gitignore
└── README.md
```

> `infra/`, `k8s/`, `frontend/`는 이후 Day에서 만들어지므로 지금은 없어도 된다. Terraform은 루트 `terraform/`이 아니라 `infra/terraform/`에 위치한다.

오늘은 주로:

```text
backend/
nginx/
Dockerfile
docker-compose.yml
```

를 사용한다.

---

# 10. Dockerfile이란?

Dockerfile은 Docker Image를 어떻게 만들 것인지 적어 놓은 파일이다.

대표 명령:

```dockerfile
FROM
WORKDIR
COPY
RUN
EXPOSE
ENTRYPOINT
CMD
```

기본 흐름:

```text
FROM
 ↓
파일 복사
 ↓
필요한 작업
 ↓
실행 명령
```

---

# 11. 첫 Dockerfile

프로젝트 루트에:

```text
Dockerfile
```

을 만든다.

```dockerfile
FROM eclipse-temurin:25-jre

WORKDIR /app

COPY backend/build/libs/*-SNAPSHOT.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
```

> `COPY backend/build/libs/*.jar app.jar`로 쓰면 `-plain.jar`까지 두 파일이 매칭되어 `When using COPY with more than one source file, the destination must be a directory` 오류가 난다. 그래서 실행 JAR만 매칭되도록 `*-SNAPSHOT.jar`를 사용한다(version이 다르면 실제 실행 JAR 이름에 맞춘다).
>
> 이 첫 Dockerfile은 **호스트에서 미리 Build한 JAR**을 복사하므로, 7번의 `./gradlew clean build`를 먼저 해야 한다. 나중에 67번 Multi-stage Dockerfile로 교체하며, 최종 저장소의 루트 `Dockerfile`은 Multi-stage 버전이다.

---

# 12. Dockerfile 한 줄씩 이해하기

## FROM

```dockerfile
FROM eclipse-temurin:25-jre
```

Java Runtime이 포함된 기반 Image를 사용한다. 버전은 `build.gradle`의 toolchain(`JavaLanguageVersion.of(25)`)과 같거나 높아야 한다.

## WORKDIR

```dockerfile
WORKDIR /app
```

Container 내부 작업 디렉터리를 `/app`으로 지정한다.

## COPY

```dockerfile
COPY backend/build/libs/*-SNAPSHOT.jar app.jar
```

호스트의 실행 JAR을 Container의 `/app/app.jar`로 복사한다.

## EXPOSE

```dockerfile
EXPOSE 8080
```

이 Image의 애플리케이션이 8080을 사용한다는 의도를 표현한다.

**주의:** 이것만으로 Host의 8080이 외부에 공개되는 것은 아니다.

## ENTRYPOINT

```dockerfile
ENTRYPOINT ["java", "-jar", "app.jar"]
```

Container가 시작할 때 실행할 명령이다.

---

# 13. JAR과 Docker의 관계

```text
Spring Source Code
      ↓
Gradle Build
      ↓
JAR
      ↓
Docker Image
      ↓
Container
      ↓
java -jar app.jar
```

즉 Docker가 Spring Boot를 대신하는 것이 아니다.

Docker는 Spring Boot 애플리케이션을 **포장하고 실행하는 환경**이다.

---

# 14. Docker Image Build

프로젝트 루트로 이동:

```bash
cd ..
```

확인:

```bash
pwd
```

그리고:

```bash
docker build   -t cloud-file-service:day2   .
```

---

# 15. `-t`의 의미

```bash
-t cloud-file-service:day2
```

Image 이름과 Tag를 지정한다.

```text
Repository = cloud-file-service
Tag        = day2
```

결과:

```text
cloud-file-service:day2
```

---

# 16. Build Context

명령 마지막:

```bash
.
```

은 현재 디렉터리를 Docker Build Context로 사용한다.

현재:

```text
cloud-file-service/
├── Dockerfile
└── backend/
    └── build/libs/
```

이므로 루트에서 Build해야 한다.

---

# 17. Image 확인

```bash
docker images
```

또는:

```bash
docker image ls
```

다음이 보이는지 확인한다.

```text
cloud-file-service
```

---

# 18. Container 실행

```bash
docker run   --name cloud-file-service   -p 8080:8080   cloud-file-service:day2
```

---

# 19. `-p 8080:8080` 완전 이해하기

형식:

```text
-p HOST_PORT:CONTAINER_PORT
```

현재:

```text
-p 8080:8080
```

이므로:

```text
Host :8080
    ↓
Container :8080
```

이다.

구조:

```text
curl
 ↓
Codespace Host :8080
 ↓
Docker Port Mapping
 ↓
Container :8080
 ↓
Spring Boot
```

---

# 20. Container 확인

다른 터미널:

```bash
docker ps
```

상세 정보:

```bash
docker inspect cloud-file-service
```

---

# 21. Health 확인

```bash
curl -i http://localhost:8080/health
```

정상:

```text
HTTP/1.1 200
```

Body:

```json
{"status":"UP"}
```

---

# 22. File API 확인

```bash
curl -i -X POST   http://localhost:8080/api/files   -H "Content-Type: application/json"   -d '{
    "fileName": "docker.txt",
    "contentType": "text/plain",
    "size": 100
  }'
```

> 이 JSON 요청은 Day 1의 In-Memory metadata API 기준이다. Day 3 이후 현재 코드는 `multipart/form-data`(`-F "file=@test.txt"`)로 업로드하므로, 최종 코드로 실습 중이라면 `curl -i -X POST http://localhost:8080/api/files -F "file=@test.txt"` 형태를 사용한다.

목록:

```bash
curl -i http://localhost:8080/api/files
```

---

# 23. Container 로그

```bash
docker logs cloud-file-service
```

실시간:

```bash
docker logs -f cloud-file-service
```

로그 추적을 종료:

```text
Ctrl + C
```

---

# 24. Container 내부 접속

```bash
docker exec -it   cloud-file-service   sh
```

확인:

```bash
pwd
```

```bash
ls -la
```

아마:

```text
/app
app.jar
```

등이 보인다.

나가기:

```bash
exit
```

---

# 25. Host localhost와 Container localhost

이것은 매우 중요하다.

Host에서:

```text
localhost:8080
```

은:

```text
Codespace Host
```

를 의미한다.

Container 내부에서:

```text
localhost:8080
```

은:

```text
그 Container 자신
```

을 의미한다.

즉:

```text
Host localhost
      ≠
Container localhost
```

이 개념은 Nginx에서 반드시 필요하다.

---

# 26. Container 중지와 삭제

```bash
docker stop cloud-file-service
```

삭제:

```bash
docker rm cloud-file-service
```

Image는 별도로 남는다.

```bash
docker images
```

왜냐하면:

```text
Image ≠ Container
```

이기 때문이다.

---

# 27. Docker Network

이제 Nginx를 붙인다.

목표:

```text
Nginx Container
       |
       v
Spring Boot Container
```

Network 생성:

```bash
docker network create cloud-network
```

확인:

```bash
docker network ls
```

---

# 28. Backend를 Network에 연결

```bash
docker run -d   --name cloud-file-service   --network cloud-network   -p 8080:8080   cloud-file-service:day2
```

확인:

```bash
docker ps
```

---

# 29. Docker DNS

같은 Docker Network의 Container는 이름으로 서로 찾을 수 있다.

Backend 이름:

```text
cloud-file-service
```

Port:

```text
8080
```

따라서 Nginx에서는:

```text
http://cloud-file-service:8080
```

처럼 접근할 수 있다.

Host의:

```text
localhost:8080
```

와 다르다.

---

# 30. Nginx란?

Nginx는 Web Server이면서 Reverse Proxy, Load Balancer 등으로 사용할 수 있다.

이번 프로젝트에서는 **Reverse Proxy**에 집중한다.

```text
Client
  ↓
Nginx
  ↓
Spring Boot
```

---

# 31. Reverse Proxy란?

Client가 Backend를 직접 호출하는 대신:

```text
Client
   ↓
Nginx
   ↓
Backend
```

구조를 만드는 것이다.

Nginx가 Client의 요청을 받아 Backend로 전달한다.

---

# 32. 왜 Nginx를 사용하는가?

최종 프로젝트는:

```text
Internet
   ↓
Load Balancer
   ↓
Nginx
   ↓
Application
```

처럼 확장될 수 있다.

Nginx를 통해:

- Reverse Proxy
- Routing
- Load Balancing
- TLS 관련 처리
- Static Content

등을 구성할 수 있다.

---

# 33. nginx.conf 만들기

폴더:

```bash
mkdir -p nginx
```

파일:

```text
nginx/nginx.conf
```

내용:

```nginx
events {}

http {

    upstream backend {
        server cloud-file-service:8080;
    }

    server {

        listen 80;

        location / {

            proxy_pass http://backend;

            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

---

# 34. `upstream` 이해하기

```nginx
upstream backend {
    server cloud-file-service:8080;
}
```

Backend 그룹을 정의한다.

현재는 하나다.

```text
backend
  ↓
cloud-file-service:8080
```

나중에는:

```nginx
upstream backend {
    server app1:8080;
    server app2:8080;
    server app3:8080;
}
```

처럼 여러 서버를 둘 수 있다.

---

# 35. `server`와 `listen`

```nginx
server {
    listen 80;
}
```

Nginx Container가 80번 포트에서 HTTP 요청을 받도록 한다.

---

# 36. `location`

```nginx
location / {
}
```

모든 경로에 대해 처리한다.

따라서:

```text
/health
/api/files
/api/files/1
```

등을 받을 수 있다.

---

# 37. `proxy_pass`

```nginx
proxy_pass http://backend;
```

요청을:

```text
Nginx
 ↓
backend
 ↓
cloud-file-service:8080
```

으로 전달한다.

---

# 38. Proxy Header

```nginx
proxy_set_header Host $host;
```

원래 Host를 전달한다.

```nginx
proxy_set_header X-Real-IP $remote_addr;
```

Client IP 전달에 사용된다.

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

Proxy를 거친 Client IP 정보를 전달한다.

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

원래 HTTP/HTTPS Scheme 정보를 전달한다.

---

# 39. Nginx Image

```bash
docker pull nginx:alpine
```

---

# 40. Nginx Container 실행

Spring Boot가 이미 `cloud-network`에 있어야 한다.

```bash
docker run -d   --name nginx   --network cloud-network   -p 80:80   -v "$(pwd)/nginx/nginx.conf:/etc/nginx/nginx.conf:ro"   nginx:alpine
```

---

# 41. Volume Mount 이해하기

```bash
-v "$(pwd)/nginx/nginx.conf:/etc/nginx/nginx.conf:ro"
```

구조:

```text
Host
nginx/nginx.conf
       |
       v
Container
/etc/nginx/nginx.conf
```

`ro`는:

```text
read only
```

이다.

Container가 설정 파일을 읽을 수 있지만 수정하지 못하게 한다.

---

# 42. Nginx 상태

```bash
docker ps
```

두 개가 보여야 한다.

```text
nginx
cloud-file-service
```

---

# 43. Nginx를 통한 Health

직접 Backend:

```bash
curl -i http://localhost:8080/health
```

Nginx:

```bash
curl -i http://localhost/health
```

두 번째 요청은:

```text
curl
 ↓
Host :80
 ↓
Nginx
 ↓
Docker Network
 ↓
cloud-file-service:8080
 ↓
Spring Boot
```

이다.

---

# 44. Nginx를 통한 File API

```bash
curl -i -X POST   http://localhost/api/files   -H "Content-Type: application/json"   -d '{
    "fileName": "nginx.txt",
    "contentType": "text/plain",
    "size": 123
  }'
```

조회:

```bash
curl -i http://localhost/api/files
```

---

# 45. Docker Compose란?

Container가 여러 개가 되면 명령이 길어진다.

```bash
docker network create ...
docker run ...
docker run ...
```

Compose에서는 YAML 파일로 정의한다.

```text
docker-compose.yml
```

을 사용해:

```text
Container
Network
Volume
Environment
```

등을 한 번에 관리한다.

---

# 46. Compose와 Terraform의 차이

비슷해 보이지만 목적이 다르다.

Docker Compose:

```text
로컬/개발 Container 환경
```

Terraform:

```text
Cloud Infrastructure
```

Kubernetes YAML:

```text
Kubernetes Resource
```

Argo CD:

```text
Git에 정의된 Kubernetes 상태와 실제 Cluster 상태를 동기화
```

---

# 47. docker-compose.yml

프로젝트 루트:

```text
docker-compose.yml
```

작성:

```yaml
services:

  backend:
    build:
      context: .
      dockerfile: Dockerfile

    container_name: cloud-file-service

    expose:
      - "8080"

    networks:
      - cloud-network


  nginx:
    image: nginx:alpine

    container_name: nginx

    ports:
      - "80:80"

    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro

    depends_on:
      - backend

    networks:
      - cloud-network


networks:
  cloud-network:
    driver: bridge
```

> **서비스 이름 vs Container 이름:** 여기서 Compose **서비스 이름**은 `backend`이고, `container_name`은 `cloud-file-service`이다. `docker compose logs/stop/start/exec` 명령에는 **서비스 이름**(`backend`, `nginx`)을 쓴다. Nginx의 `server cloud-file-service:8080;`은 container_name으로, `backend:8080`은 서비스 이름으로 둘 다 Docker DNS에서 찾을 수 있다.
>
> **최종 저장소와의 차이:** Day 3.5 이후 현재 `docker-compose.yml`은 서비스명이 `cloud-file-service`(container_name 없음), 포트 `18080:8080`, `postgres` 서비스와 DB/S3 환경변수(`DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `SPRING_DATASOURCE_*`, `AWS_REGION`, `S3_BUCKET`), `extra_hosts: host.docker.internal:host-gateway`를 가진다. 그에 맞춰 `nginx/nginx.conf`의 upstream도 `server host.docker.internal:18080;`으로 바뀐다. 오늘은 위의 Day 2 버전으로 실습한다.

---

# 48. Compose `services`

```yaml
services:
```

아래에 실행할 서비스를 정의한다.

현재:

```text
backend
nginx
```

두 개다.

---

# 49. Backend `build`

```yaml
build:
  context: .
  dockerfile: Dockerfile
```

프로젝트 루트의 Dockerfile을 사용해 Backend Image를 Build한다.

---

# 50. `expose`와 `ports`

Backend:

```yaml
expose:
  - "8080"
```

Nginx:

```yaml
ports:
  - "80:80"
```

차이를 이해하는 것이 중요하다.

`ports`:

```text
Host ↔ Container
```

연결을 만든다.

`expose`는 Container Network 내부에서 사용하는 포트를 명시하는 용도로 볼 수 있다.

따라서 외부 Client는:

```text
Nginx :80
```

만 사용하고 Backend는 내부에서:

```text
backend:8080
```

으로 접근하도록 구성한다.

---

# 51. 왜 Backend를 외부에 공개하지 않는가?

원하는 구조:

```text
Internet
   ↓
Nginx :80
   ↓
Backend :8080
```

외부 Client가:

```text
Backend :8080
```

을 직접 호출할 필요가 없다.

서비스 경계를:

```text
External
    ↓
Nginx
    ↓
Internal Backend
```

로 나눈다.

---

# 52. `depends_on`

```yaml
depends_on:
  - backend
```

Compose가 서비스 시작 관계를 표현하도록 한다.

단, 이것을:

> Backend가 완전히 준비될 때까지 API 요청이 무조건 성공할 때까지 기다린다.

라고 이해하면 안 된다.

애플리케이션 준비 상태는 별도의 Health Check/Readiness 개념으로 관리하는 것이 더 정확하다.

이 차이는 Kubernetes에서 매우 중요하다.

---

# 53. Compose 실행

먼저 28번/40번에서 `docker run`으로 직접 만든 Container와 Network를 제거한다. `docker compose down`은 Compose가 만든 것만 지우므로, 이것을 하지 않으면 `container name "/cloud-file-service" is already in use` 또는 `port is already allocated`(80) 오류가 난다.

```bash
docker rm -f cloud-file-service nginx
docker network rm cloud-network
```

기존 Compose Container 제거:

```bash
docker compose down
```

Build:

```bash
docker compose build
```

실행:

```bash
docker compose up -d
```

확인:

```bash
docker compose ps
```

---

# 54. Compose 로그

전체:

```bash
docker compose logs
```

Backend (서비스 이름 `backend` 사용):

```bash
docker compose logs backend
```

또는 container_name으로:

```bash
docker logs cloud-file-service
```

Nginx:

```bash
docker compose logs nginx
```

실시간:

```bash
docker compose logs -f
```

---

# 55. Compose를 통한 Health

```bash
curl -i http://localhost/health
```

정상:

```text
HTTP 200
```

---

# 56. Compose POST

```bash
curl -i -X POST   http://localhost/api/files   -H "Content-Type: application/json"   -d '{
    "fileName": "compose.txt",
    "contentType": "text/plain",
    "size": 256
  }'
```

---

# 57. Compose GET

```bash
curl -i http://localhost/api/files
```

단건:

```bash
curl -i http://localhost/api/files/1
```

---

# 58. Compose DELETE

```bash
curl -i -X DELETE   http://localhost/api/files/1
```

---

# 59. Docker Network 확인

```bash
docker network ls
```

상세:

```bash
docker network inspect <network-name>
```

Compose가 생성한 실제 Network 이름은:

```bash
docker network ls
```

로 확인한다.

---

# 60. Container 내부에서 Backend 통신

Nginx Container:

```bash
docker compose exec nginx sh
```

가능한 경우:

```bash
wget -qO- http://backend:8080/health
```

또는 Image에 curl이 있다면:

```bash
curl http://backend:8080/health
```

결과:

```json
{"status":"UP"}
```

가 나와야 한다.

이 테스트는:

```text
Nginx Container
   ↓
Docker DNS
   ↓
backend
   ↓
Spring Boot
```

통신이 실제로 된다는 것을 증명한다.

---

# 61. 장애 실험 1 — Backend 중지

```bash
docker compose stop backend
```

확인:

```bash
docker compose ps
```

Nginx는 살아있을 수 있지만:

```bash
curl -i http://localhost/health
```

는 실패할 것이다.

왜냐하면:

```text
Client
 ↓
Nginx
 ↓
Backend
```

에서 Nginx 뒤의 Backend가 없으므로 Nginx가 `502 Bad Gateway`(또는 `504`) 같은 오류를 반환하기 때문이다.

Nginx 로그에서 원인을 확인한다.

```bash
docker compose logs nginx
```

---

# 62. Backend 복구

```bash
docker compose start backend
```

확인:

```bash
curl http://localhost/health
```

다시 성공해야 한다.

---

# 63. 장애 실험 2 — Nginx 중지

```bash
docker compose stop nginx
```

외부에서:

```bash
curl http://localhost/health
```

가 실패할 수 있다.

하지만 Backend 자체는 살아있을 수 있다.

필요하면 다시:

```bash
docker compose start nginx
```

---

# 64. 장애 실험 3 — 잘못된 Backend 주소

`nginx/nginx.conf`의:

```nginx
server cloud-file-service:8080;
```

을 일부러:

```nginx
server wrong-backend:8080;
```

으로 변경한다.

재시작:

```bash
docker compose restart nginx
```

그리고:

```bash
curl -i http://localhost/health
```

실패를 확인한다. Nginx는 시작할 때 upstream 이름을 찾지 못하면 `host not found in upstream` 오류로 **Container 자체가 종료**된다.

```bash
docker compose ps
docker compose logs nginx
```

다시:

```nginx
server cloud-file-service:8080;
```

으로 복구하고 Nginx를 다시 시작한다.

```bash
docker compose up -d --force-recreate nginx
```

```bash
curl -i http://localhost/health
```

가 다시 성공해야 한다. (단일 파일 bind mount는 편집기에 따라 변경이 반영되지 않을 수 있으므로 `restart` 대신 `--force-recreate`를 사용한다.)

---

# 65. 장애 실험의 의미

이제 시스템을 계층으로 볼 수 있어야 한다.

```text
Application
Container
Network
Proxy
```

중 어디에서 문제가 발생했는지 구분할 수 있어야 한다.

최종 클라우드 환경에서는:

```text
Application
Docker
ECS/Kubernetes
Network
Load Balancer
Nginx
S3
IAM
```

등 더 많은 계층이 추가된다.

---

# 66. Multi-stage Build

현재 Dockerfile:

```text
이미 만들어진 JAR
   ↓
Runtime Image
```

이다.

더 발전시키면 Docker가 Build까지 수행할 수 있다.

```text
Docker Build
   |
   +-- Build Stage
   |     JDK
   |     Gradle
   |     Source
   |
   +-- Runtime Stage
         JRE
         app.jar
```

---

# 67. Multi-stage Dockerfile

루트 `Dockerfile`을 다음 내용으로 **교체**한다. (최종 저장소의 루트 `Dockerfile`과 같은 내용이다.)

```dockerfile
FROM eclipse-temurin:25-jdk AS builder

WORKDIR /workspace

COPY backend/gradlew backend/gradlew
COPY backend/gradle backend/gradle
COPY backend/build.gradle backend/settings.gradle backend/

RUN chmod +x backend/gradlew

RUN cd backend && ./gradlew dependencies --no-daemon

COPY backend/src backend/src

RUN cd backend && ./gradlew clean bootJar --no-daemon


FROM eclipse-temurin:25-jre

WORKDIR /app

COPY --from=builder /workspace/backend/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
```

> 여기서는 `build`가 아니라 `bootJar`만 실행하므로 `-plain.jar`가 만들어지지 않고 테스트도 실행되지 않는다. 그래서 `*.jar`가 실행 JAR 하나만 매칭되며, Image Build 중에 DB 같은 외부 의존성이 필요 없다. 이후 `docker compose build`도 이 Dockerfile을 사용한다.

---

# 68. Multi-stage 핵심

Build Stage:

```text
JDK
Gradle
Source
```

Runtime Stage:

```text
JRE
JAR
```

최종 Runtime Image에서 Build 도구를 제외할 수 있다.

장점:

```text
Image Size 감소 가능
공격 표면 감소 가능
배포 단순화
Build/Runtime 분리
```

---

# 69. Multi-stage Build

```bash
docker build   -t cloud-file-service:day2-multistage   .
```

Image 확인:

```bash
docker images
```

---

# 70. Docker Image Layer

Dockerfile:

```dockerfile
FROM ...
COPY ...
RUN ...
```

등의 작업은 Image Layer 구조와 관련된다.

개념:

```text
Layer 1
Layer 2
Layer 3
Layer 4
```

Docker는 Build Cache를 활용할 수 있다.

---

# 71. Build Cache

변경이 적은 파일과 변경이 잦은 파일을 적절히 분리하면 Cache 효율을 높일 수 있다.

예:

```text
Gradle Wrapper
Gradle 설정
Dependency
Source Code
```

를 무조건 한 번에 복사하는 것보다 Dependency와 Source의 변경 빈도를 고려해 구성할 수 있다.

초보 단계에서는:

> Dockerfile의 명령 순서가 Build Cache에 영향을 줄 수 있다.

정도로 먼저 이해한다.

---

# 72. `.dockerignore`

프로젝트 루트:

```text
.dockerignore
```

작성:

```dockerignore
.git
.github
.idea
.vscode

**/build
**/.gradle

README.md
docs
terraform
k8s
observability

*.log
.env
*.pem
```

> **주의:** `**/build`를 제외하므로, 호스트의 `backend/build/libs/*.jar`를 복사하는 11번의 첫 Dockerfile은 이제 `COPY failed`로 실패한다. 반드시 67번 Multi-stage Dockerfile로 교체한 뒤 사용한다.
>
> 최종 저장소의 `.dockerignore`에는 이후 Day를 거치며 `.env.*`, `*.key`, `*.crt`, `keys.txt`, `backend/bin`, `infra/terraform/*.tfstate` 등이 추가되어 있다.

---

# 73. `.dockerignore`의 목적

Docker Build Context에 불필요한 파일을 넣지 않도록 한다.

특히:

```text
.git
build
.gradle
```

등을 제외하면 불필요한 데이터 전송/처리를 줄일 수 있다.

단:

> `.dockerignore`는 Secret 관리 시스템이 아니다.

Secret을 안전하게 보관하는 방법 자체를 대신하지 않는다.

---

# 74. 보안 주의

절대로 Git에:

```text
AWS Access Key
AWS Secret Key
Password
Token
Private Key
```

등을 Commit하지 않는다.

잘못 올라간 Credential은:

```text
파일 삭제
```

만으로 해결되지 않는다.

이미 노출된 자격 증명은 폐기/교체해야 한다.

Day 3부터 AWS를 사용하므로 매우 중요하다.

---

# 75. Environment Variable

Container 환경변수:

```bash
docker run   -e SPRING_PROFILES_ACTIVE=docker   ...
```

Compose:

```yaml
environment:
  SPRING_PROFILES_ACTIVE: docker
```

처럼 사용할 수 있다.

환경에 따라:

```text
dev
staging
prod
```

설정을 분리할 수 있다.

> 위 `SPRING_PROFILES_ACTIVE`는 개념 예시다(현재 프로젝트에는 `docker` profile 파일이 없다). 실제 프로젝트는 `backend/src/main/resources/application.properties`에서 `DB_URL`/`DB_USERNAME`/`DB_PASSWORD`(또는 `SPRING_DATASOURCE_*`), `AWS_REGION`, `S3_BUCKET` 환경변수를 읽는다. 같은 폴더의 `application.yml`에 있는 `AWS_S3_BUCKET`, `cloud.aws.*` 키는 코드에서 사용하지 않는 레거시 설정이므로 환경변수 이름은 `S3_BUCKET`을 사용한다.

---

# 76. Stateless Application

최종 Kubernetes 환경에서는:

```text
Pod 1
Pod 2
Pod 3
```

가 실행될 수 있다.

Pod 하나가 언제든:

```text
Restart
Delete
Replace
```

될 수 있다.

따라서 중요한 상태를:

```text
Container 내부 메모리
```

에만 저장하면 안 된다.

---

# 77. In-Memory 한계 실험

파일 생성:

```bash
curl -X POST   http://localhost/api/files   -H "Content-Type: application/json"   -d '{
    "fileName": "important.txt",
    "contentType": "text/plain",
    "size": 100
  }'
```

조회:

```bash
curl http://localhost/api/files
```

데이터가 있다.

그 다음:

```bash
docker compose down
```

다시:

```bash
docker compose up -d
```

조회:

```bash
curl http://localhost/api/files
```

데이터가 사라진 것을 확인한다.

---

# 78. 왜 데이터가 사라졌는가?

Day 1에서:

```java
ConcurrentHashMap
```

을 사용했다.

구조:

```text
Container
   |
   v
JVM
   |
   v
RAM
   |
   v
ConcurrentHashMap
```

Container가 종료되면:

```text
Container 종료
      ↓
JVM 종료
      ↓
Memory 해제
      ↓
데이터 소멸
```

한다.

---

# 79. 이것이 S3와 연결되는 이유

실제 파일은 최종적으로:

```text
Spring Boot
    |
    v
AWS S3
```

에 저장한다.

Container가 삭제되어도:

```text
S3 Object
```

는 유지된다.

즉:

```text
Ephemeral Container
        +
Persistent External Storage
```

구조를 만든다.

---

# 80. 이것이 ECS와 연결되는 이유

Day 4:

```text
Docker Image
     ↓
Amazon ECR
     ↓
Amazon ECS
     ↓
Fargate
     ↓
Spring Boot Container
```

오늘 만든 Docker Image가 실제 AWS 배포의 출발점이 된다.

---

# 81. 이것이 Kubernetes와 연결되는 이유

Day 7:

```text
Docker Image
     ↓
Kubernetes
     ↓
Deployment
     ↓
Pod
     ↓
Container
```

Kubernetes가 Container 실행/관리 구조를 제공한다.

---

# 82. Docker Compose와 Kubernetes

| Docker Compose | Kubernetes |
|---|---|
| 로컬 개발/간단한 구성 | Container Orchestration |
| `docker compose up` | `kubectl apply` |
| service | Service 등 여러 Resource |
| compose network | Kubernetes networking |
| 간단한 실행 정의 | 선언적 운영 환경 |
| 개발/테스트에 편리 | 대규모 운영에 적합 |

완전히 1:1 대응되는 것은 아니다.

---

# 83. ECS와 Kubernetes

둘 다 Container를 실행/관리할 수 있다.

```text
Docker Image
    |
    +------ ECS
    |
    +------ Kubernetes
```

ECS:

```text
AWS 중심의 Container Orchestration
```

Kubernetes:

```text
범용 Container Orchestration Platform
```

이라고 이해하면 된다.

---

# 84. Day 2 최종 아키텍처

```text
                         CLIENT
                           |
                           | HTTP
                           v
                 +----------------------+
                 |    NGINX CONTAINER   |
                 |        :80           |
                 |                      |
                 |   Reverse Proxy      |
                 +----------+-----------+
                            |
                            | Docker Network
                            |
                            v
                 +----------------------+
                 | SPRING BOOT CONTAINER|
                 |       :8080          |
                 |                      |
                 | Controller           |
                 |      ↓               |
                 | Service              |
                 |      ↓               |
                 | Repository           |
                 +----------+-----------+
                            |
                            v
                    In-Memory Store
```

---

# 85. 전체 요청 흐름

사용자가:

```bash
curl http://localhost/api/files
```

를 실행한다.

1. Host의 80번 Port로 요청
2. Docker Port Mapping
3. Nginx Container의 80번 Port
4. Nginx `location /`
5. `proxy_pass http://backend`
6. `upstream backend`에 적힌 `cloud-file-service`를 Docker DNS로 찾기
7. Backend Container(`cloud-file-service`)의 8080
8. Spring Boot
9. `FileController`
10. `FileMetadataService`
11. Repository
12. JSON Response
13. Nginx
14. Client

흐름:

```text
Client
 ↓
Host :80
 ↓
Nginx :80
 ↓
Docker DNS
 ↓
backend:8080
 ↓
Spring Boot
 ↓
Controller
 ↓
Service
 ↓
Repository
 ↓
Response
```

---

# 86. Day 2에서 만들어진 것

```text
Spring Boot
    ↓
Dockerfile
    ↓
Docker Image
    ↓
Docker Container
    ↓
Docker Network
    ↓
Nginx
    ↓
Reverse Proxy
    ↓
Docker Compose
```

프로젝트가:

```text
Java Application
```

에서:

```text
Containerized Application
```

으로 발전했다.

---

# 87. Day 2 최종 테스트

## 1. Compose 실행

```bash
docker compose down
docker compose build
docker compose up -d
```

## 2. 상태

```bash
docker compose ps
```

## 3. Health

```bash
curl -i http://localhost/health
```

## 4. Create

```bash
curl -i -X POST   http://localhost/api/files   -H "Content-Type: application/json"   -d '{
    "fileName": "day2.txt",
    "contentType": "text/plain",
    "size": 1024
  }'
```

## 5. List

```bash
curl -i http://localhost/api/files
```

## 6. Get

```bash
curl -i http://localhost/api/files/1
```

## 7. Delete

```bash
curl -i -X DELETE http://localhost/api/files/1
```

---

# 88. Day 2 체크리스트

## Docker

- [ ] `docker --version`
- [ ] `docker ps`
- [ ] `docker images`
- [ ] Image Build
- [ ] Container Run
- [ ] Container Stop
- [ ] Container Remove
- [ ] `docker logs`
- [ ] `docker exec`

## Dockerfile

- [ ] FROM
- [ ] WORKDIR
- [ ] COPY
- [ ] EXPOSE
- [ ] ENTRYPOINT
- [ ] Multi-stage Build
- [ ] `.dockerignore`

## Network

- [ ] Docker Network 생성
- [ ] Container를 Network에 연결
- [ ] Container 이름으로 통신
- [ ] Docker DNS 이해

## Nginx

- [ ] nginx.conf
- [ ] upstream
- [ ] server
- [ ] location
- [ ] proxy_pass
- [ ] proxy header

## Compose

- [ ] docker-compose.yml
- [ ] backend
- [ ] nginx
- [ ] network
- [ ] volume
- [ ] depends_on
- [ ] `docker compose up`
- [ ] `docker compose down`
- [ ] `docker compose logs`

## 장애

- [ ] Backend 중지
- [ ] Nginx 중지
- [ ] 잘못된 Backend 주소
- [ ] 복구

---

# 89. Day 2 PASS 기준

다음 구조를 직접 설명할 수 있어야 한다.

```text
Client
 ↓
Nginx
 ↓
Docker Network
 ↓
Spring Boot Container
 ↓
Controller
 ↓
Service
 ↓
Repository
```

다음 질문에도 답할 수 있어야 한다.

1. Image와 Container의 차이는?
2. Dockerfile은 무엇인가?
3. `docker build`는 무엇을 하는가?
4. `docker run`은 무엇을 하는가?
5. `-p 8080:8080`에서 각각 무엇인가?
6. Container 내부 localhost와 Host localhost는 어떻게 다른가?
7. Reverse Proxy란 무엇인가?
8. Docker Network는 왜 필요한가?
9. Backend 8080을 외부에 직접 공개하지 않는 이유는?
10. Container 내부에 중요한 파일을 영구 저장하면 안 되는 이유는?
11. Docker Compose는 무엇을 해결하는가?
12. 오늘 만든 Docker Image가 ECS/Kubernetes와 어떻게 연결되는가?

---

# 90. 해커톤 발표 대비

## Docker를 왜 사용했나요?

> Spring Boot 애플리케이션을 실행 환경과 함께 Container Image로 패키징하여 개발/배포 환경 차이를 줄이고, 이후 ECS와 Kubernetes에서 동일한 Image를 사용할 수 있도록 구성했습니다.

## Nginx를 왜 사용했나요?

> Client와 Application 사이에 Reverse Proxy 계층을 구성하여 Backend를 직접 외부에 노출하지 않고 요청을 전달하도록 구성했습니다.

## Docker Network를 왜 사용했나요?

> Nginx와 Spring Boot Container가 같은 Docker Network에서 Container 이름 기반으로 통신하도록 구성했습니다.

## 왜 Backend Port를 외부에 공개하지 않았나요?

> 외부 Client는 Nginx를 통해 접근하도록 하고 Backend는 내부 Network에서만 접근하도록 서비스 경계를 분리했습니다.

## Compose를 왜 사용했나요?

> 여러 Container, Network, Volume 등의 실행 환경을 YAML로 정의하여 개발 환경을 쉽게 재현할 수 있도록 했습니다.

---

# 91. Day 2 장애 대응 사고법

문제가 발생하면 무작정 코드를 수정하지 않는다.

다음 순서로 확인한다.

```text
1. Client 요청 확인
        ↓
2. Nginx 상태 확인
        ↓
3. Backend Container 상태 확인
        ↓
4. Network 확인
        ↓
5. Backend 로그
        ↓
6. Nginx 로그
        ↓
7. Container 내부 통신
        ↓
8. Application 로그
```

명령:

```bash
docker compose ps
```

```bash
docker compose logs nginx
```

```bash
docker compose logs backend
```

```bash
docker network ls
```

```bash
docker network inspect <network>
```

---

# 92. Day 2에서 꼭 이해해야 할 포트

```text
Host Port
   ↓
Docker Port Mapping
   ↓
Container Port
   ↓
Application Port
```

예:

```text
Host :80
   ↓
Nginx :80
   ↓
Docker Network
   ↓
Backend :8080
   ↓
Spring Boot :8080
```

여기서:

```text
80
```

과:

```text
8080
```

이 왜 각각 존재하는지 설명할 수 있어야 한다.

---

# 93. Day 2 → Day 3

오늘:

```text
Nginx
  ↓
Spring Boot
  ↓
In-Memory
```

내일:

```text
Nginx
  ↓
Spring Boot
  ↓
AWS S3
```

로 발전한다.

실제 파일을 S3에 저장한다. 이어서 Day 3.5에서 metadata를 PostgreSQL에 저장하도록 바꾸면서 `docker-compose.yml`(서비스명 `cloud-file-service`, `18080:8080`, `postgres` 서비스)과 `nginx/nginx.conf`(upstream `host.docker.internal:18080`)가 현재 저장소 형태로 바뀐다.

---

# 94. Day 3에서 배울 것

```text
AWS Region
S3
Bucket
Object
Object Key
IAM
IAM Role
AWS SDK for Java
Upload
Download
Delete
Presigned URL
Multipart Upload 개념
Environment Variable
Credential 관리
```

그리고:

```text
hello.txt
   ↓
Spring Boot
   ↓
S3 Bucket
   ↓
S3 Object
```

를 실제로 구현한다.

---

# 95. Day 3 → Day 4

```text
Docker Image
    ↓
ECR
    ↓
ECS
    ↓
Fargate
    ↓
Spring Boot
    ↓
S3
```

실제 AWS 환경에서 실행한다.

---

# 96. Day 4 → Day 5

AWS Console에서 만든 인프라를 이해한 다음:

```text
Terraform (infra/terraform/)
    ↓
VPC
Subnet
Security Group
IAM
S3
ECR
RDS (PostgreSQL)
Secrets Manager
CloudWatch Logs
ECS
```

를 코드로 정의한다.

이것이 IaC의 핵심이다.

---

# 97. Day 5 → Day 6

Day 6에서는 React + Vite로 Google Drive 스타일 Frontend(`frontend/`)를 만들고 Backend API와 연결한다.

```text
Browser
    ↓
React Frontend
    ↓
Spring Boot API
    ↓
PostgreSQL(RDS) + S3
```

---

# 98. Day 6 → Day 7

같은 Container Image를:

```text
Kubernetes (kind / EKS)
    ↓
Deployment
    ↓
Pod
    ↓
Service
```

에서 실행한다.

그리고:

```text
Namespace
ConfigMap
Secret
Readiness Probe
Liveness Probe
GitHub Actions CI/CD
Rollout / Rollback
```

를 학습한다.

---

# 99. Day 7 선택 기능 — Observability / GitOps

Day 7의 선택 기능으로 다음을 추가할 수 있다.

```text
Spring Boot
     ↓
Prometheus / OpenTelemetry
     ↓
Grafana
```

```text
Developer
    ↓
GitHub
    ↓
Argo CD
    ↓
Kubernetes
```

필수 경로(kind/EKS 배포, CI/CD)를 먼저 끝낸 뒤 진행한다.

---

# 100. Day 2 학습 기록

`docs/day2.md`

```markdown
# Day 2 Study Log

## Date

2026-09-13

## Goal

Docker + Nginx + Docker Compose 기반 Containerized Application 구현

## Environment

- GitHub Codespaces
- Docker:
- Java:
- Spring Boot:

## Docker

- [ ] Docker version 확인
- [ ] Image Build
- [ ] Container Run
- [ ] Container Stop
- [ ] Container Remove
- [ ] docker logs
- [ ] docker exec

## Dockerfile

- [ ] FROM
- [ ] WORKDIR
- [ ] COPY
- [ ] EXPOSE
- [ ] ENTRYPOINT
- [ ] Multi-stage Build
- [ ] .dockerignore

## Network

- [ ] Docker Network
- [ ] Container DNS
- [ ] Container 이름 통신

## Nginx

- [ ] nginx.conf
- [ ] upstream
- [ ] Reverse Proxy
- [ ] proxy_pass
- [ ] Header forwarding

## Compose

- [ ] docker-compose.yml
- [ ] backend
- [ ] nginx
- [ ] network
- [ ] volume
- [ ] depends_on

## API Tests

### Health

Result:

### Create

Result:

### List

Result:

### Get

Result:

### Delete

Result:

## Failure Tests

### Backend stopped

What happened?

### Nginx stopped

What happened?

### Wrong backend hostname

What happened?

## Container Restart Experiment

What happened to In-Memory data?

Why?

## What I learned

1.
2.
3.
4.
5.

## What I still don't understand

1.
2.
3.

## Git Commits

-

## Tomorrow

AWS S3 Integration
```

---

# 101. Git Commit

작업이 끝나면:

```bash
git status
```

확인한다. `.env`, `*.pem`, AWS credential 파일이 목록에 보이면 절대 add하지 않는다(`.gitignore`에 추가). `backend/build/`는 `.gitignore`의 `build/`로 제외되어야 한다.

```bash
git add Dockerfile docker-compose.yml .dockerignore nginx/nginx.conf docs/day2.md
```

Commit:

```bash
git commit -m "feat: containerize application with nginx"
```

Push:

```bash
git push
```

GitHub에서 다음 파일이 올라갔는지 확인한다.

```text
Dockerfile
docker-compose.yml
.dockerignore
nginx/nginx.conf
docs/day2.md
```

> `docs/day2.md`는 선택 사항이다(현재 저장소에는 `docs/` 폴더가 없다). 만들지 않았다면 `git add`에서 빼면 된다.

---

# 102. 최종 Git 구조

```text
cloud-file-service/
│
├── backend/
│   ├── src/
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradlew
│   └── gradlew.bat
│
├── nginx/
│   └── nginx.conf
│
├── docs/            # (선택) 학습 기록
│   ├── day1.md
│   └── day2.md
│
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .gitignore
└── README.md
```

> 이후 Day에서 `frontend/`(Day 6), `infra/`·`infra/terraform/`(Day 4~5), `k8s/`(Day 7)가 추가된다.

---

# 103. 최종 프로젝트 발전 구조

현재:

```text
[Day 1]
Spring Boot
    ↓
In-Memory
```

현재 Day 2:

```text
[Day 2]
Client
    ↓
Nginx
    ↓
Docker Network
    ↓
Spring Boot Container
    ↓
In-Memory
```

Day 3:

```text
[Day 3]
Client
    ↓
Nginx
    ↓
Spring Boot
    ↓
S3
```

Day 3.5:

```text
[Day 3.5]
Spring Boot
    ↓
PostgreSQL(metadata) + S3(file)
```

Day 4:

```text
[Day 4]
Internet
    ↓
AWS
    ↓
ECS/Fargate
    ↓
Spring Boot
    ↓
S3
```

Day 5:

```text
[Day 5]
Terraform
    ↓
AWS Infrastructure
```

Day 6:

```text
[Day 6]
React Frontend
    ↓
Spring Boot
    ↓
RDS + S3
```

Day 7:

```text
[Day 7]
GitHub Actions
    ↓
ECR
    ↓
Kubernetes (kind / EKS)
    ↓
Pods
    ↓
Spring Boot
    ↓
RDS + S3
```

---

# 104. Day 2 한 문장

> **오늘은 Spring Boot 애플리케이션을 Docker Container라는 독립적인 실행 단위로 패키징하고, Docker Network와 Nginx Reverse Proxy를 이용해 외부 요청과 내부 Application을 분리했다.**

---

# 105. Day 2 최종 복습 문제

## 문제 1

Docker Image와 Container의 차이를 설명하라.

## 문제 2

다음 명령을 설명하라.

```bash
docker build -t cloud-file-service:day2 .
```

## 문제 3

다음 명령에서 각각 무엇을 의미하는가?

```bash
docker run -p 8080:8080 ...
```

## 문제 4

왜 Host의 `localhost`와 Container 내부의 `localhost`가 다른가?

## 문제 5

다음 설정을 설명하라.

```nginx
upstream backend {
    server cloud-file-service:8080;
}
```

## 문제 6

다음 설정의 역할은?

```nginx
proxy_pass http://backend;
```

## 문제 7

왜 Nginx와 Backend를 같은 Docker Network에 넣는가?

## 문제 8

왜 Backend 8080을 외부에 직접 공개하지 않는가?

## 문제 9

Container를 삭제하면 In-Memory 데이터는 어떻게 되는가?

## 문제 10

그 문제를 S3가 어떻게 해결하는가?

## 문제 11

오늘 만든 Docker Image가 ECS에서 어떻게 사용되는가?

## 문제 12

오늘 만든 Docker Image가 Kubernetes에서 어떻게 사용되는가?

---

# 106. 스스로 설명할 수 있다면 PASS

다음 그림을 보면서 직접 설명해본다.

```text
Client
  |
  | HTTP :80
  v
Nginx
  |
  | Docker DNS
  v
backend:8080
  |
  v
Spring Boot
  |
  +-- Controller
  |
  +-- Service
  |
  +-- Repository
  |
  v
In-Memory
```

설명 예시:

> Client가 Nginx의 80번 포트로 요청을 보내면 Nginx가 Reverse Proxy 역할을 수행하여 Docker Network 안의 backend로 요청을 전달한다. Backend Container에서는 Spring Boot가 8080번 포트에서 요청을 받고 Controller → Service → Repository 순서로 처리한다. 현재 데이터는 In-Memory이므로 Container가 종료되면 데이터가 사라진다. 따라서 다음 단계에서는 실제 파일을 Container 내부에 저장하지 않고 AWS S3 같은 외부 영속 저장소에 저장하는 구조로 발전시킨다.

---

# 107. Day 2 완료

Day 2가 끝나면:

```text
[Day 1]
Spring Boot REST API
       ↓
[Day 2]
Docker
       ↓
Docker Image
       ↓
Docker Container
       ↓
Docker Network
       ↓
Nginx Reverse Proxy
       ↓
Docker Compose
```

까지 완성된다.

이제 프로젝트는 단순한 Spring Boot 실습이 아니라 **실제로 Container에서 동작하는 Cloud File Service의 기반**이 된다.

다음은 **Day 3 — AWS S3 실제 파일 저장**이다.
