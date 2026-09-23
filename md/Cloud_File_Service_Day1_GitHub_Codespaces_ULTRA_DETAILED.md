# Cloud File Service — Day 1
# GitHub Codespaces 초보자용 완전 상세 실습 가이드

> 참고: 이 문서는 로컬 개발/기초 프로젝트 흐름을 설명하는 역사적 문서이며, 현재 실 배포는 Day 3~4의 AWS S3 + ECS 경로를 실제 기준으로 따라야 한다. 현재 프로젝트는 JPA/PostgreSQL을 사용하므로 `./gradlew test`와 `bootRun` 전에 로컬 PostgreSQL을 실행해야 한다. ECS에서는 `localhost`를 DB 주소로 쓰면 안 되고, `securityGroups`와 Public IP 검증을 우선해야 한다.

> **현재 구현 기준:** 이 문서의 초기 REST와 In-Memory 예제는 학습 기록이다. 현재 프로젝트는 `POST /api/files`에서 JSON metadata만 생성하지 않고 `multipart/form-data` 파일을 업로드하며, PostgreSQL에는 metadata를 저장하고 실제 파일 내용은 S3에 저장한다. 현재 API와 실행 방법은 루트 `README.md`를 기준으로 확인한다.

> **개인정보 보호:** 아래 명령과 값은 설명용 예시이며 실제 AWS credential, 계정 ID, 비밀번호, 개인 파일명이나 개인 식별 정보를 문서에 기록하지 않는다.

> 이 문서는 기존 `Cloud_File_Service_Day1_GitHub_Codespaces_DETAILED.md`의 프로젝트 방향을 유지하면서, **처음 Spring Boot를 배우는 사람도 "왜 만드는지 → 무엇을 입력하는지 → 코드가 어떻게 동작하는지 → 어떻게 테스트하는지"를 따라갈 수 있도록** Day 1을 다시 구성한 확장판이다.
>
> 최종 프로젝트에서는 Docker, Nginx, AWS S3, ECR, ECS, Terraform(IaC), Kubernetes, OpenTelemetry, Grafana, Argo CD를 연결한다.
>
> **Day 1에서는 AWS/Kubernetes를 아직 구축하지 않는다.** 오늘의 산출물은 이후 모든 기술이 올라갈 **실제로 실행되는 Spring Boot Application Foundation**이다.

---

# 0. 오늘의 최종 결과

오늘 다음 구조를 만든다.

```text
Client
  |
  | HTTP
  v
Controller
  |
  v
Service
  |
  v
Repository
  |
  v
In-Memory Store
```

API:

```text
GET    /health
POST   /api/files
GET    /api/files
GET    /api/files/{id}
DELETE /api/files/{id}
```

오늘 끝나면 최소한:

```bash
docker compose up -d postgres
```

현재 프로젝트는 JPA가 시작될 때 PostgreSQL 연결을 확인하므로, 위 명령으로 DB를 먼저 실행한다.

```bash
./gradlew test
```

와

```bash
./gradlew clean build
```

가 성공하고, 서버를 실행한 뒤 `curl`로 API를 직접 호출할 수 있어야 한다.

---

# 1. 먼저 최종 프로젝트를 이해하자

우리가 최종적으로 만들 구조는 대략 다음과 같다.

```text
                         Internet
                            |
                            v
                  +--------------------+
                  | Load Balancer      |
                  +---------+----------+
                            |
                            v
                  +--------------------+
                  | Nginx              |
                  | Reverse Proxy      |
                  +---------+----------+
                            |
                            v
                  +--------------------+
                  | Spring Boot API    |
                  +-----+---------+----+
                        |         |
                        |         |
                        v         v
                +-----------+  +-----------+
                | Metadata  |  | AWS S3    |
                | Database  |  | File Data |
                +-----------+  +-----------+
```

컨테이너 배포:

```text
Spring Boot
    |
    v
Docker Image
    |
    +------> ECR ------> ECS / Fargate
    |
    +------> Kubernetes
```

Infrastructure as Code:

```text
Terraform
   |
   +-- VPC
   +-- Subnet
   +-- Security Group
   +-- IAM
   +-- S3
   +-- ECR
   +-- ECS
   +-- Load Balancer
```

Observability:

```text
Spring Boot
     |
     v
OpenTelemetry
     |
     v
Telemetry Backend / Collector
     |
     v
Grafana
```

GitOps:

```text
Developer
    |
    v
GitHub
    |
    v
Argo CD
    |
    v
Kubernetes
```

---

# 2. 7일 프로젝트 지도

## Day 1 — Application Foundation

```text
GitHub Codespaces
       ↓
Spring Boot
       ↓
REST API
       ↓
Controller
       ↓
Service
       ↓
Repository
       ↓
In-Memory
```

배울 것:

- Git/GitHub
- Linux 터미널
- Java
- Gradle
- Spring Boot
- HTTP
- JSON
- REST API
- Controller
- Service
- Repository
- Domain
- DTO
- Validation
- Exception Handling
- JUnit
- Logging
- Git commit/push

## Day 2 — Docker + Nginx

```text
Client
  ↓
Nginx
  ↓
Docker Container
  ↓
Spring Boot
```

## Day 3 — AWS S3

```text
Spring Boot
    |
    +---- Metadata
    |
    +---- File → S3
```

## Day 4 — ECR + ECS

```text
Docker Image
    ↓
ECR
    ↓
ECS
    ↓
Fargate
    ↓
Container
```

## Day 5 — Terraform / IaC

```text
Terraform
   |
   +-- Network
   +-- IAM
   +-- S3
   +-- ECR
   +-- ECS
```

## Day 6 — Kubernetes + OpenTelemetry + Grafana

```text
Kubernetes
   |
   +-- Deployment
   |      |
   |      +-- Pod
   |      +-- Pod
   |
   +-- Service
         |
         v
     Spring Boot
         |
         v
   OpenTelemetry
         |
         v
      Grafana
```

## Day 7 — Argo CD + GitOps + 장애 대응

```text
GitHub
   ↓
Argo CD
   ↓
Kubernetes
```

그리고 실제 장애를 발생시켜:

```text
Pod 삭제
   ↓
Kubernetes가 새 Pod 생성
```

같은 동작을 확인한다.

---

# 3. 왜 Day 1부터 AWS를 만들지 않는가?

초보자에게 가장 중요한 이유다.

처음부터:

```text
Spring Boot
 + Docker
 + AWS
 + S3
 + IAM
 + ECS
 + Terraform
```

을 한꺼번에 붙이면 문제가 발생했을 때 원인을 찾기 어렵다.

예:

```text
API가 안 된다.
```

라고 했을 때:

```text
Spring Boot 문제?
Docker 문제?
Credential 문제?
IAM 문제?
S3 문제?
ECS 문제?
Network 문제?
Security Group 문제?
```

를 모두 의심해야 한다.

그래서:

```text
Day 1
Application 검증
      ↓
Day 2
Container 검증
      ↓
Day 3
S3 연결 검증
      ↓
Day 4
ECS 검증
      ↓
Day 5
Terraform 재현성 검증
      ↓
Day 6
Kubernetes 검증
      ↓
Day 7
GitOps + Observability + 장애 검증
```

으로 진행한다.

