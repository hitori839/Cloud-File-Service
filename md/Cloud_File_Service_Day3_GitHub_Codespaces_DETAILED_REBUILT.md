# Cloud File Service — Day 3
## GitHub Codespaces 초보자용 상세 실습서
### Spring Boot + Docker + AWS S3 실제 연동

> 참고: 로컬 개발에서는 Docker Compose와 PostgreSQL의 기본값이 유효하지만, AWS ECS 배포에서는 `localhost:5432`를 절대로 사용하면 안 된다. 실제 배포 시에는 DB endpoint, IAM, security group, public IP 검증 순서를 먼저 따라야 한다.

> **현재 구현 기준:** 최종 저장소(Day 3.5 이후)에서는 파일 업로드 응답이 S3 key 문자열이 아니라 `FileResponse`이며, 다운로드는 `/api/files/{id}/download`에서 DB의 파일 ID로 수행한다. 최종 업로드 흐름은 `MultipartFile -> S3StorageService -> FileEntity -> FileResponse`이고, PostgreSQL 연결이 backend 시작에 필요하다. **이 Day 3 문서는 그 이전 단계**로, `FileController`가 `S3StorageService`를 직접 호출하고 업로드 응답으로 S3 key 문자열을 돌려준다(DB 불필요). Day 3.5에서 이 Controller를 `FileService` + PostgreSQL 구조로 교체한다.

> **개인정보 보호:** AWS access key, secret key, 계정 ID, 개인 파일명과 실제 비밀번호는 이 문서에 기록하지 않는다. 모든 credential 예시는 실행 환경의 환경변수 또는 placeholder로 대체한다.

> **Day 3 목표**
>
> Day 1~2에서 만든 파일 서비스(메모리에 metadata만 저장하는 JSON API)를 실제 파일을 **Amazon S3**에 저장하는 업로드/다운로드/삭제 API로 바꾼다.
>
> 이 문서는 단순히 코드를 보여주는 것이 아니라 **어느 폴더에서, 어떤 파일을 만들고, 기존 코드의 어디를 찾아서 어떻게 수정하는지**를 초보자 기준으로 단계별 설명한다.

---

# 1. Day 3에서 만드는 최종 구조

```text
사용자
  |
  | HTTP
  v
Spring Boot
  |
  v
FileController
  |
  v
S3StorageService
  |
  v
AWS SDK for Java
  |
  v
Amazon S3
  |
  v
Bucket
  |
  +-- Object
  +-- Object
  +-- Object
```

Day 2가 대략:

```text
Spring Boot → In-Memory Repository (파일 metadata만, 실제 파일 없음)
```

이었다면 Day 3은:

```text
Spring Boot → AWS SDK → S3
```

로 바뀐다.

---

# 2. 오늘 수정/생성할 파일

프로젝트가 다음과 같은 구조라고 가정한다.

```text
cloud-file-service/
├── backend/
│   ├── build.gradle
│   └── src/
│       └── main/
│           ├── java/
│           │   └── [현재 패키지]/
│           │       ├── controller/
│           │       │   └── FileController.java
│           │       │
│           │       ├── config/
│           │       │   └── S3Config.java          ← 새로 생성
│           │       │
│           │       └── storage/
│           │           └── S3StorageService.java ← 새로 생성
│           │
│           └── resources/
│               └── application.properties
│
├── Dockerfile
├── docker-compose.yml
└── .gitignore
```

## 핵심 수정 순서

```text
1. backend/build.gradle
        ↓
2. application.properties
        ↓
3. S3Config.java 생성
        ↓
4. S3StorageService.java 생성
        ↓
5. 기존 FileController.java 수정
        ↓
6. .gitignore 확인
        ↓
7. Dockerfile 확인
```

**현재 프로젝트의 패키지명과 기존 Controller 구조는 먼저 확인하고 그대로 유지한다.**

---

# 3. GitHub Codespaces 시작

GitHub에서 Repository를 연다.

```text
Code
→ Codespaces
→ Create codespace
```

VS Code가 열리면:

```text
Terminal
→ New Terminal
```

을 선택한다.

---

# 4. 프로젝트 위치 확인

```bash
pwd
```

그리고:

```bash
ls -la
```

프로젝트 루트인지 확인한다.

예:

```text
/workspaces/cloud-file-service
```

---

# 5. backend 확인

```bash
ls backend
```

보통:

```text
build.gradle
settings.gradle
src
```

등이 있어야 한다.

---

# 6. Java 파일 전체 확인

```bash
find backend/src/main/java -type f
```

이 명령으로 **현재 프로젝트의 실제 파일명**을 먼저 확인한다.

예:

```text
backend/src/main/java/com/example/backend/BackendApplication.java
backend/src/main/java/com/example/backend/controller/FileController.java
```

---

# 7. 현재 패키지명 확인

```bash
grep -R "^package " backend/src/main/java
```

예:

```text
package com.example.backend;
```

이라면 새 Java 파일도:

```text
com.example.backend
```

아래에 만든다.

**문서의 `com.example.backend`를 실제 프로젝트 패키지명으로 바꿔야 한다.**

---

# 8. 현재 Controller 찾기

```bash
find backend/src/main/java -type f | grep -i controller
```

또는:

```bash
grep -R "MultipartFile" backend/src/main/java
```

파일 업로드 기능이 이미 있다면 `MultipartFile`을 사용하는 Controller가 있을 가능성이 높다.

---

# 9. 기존 Controller를 먼저 읽는다

예:

```bash
cat backend/src/main/java/com/example/backend/controller/FileController.java
```

또는 VS Code Explorer에서 해당 파일을 연다.

**기존 Controller를 무조건 삭제하지 않는다.**

Day 3의 핵심은 기존 파일 서비스 기능을 유지하면서 저장 방식만 S3로 바꾸는 것이다.

---

# 10. Day 3 시작 전 Git 저장

프로젝트 루트:

```bash
git status
```

Commit하지 않은 변경사항이 있다면 현재 상태를 먼저 저장한다. (`nothing to commit`이면 이 단계는 건너뛴다.)

```bash
git add .
git commit -m "save day2 before s3 integration"
```

---

# 11. AWS S3 개념

S3:

> Amazon Simple Storage Service

AWS의 객체 스토리지다.

쉽게:

```text
사진
PDF
동영상
문서
ZIP
```

같은 파일 데이터를 저장하는 서비스라고 생각하면 된다.

---

# 12. Bucket

S3 파일은 Bucket 안에 저장된다.

```text
S3
└── Bucket
    ├── file1.txt
    ├── image.png
    └── report.pdf
```

Bucket 이름은 전 세계적으로 고유해야 한다.

---

# 13. Object

S3에서는 일반적인 파일을 Object라고 부른다.

```text
hello.txt
```

를 업로드하면 S3 Object가 된다.

---

# 14. Object Key

S3 Object의 이름/식별자를 Key라고 한다.

예:

```text
hello.txt
```

또는:

```text
uploads/2026/09/hello.txt
```