이것은 **문제를 한 계층씩 격리하는 방법**이기도 하다.

---

# 4. GitHub Codespaces

## 4.1 Codespaces란?

GitHub Repository를 기반으로 클라우드에서 개발할 수 있는 환경이다.

개념적으로:

```text
내 PC
  |
  | Browser
  v
GitHub Codespace
  |
  +-- Linux
  +-- Git
  +-- Java
  +-- Gradle
  +-- 개발 도구
```

이번 프로젝트에서는 Codespaces에서 Linux 명령어와 CLI 기반 개발을 익힌다.

---

# 5. Repository 만들기

GitHub에서 Repository를 만든다.

추천:

```text
cloud-file-service
```

처음에는 Private으로 만들어도 된다.

최종 구조는:

```text
cloud-file-service/
├── backend/
├── nginx/
├── terraform/
├── k8s/
├── observability/
├── docs/
├── Dockerfile
├── docker-compose.yml
├── README.md
└── .gitignore
```

오늘은 `backend` 중심으로 만든다.

---

# 6. Codespace 생성

Repository에서:

```text
Code
→ Codespaces
→ Create codespace on main
```

을 선택한다.

생성이 끝나면 VS Code와 비슷한 화면이 나온다.

터미널:

```text
Terminal
→ New Terminal
```

을 연다.

---

# 7. Linux 터미널 기초

## 현재 위치

```bash
pwd
```

뜻:

> 내가 현재 어느 디렉터리에 있는가?

---

## 파일 목록

```bash
ls
```

상세:

```bash
ls -la
```

---

## 디렉터리 이동

```bash
cd backend
```

상위:

```bash
cd ..
```

---

## 폴더 생성

```bash
mkdir docs
```

---

## 파일 내용 확인

```bash
cat README.md
```

---

## 파일 찾기

```bash
find . -maxdepth 3 -type f
```

---

# 8. Git 상태 확인

```bash
git status
```

Git이 정상적으로 Repository를 인식하고 있는지 확인한다.

---

# 9. Git의 기본 구조

Git은 다음 흐름으로 이해한다.

```text
Working Directory
       |
       | git add
       v
Staging Area
       |
       | git commit
       v
Local Repository
       |
       | git push
       v
GitHub
```

실습:

```bash
git status
git add .
git commit -m "feat: initialize project"
git push
```

---

# 10. Commit을 의미 있게 만든다

추천:

```text
feat: initialize spring boot project
feat: add health endpoint
feat: add file metadata domain
feat: add in-memory repository
feat: add file metadata service
feat: add file metadata api
feat: add validation and exception handling
test: add file service tests
docs: add day 1 study log
```

피해야 할 예:

```text
test
final
final2
진짜최종
asdf
```

---

# 11. Java 확인

```bash
java -version
```

```bash
javac -version
```

Gradle Wrapper가 있다면:

```bash
./gradlew --version
```

Java 버전은 프로젝트에서 정한 버전을 끝까지 유지한다.

---

# 12. JDK / JVM / Java

초보자가 자주 헷갈린다.

```text
JDK
 ├── Java Compiler
 └── 개발 도구
       |
       v
Java Source
       |
       v
Bytecode
       |
       v
JVM
       |
       v
실행
```

간단히:

- Java: 언어/생태계
- JDK: 개발 도구
- JVM: Java 바이트코드 실행 환경

정도로 이해하면 된다.

---

# 13. Gradle

Gradle은 Java 프로젝트의:

```text
의존성 관리
컴파일
테스트
패키징
실행
```

등을 자동화한다.

대표 명령:

```bash
./gradlew test
```

```bash
./gradlew build
```

```bash
./gradlew bootRun
```

---

# 14. Gradle Wrapper

프로젝트에:

```text
gradlew
gradlew.bat
gradle/wrapper/
```

가 있다면 Wrapper를 사용한다.

Codespaces/Linux:

```bash
./gradlew
```

Windows:

```text
gradlew.bat
```

Wrapper를 사용하는 이유는 프로젝트에서 지정한 Gradle 버전을 일관되게 사용하기 위해서다.

---

# 15. Spring Boot란?

Java로 HTTP 서버를 직접 만들면 신경 쓸 것이 많다.

```text
HTTP
Routing
JSON
Request
Response
Thread
Error
```

Spring Boot는 이런 서버 애플리케이션을 편리하게 구성할 수 있도록 도와준다.

우리는:

```java
@GetMapping("/health")
```

처럼 작성해서 HTTP 요청과 Java 메서드를 연결한다.

---

# 16. Spring Initializr 설정

Spring Initializr 또는 이미 만든 프로젝트를 사용한다.

권장:

```text
Project: Gradle - Groovy
Language: Java
Packaging: Jar
```

의존성:

```text
Spring Web
Validation
Spring Boot Actuator
Spring Boot Test
```

버전은 현재 프로젝트에서 선택한 호환 가능한 버전을 유지한다.

---

# 17. 프로젝트 구조

Day 1 목표:

```text
backend/
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/example/cloudfileservice/
│   │   │       ├── CloudFileServiceApplication.java
│   │   │       ├── controller/
│   │   │       │   ├── HealthController.java
│   │   │       │   └── FileController.java
│   │   │       ├── service/
│   │   │       │   └── FileMetadataService.java
│   │   │       ├── repository/
│   │   │       │   ├── FileMetadataRepository.java
│   │   │       │   └── InMemoryFileMetadataRepository.java
│   │   │       ├── domain/
│   │   │       │   ├── FileMetadata.java
│   │   │       │   └── FileStatus.java
│   │   │       ├── dto/
│   │   │       │   ├── CreateFileRequest.java
│   │   │       │   └── FileResponse.java
│   │   │       └── exception/
│   │   │           ├── FileNotFoundException.java
│   │   │           └── GlobalExceptionHandler.java
│   │   └── resources/
│   │       └── application.yml
│   └── test/
│       └── java/
├── build.gradle
├── settings.gradle
├── gradlew
└── gradlew.bat
```

---

# 18. 패키지 역할

```text
controller
→ HTTP 입구

service
→ 비즈니스 로직

repository
→ 저장/조회

domain
→ 핵심 데이터

dto
→ API 입출력

exception
→ 예외 처리
```

핵심 흐름:

```text
HTTP
 ↓
Controller
 ↓
Service
 ↓
Repository
 ↓
Data
```

---

# 19. Application 클래스

`CloudFileServiceApplication.java`

```java
package com.example.cloudfileservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CloudFileServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(
                CloudFileServiceApplication.class,
                args
        );
    }
}
```

---

# 20. `main()`과 Spring

Java 프로그램의 시작점:

```java
public static void main(String[] args)
```

여기에서:

```java
SpringApplication.run(...)
```

을 호출한다.

개념:

```text
main()
 ↓
Spring Boot 시작
 ↓
Spring Container 생성
 ↓
Bean 탐색/등록
 ↓
HTTP Server 시작
```

---

# 21. `@SpringBootApplication`

```java
@SpringBootApplication
```

Spring Boot 애플리케이션의 핵심 시작 애노테이션이다.

초보자 단계에서는:

> Spring Boot가 애플리케이션을 구성하고 필요한 컴포넌트를 찾아 실행하도록 시작시키는 표시