이번 Day 3에서는 초보자가 URL Path 문제를 겪지 않도록 기본적으로 UUID를 붙인 Key를 사용한다.

예:

```text
550e8400-e29b-41d4-a716-446655440000-hello.txt
```

---

# 15. Region

예:

```text
ap-northeast-2
```

는 서울 Region이다.

이번 문서는 서울 Region을 기준으로 한다.

---

# 16. AWS CLI 확인

Codespaces Terminal:

```bash
aws --version
```

정상적으로 설치되어 있어야 한다.

`command not found`가 나오면 AWS CLI v2를 설치한다. (프로젝트 폴더 안에 설치 파일이 생기지 않도록 `/tmp`에서 진행한다.)

```bash
cd /tmp
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip -q awscliv2.zip
sudo ./aws/install
cd -
aws --version
```

> 프로젝트 루트에서 설치했다면 `aws/` 폴더와 `awscliv2.zip`이 Git에 올라가지 않도록 27번에서 `.gitignore`에 추가한다.

---

# 17. AWS 인증 확인

```bash
aws sts get-caller-identity
```

성공하면 AWS 계정 정보가 나온다.

이 명령이 실패한다면 Spring Boot S3 연동보다 먼저 AWS 인증을 해결해야 한다.

인증 방법 예 (둘 중 하나):

```bash
aws configure
# → ~/.aws/credentials 에 저장된다 (프로젝트 폴더 밖이므로 Git에 올라가지 않는다)
```

또는 26번처럼 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` 환경변수를 export한다. (Codespaces Secrets에 등록해 두면 새 Terminal에서도 자동으로 설정된다.)

---

# 18. Region 설정

```bash
export AWS_REGION=ap-northeast-2
```

확인:

```bash
echo "$AWS_REGION"
```

---

# 19. S3 Bucket 생성

AWS Console에서:

```text
S3
→ Create bucket
```

Bucket 이름을 정한다.

예:

```text
cloud-file-service-2026-unique-name
```

**실제 이름은 본인이 만든 Bucket 이름을 사용한다.**

---

# 20. Bucket 이름 기록

예:

```text
S3_BUCKET=cloud-file-service-2026-unique-name
```

터미널:

```bash
export S3_BUCKET=YOUR_BUCKET_NAME
```

예:

```bash
export S3_BUCKET=cloud-file-service-2026-unique-name
```

---

# 21. S3 Public Access

학습용 파일 서비스라도 Bucket 전체를 Public으로 만들 필요가 없다.

가능하면:

```text
Block Public Access
```

를 유지한다.

애플리케이션이 IAM 권한을 가지고 S3에 접근한다.

```text
Client
  ↓
Spring Boot
  ↓
IAM 권한
  ↓
S3
```

---

# 22. AWS CLI로 Bucket 확인

```bash
aws s3 ls
```

특정 Bucket:

```bash
aws s3 ls s3://$S3_BUCKET
```

---

# 23. CLI로 S3 테스트

파일:

```bash
echo "hello s3" > test-s3.txt
```

업로드:

```bash
aws s3 cp test-s3.txt s3://$S3_BUCKET/test-s3.txt
```

확인:

```bash
aws s3 ls s3://$S3_BUCKET/
```

---

# 24. 다운로드

```bash
aws s3 cp   s3://$S3_BUCKET/test-s3.txt   downloaded-test.txt
```

확인:

```bash
cat downloaded-test.txt
```

결과:

```text
hello s3
```

---

# 25. 삭제

```bash
aws s3 rm s3://$S3_BUCKET/test-s3.txt
```

확인:

```bash
aws s3 ls s3://$S3_BUCKET/
```

---

# 26. IAM과 Credentials

AWS SDK가 S3에 요청하려면 권한이 필요하다.

개발 환경에서는 AWS Credential Provider Chain을 사용할 수 있다.

환경변수 예:

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="ap-northeast-2"
```

**실제 Secret은 이 문서, GitHub, Dockerfile, README 등에 기록하지 않는다.**

ECS로 배포할 때는 장기 Access Key를 Container에 넣지 않고 **ECS Task Role**을 사용하는 방향으로 만든다.

---

# 27. `.gitignore` 확인

프로젝트 루트:

```text
.gitignore
```

에 다음을 확인/추가한다.

```gitignore
.env
.env.*
!.env.example
.aws/
*.pem
build/
.gradle/

# AWS CLI 설치 파일 (프로젝트 루트에서 설치한 경우)
/aws/
awscliv2.zip

# Day 3 실습용 테스트 파일
test-s3.txt
downloaded-test.txt
day3.txt
day3-download.txt
docker-test.txt
after-restart.txt
final.txt
final-download.txt
```

---

# 28. `.env.example`

필요하다면:

```text
.env.example
```

을 만든다.

```env
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY
S3_BUCKET=YOUR_BUCKET_NAME
```

실제 Secret은 넣지 않는다.

---

# 29. AWS SDK dependency 확인

`backend/build.gradle`을 연다.

먼저:

```bash
grep -n "software.amazon.awssdk" backend/build.gradle
```

또는:

```bash
grep -n "aws" backend/build.gradle
```

이미 AWS SDK가 있다면 중복 추가하지 않는다.

---

# 30. `backend/build.gradle` 수정

`dependencies { ... }` 안에 다음 **두 줄**을 추가한다.

```gradle
implementation platform('software.amazon.awssdk:bom:2.36.3')
implementation 'software.amazon.awssdk:s3'
```

> **중요:** Spring Boot의 dependency management는 AWS SDK 버전을 관리하지 않는다. `software.amazon.awssdk:s3`만 버전 없이 추가하면 `Could not find software.amazon.awssdk:s3:.` 오류가 난다. 그래서 AWS SDK BOM(`platform(...)`)으로 버전을 지정한다.

현재 저장소 기준 예 (Day 1에서 Spring Initializr가 만든 dependency 뒤에 추가):

```gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-actuator'
    implementation 'org.springframework.boot:spring-boot-starter-validation'
    implementation 'org.springframework.boot:spring-boot-starter-webmvc'
    testImplementation 'org.springframework.boot:spring-boot-starter-actuator-test'
    testImplementation 'org.springframework.boot:spring-boot-starter-validation-test'
    testImplementation 'org.springframework.boot:spring-boot-starter-webmvc-test'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'

    implementation platform('software.amazon.awssdk:bom:2.36.3')

    implementation 'software.amazon.awssdk:s3'
}
```

기존 dependency는 삭제하지 않는다. (`spring-boot-starter-data-jpa`, `postgresql`은 Day 3.5에서 추가한다.)

---

# 31. AWS SDK 버전 관리

30번의:

```gradle
implementation platform('software.amazon.awssdk:bom:2.36.3')
```

가 AWS SDK BOM이다. BOM이 SDK 모듈들(`s3`, `regions`, `auth` 등)의 버전을 한 번에 맞춰 주므로 `s3` dependency에는 버전을 쓰지 않는다.

이미 BOM이 있는 프로젝트에서는 중복 추가하지 않고 같은 dependency management를 그대로 따른다.