라고 이해한다.

---

# 22. application.yml

`src/main/resources/application.yml`

```yaml
spring:
  application:
    name: cloud-file-service

server:
  port: 8080
```

YAML에서는 들여쓰기가 중요하다.

올바른:

```yaml
server:
  port: 8080
```

잘못된:

```yaml
server:
port: 8080
```

---

# 23. 첫 실행

```bash
cd backend
./gradlew bootRun
```

정상적으로 실행되면 Spring Boot 로그가 나온다.

새 터미널을 열어 테스트한다.

---

# 24. 포트 8080

```text
localhost:8080
```

에서 서버가 실행된다고 생각하자.

```text
localhost
= 현재 환경

8080
= 서버가 요청을 받는 Port
```

최종 프로젝트에서는:

```text
Internet
   ↓
Load Balancer :443
   ↓
Nginx :80
   ↓
Spring Boot :8080
```

같은 구조가 될 수 있다.

---

# 25. HTTP란?

HTTP는 클라이언트와 서버가 데이터를 주고받기 위한 프로토콜이다.

예:

```http
GET /health HTTP/1.1
```

는:

```text
Method = GET
Path = /health
```

를 의미한다.

---

# 26. GET / POST / DELETE

## GET

조회:

```http
GET /api/files
```

## POST

생성:

```http
POST /api/files
```

## DELETE

삭제:

```http
DELETE /api/files/1
```

---

# 27. HTTP Status Code

중요한 값:

```text
200 OK
201 Created
204 No Content
400 Bad Request
404 Not Found
500 Internal Server Error
```

이번 프로젝트에서는:

```text
GET 성공      → 200
POST 생성     → 201
DELETE 성공   → 204
잘못된 요청   → 400
없는 파일     → 404
서버 내부 오류 → 500
```

로 사용한다.

---

# 28. JSON

요청 예:

```json
{
  "fileName": "hello.txt",
  "contentType": "text/plain",
  "size": 13
}
```

JSON:

```text
클라이언트 데이터
      ↓
HTTP Body
      ↓
Java DTO
```

반대로:

```text
Java Object
      ↓
JSON
      ↓
HTTP Response
```

Spring Boot가 이 변환을 도와준다.

---

# 29. 첫 번째 API — Health

파일:

```text
src/main/java/com/example/cloudfileservice/controller/HealthController.java
```

```java
package com.example.cloudfileservice.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthController {

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of(
                "status",
                "UP"
        );
    }
}
```

---

# 30. Health Controller 해설

```java
@RestController
```

Spring에게:

> 이 클래스는 HTTP REST API Controller입니다.

라고 알려준다.

```java
@GetMapping("/health")
```

Spring에게:

> GET /health 요청이 오면 이 메서드를 실행하세요.

라고 알려준다.

```java
return Map.of(...)
```

Java Map을 반환한다.

Spring이 JSON으로 변환한다.

결과:

```json
{
  "status": "UP"
}
```

---

# 31. Health 테스트

```bash
curl -i http://localhost:8080/health
```

예상:

```text
HTTP/1.1 200
Content-Type: application/json
```

Body:

```json
{"status":"UP"}
```

---

# 32. Health API가 최종 프로젝트에서 중요한 이유

나중에:

```text
ECS
Kubernetes
Load Balancer
```

등이 애플리케이션 상태를 확인할 수 있어야 한다.

개념:

```text
Health Check
    |
    v
GET /health
    |
    +-- 200 → 정상
    |
    +-- 실패 → 비정상
```

Day 1의 작은 API가 이후 운영 구조의 기반이 된다.

---

# 33. Domain 설계

우리가 관리할 것은 파일이다.

하지만 실제 파일 바이트는 Day 1에서 저장하지 않는다.

파일 메타데이터:

```text
id
fileName
contentType
size
objectKey
status
createdAt
```

실제 최종 구조:

```text
Metadata
   ↓
Database

Actual File
   ↓
S3
```

Day 1:

```text
Metadata
   ↓
In-Memory
```

---

# 34. 왜 파일 내용 자체를 저장하지 않는가?

파일이:

```text
100 MB
1 GB
10 GB
```

일 수 있다고 생각한다.

컨테이너 메모리에 이런 파일을 계속 저장하는 것은 적절하지 않다.

또 Container/Pod는:

```text
Restart
Replace
Scale
```

될 수 있다.

그래서 중요한 상태를 애플리케이션 메모리에 두지 않는 방향으로 발전시킨다.

---

# 35. FileStatus

`FileStatus.java`

```java
package com.example.cloudfileservice.domain;

public enum FileStatus {
    REGISTERED,
    UPLOADED,
    DELETED
}
```

의미:

```text
REGISTERED
→ 메타데이터가 등록됨

UPLOADED
→ 실제 저장소에 파일이 올라감

DELETED
→ 삭제 처리됨
```

Day 1은:

```text
REGISTERED
```

를 사용한다.

---

# 36. Enum이란?

정해진 값 중 하나만 사용하도록 표현하는 타입이다.

예:

```java
FileStatus.REGISTERED
FileStatus.UPLOADED
FileStatus.DELETED
```

문자열:

```java
"UPLOADED"
```

보다 오타를 줄이고 의미를 명확히 할 수 있다.

---

# 37. FileMetadata

`FileMetadata.java`

```java
package com.example.cloudfileservice.domain;

import java.time.Instant;

public record FileMetadata(
        Long id,
        String fileName,
        String contentType,
        long size,
        String objectKey,
        FileStatus status,
        Instant createdAt
) {
}
```

---

# 38. Record란?

데이터를 담는 객체를 간결하게 정의할 수 있는 Java 문법이다.

예:

```java
public record User(
        Long id,
        String name
) {
}
```

사용:

```java
User user = new User(1L, "Alice");

System.out.println(user.id());
System.out.println(user.name());
```

---

# 39. `fileName`과 `objectKey`

둘은 다르다.

```text
fileName
hello.txt
```

사용자가 보는 원래 파일 이름이다.

```text
objectKey
files/1-hello.txt
```

저장소에서 객체를 식별하기 위한 내부 키다.

여러 사용자가 모두:

```text
hello.txt
```

를 업로드할 수 있으므로 내부 key를 별도로 만든다.

Day 3에서 S3에 연결할 때 이 설계가 실제로 사용된다.

---

# 40. DTO란?

DTO:

```text
Data Transfer Object
```

API를 통해 데이터를 전달하기 위한 객체다.

요청:

```text
JSON
 ↓
Request DTO
 ↓
Service
 ↓
Domain
```

응답:

```text
Domain
 ↓
Response DTO
 ↓
JSON
```

---

# 41. DTO와 Domain을 분리하는 이유

Domain은 내부 모델이다.

API는 외부 계약이다.

내부 Domain에 나중에:

```text
internalField
storageProvider
privateInformation
```

같은 필드가 추가될 수도 있다.

Domain을 그대로 외부에 반환하면 의도하지 않은 정보가 노출될 수 있다.

따라서:

```text
Domain
 ↓
Response DTO
 ↓
JSON
```

구조를 사용한다.

---

# 42. CreateFileRequest

`CreateFileRequest.java`