---

# 32. Gradle dependency 확인

```bash
cd backend
./gradlew dependencies
```

그리고:

```bash
./gradlew clean build
```

정상:

```text
BUILD SUCCESSFUL
```

---

# 33. `application.properties` 찾기

파일:

```text
backend/src/main/resources/application.properties
```

확인:

```bash
cat src/main/resources/application.properties
```

(32번에서 `cd backend` 했으므로 현재 위치는 `backend/`다.)

> **주의 — `application.yml`:** 같은 폴더에 `application.yml`이 있을 수 있다. 두 파일은 동시에 로드되고 같은 키는 `application.properties`가 우선한다. **S3 설정은 `application.properties`에만 추가한다.** `application.yml`에 `cloud.aws.region`, `cloud.aws.s3.bucket`(`AWS_S3_BUCKET`) 같은 키를 넣어도 현재 코드(`@Value("${aws.region}")`, `@Value("${aws.s3.bucket}")`)는 읽지 않으며, 환경변수 이름도 `AWS_S3_BUCKET`이 아니라 `S3_BUCKET`이다.

---

# 34. 기존 설정을 삭제하지 않는다

현재:

```properties
spring.application.name=backend

server.address=0.0.0.0
server.port=8080
```

등이 있다면 유지한다.

맨 아래에 S3 설정을 추가한다.

---

# 35. S3 설정 추가

```properties
# AWS
aws.region=${AWS_REGION:ap-northeast-2}

# S3
aws.s3.bucket=${S3_BUCKET:local-cloud-file-service}

# Multipart
spring.servlet.multipart.max-file-size=10MB
spring.servlet.multipart.max-request-size=10MB
```

---

# 36. 설정 설명

```properties
aws.region=${AWS_REGION:ap-northeast-2}
```

뜻:

```text
AWS_REGION 환경변수가 있으면 그 값을 사용
없으면 ap-northeast-2 사용
```

---

# 37. Bucket 설정

```properties
aws.s3.bucket=${S3_BUCKET:local-cloud-file-service}
```

뜻:

```text
S3_BUCKET 환경변수가 있으면 그 값을 사용
없으면 local-cloud-file-service 사용 (placeholder)
```

기본값을 두는 이유: `S3_BUCKET`이 없는 Terminal에서 `./gradlew clean build`를 실행해도 테스트(`BackendApplicationTests`의 context load)가 `Could not resolve placeholder 'S3_BUCKET'`로 실패하지 않게 하기 위해서다. 기본값은 실제 Bucket이 아니므로 **실제 업로드 전에는 반드시 `S3_BUCKET`을 export한다.** (그렇지 않으면 업로드 시 `NoSuchBucket` 또는 `AccessDenied`가 난다.)

예:

```bash
export S3_BUCKET=cloud-file-service-2026-unique-name
```

이면:

```text
aws.s3.bucket
=
cloud-file-service-2026-unique-name
```

---

# 38. `S3Config.java` 만들기

현재 패키지가:

```text
com.example.backend
```

라고 가정한다.

폴더:

```text
backend/src/main/java/com/example/backend/config/
```

생성:

```bash
mkdir -p src/main/java/com/example/backend/config
```

파일:

```text
S3Config.java
```

---

# 39. `S3Config.java` 전체 코드

```java
package com.example.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
public class S3Config {

    @Value("${aws.region}")
    private String region;

    @Bean
    public S3Client s3Client() {

        return S3Client.builder()
                .region(Region.of(region))
                .build();
    }
}
```

**중요:** `package com.example.backend.config;`는 현재 프로젝트의 실제 패키지명으로 변경한다.

---

# 40. `@Configuration`

```java
@Configuration
```

Spring에게:

> 이 클래스는 설정 클래스다.

라고 알려준다.

---

# 41. `@Value`

```java
@Value("${aws.region}")
private String region;
```

`application.properties`의:

```properties
aws.region=...
```

값을 Java 변수에 넣는다.

---

# 42. `@Bean`

```java
@Bean
public S3Client s3Client()
```

Spring Container에 S3Client를 등록한다.

그러면 다른 클래스에서:

```java
private final S3Client s3Client;
```

형태로 주입받을 수 있다.

---

# 43. S3Client

```java
S3Client.builder()
        .region(Region.of(region))
        .build();
```

AWS S3와 통신할 Java Client를 생성한다.

여기에는 Access Key를 직접 작성하지 않는다.

---

# 44. Credentials는 어떻게 찾는가?

AWS SDK는 여러 Credential Provider를 순서대로 확인할 수 있다.

개발환경에서는:

```text
환경변수
AWS 설정
기타 Provider
```

등을 사용할 수 있다.

ECS에서는:

```text
ECS Task Role
```

을 사용하는 방향으로 간다. (Day 7의 EKS에서는 같은 역할을 **EKS Pod Identity**가 한다.) 코드에 Credential을 넣지 않았기 때문에 `S3Config`를 바꾸지 않고 실행 환경만 바꿔도 동작한다.

---

# 45. `S3StorageService.java` 만들기

폴더:

```text
backend/src/main/java/com/example/backend/storage/
```

생성:

```bash
mkdir -p src/main/java/com/example/backend/storage
```

파일:

```text
S3StorageService.java
```

---

# 46. `S3StorageService.java` 전체 코드

```java
package com.example.backend.storage;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class S3StorageService {

    private final S3Client s3Client;
    private final String bucket;

    public S3StorageService(
            S3Client s3Client,
            @Value("${aws.s3.bucket}") String bucket
    ) {
        this.s3Client = s3Client;
        this.bucket = bucket;
    }

    public String upload(String key, MultipartFile file) throws IOException {

        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(
                        file.getContentType() != null
                                ? file.getContentType()
                                : "application/octet-stream"
                )
                .contentLength(file.getSize())
                .build();

        s3Client.putObject(
                request,
                RequestBody.fromInputStream(
                        file.getInputStream(),
                        file.getSize()
                )
        );

        return key;
    }

    public byte[] download(String key) {

        GetObjectRequest request = GetObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .build();

        ResponseBytes<GetObjectResponse> response =
                s3Client.getObjectAsBytes(request);

        return response.asByteArray();
    }

    public void delete(String key) {

        DeleteObjectRequest request = DeleteObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .build();

        s3Client.deleteObject(request);
    }

    public boolean exists(String key) {

        try {

            HeadObjectRequest request = HeadObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .build();

            s3Client.headObject(request);

            return true;

        } catch (Exception e) {

            return false;
        }
    }
}
```

---

# 47. `S3StorageService`의 역할

이 클래스 하나가 S3와 통신한다.

```text
upload()
download()
delete()
exists()
```

Controller는 S3 SDK의 세부 구현을 몰라도 된다.

---

# 48. `upload()` 자세히 보기

```java
public String upload(String key, MultipartFile file)
```

입력:

```text
key
→ S3 Object Key

file
→ 업로드 파일
```

---

# 49. `PutObjectRequest`

```java
PutObjectRequest.builder()
        .bucket(bucket)
        .key(key)
```

은:

```text
어느 Bucket?
어떤 Key?
```

를 지정한다.

---

# 50. Content-Type

```java
.contentType(file.getContentType())
```

예:

```text
image/png
application/pdf
text/plain
```

등을 S3 Object의 Content-Type으로 지정한다.

---

# 51. 파일 크기

```java
.contentLength(file.getSize())
```

파일 크기를 전달한다.

그리고:

```java
RequestBody.fromInputStream(
    file.getInputStream(),
    file.getSize()
)
```

로 파일 데이터를 요청 Body로 만든다.

---

# 52. 실제 업로드

```java
s3Client.putObject(...)
```

가 실행되는 순간 AWS S3에 Object가 생성된다.

---

# 53. Download

```java
s3Client.getObjectAsBytes(request);
```

S3 Object를 가져와 byte 배열로 만든다.

현재 구현은 이해하기 쉬운 기본 방식이다.

대용량 파일에서는:

```text
Streaming
Presigned URL
Multipart Upload
```

등을 고려한다.

---

# 54. Delete

```java
s3Client.deleteObject(request);
```

S3 Object를 삭제한다.

---

# 55. Exists

```java
s3Client.headObject(request);
```

Object를 실제로 다운로드하지 않고 존재 여부를 확인할 수 있다.

---

# 56. 기존 `FileController.java` 수정

다시 실제 Controller를 찾는다.

```bash
find src/main/java -type f | grep -i controller
```

그리고:

```bash
grep -R "MultipartFile" src/main/java
```

---

# 57. 기존 Controller에서 찾을 코드

> **이 시리즈(Day 1~2)를 그대로 따라왔다면:** 로컬 디스크 저장 코드는 없다. 현재 `FileController`는 `FileMetadataService`를 사용하는 **JSON metadata API**(`POST /api/files` + `@RequestBody CreateFileRequest`, `GET /api/files`, `GET /api/files/{id}`, `DELETE /api/files/{id}`, `id`는 `Long`)다. 이 경우 57·58·101·102번의 로컬 디스크 설명은 참고만 하고, 60번 코드로 `FileController.java` **전체를 교체**한다.

다른 프로젝트에서 로컬 디스크에 저장하고 있었다면 코드가 다음과 비슷할 수 있다.

```java
Path path = Paths.get("uploads", file.getOriginalFilename());

Files.write(
    path,
    file.getBytes()
);
```

이런 코드는 **로컬 디스크에 저장**한다.

Day 3에서는 이 부분을 S3 Service 호출로 바꾼다.

---

# 58. 기존 구조

```text
FileController
      |
      v
Files.write()
      |
      v
uploads/
```

Day 3:

```text
FileController
      |
      v
S3StorageService
      |
      v
S3
```

---

# 59. Controller에서 Service 주입

기존 Controller에:

```java
private final S3StorageService storageService;

public FileController(S3StorageService storageService) {
    this.storageService = storageService;
}
```

를 추가한다.

Lombok을 이미 사용한다면 프로젝트의 기존 방식에 맞춰 생성자 주입을 유지해도 된다.

---

# 60. Upload Controller 예시

Controller가 없거나, Day 1~2의 JSON metadata `FileController`를 사용 중이라면 `backend/src/main/java/com/example/backend/controller/FileController.java`의 내용을 **아래 코드로 전체 교체**한다. (현재 저장소의 Day 3 Commit도 이렇게 교체했다.)

> 기존 `@GetMapping("/{id}")`(Long)와 새 `@GetMapping("/{key}")`(String)를 한 Controller에 같이 두면 같은 URL 패턴이라 Spring 시작 시 `Ambiguous mapping` 오류가 난다. 기존 JSON `@PostMapping`도 multipart 업로드와 같은 `POST /api/files`를 사용하므로 남겨 두지 않는다.
>
> Day 1에서 만든 `domain/`, `dto/`, `service/FileMetadataService`, `repository/`, `exception/` 파일은 삭제하지 않아도 된다. Controller에서 사용하지 않을 뿐이며, 기존 테스트(`FileMetadataServiceTest` 등)도 그대로 통과한다.

```java
package com.example.backend.controller;

import java.io.IOException;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.example.backend.storage.S3StorageService;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final S3StorageService storageService;

    public FileController(S3StorageService storageService) {
        this.storageService = storageService;
    }

    @PostMapping
    public ResponseEntity<String> upload(
            @RequestParam("file") MultipartFile file
    ) throws IOException {

        String originalName = file.getOriginalFilename();

        if (originalName == null || originalName.isBlank()) {
            originalName = "unknown";
        }

        String key = UUID.randomUUID() + "-" + originalName;

        storageService.upload(key, file);

        return ResponseEntity.ok(key);
    }

    @GetMapping("/{key}")
    public ResponseEntity<byte[]> download(
            @PathVariable String key
    ) {

        if (!storageService.exists(key)) {
            return ResponseEntity.notFound().build();
        }

        byte[] data = storageService.download(key);

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(data);
    }

    @DeleteMapping("/{key}")
    public ResponseEntity<Void> delete(
            @PathVariable String key
    ) {

        storageService.delete(key);

        return ResponseEntity.noContent().build();
    }
}
```

**Day 1~2 JSON metadata Controller가 아니라 이미 파일 업로드 기능이 있는 다른 Controller라면**, 전체 교체하지 말고 현재 API 구조에 맞춰 `S3StorageService`를 연결한다. 이때도 같은 URL·HTTP Method 조합의 mapping이 두 개 생기지 않게 한다.

---

# 61. 왜 UUID를 사용하는가?

원래 파일명이:

```text
report.pdf
```

인 파일을 여러 사용자가 올릴 수 있다.

그대로 Key를 만들면:

```text
report.pdf
```

가 충돌할 수 있다.

UUID:

```text
UUID-report.pdf
```

로 만들면 충돌 가능성을 크게 줄일 수 있다.

---

# 62. 파일명 보안

사용자가 입력한 파일명을 그대로 경로로 사용하는 것은 피한다.

특히:

```text
../
```

같은 경로 관련 문자를 주의해야 한다.

실제 서비스에서는:

```text
filename normalization
허용 문자 제한
파일 확장자 정책
MIME 검증
```

등을 추가한다.

---

# 63. Multipart 파일 크기 제한

`application.properties`:

```properties
spring.servlet.multipart.max-file-size=10MB
spring.servlet.multipart.max-request-size=10MB
```

이렇게 하면 기본 파일 크기를 제한할 수 있다.

---

# 64. Gradle Build

`backend`:

```bash
./gradlew clean build
```

정상:

```text
BUILD SUCCESSFUL
```

---

# 65. 환경변수 설정

Codespaces Terminal:

```bash
export AWS_REGION=ap-northeast-2
export S3_BUCKET=YOUR_BUCKET_NAME
```

확인:

```bash
echo "$AWS_REGION"
echo "$S3_BUCKET"
```

Secret 자체를 화면에 출력하거나 공유하지 않는다.