```java
package com.example.cloudfileservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateFileRequest(

        @NotBlank(message = "fileName은 필수입니다.")
        @Size(
                max = 255,
                message = "fileName은 255자 이하여야 합니다."
        )
        String fileName,

        @NotBlank(message = "contentType은 필수입니다.")
        @Size(
                max = 100,
                message = "contentType은 100자 이하여야 합니다."
        )
        String contentType,

        @Positive(message = "size는 0보다 커야 합니다.")
        long size
) {
}
```

---

# 43. Validation

## `@NotBlank`

```java
@NotBlank
String fileName;
```

다음과 같은 입력을 막는다.

```text
""
"   "
```

---

## `@Size`

```java
@Size(max = 255)
```

최대 문자열 길이를 제한한다.

---

## `@Positive`

```java
@Positive
long size;
```

0보다 큰 값만 허용한다.

```text
-1 → 실패
0  → 실패
1  → 성공
```

---

# 44. `@Valid`

Controller:

```java
public ... create(
        @Valid @RequestBody CreateFileRequest request
)
```

여기서 `@Valid`가 DTO의 Validation 규칙을 실행한다.

---

# 45. FileResponse

`FileResponse.java`

```java
package com.example.cloudfileservice.dto;

import com.example.cloudfileservice.domain.FileMetadata;
import com.example.cloudfileservice.domain.FileStatus;

import java.time.Instant;

public record FileResponse(
        Long id,
        String fileName,
        String contentType,
        long size,
        String objectKey,
        FileStatus status,
        Instant createdAt
) {

    public static FileResponse from(
            FileMetadata metadata
    ) {
        return new FileResponse(
                metadata.id(),
                metadata.fileName(),
                metadata.contentType(),
                metadata.size(),
                metadata.objectKey(),
                metadata.status(),
                metadata.createdAt()
        );
    }
}
```

---

# 46. Repository

Repository는:

```text
저장
조회
삭제
```

를 담당한다.

Day 1:

```text
Repository
   ↓
Memory
```

향후:

```text
Repository
   ↓
Database
```

로 발전한다.

실제 파일은:

```text
FileStorage
   ↓
S3
```

로 분리한다.

---

# 47. Repository Interface

`FileMetadataRepository.java`

```java
package com.example.cloudfileservice.repository;

import com.example.cloudfileservice.domain.FileMetadata;

import java.util.List;
import java.util.Optional;

public interface FileMetadataRepository {

    FileMetadata save(FileMetadata file);

    Optional<FileMetadata> findById(Long id);

    List<FileMetadata> findAll();

    boolean deleteById(Long id);
}
```

---

# 48. Interface를 왜 쓰는가?

현재:

```text
FileMetadataRepository
        |
        v
InMemoryFileMetadataRepository
```

나중:

```text
FileMetadataRepository
        |
        v
Database 구현
```

으로 바꿀 수 있다.

Service가:

```text
"메모리에 저장하세요"
```

가 아니라:

```text
"Repository에 저장하세요"
```

라고 생각하도록 만드는 것이다.

---

# 49. In-Memory Repository 전체 코드

`InMemoryFileMetadataRepository.java`

```java
package com.example.cloudfileservice.repository;

import com.example.cloudfileservice.domain.FileMetadata;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Repository
public class InMemoryFileMetadataRepository
        implements FileMetadataRepository {

    private final ConcurrentHashMap<Long, FileMetadata> store =
            new ConcurrentHashMap<>();

    private final AtomicLong sequence =
            new AtomicLong(0);

    @Override
    public FileMetadata save(FileMetadata file) {

        Long id = file.id();

        if (id == null) {
            id = sequence.incrementAndGet();

            file = new FileMetadata(
                    id,
                    file.fileName(),
                    file.contentType(),
                    file.size(),
                    file.objectKey(),
                    file.status(),
                    file.createdAt()
            );
        }

        store.put(id, file);

        return file;
    }

    @Override
    public Optional<FileMetadata> findById(Long id) {
        return Optional.ofNullable(
                store.get(id)
        );
    }

    @Override
    public List<FileMetadata> findAll() {
        return new ArrayList<>(store.values())
                .stream()
                .sorted(
                        Comparator.comparing(
                                FileMetadata::id
                        )
                )
                .toList();
    }

    @Override
    public boolean deleteById(Long id) {
        return store.remove(id) != null;
    }
}
```

---

# 50. `@Repository`

```java
@Repository
```

Spring에게 이 클래스가 Repository 역할을 한다고 알려준다.

Spring이 Bean으로 관리할 수 있다.

---

# 51. `ConcurrentHashMap`

```java
ConcurrentHashMap<Long, FileMetadata>
```

를 간단히:

```text
ID → FileMetadata
```

저장소라고 생각하면 된다.

예:

```text
1 → hello.txt
2 → image.png
3 → document.pdf
```

---

# 52. `AtomicLong`

```java
AtomicLong sequence
```

는 ID를 만들기 위한 카운터다.

```text
0
 ↓
1
 ↓
2
 ↓
3
```

---

# 53. `Optional`

```java
Optional<FileMetadata>
```

는:

```text
값이 있을 수도 있음
값이 없을 수도 있음
```

을 표현한다.

Repository:

```java
return Optional.ofNullable(store.get(id));
```

파일이 있으면 객체가 있고:

```text
Optional.empty()
```

이면 없다.

---

# 54. Service

`FileMetadataService.java`

```java
package com.example.cloudfileservice.service;

import com.example.cloudfileservice.domain.FileMetadata;
import com.example.cloudfileservice.domain.FileStatus;
import com.example.cloudfileservice.dto.CreateFileRequest;
import com.example.cloudfileservice.exception.FileNotFoundException;
import com.example.cloudfileservice.repository.FileMetadataRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
public class FileMetadataService {

    private final FileMetadataRepository repository;

    public FileMetadataService(
            FileMetadataRepository repository
    ) {
        this.repository = repository;
    }

    public FileMetadata create(
            CreateFileRequest request
    ) {
        FileMetadata metadata =
                new FileMetadata(
                        null,
                        request.fileName(),
                        request.contentType(),
                        request.size(),
                        null,
                        FileStatus.REGISTERED,
                        Instant.now()
                );

        FileMetadata saved =
                repository.save(metadata);

        String objectKey =
                "files/"
                + saved.id()
                + "-"
                + saved.fileName();

        FileMetadata updated =
                new FileMetadata(
                        saved.id(),
                        saved.fileName(),
                        saved.contentType(),
                        saved.size(),
                        objectKey,
                        saved.status(),
                        saved.createdAt()
                );

        return repository.save(updated);
    }

    public List<FileMetadata> findAll() {
        return repository.findAll();
    }

    public FileMetadata findById(Long id) {
        return repository.findById(id)
                .orElseThrow(
                        () -> new FileNotFoundException(id)
                );
    }

    public void delete(Long id) {
        FileMetadata file = findById(id);

        FileMetadata deleted =
                new FileMetadata(
                        file.id(),
                        file.fileName(),
                        file.contentType(),
                        file.size(),
                        file.objectKey(),
                        FileStatus.DELETED,
                        file.createdAt()
                );

        repository.save(deleted);
    }
}
```

---

# 55. Service의 책임

Controller가 모든 일을 하면:

```text
HTTP
Validation
Business Logic
Storage
Exception
Response
```