---

# 66. AWS 인증 테스트

```bash
aws sts get-caller-identity
```

이 명령이 성공하는지 확인한다.

---

# 67. Spring Boot 실행

`backend`에서 (65번의 `AWS_REGION`, `S3_BUCKET`을 export한 **같은 Terminal**에서):

```bash
./gradlew bootRun
```

정상적으로 실행되면 Spring Boot startup 로그를 확인한다.

---

# 68. Health 확인

Actuator가 있다면:

```bash
curl http://localhost:8080/actuator/health
```

예:

```json
{"status":"UP"}
```

---

# 69. Actuator가 없다면

현재 Controller의 mapping을 확인한다.

```bash
grep -R "@GetMapping" src/main/java
```

또는:

```bash
grep -R "@RequestMapping" src/main/java
```

---

# 70. Upload 테스트

새 Terminal을 연다. (새 Terminal은 프로젝트 루트에서 시작한다.)

`export`한 값은 새 Terminal에 전달되지 않으므로 이 Terminal에서도 다시 설정한다. (72번 `aws s3 ls s3://$S3_BUCKET/`에서 필요)

```bash
export AWS_REGION=ap-northeast-2
export S3_BUCKET=YOUR_BUCKET_NAME
```

프로젝트 루트에서 테스트 파일 생성:

```bash
echo "Day 3 S3 integration test" > day3.txt
```

업로드:

```bash
curl -X POST   -F "file=@day3.txt"   http://localhost:8080/api/files
```

예상 결과:

```text
550e8400-e29b-41d4-a716-446655440000-day3.txt
```

실제 Controller 경로가 다르면 그 경로를 사용한다.

---

# 71. 반환된 Key 저장

```bash
export FILE_KEY="반환된_KEY"
```

예:

```bash
export FILE_KEY="550e8400-e29b-41d4-a716-446655440000-day3.txt"
```

---

# 72. S3에서 확인

```bash
aws s3 ls s3://$S3_BUCKET/ --recursive
```

Object가 나타나면:

```text
Spring Boot
→ AWS SDK
→ S3
```

연결 성공이다.

---

# 73. Download 테스트

```bash
curl   "http://localhost:8080/api/files/${FILE_KEY}"   -o day3-download.txt
```

확인:

```bash
cat day3-download.txt
```

---

# 74. 원본/다운로드 비교

```bash
diff day3.txt day3-download.txt
```

아무 출력이 없으면 동일하다.

---

# 75. Delete 테스트

```bash
curl -X DELETE   "http://localhost:8080/api/files/${FILE_KEY}"
```

S3 확인:

```bash
aws s3 ls s3://$S3_BUCKET/ --recursive
```

Object가 사라져야 한다.

---

# 76. Docker 테스트 준비

Spring Boot만 성공하면 끝내지 않는다.

최종 목표가:

```text
Docker
→ ECR
→ ECS
```

이므로 Docker에서도 같은 S3 연결을 확인해야 한다.

**먼저 67번에서 실행한 `./gradlew bootRun`을 `Ctrl + C`로 종료한다.** 그렇지 않으면 8080 포트가 이미 사용 중이라 81번 `docker run -p 8080:8080`이 실패한다.

---

# 77. JAR 생성

```bash
cd backend
./gradlew clean build
```

확인:

```bash
ls build/libs
```

JAR 파일이 있어야 한다. (`*-plain.jar`까지 2개가 보일 수 있으며 정상이다.)

> 이 단계는 **로컬 빌드/테스트 확인용**이다. Day 2에서 만든 Multi-stage Dockerfile은 Image 안에서 `./gradlew clean bootJar`로 JAR을 다시 만들고, `.dockerignore`가 `**/build`를 제외하므로 여기서 만든 JAR은 Image에 들어가지 않는다.

---

# 78. 프로젝트 루트로 이동

```bash
cd ..
```

확인:

```bash
ls
```

---

# 79. Dockerfile 확인

```bash
cat Dockerfile
```

Day 2에서 만든 Multi-stage Dockerfile이 그대로 있어야 한다. (Day 3에서는 Dockerfile을 수정하지 않는다.)

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

`build.gradle`이 먼저 COPY되므로 30번에서 추가한 AWS SDK dependency도 Image 빌드 중에 자동으로 받아진다.

> 주의: `COPY backend/build/libs/*.jar app.jar` 형태의 단일 stage Dockerfile은 이 프로젝트에서 동작하지 않는다. `.dockerignore`가 `**/build`를 제외하고, `./gradlew build` 후 `build/libs`에 `*-plain.jar`까지 JAR이 2개 생길 수 있기 때문이다.

---

# 80. Docker Build

```bash
docker build   -t cloud-file-service:day3   .
```

확인:

```bash
docker images | grep cloud-file-service
```

---

# 81. Docker Run

로컬 테스트에서는 환경변수를 Container에 전달한다.

```bash
docker run --rm   -p 8080:8080   -e AWS_REGION="$AWS_REGION"   -e S3_BUCKET="$S3_BUCKET"   -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID"   -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"   cloud-file-service:day3
```

> `aws configure`로 인증했다면 `AWS_ACCESS_KEY_ID` 환경변수가 비어 있어 Container 안에서 `Unable to load credentials`가 난다. 이때는 두 `-e AWS_...KEY...` 대신 `-v ~/.aws:/root/.aws:ro`로 설정 폴더를 읽기 전용으로 연결한다. 임시 Credential(SSO 등)을 쓴다면 `-e AWS_SESSION_TOKEN="$AWS_SESSION_TOKEN"`도 함께 전달한다.

**운영 환경에서 이 방식으로 장기 Secret을 Container에 넣는 것은 권장하지 않는다. Day 4 ECS에서는 Task Role을 사용한다.**

---

# 82. Docker API 테스트

다른 Terminal:

```bash
curl http://localhost:8080/actuator/health
```

또는 실제 API를 사용한다.

---

# 83. Docker → S3 Upload

```bash
echo "Docker to S3 test" > docker-test.txt
```

```bash
curl -X POST   -F "file=@docker-test.txt"   http://localhost:8080/api/files
```

반환된 Key를 저장:

```bash
export FILE_KEY="반환된_KEY"
```

S3:

```bash
aws s3 ls s3://$S3_BUCKET/ --recursive
```

---

# 84. Container 재시작 실험

파일을 S3에 저장했다.

```text
Docker Container
       |
       v
      S3
```

이제 Container를 종료한다.

```bash
docker ps
```

Container ID 확인:

```bash
docker stop CONTAINER_ID
```

---

# 85. Container를 다시 실행한다

동일한 Docker Image를 다시 실행한다.

```bash
docker run --rm   -p 8080:8080   -e AWS_REGION="$AWS_REGION"   -e S3_BUCKET="$S3_BUCKET"   -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID"   -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"   cloud-file-service:day3
```

그리고 기존 `FILE_KEY`로 다운로드한다.

```bash
curl   "http://localhost:8080/api/files/${FILE_KEY}"   -o after-restart.txt
```

확인:

```bash
cat after-restart.txt
```

---

# 86. 이 실험의 의미

Container는 교체되었지만:

```text
S3 Object
```

는 남아 있다.

즉:

```text
Container
→ 일시적인 실행 환경

S3
→ 영속적인 파일 저장소
```

로 역할을 분리했다.

이것이 Day 4 ECS Fargate와 직접 연결된다.

---

# 87. S3 권한 오류

오류:

```text
AccessDenied
```

이면 다음 순서로 확인한다.

```text
1. AWS 인증
2. IAM Policy
3. Bucket 이름
4. Region
5. Action
6. Object ARN
```

---

# 88. 필요한 기본 S3 권한

파일 서비스의 기본 권한:

```text
s3:PutObject
s3:GetObject
s3:DeleteObject
```

목록 조회:

```text
s3:ListBucket
```

---

# 89. IAM Policy 예시

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
    }
  ]
}
```

`YOUR_BUCKET_NAME`은 실제 Bucket 이름으로 변경한다.

---

# 90. Bucket ARN과 Object ARN

Bucket:

```text
arn:aws:s3:::my-bucket
```

Object:

```text
arn:aws:s3:::my-bucket/*
```

따라서:

```text
ListBucket
→ Bucket ARN

GetObject
PutObject
DeleteObject
→ Object ARN
```

이다.

---

# 91. Credentials 오류

예:

```text
Unable to load credentials
```

먼저:

```bash
aws sts get-caller-identity
```

를 실행한다.

AWS CLI 자체가 인증되지 않았다면 개발환경 Credential부터 해결한다.

---

# 92. Bucket 오류

예:

```text
NoSuchBucket
```

이면:

```bash
aws s3 ls
```

와:

```bash
echo "$S3_BUCKET"
```

을 확인한다.

---

# 93. Region 오류

Bucket이 다른 Region에 있을 수 있다.

확인:

```bash
aws s3api get-bucket-location   --bucket "$S3_BUCKET"
```

그리고:

```bash
echo "$AWS_REGION"
```

을 비교한다.

---

# 94. NoSuchKey

다운로드 Key가 틀렸을 때 발생할 수 있다.

확인:

```bash
aws s3 ls s3://$S3_BUCKET/ --recursive
```

여기에 표시된 실제 Key를 사용한다.

---

# 95. Bean 오류

예:

```text
No qualifying bean of type 'S3Client'
```

확인:

```text
S3Config.java
```

가 Spring Boot Application의 Component Scan 범위 안에 있는지 확인한다.

예:

```text
com.example.backend
├── BackendApplication
├── config
│   └── S3Config
└── storage
    └── S3StorageService
```

처럼 같은 루트 패키지 아래에 두는 것이 이해하기 쉽다.

---

# 96. Property 오류

예:

```text
Could not resolve placeholder 'S3_BUCKET'
```

확인:

```bash
echo "$S3_BUCKET"
```

없다면:

```bash
export S3_BUCKET=YOUR_BUCKET_NAME
```

그리고 `application.properties`가 35번처럼 `${S3_BUCKET:local-cloud-file-service}` (기본값 포함) 형태인지 확인한다.

---

# 97. Gradle 오류

예:

```text
Could not find software.amazon.awssdk:s3
```

확인:

```text
repositories
dependency
Gradle sync
```

특히 `implementation platform('software.amazon.awssdk:bom:...')` 줄이 빠지지 않았는지 확인한다(30번).

그리고:

```bash
./gradlew clean build
```

를 다시 실행한다.

---

# 98. Docker에서는 되고 Java에서는 안 되는 경우

환경변수가 어디에 설정되어 있는지 확인한다.

```text
Terminal A
→ AWS_REGION 설정

Terminal B
→ AWS_REGION 없음
```

같은 문제가 있을 수 있다.

각 Terminal에서:

```bash
echo "$AWS_REGION"
echo "$S3_BUCKET"
```

을 확인한다.

---

# 99. Docker에서는 안 되고 Java에서는 되는 경우

Docker 실행 명령의:

```bash
-e
```

옵션을 확인한다.

```bash
-e AWS_REGION="$AWS_REGION"
-e S3_BUCKET="$S3_BUCKET"
```

그리고 Credential도 개발환경에서 필요한 경우 전달되어야 한다.

---

# 100. 파일이 S3에 저장되지 않는 경우

다음 흐름을 확인한다.

```text
HTTP 요청
 ↓
Controller
 ↓
S3StorageService.upload()
 ↓
S3Client.putObject()
 ↓
S3
```

CloudWatch는 아직 Day 3의 필수 요소가 아니므로 우선 로컬 Spring Boot 로그와 예외 Stack Trace를 확인한다.

---

# 101. Controller에서 로컬 저장 코드 검색

프로젝트에서:

```bash
grep -R "Files.write" src/main/java
```

또는:

```bash
grep -R "FileOutputStream" src/main/java
```

또는:

```bash
grep -R "Paths.get" src/main/java
```

를 실행한다.

이 결과가 기존 파일 저장 로직을 찾는 데 도움이 된다.

---

# 102. 기존 저장 로직을 찾았다면

예:

```java
Files.write(path, file.getBytes());
```

이 부분을:

```java
storageService.upload(key, file);
```

로 바꾸는 것이 핵심이다.

단, 현재 Controller에서 DB 저장, 응답 생성 등 다른 기능을 하고 있다면 그 기능은 유지한다.

---

# 103. 파일 저장 책임 분리

최종 구조:

```text
Controller
  |
  | HTTP 처리
  v
S3StorageService
  |
  | AWS SDK
  v
S3
```

Controller에:

```java
S3Client
PutObjectRequest
GetObjectRequest
```

등을 전부 작성하지 않는 이유는 책임을 분리하기 위해서다.

---

# 104. S3 파일 목록 기능은 나중에

향후:

```text
GET /api/files
```

를 추가할 수 있다.

S3 SDK의:

```java
ListObjectsV2Request
```

를 사용한다.

하지만 Day 3 필수 기능은:

```text
Upload
Download
Delete
```

이다.

---

# 105. Presigned URL

향후 파일 서비스가 커지면:

```text
Client
   |
   | URL 요청
   v
Spring Boot
   |
   | Presigned URL
   v
Client
   |
   | 직접 Upload/Download
   v
S3
```

구조를 사용할 수 있다.

장점은 대용량 파일을 Spring Boot 서버가 직접 중계하는 부담을 줄일 수 있다는 것이다.

---

# 106. Multipart Upload

큰 파일은:

```text
1GB
```

전체를 한 번에 처리하는 대신:

```text
Part 1
Part 2
Part 3
...
```

로 나누어 업로드할 수 있다.

S3 Multipart Upload를 사용한다.

Day 3 기본 구현이 성공한 다음 확장 기능으로 공부한다.

---

# 107. DB와 S3

실제 서비스는 다음처럼 확장할 수 있다.

```text
                Spring Boot
                /         \
               /           \
              v             v
             S3             DB
              |              |
              |              +-- 파일명
              |              +-- S3 Key
              |              +-- 크기
              |              +-- MIME Type
              |              +-- 업로드 시간
              |
              +-- 실제 파일 데이터
```

S3에는 파일 데이터를 저장하고 DB에는 파일 메타데이터를 저장하는 방식이다.

---

# 108. Day 3에서는 DB가 필수인가?

아니다.

Day 3의 핵심:

```text
Spring Boot
    ↓
AWS SDK
    ↓
S3
```

연결이다.

DB 메타데이터는 Day 3.5에서 PostgreSQL + JPA(`FileEntity`, `FolderEntity`)로 확장한다. 그때 `FileController`는 `FileService`를 거치도록 다시 바뀌고, 다운로드 경로도 `/api/files/{id}/download`로 바뀐다.

---

# 109. Day 3 최종 테스트

## 1. AWS 인증

```bash
aws sts get-caller-identity
```

## 2. Bucket

```bash
aws s3 ls s3://$S3_BUCKET
```

## 3. Build

```bash
cd backend
./gradlew clean build
```

## 4. 실행

```bash
./gradlew bootRun
```

## 5. 테스트 파일

`bootRun`이 실행 중인 Terminal은 그대로 두고, **다른 Terminal(프로젝트 루트, `AWS_REGION`/`S3_BUCKET` export 완료)**에서 진행한다. (Docker Container가 아직 8080에서 실행 중이라면 먼저 종료해 둔다.)

```bash
echo "Day3 final test" > final.txt
```

## 6. Upload

```bash
curl -X POST   -F "file=@final.txt"   http://localhost:8080/api/files
```

반환된 Key를 저장한다. (이전 테스트의 `FILE_KEY`를 그대로 쓰면 안 된다.)

```bash
export FILE_KEY="반환된_KEY"
```

## 7. S3 확인

```bash
aws s3 ls s3://$S3_BUCKET/ --recursive
```

## 8. Download

```bash
curl   "http://localhost:8080/api/files/${FILE_KEY}"   -o final-download.txt
```

## 9. 비교

```bash
diff final.txt final-download.txt
```

## 10. Delete

```bash
curl -X DELETE   "http://localhost:8080/api/files/${FILE_KEY}"
```

---

# 110. Docker 최종 테스트

109번의 `bootRun`을 `Ctrl + C`로 종료한 뒤, **프로젝트 루트**에서 진행한다.

## Build

```bash
docker build -t cloud-file-service:day3 .
```

## Run

```bash
docker run --rm   -p 8080:8080   -e AWS_REGION="$AWS_REGION"   -e S3_BUCKET="$S3_BUCKET"   -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID"   -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"   cloud-file-service:day3
```

## Upload

```bash
curl -X POST   -F "file=@final.txt"   http://localhost:8080/api/files
```

## S3 확인

```bash
aws s3 ls s3://$S3_BUCKET/ --recursive
```

---

# 111. Day 3 장애 대응 순서

문제가 발생했을 때 무작정 코드를 수정하지 않는다.

```text
1. AWS CLI 인증
        ↓
2. Bucket 존재
        ↓
3. Region
        ↓
4. IAM 권한
        ↓
5. application.properties
        ↓
6. S3Config
        ↓
7. S3StorageService
        ↓
8. Controller
        ↓
9. Gradle Build
        ↓
10. Docker 환경변수
```

---

# 112. Connection 문제와 S3 문제 구분

S3 연동에서:

```text
AccessDenied
```

가 나오면 네트워크보다 IAM 권한을 먼저 본다.

```text
NoSuchBucket
```

이면 Bucket 이름을 본다.

```text
NoSuchKey
```

이면 Object Key를 본다.

```text
Unable to load credentials
```

이면 Credential을 본다.

---

# 113. 보안 체크

다음은 하지 않는다.

```text
❌ Access Key를 Java 코드에 작성
❌ Secret Key를 Java 코드에 작성
❌ Secret을 Dockerfile에 작성
❌ .env를 Git에 Commit
❌ README에 실제 Secret 작성
❌ S3 Bucket 전체를 무조건 Public으로 설정
```

---

# 114. Git 확인

프로젝트 루트:

```bash
git status
```

추적 파일 확인:

```bash
git ls-files
```

`.env`가 추적되는지 확인:

```bash
git ls-files | grep -E '(^|/)\.env($|\.)'
```

실제 Secret이 Git에 올라간 경우 단순히 파일을 삭제하는 것만으로 끝나지 않을 수 있으므로 해당 Credential을 폐기/교체해야 한다.

`git status`에 실습용 테스트 파일(`test-s3.txt`, `day3.txt`, `final.txt` 등)이나 `aws/`, `awscliv2.zip`이 보이면 27번의 `.gitignore`에 추가했는지 확인하거나 삭제한다.

```bash
rm -f test-s3.txt downloaded-test.txt day3.txt day3-download.txt docker-test.txt after-restart.txt final.txt final-download.txt
```

---

# 115. Git Commit

Day 3가 성공하면:

```bash
git add .
```

```bash
git commit -m "integrate aws s3 storage"
```

그리고:

```bash
git push
```

---

# 116. Day 3 최종 프로젝트 구조

```text
cloud-file-service/
│
├── backend/
│   ├── build.gradle
│   │
│   └── src/main/
│       ├── java/
│       │   └── com/example/backend/
│       │       ├── BackendApplication.java
│       │       │
│       │       ├── controller/
│       │       │   ├── FileController.java      ← S3 버전으로 교체
│       │       │   └── HealthController.java
│       │       │
│       │       ├── config/
│       │       │   └── S3Config.java            ← 새로 생성
│       │       │
│       │       ├── storage/
│       │       │   └── S3StorageService.java    ← 새로 생성
│       │       │
│       │       └── domain/ dto/ exception/ repository/ service/
│       │                                        ← Day 1 파일 그대로 유지
│       │
│       └── resources/
│           └── application.properties          ← AWS/S3/Multipart 설정 추가
│
├── Dockerfile                                  ← Day 2 그대로
├── docker-compose.yml                          ← Day 2 그대로 (Day 3에서는 수정하지 않음)
├── .gitignore
└── README.md
```

---

# 117. 파일별 역할

| 파일 | 역할 |
|---|---|
| `build.gradle` | AWS SDK dependency |
| `application.properties` | Region/Bucket 설정 |
| `S3Config.java` | S3Client 생성 |
| `S3StorageService.java` | S3 Upload/Download/Delete |
| `FileController.java` | HTTP API |
| `Dockerfile` | Spring Boot Container 이미지 |
| `docker-compose.yml` | 로컬 Container 실행 |
| `.gitignore` | Secret 제외 |

---

# 118. 요청 흐름 — Upload

```text
POST /api/files
       |
       v
FileController
       |
       v
S3StorageService.upload()
       |
       v
S3Client.putObject()
       |
       v
S3 Bucket
       |
       v
Object 생성
```

---

# 119. 요청 흐름 — Download

```text
GET /api/files/{key}
       |
       v
FileController
       |
       v
S3StorageService.exists()
       |
       v
S3StorageService.download()
       |
       v
S3Client.getObjectAsBytes()
       |
       v
Client
```

---

# 120. 요청 흐름 — Delete

```text
DELETE /api/files/{key}
       |
       v
FileController
       |
       v
S3StorageService.delete()
       |
       v
S3Client.deleteObject()
       |
       v
S3 Object 삭제
```

---

# 121. Day 3에서 가장 중요한 설계

```text
Controller
→ HTTP

Storage Service
→ 파일 저장/조회/삭제

S3Client
→ AWS 통신

S3
→ 영속 파일
```

이렇게 역할을 분리한다.

---

# 122. Container와 S3를 분리하는 이유

잘못된 구조:

```text
Fargate Task
└── uploads/
    └── file.pdf
```

Task가 교체되면 파일을 영속 데이터로 보장하기 어렵다.

좋은 구조:

```text
Fargate Task
      |
      v
     S3
      |
      └── file.pdf
```

Task와 파일 데이터의 생명주기를 분리한다.

---

# 123. Day 4와 연결

Day 3:

```text
Spring Boot
   |
   v
S3
```

Day 4:

```text
Docker Image
   |
   v
ECR
   |
   v
ECS Fargate
   |
   v
Spring Boot
   |
   v
S3
```

Day 3에서 만든 `S3StorageService`를 크게 바꾸지 않고 AWS 실행환경으로 이동하는 것이 목표다.

---

# 124. Day 5와 연결 — IaC

이후 Terraform으로:

```text
S3
ECR
IAM
ECS
VPC
Security Group
CloudWatch
```

등을 코드로 관리한다.

목표:

```bash
terraform init
terraform plan
terraform apply
```

로 Infrastructure를 재현하는 것이다.

---

# 125. Kubernetes와 연결

이후 Kubernetes에서도:

```text
Deployment
Service
ConfigMap
Secret
Ingress
```

등으로 Container를 관리할 수 있다.

중요한 점:

```text
Kubernetes에서 실행
        ↓
Spring Boot
        ↓
S3
```

구조를 그대로 유지할 수 있다는 것이다.

---

# 126. 해커톤에서 설명할 수 있는 내용

> "Spring Boot 기반 파일 서비스를 Docker로 패키징하고 파일 저장 계층을 Amazon S3로 분리했습니다."

> "AWS SDK for Java의 S3Client를 이용하여 Object Upload, Download, Delete를 구현했습니다."

> "Container 내부에 영속 파일을 저장하지 않고 S3를 사용해 Container 교체와 파일 데이터의 생명주기를 분리했습니다."

> "이 구조를 기반으로 다음 단계에서 ECR, ECS Fargate, Terraform, Kubernetes, CI/CD로 확장할 수 있습니다."

---

# 127. 예상 질문

## Q. S3를 사용한 이유?

> Container가 교체되어도 파일을 유지하기 위해서입니다.

## Q. Docker Container에 저장하면 안 되나요?

> 임시 데이터에는 사용할 수 있지만 영속 파일 저장소로 사용하면 Container 교체/스케일링에 불리합니다.

## Q. ECR은 무엇인가요?

> Docker Image를 저장하는 AWS Container Registry입니다.

## Q. ECS는 무엇인가요?

> AWS에서 Container를 관리하고 실행하기 위한 서비스입니다.

## Q. Fargate는?

> 서버를 직접 관리하지 않고 ECS에서 Container를 실행할 수 있는 방식입니다.

## Q. Access Key를 코드에 넣지 않은 이유?

> Secret 노출을 막고 실행 환경의 Credential/Task Role을 사용하기 위해서입니다.

---

# 128. Day 3 완료 체크리스트

## AWS

- [ ] S3 Bucket 생성
- [ ] Region 확인
- [ ] Public Access Block 확인
- [ ] IAM 권한 확인
- [ ] AWS CLI 인증 성공

## Backend

- [ ] `backend/build.gradle` 수정
- [ ] `application.properties` 수정
- [ ] `S3Config.java` 생성
- [ ] `S3StorageService.java` 생성
- [ ] 기존 `FileController.java` 수정

## API

- [ ] Upload
- [ ] Download
- [ ] Delete

## S3

- [ ] Object 생성
- [ ] Object 확인
- [ ] Object 다운로드
- [ ] Object 삭제

## Docker

- [ ] Gradle Build
- [ ] Docker Build
- [ ] Docker Run
- [ ] Docker → S3 Upload
- [ ] Container 재시작 후 S3 파일 확인

## 보안

- [ ] Access Key가 코드에 없음
- [ ] Secret이 Git에 없음
- [ ] `.env`가 Git에 없음
- [ ] Dockerfile에 Secret 없음
- [ ] S3 Bucket 전체 Public 설정하지 않음

---

# 129. Day 3 성공 판정

아래 하나의 시나리오를 성공시키면 Day 3 핵심 완료다.

```text
1. Codespaces 실행
       ↓
2. Spring Boot 실행
       ↓
3. POST /api/files
       ↓
4. S3 Object 생성
       ↓
5. GET /api/files/{key}
       ↓
6. 파일 다운로드
       ↓
7. DELETE /api/files/{key}
       ↓
8. S3 Object 삭제
       ↓
9. Docker Build
       ↓
10. Docker 실행
       ↓
11. Docker에서 Upload
       ↓
12. S3 확인
       ↓
13. Container 종료
       ↓
14. Container 재실행
       ↓
15. S3 파일 유지 확인
```

---

# 130. ⭐ Day 3 핵심 한 문장

> **파일의 영속성을 Container가 아니라 S3에 맡기고, Spring Boot에서는 AWS SDK의 `S3Client`를 통해 Upload/Download/Delete를 수행하도록 저장 계층을 분리한다.**

---

# 131. Day 3 → Day 4 핵심 연결

```text
DAY 3

GitHub Codespaces
        |
        v
Spring Boot
        |
        v
AWS SDK
        |
        v
S3
```

↓

```text
DAY 4

GitHub Codespaces
        |
        v
Docker Build
        |
        v
ECR
        |
        v
ECS
        |
        v
Fargate
        |
        v
Spring Boot
        |
        v
IAM Task Role
        |
        v
S3
```

따라서 Day 3에서 만든 코드는 Day 4의 실제 AWS Container 배포를 위한 기반이다.

---

# 132. 🎯 Day 3 종료

**Day 3의 목표는 "S3를 공부했다"가 아니다.**

다음 실제 동작을 완성하는 것이다.

```text
Client
  ↓
Spring Boot
  ↓
S3StorageService
  ↓
AWS S3
```

그리고 Docker에서도:

```text
Docker Container
  ↓
Spring Boot
  ↓
S3
```

가 동작해야 한다.

여기까지 성공하면 다음 단계에서 같은 Docker Image를 ECR에 Push하고 ECS Fargate에서 실제 서비스로 실행할 수 있다.

---

# END OF DAY 3