가 한 곳에 섞인다.

우리는:

```text
Controller
    ↓
Service
    ↓
Repository
```

로 분리한다.

Service는:

> "파일을 등록하려면 어떤 순서로 무엇을 해야 하는가?"

를 담당한다.

---

# 56. 파일 생성 흐름

```text
CreateFileRequest
       |
       v
Service.create()
       |
       v
FileMetadata 생성
       |
       v
Repository.save()
       |
       v
ID 생성
       |
       v
objectKey 생성
       |
       v
Repository.save()
       |
       v
FileMetadata 반환
```

---

# 57. Dependency Injection

Service:

```java
public FileMetadataService(
        FileMetadataRepository repository
) {
    this.repository = repository;
}
```

Controller:

```java
public FileController(
        FileMetadataService service
) {
    this.service = service;
}
```

Controller가 직접:

```java
new FileMetadataService(...)
```

하지 않는다.

Spring이 필요한 객체를 연결한다.

개념:

```text
Spring Container
      |
      +-- Repository
      |
      +-- Service
      |
      +-- Controller
```

---

# 58. Constructor Injection을 사용하는 이유

의존성이 코드에 명확하게 보인다.

```java
public FileMetadataService(
        FileMetadataRepository repository
)
```

를 보면:

> "이 Service는 Repository가 없으면 동작하지 않는구나."

를 바로 알 수 있다.

또 테스트에서 가짜 Repository를 넣기도 쉽다.

---

# 59. FileNotFoundException

`FileNotFoundException.java`

```java
package com.example.cloudfileservice.exception;

public class FileNotFoundException
        extends RuntimeException {

    public FileNotFoundException(Long id) {
        super("File not found: " + id);
    }
}
```

---

# 60. 왜 Service에서 예외를 발생시키는가?

요청:

```text
GET /api/files/999999
```

Repository:

```text
데이터 없음
```

Service는 이것을:

```text
요청한 파일이 존재하지 않는다.
```

라는 의미로 해석한다.

그래서:

```java
.orElseThrow(
    () -> new FileNotFoundException(id)
)
```

를 사용한다.

---

# 61. GlobalExceptionHandler

`GlobalExceptionHandler.java`

```java
package com.example.cloudfileservice.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(
            FileNotFoundException.class
    )
    public ResponseEntity<Map<String, String>>
    handleFileNotFound(
            FileNotFoundException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(
                        Map.of(
                                "message",
                                exception.getMessage()
                        )
                );
    }
}
```

---

# 62. 예외 처리 흐름

```text
GET /api/files/999999
        |
        v
Controller
        |
        v
Service
        |
        v
Repository
        |
        v
데이터 없음
        |
        v
FileNotFoundException
        |
        v
GlobalExceptionHandler
        |
        v
HTTP 404
```

---

# 63. Controller 전체 코드

`FileController.java`

```java
package com.example.cloudfileservice.controller;

import com.example.cloudfileservice.domain.FileMetadata;
import com.example.cloudfileservice.dto.CreateFileRequest;
import com.example.cloudfileservice.dto.FileResponse;
import com.example.cloudfileservice.service.FileMetadataService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileMetadataService service;

    public FileController(
            FileMetadataService service
    ) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<FileResponse> create(
            @Valid
            @RequestBody
            CreateFileRequest request
    ) {
        FileMetadata metadata =
                service.create(request);

        FileResponse response =
                FileResponse.from(metadata);

        URI location =
                URI.create(
                        "/api/files/" + response.id()
                );

        return ResponseEntity
                .created(location)
                .body(response);
    }

    @GetMapping
    public ResponseEntity<List<FileResponse>>
    findAll() {

        List<FileResponse> response =
                service.findAll()
                        .stream()
                        .map(FileResponse::from)
                        .toList();

        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<FileResponse> findById(
            @PathVariable Long id
    ) {
        FileMetadata metadata =
                service.findById(id);

        return ResponseEntity.ok(
                FileResponse.from(metadata)
        );
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable Long id
    ) {
        service.delete(id);

        return ResponseEntity
                .noContent()
                .build();
    }
}
```

---

# 64. Controller를 한 줄씩 이해하기

```java
@RestController
```

REST API Controller.

```java
@RequestMapping("/api/files")
```

이 클래스의 기본 URL.

```java
@PostMapping
```

POST `/api/files`.

```java
@GetMapping
```

GET `/api/files`.

```java
@GetMapping("/{id}")
```

GET `/api/files/1`.

```java
@DeleteMapping("/{id}")
```

DELETE `/api/files/1`.

---

# 65. `@RequestBody`

```java
@RequestBody CreateFileRequest request
```

HTTP Body:

```json
{
  "fileName": "hello.txt",
  "contentType": "text/plain",
  "size": 13
}
```

를 Java 객체:

```text
CreateFileRequest
```

로 변환한다.

---

# 66. `@PathVariable`

```java
@GetMapping("/{id}")
```

요청:

```text
GET /api/files/123
```

이면:

```java
id = 123
```

이 된다.

---

# 67. POST 응답 201

```java
ResponseEntity
    .created(location)
    .body(response);
```

는 생성 성공을:

```text
201 Created
```

로 표현한다.

그리고:

```text
Location: /api/files/1
```

같은 위치 정보를 줄 수 있다.

---

# 68. 전체 API 표

| Method | URL | 의미 | 성공 |
|---|---|---|---|
| GET | `/health` | 서비스 상태 | 200 |
| POST | `/api/files` | 파일 메타데이터 생성 | 201 |
| GET | `/api/files` | 목록 | 200 |
| GET | `/api/files/{id}` | 단건 조회 | 200 |
| DELETE | `/api/files/{id}` | 삭제 상태 처리 | 204 |

---

# 69. curl로 테스트

## Health

```bash
curl -i http://localhost:8080/health
```

---

## Create

```bash
curl -i -X POST \
  http://localhost:8080/api/files \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "hello.txt",
    "contentType": "text/plain",
    "size": 13
  }'
```

예상:

```text
HTTP/1.1 201
Location: /api/files/1
```

Body:

```json
{
  "id": 1,
  "fileName": "hello.txt",
  "contentType": "text/plain",
  "size": 13,
  "objectKey": "files/1-hello.txt",
  "status": "REGISTERED",
  "createdAt": "..."
}
```

---

# 70. 목록 조회

```bash
curl -i http://localhost:8080/api/files
```

---

# 71. 단건 조회

```bash
curl -i http://localhost:8080/api/files/1
```

---

# 72. 없는 ID

```bash
curl -i http://localhost:8080/api/files/999999
```

예상:

```text
404 Not Found
```

---

# 73. Validation 실패 — 빈 이름

```bash
curl -i -X POST \
  http://localhost:8080/api/files \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "",
    "contentType": "text/plain",
    "size": 13
  }'
```

예상:

```text
400 Bad Request
```

---

# 74. Validation 실패 — size 0

```bash
curl -i -X POST \
  http://localhost:8080/api/files \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "hello.txt",
    "contentType": "text/plain",
    "size": 0
  }'
```

---

# 75. Validation 실패 — 음수

```bash
curl -i -X POST \
  http://localhost:8080/api/files \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "hello.txt",
    "contentType": "text/plain",
    "size": -1
  }'
```

---

# 76. DELETE

```bash
curl -i -X DELETE \
  http://localhost:8080/api/files/1
```

예상:

```text
204 No Content
```

---

# 77. 테스트 코드

테스트 파일 예:

```text
src/test/java/com/example/cloudfileservice/repository/InMemoryFileMetadataRepositoryTest.java
```

```java
package com.example.cloudfileservice.repository;

import com.example.cloudfileservice.domain.FileMetadata;
import com.example.cloudfileservice.domain.FileStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class InMemoryFileMetadataRepositoryTest {

    @Test
    void saveAndFindById() {

        InMemoryFileMetadataRepository repository =
                new InMemoryFileMetadataRepository();

        FileMetadata file =
                new FileMetadata(
                        null,
                        "hello.txt",
                        "text/plain",
                        13,
                        null,
                        FileStatus.REGISTERED,
                        Instant.now()
                );

        FileMetadata saved =
                repository.save(file);

        assertThat(saved.id()).isNotNull();

        var result =
                repository.findById(saved.id());

        assertThat(result).isPresent();
        assertThat(result.get().fileName())
                .isEqualTo("hello.txt");
    }
}
```

---

# 78. Service Test

```java
package com.example.cloudfileservice.service;

import com.example.cloudfileservice.dto.CreateFileRequest;
import com.example.cloudfileservice.exception.FileNotFoundException;
import com.example.cloudfileservice.repository.InMemoryFileMetadataRepository;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileMetadataServiceTest {

    @Test
    void createFile() {

        var repository =
                new InMemoryFileMetadataRepository();

        var service =
                new FileMetadataService(repository);

        var request =
                new CreateFileRequest(
                        "hello.txt",
                        "text/plain",
                        13
                );

        var result =
                service.create(request);

        assertThat(result.id()).isNotNull();
        assertThat(result.fileName())
                .isEqualTo("hello.txt");
        assertThat(result.objectKey())
                .startsWith("files/");
    }

    @Test
    void missingFileThrowsException() {

        var repository =
                new InMemoryFileMetadataRepository();

        var service =
                new FileMetadataService(repository);

        assertThatThrownBy(
                () -> service.findById(999L)
        )
        .isInstanceOf(FileNotFoundException.class);
    }
}
```

---

# 79. 테스트 실행

```bash
./gradlew test
```

성공:

```text
BUILD SUCCESSFUL
```

실패하면 바로 코드를 고치지 말고:

```text
어떤 테스트인가?
Expected?
Actual?
Stack trace?
```

를 확인한다.

---

# 80. Build

```bash
./gradlew clean build
```

의미:

```text
clean
→ 이전 build 결과 제거

build
→ compile
→ test
→ package
```

---

# 81. 가장 중요한 장애 실험 — In-Memory의 한계

이것은 반드시 직접 해본다.

### 1단계

파일 생성:

```bash
curl -X POST \
  http://localhost:8080/api/files \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "important.txt",
    "contentType": "text/plain",
    "size": 100
  }'
```

### 2단계

조회:

```bash
curl http://localhost:8080/api/files
```

데이터가 존재한다.

### 3단계

서버 종료:

```text
Ctrl + C
```

### 4단계

재실행:

```bash
./gradlew bootRun
```

### 5단계

다시 조회:

```bash
curl http://localhost:8080/api/files
```

데이터가 사라진다.

---

# 82. 왜 데이터가 사라졌는가?

Repository가:

```java
ConcurrentHashMap
```

을 사용하기 때문이다.

메모리 구조:

```text
Spring Boot Process
      |
      v
RAM
      |
      v
ConcurrentHashMap
```

프로세스가 종료되면:

```text
Process 종료
   ↓
Memory 해제
   ↓
데이터 소멸
```

한다.

이것은 Day 1에서 의도한 실험 결과다.

---

# 83. 이 실험이 Kubernetes와 연결되는 이유

최종적으로:

```text
Pod 1
Pod 2
Pod 3
```

가 실행될 수 있다.

각 Pod의 메모리는 서로 독립적이다.

```text
Pod 1 → A
Pod 2 → B
Pod 3 → C
```

요청이:

```text
POST → Pod 1
GET  → Pod 2
```

로 들어가면 같은 메모리를 보고 있지 않을 수 있다.

따라서 중요한 상태는 외부 저장소에 둔다.

---

# 84. S3와 연결

최종:

```text
Container
    |
    v
S3
    |
    v
Actual File
```

파일 자체를 S3에 저장한다.

메타데이터는:

```text
Database
```

에 저장하는 구조로 발전한다.

---

# 85. Nginx와 연결

현재:

```text
Client
 ↓
Spring Boot
```

최종:

```text
Client
 ↓
Nginx
 ↓
Spring Boot / Pods
```

Nginx는 Reverse Proxy 역할을 한다.

Day 2에 실제 구성한다.

---

# 86. OpenTelemetry와 연결

최종 구조:

```text
Client
 ↓
Nginx
 ↓
Kubernetes
 ↓
Spring Boot
 ↓
S3
```

어디에서 지연이 발생하는지 알아야 한다.

OpenTelemetry는 요청/성능 등의 telemetry를 수집하는 방향으로 확장하는 데 사용한다.

---

# 87. Grafana와 연결

나중에는:

```text
Request Rate
Error Rate
Latency
```

등을 Dashboard에서 확인한다.

Day 1에는 설치하지 않는다.

오늘은:

> "왜 운영 환경에서 관측 가능성이 필요한가?"

를 이해한다.

---

# 88. Argo CD와 연결

오늘:

```bash
git add .
git commit
git push
```

를 한다.

Day 7:

```text
GitHub
  ↓
Argo CD
  ↓
Kubernetes
```

로 연결한다.

즉 Git은 최종 GitOps 구조의 시작점이다.

---

# 89. `.gitignore`

최소:

```gitignore
build/
.gradle/
.idea/
*.iml
.env
*.pem
```

AWS Credential, Secret, Private Key 등을 Repository에 넣지 않는다.

특히 실제 Secret이 Git에 올라갔다면 단순히 파일만 삭제하지 말고 해당 자격 증명을 폐기/교체해야 한다.

---

# 90. 환경변수

나쁜 예:

```java
String bucket =
        "my-real-production-bucket";
```

좋은 방향:

```text
S3_BUCKET
AWS_REGION
```

같은 환경 설정을 사용하는 것이다.

Day 4 ECS에서는 Container 환경변수/IAM Role과 연결한다.

---

# 91. README

Day 1에는 실제 구현 상태만 기록한다.

```markdown
# Cloud File Service

## Current Status

Day 1 — Spring Boot Application Foundation

## Features

- Health API
- File metadata creation
- File metadata list
- File metadata lookup
- Delete state
- Validation
- Exception handling
- Tests

## API

GET /health
POST /api/files  (multipart upload)
GET /api/files?folderId={id}
GET /api/files/{id}/download
DELETE /api/files/{id}

## Current Storage

PostgreSQL metadata + Amazon S3 file contents

## Future

- Docker
- Nginx
- AWS S3
- ECR
- ECS
- Terraform
- Kubernetes
- OpenTelemetry
- Grafana
- Argo CD
```

---

# 92. 완료하지 않은 것은 완료했다고 쓰지 않는다

Day 1:

```text
Spring Boot API       ✅
In-Memory Repository  ✅
```

아직:

```text
S3                   예정
ECS                  예정
Terraform             예정
Kubernetes            예정
Grafana               예정
Argo CD               예정
```

이다.

이것이 포트폴리오에서 중요하다.

---

# 93. 디버깅 방법

문제가 생기면:

```text
1. 재현
2. 에러 메시지 확인
3. 로그 확인
4. 계층 분류
5. 최소 수정
6. 테스트
7. 다시 재현
```

---

# 94. 404가 나오면

확인:

```text
URL
HTTP Method
@RequestMapping
@GetMapping
@PostMapping
Controller package
```

예를 들어:

```text
GET /api/file
```

인데:

```text
/api/files
```

로 구현했다면 404가 발생할 수 있다.

---

# 95. 400이 나오면

확인:

```text
JSON 문법
Content-Type
필수 필드
Validation
자료형
```

예:

```json
{
  "size": "abc"
}
```

`long`으로 변환할 수 없으므로 문제가 발생한다.

---

# 96. 500이 나오면

서버 로그를 확인한다.

특히:

```text
Exception
Caused by
Stack Trace
```

를 찾는다.

500은:

> 서버 내부에서 처리하지 못한 문제가 발생했다.

는 의미다.

---

# 97. 로그 읽기

서버 실행 시:

```text
Application started
Port
Profile
Warning
Error
Exception
```

등을 확인한다.

이 습관은 이후:

```text
ECS
→ CloudWatch Logs

Kubernetes
→ kubectl logs
```

로 이어진다.

---

# 98. 최종 API 테스트 체크리스트

## Health

```bash
curl -i http://localhost:8080/health
```

- [ ] 200

## Create

```bash
curl -i -X POST \
  http://localhost:8080/api/files \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "hello.txt",
    "contentType": "text/plain",
    "size": 13
  }'
```

- [ ] 201
- [ ] ID 생성
- [ ] objectKey 생성
- [ ] status 확인

## List

```bash
curl -i http://localhost:8080/api/files
```

- [ ] 200

## Get

```bash
curl -i http://localhost:8080/api/files/1
```

- [ ] 200

## Not Found

```bash
curl -i http://localhost:8080/api/files/999999
```

- [ ] 404

## Invalid

```text
fileName = ""
size = 0
size = -1
```

- [ ] 400

## Delete

```bash
curl -i -X DELETE \
  http://localhost:8080/api/files/1
```

- [ ] 204

---

# 99. Day 1 최종 폴더 구조

```text
backend/
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/example/cloudfileservice/
│   │   │       ├── CloudFileServiceApplication.java
│   │   │       ├── controller/
│   │   │       │   ├── HealthController.java
│   │   │       │   └── FileController.java
│   │   │       ├── service/
│   │   │       │   └── FileMetadataService.java
│   │   │       ├── repository/
│   │   │       │   ├── FileMetadataRepository.java
│   │   │       │   └── InMemoryFileMetadataRepository.java
│   │   │       ├── domain/
│   │   │       │   ├── FileMetadata.java
│   │   │       │   └── FileStatus.java
│   │   │       ├── dto/
│   │   │       │   ├── CreateFileRequest.java
│   │   │       │   └── FileResponse.java
│   │   │       └── exception/
│   │   │           ├── FileNotFoundException.java
│   │   │           └── GlobalExceptionHandler.java
│   │   └── resources/
│   │       └── application.yml
│   └── test/
│
├── build.gradle
├── settings.gradle
├── gradlew
└── gradlew.bat

README.md
.gitignore
```

---

# 100. Day 1 학습 기록 템플릿

`docs/day1.md`

```markdown
# Day 1 Study Log

## Date

2026-09-12

## Goal

Spring Boot 기반 Cloud File Service Application Foundation 구현

## Environment

- GitHub Codespaces
- Java:
- Spring Boot:
- Gradle:
- OS:

## Implemented

- [ ] Health API
- [ ] FileStatus
- [ ] FileMetadata
- [ ] CreateFileRequest
- [ ] FileResponse
- [ ] Repository
- [ ] Service
- [ ] Controller
- [ ] Validation
- [ ] Exception Handler
- [ ] Tests

## API Test

### GET /health

Result:

### POST /api/files

Result:

### GET /api/files

Result:

### GET /api/files/{id}/download

Result:

### DELETE /api/files/{id}

Result:

## Failure Tests

### Empty fileName

Result:

### Empty contentType

Result:

### size = 0

Result:

### size < 0

Result:

### Non-existent ID

Result:

## Restart Experiment

What happened?

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

Docker + Nginx
```

---

# 101. 해커톤에서 설명할 수 있어야 하는 것

## 왜 파일을 Container에 저장하지 않는가?

> Container는 재시작/교체될 수 있으므로 영속적인 파일 저장소로 사용하는 데 적합하지 않다. 실제 파일은 S3 같은 외부 저장소에 두고 메타데이터는 별도로 관리하는 구조로 확장한다.

## 왜 Docker인가?

> 애플리케이션과 실행 환경을 이미지로 패키징해 로컬, ECS, Kubernetes 등 서로 다른 환경에서 일관되게 실행하기 위해 사용한다.

## 왜 ECS와 Kubernetes를 모두 사용하는가?

> 동일한 Container를 AWS 관리형 Container 실행 환경인 ECS와 Kubernetes에서 실행해 보며 배포 및 운영 모델의 차이를 비교하기 위해 사용한다.

## 왜 Terraform인가?

> AWS 인프라를 콘솔에서 수동 생성하는 대신 코드로 정의하고 변경 이력을 관리하며 반복적으로 재현하기 위해 Infrastructure as Code를 적용한다.

## 왜 Nginx인가?

> Client와 애플리케이션 사이의 Reverse Proxy 계층을 구성하고 여러 백엔드 인스턴스로 요청을 전달하는 구조를 경험하기 위해 사용한다.

## 왜 OpenTelemetry인가?

> 시스템이 여러 구성요소로 확장되면 단순 성공/실패만으로 장애 원인을 찾기 어렵기 때문에 요청 흐름과 성능을 관찰할 telemetry가 필요하다.

## 왜 Grafana인가?

> 관측 데이터를 Dashboard로 시각화해 요청량, 오류, 지연시간 등의 운영 상태를 빠르게 파악하기 위해 사용한다.

## 왜 Argo CD인가?

> Kubernetes 배포 설정을 Git에서 관리하고 Git에 정의된 원하는 상태와 실제 클러스터 상태를 동기화하는 GitOps 흐름을 구현하기 위해 사용한다.

---

# 102. Day 1의 핵심 개념 15개

1. Controller는 HTTP 요청을 처리한다.
2. Service는 비즈니스 흐름을 처리한다.
3. Repository는 저장/조회를 담당한다.
4. Domain은 시스템 핵심 데이터를 표현한다.
5. DTO는 API 입출력 모델이다.
6. Validation은 잘못된 입력을 경계에서 차단한다.
7. Exception Handler는 예외를 HTTP 응답으로 변환한다.
8. Dependency Injection은 객체의 의존성을 외부에서 연결한다.
9. In-Memory 데이터는 프로세스 종료 후 사라진다.
10. Container는 재시작/교체될 수 있다고 가정해야 한다.
11. 실제 파일은 최종적으로 S3 같은 외부 영속 저장소로 분리한다.
12. 파일 메타데이터와 실제 파일 내용은 서로 다른 책임으로 볼 수 있다.
13. Docker는 애플리케이션을 실행 가능한 이미지로 패키징한다.
14. Kubernetes는 Container의 배포/운영을 관리한다.
15. GitHub → Argo CD → Kubernetes가 최종 GitOps 흐름이다.

---

# 103. Day 1 → Day 2

오늘:

```text
Spring Boot
   ↓
JAR
```

내일:

```text
Spring Boot
   ↓
JAR
   ↓
Docker Image
   ↓
Container
```

그리고 Nginx:

```text
Client
   ↓
Nginx
   ↓
Container
```

를 붙인다.

---

# 104. Day 2 → Day 3

```text
Docker
  ↓
Spring Boot
  ↓
S3
```

실제 파일 저장을 연결한다.

---

# 105. Day 3 → Day 4

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

실제 AWS에서 실행한다.

---

# 106. Day 4 → Day 5

수동으로 만든 AWS 인프라를 이해한 다음:

```text
Terraform
    ↓
AWS Infrastructure
```

로 코드화한다.

---

# 107. Day 5 → Day 6

같은 Docker Image를:

```text
Kubernetes
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
OpenTelemetry
    ↓
Grafana
```

를 연결한다.

---

# 108. Day 6 → Day 7

최종:

```text
GitHub
   ↓
Argo CD
   ↓
Kubernetes
```

GitOps를 구현한다.

그리고:

```text
Pod 장애
Network 문제
잘못된 설정
```

등을 일부러 발생시켜 장애 대응 능력을 확인한다.

---

# 109. Day 1 PASS 기준

## 환경

- [ ] Codespace 생성
- [ ] Terminal 사용
- [ ] Java 확인
- [ ] Gradle 확인
- [ ] Git 확인

## Application

- [ ] Spring Boot 실행
- [ ] `/health`
- [ ] Domain
- [ ] DTO
- [ ] Repository
- [ ] Service
- [ ] Controller
- [ ] Exception Handler

## API

- [ ] POST → 201
- [ ] GET all → 200
- [ ] GET one → 200
- [ ] 없는 ID → 404
- [ ] Invalid input → 400
- [ ] DELETE → 204

## Test

- [ ] Repository test
- [ ] Service test
- [ ] 실패 테스트
- [ ] 경계값 테스트

## 장애 실험

- [ ] 서버 재시작
- [ ] In-Memory 데이터 소멸 확인
- [ ] 원인을 설명할 수 있음

## Git

- [ ] `.gitignore`
- [ ] commit
- [ ] push
- [ ] GitHub에서 확인

---

# 110. 코드 없이 설명하는 최종 복습

다음 요청이 들어왔다고 생각한다.

```http
POST /api/files
Content-Type: application/json
```

```json
{
  "fileName": "hello.txt",
  "contentType": "text/plain",
  "size": 13
}
```

코드를 보지 않고 다음을 말해본다.

```text
1. HTTP 요청이 Spring Boot에 도착한다.
2. FileController가 요청을 받는다.
3. JSON이 CreateFileRequest가 된다.
4. @Valid가 Validation을 실행한다.
5. Service.create()가 호출된다.
6. Service가 FileMetadata를 만든다.
7. Repository에 저장한다.
8. Repository가 ID를 생성한다.
9. Service가 objectKey를 만든다.
10. 저장한다.
11. FileResponse로 변환한다.
12. 201 Created를 반환한다.
```

이 흐름을 설명할 수 있다면 Day 1의 핵심을 이해한 것이다.

---

# 111. 최종 아키텍처 요약

```text
┌─────────────────────────────────────────────────────────┐
│                    CLOUD FILE SERVICE                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Client                                                  │
│   │                                                     │
│   ▼                                                     │
│ Nginx                                                   │
│   │                                                     │
│   ▼                                                     │
│ Spring Boot                                             │
│   │                                                     │
│   ├──────────────► Metadata DB                          │
│   │                                                     │
│   └──────────────► S3                                   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Deployment                                              │
│                                                         │
│ Docker → ECR → ECS/Fargate                              │
│                                                         │
│ Docker → Kubernetes → Deployment → Pods → Service      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ IaC                                                     │
│                                                         │
│ Terraform → AWS Infrastructure                          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Observability                                           │
│                                                         │
│ Spring Boot → OpenTelemetry → Telemetry → Grafana      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ GitOps                                                  │
│                                                         │
│ GitHub → Argo CD → Kubernetes                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

# 112. 오늘 실제로 해야 할 순서

```text
STEP 1
Repository / Codespace
        ↓
STEP 2
Linux / Git
        ↓
STEP 3
Java / Gradle
        ↓
STEP 4
Spring Boot 실행
        ↓
STEP 5
application.yml
        ↓
STEP 6
Health API
        ↓
STEP 7
FileStatus
        ↓
STEP 8
FileMetadata
        ↓
STEP 9
Repository Interface
        ↓
STEP 10
In-Memory Repository
        ↓
STEP 11
CreateFileRequest
        ↓
STEP 12
FileResponse
        ↓
STEP 13
Service
        ↓
STEP 14
Exception
        ↓
STEP 15
Global Exception Handler
        ↓
STEP 16
Controller
        ↓
STEP 17
JUnit
        ↓
STEP 18
curl 정상 테스트
        ↓
STEP 19
curl 실패/경계값 테스트
        ↓
STEP 20
서버 재시작 실험
        ↓
STEP 21
README
        ↓
STEP 22
Git commit
        ↓
STEP 23
Git push
```

---

# 113. Day 1 완료 선언

다음 문장을 스스로 설명할 수 있으면 Day 1 PASS다.

> GitHub Codespaces에서 Spring Boot 애플리케이션을 실행했고, Controller → Service → Repository 구조로 파일 메타데이터 API를 만들었다. DTO에 Validation을 적용했고, 존재하지 않는 파일은 예외 처리하여 404로 반환한다. 현재 저장소는 In-Memory이므로 애플리케이션을 재시작하면 데이터가 사라진다는 것을 직접 확인했다. 따라서 최종 시스템에서는 실제 파일을 S3에 저장하고 메타데이터를 별도 영속 저장소에 관리한다. 이후 Docker, Nginx, S3, ECR, ECS, Terraform, Kubernetes, OpenTelemetry, Grafana, Argo CD를 이 애플리케이션 위에 단계적으로 연결한다.

---

# 114. 다음 단계

**Day 2 — Docker + Nginx**

다음 날에는 오늘 만든 애플리케이션을 버리지 않는다.

```text
Spring Boot
   ↓
JAR
   ↓
Dockerfile
   ↓
Docker Image
   ↓
Container
   ↓
Nginx
```

그리고 다음 명령을 직접 사용한다.

```bash
docker build
docker run
docker ps
docker logs
docker exec
```

---

# 115. Day 1 한 문장

> **클라우드에 올리기 전에, 클라우드에서 실행할 가치가 있는 애플리케이션을 먼저 제대로 만든다.**

