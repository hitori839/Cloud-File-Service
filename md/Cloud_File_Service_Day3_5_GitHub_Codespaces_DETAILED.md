# Cloud File Service — Day 3.5
# 실제 파일 시스템으로 업그레이드하기
## Google Drive 느낌의 파일 관리 서비스 만들기 — GitHub Codespaces 초보자용 상세 실습서

> **전제:** Day 3의 S3 연동까지 이미 완료한 상태에서 시작한다.

> **현재 구현 기준:** 이 문서는 현재 프로젝트 구조와 가장 가깝지만, 새 프로젝트를 생성하는 절차가 아니라 이미 존재하는 `backend/`와 `docker-compose.yml`에 적용하는 기준으로 읽는다. Compose backend 서비스명은 `cloud-file-service`, 외부 backend 포트는 `18080`, PostgreSQL은 `postgres` 서비스다.

> **개인정보 보호:** 개발용 DB 값은 예시일 뿐이며 실제 비밀번호, AWS credential, 계정 식별자, 개인 파일명은 문서에 저장하지 않는다.
>
> Day 3의 목표가 `Spring Boot → AWS SDK → S3`였다면,
> Day 3.5의 목표는 `Spring Boot → PostgreSQL + S3` 구조로 발전시켜
> **실제로 폴더를 만들고, 파일을 업로드하고, 목록을 보고, 다운로드하고,
> 이름을 변경하고, 다른 폴더로 이동하고, 삭제할 수 있는 파일 시스템**을 만드는 것이다.
>
> 이 Day 3.5에서 만든 구조를 **Day 4~7의 기준 구조로 고정한다.**
>
> 최종적으로는 완벽한 Google Drive 복제가 아니라 다음과 같은 서비스를 목표로 한다.
>
> ```text
> My Drive
> ├── 문서
> │   ├── 과제
> │   │   └── cloud.pdf
> │   └── README.md
> ├── 사진
> │   ├── image1.png
> │   └── image2.jpg
> └── 프로젝트
>     └── cloud-file-service
>         └── architecture.png
> ```

---

# 1. Day 3과 Day 3.5의 차이

## Day 3

```text
Client
  ↓
FileController
  ↓
S3StorageService
  ↓
Amazon S3
```

파일을 S3에 저장하고 다시 가져오는 데 성공했다.

하지만 이것만으로는 Google Drive 같은 파일 시스템이라고 보기 어렵다.

왜냐하면 다음 정보가 필요하기 때문이다.

```text
파일 이름
파일 크기
파일 타입
어떤 폴더에 있는지
폴더의 부모가 무엇인지
파일 생성 시간
파일 수정 시간
S3에서 실제 파일이 어디 있는지
```

---

# 2. Day 3.5의 최종 구조

```text
                         Browser
                            |
                            | HTTP
                            v
                    Spring Boot API
                            |
             +--------------+--------------+
             |                             |
             v                             v
       PostgreSQL                         S3
             |                             |
       파일/폴더 정보                    실제 파일
             |                             |
       +-----+------+                      |
       |            |                      |
     Folder        File -------------------+
                    |
                  s3Key
```

핵심은 이것이다.

```text
PostgreSQL = 파일 시스템의 정보
S3         = 실제 파일 데이터
```

---

# 3. 왜 S3만으로 만들지 않는가?

S3의 기본 개념은:

```text
Bucket
  ↓
Object
  ↓
Key
```

이다.

예를 들어:

```text
documents/report.pdf
photos/image.png
```

처럼 `/`를 사용하면 폴더처럼 보인다.

하지만 애플리케이션에서는 다음 기능이 필요하다.

```text
폴더 생성
폴더 이름 변경
폴더 이동
파일 이름 변경
파일 이동
현재 폴더의 파일 목록
상위 폴더
검색
정렬
권한
휴지통
```

따라서 DB가 파일 시스템의 메타데이터를 관리하도록 한다.

---

# 4. 이번 단계의 핵심 설계

## PostgreSQL

```text
Folder
├── id
├── name
├── parent_id
├── created_at
└── updated_at

File
├── id
├── name
├── original_name
├── s3_key
├── size
├── content_type
├── folder_id
├── created_at
└── updated_at
```

## S3

```text
Bucket
└── users/
    └── anonymous/
        └── files/
            ├── UUID
            ├── UUID
            └── UUID
```

---

# 5. 매우 중요한 원칙

앞으로 이 프로젝트에서는:

```text
S3 Object Key ≠ 사용자에게 보여주는 파일 이름
```

으로 한다.

예:

```text
DB
name = 최종보고서.pdf
s3Key = users/anonymous/files/8f7e...
```

사용자가 파일 이름을 바꾸면:

```text
DB name만 변경
```

하면 된다.

S3 Object를 다시 복사하거나 이동할 필요가 없다.

---

# 6. Day 3.5에서 생성/수정할 파일

프로젝트가 다음 구조라고 가정한다.

```text
cloud-file-service/
├── backend/
│   ├── build.gradle
│   └── src/main/
│       ├── java/com/example/backend/
│       │   ├── config/
│       │   │   └── S3Config.java
│       │   ├── controller/
│       │   │   ├── FileController.java
│       │   │   └── FolderController.java       ← 새로 생성
│       │   ├── dto/                             ← 새로 생성
│       │   │   ├── CreateFolderRequest.java
│       │   │   ├── RenameRequest.java
│       │   │   ├── FileResponse.java
│       │   │   └── FolderResponse.java
│       │   ├── entity/                          ← 새로 생성
│       │   │   ├── FileEntity.java
│       │   │   └── FolderEntity.java
│       │   ├── repository/                      ← 새로 생성
│       │   │   ├── FileRepository.java
│       │   │   └── FolderRepository.java
│       │   ├── service/                         ← 새로 생성
│       │   │   ├── FileService.java
│       │   │   └── FolderService.java
│       │   └── storage/
│       │       └── S3StorageService.java
│       └── resources/
│           └── application.properties
├── Dockerfile
├── docker-compose.yml
└── .gitignore
```

**실제 프로젝트의 패키지명이 다르면 `com.example.backend` 부분을 실제 패키지명으로 바꾼다.**

---

# 7. 작업 시작 전 확인

Codespaces Terminal에서 프로젝트 루트로 이동한다.

```bash
pwd
```

파일 확인:

```bash
find backend/src/main/java -type f
```

패키지 확인:

```bash
grep -R "^package " backend/src/main/java | head -20
```

Git 상태:

```bash
git status
```

---

# 8. Day 3 완료 상태를 먼저 저장

Day 3 Commit이 아직 없다면:

```bash
git add .
git commit -m "complete day3 s3 integration"
```

이제 Day 3.5 작업을 시작한다.

---

# 9. 1단계 — PostgreSQL dependency 추가

파일을 연다.

```text
backend/build.gradle
```

터미널:

```bash
code backend/build.gradle
```

`dependencies {}` 안에 다음을 추가한다.

```gradle
implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
runtimeOnly 'org.postgresql:postgresql'
```

AWS S3 dependency는 Day 3에서 추가했다면 그대로 유지한다.

예:

```gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'

    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'

    implementation 'software.amazon.awssdk:s3'

    runtimeOnly 'org.postgresql:postgresql'

    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}
```

**중복 dependency를 추가하지 않는다.**

---

# 10. Gradle Build

```bash
cd backend
./gradlew clean build
```

성공:

```text
BUILD SUCCESSFUL
```

끝나면:

```bash
cd ..
```

---

# 11. 2단계 — PostgreSQL Container 만들기

프로젝트 루트의:

```text
docker-compose.yml
```

을 연다.

기존 내용이 있다면 무조건 지우지 않는다.

PostgreSQL service가 없다면 추가한다.

```yaml
services:

  postgres:
    image: postgres:16
    container_name: cloud-file-postgres
    environment:
      POSTGRES_DB: cloud_file
      POSTGRES_USER: cloud_user
      POSTGRES_PASSWORD: cloud_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

# 12. PostgreSQL 설정 이해

```yaml
POSTGRES_DB: cloud_file
```

DB 이름:

```text
cloud_file
```

```yaml
POSTGRES_USER: cloud_user
```

사용자:

```text
cloud_user
```

```yaml
POSTGRES_PASSWORD: cloud_password
```

개발용 비밀번호다.

**운영 환경에서는 이 값을 Secret으로 관리한다.**

---

# 13. PostgreSQL 실행

```bash
docker compose up -d postgres
```

확인:

```bash
docker compose ps
```

정상:

```text
cloud-file-postgres
Up
```

로그:

```bash
docker compose logs postgres
```

다음과 비슷한 메시지가 나오면 정상이다.

```text
database system is ready to accept connections
```

---

# 14. 3단계 — application.properties 수정

파일:

```text
backend/src/main/resources/application.properties
```

Day 3의 S3 설정은 유지한다.

주의:
- 이 값은 로컬 Docker Compose 환경에서의 기본값이다.
- ECS/Fargate 환경에서는 `localhost:5432`가 아닌 실제 DB endpoint를 사용해야 한다.
- 즉, 로컬 개발에서는 `localhost`가 맞고, AWS ECS에서는 DB 주소를 별도로 주입해야 한다.

추가:

```properties
# PostgreSQL
spring.datasource.url=${SPRING_DATASOURCE_URL:${DB_URL:jdbc:postgresql://localhost:5432/cloud_file}}
spring.datasource.username=${SPRING_DATASOURCE_USERNAME:${DB_USERNAME:cloud_user}}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD:${DB_PASSWORD:cloud_password}}

# JPA
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
```

최종 예:

```properties
spring.application.name=backend
server.port=8080

# AWS
aws.region=${AWS_REGION:ap-northeast-2}

# S3
aws.s3.bucket=${S3_BUCKET}

# PostgreSQL
spring.datasource.url=${DB_URL:jdbc:postgresql://localhost:5432/cloud_file}
spring.datasource.username=${DB_USERNAME:cloud_user}
spring.datasource.password=${DB_PASSWORD:cloud_password}

# JPA
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true

# Multipart
spring.servlet.multipart.max-file-size=10MB
spring.servlet.multipart.max-request-size=10MB
```

---

# 15. `ddl-auto=update`란?

```properties
spring.jpa.hibernate.ddl-auto=update
```

Spring Boot가 Entity를 보고 DB 테이블 구조를 개발 단계에서 자동으로 맞추도록 한다.

이번 학습에서는 편리하므로 사용한다.

운영 단계에서는 나중에:

```text
Flyway
Liquibase
```

같은 migration 방식으로 발전시키는 것이 좋다.

---

# 16. 4단계 — Entity 폴더 생성

```bash
mkdir -p backend/src/main/java/com/example/backend/entity
```

---

# 17. FolderEntity 만들기

파일:

```text
backend/src/main/java/com/example/backend/entity/FolderEntity.java
```

코드:

```java
package com.example.backend.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "folders")
public class FolderEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private FolderEntity parent;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected FolderEntity() {
    }

    public FolderEntity(String name, FolderEntity parent) {
        this.name = name;
        this.parent = parent;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
        this.updatedAt = LocalDateTime.now();
    }

    public FolderEntity getParent() {
        return parent;
    }

    public void setParent(FolderEntity parent) {
        this.parent = parent;
        this.updatedAt = LocalDateTime.now();
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
```

---

# 18. FolderEntity를 이해하자

```java
@Entity
```

이 클래스가 DB 테이블과 연결된다는 의미다.

```java
@Table(name = "folders")
```

DB table 이름:

```text
folders
```

이다.

---

# 19. ID

```java
@Id
@GeneratedValue(strategy = GenerationType.IDENTITY)
private Long id;
```

DB가 자동으로:

```text
1
2
3
4
```

같은 ID를 만든다.

---

# 20. 부모 폴더

가장 중요한 부분:

```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "parent_id")
private FolderEntity parent;
```

이것으로:

```text
문서
└── 과제
    └── 클라우드
```

같은 Tree를 표현한다.

---

# 21. DB에서는 이렇게 된다

```text
folders

id | name   | parent_id
---+--------+----------
1  | 문서   | null
2  | 과제   | 1
3  | 클라우드 | 2
```

---

# 22. FileEntity 만들기

파일:

```text
backend/src/main/java/com/example/backend/entity/FileEntity.java
```

코드:

```java
package com.example.backend.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "files")
public class FileEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String originalName;

    @Column(nullable = false, unique = true, length = 500)
    private String s3Key;

    @Column(nullable = false)
    private Long size;

    @Column(length = 200)
    private String contentType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id")
    private FolderEntity folder;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected FileEntity() {
    }

    public FileEntity(
            String name,
            String originalName,
            String s3Key,
            Long size,
            String contentType,
            FolderEntity folder
    ) {
        this.name = name;
        this.originalName = originalName;
        this.s3Key = s3Key;
        this.size = size;
        this.contentType = contentType;
        this.folder = folder;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
        this.updatedAt = LocalDateTime.now();
    }

    public String getOriginalName() {
        return originalName;
    }

    public String getS3Key() {
        return s3Key;
    }

    public Long getSize() {
        return size;
    }

    public String getContentType() {
        return contentType;
    }

    public FolderEntity getFolder() {
        return folder;
    }

    public void setFolder(FolderEntity folder) {
        this.folder = folder;
        this.updatedAt = LocalDateTime.now();
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
```

---

# 23. FileEntity의 핵심

```java
private String s3Key;
```

DB에는 실제 파일 Binary를 넣지 않는다.

대신:

```text
파일 정보
+
S3 위치
```

를 저장한다.

실제 Binary는 S3에 있다.

---

# 24. File과 Folder 관계

```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "folder_id")
private FolderEntity folder;
```

파일 하나가 하나의 폴더에 들어간다.

예:

```text
report.pdf
folder_id = 3
```

이면:

```text
폴더 ID 3 안에 report.pdf
```

라는 의미다.

---

# 25. Repository 폴더 생성

```bash
mkdir -p backend/src/main/java/com/example/backend/repository
```

---

# 26. FolderRepository.java

```java
package com.example.backend.repository;

import com.example.backend.entity.FolderEntity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FolderRepository
        extends JpaRepository<FolderEntity, Long> {

    List<FolderEntity> findByParent_Id(Long parentId);

    List<FolderEntity> findByParentIsNull();
}
```

---

# 27. `findByParent_Id`

```java
findByParent_Id(1L)
```

은:

```text
parent_id = 1
```

인 폴더를 찾는다.

즉:

```text
문서
├── 과제
└── 발표
```

에서 문서 ID가 1이면:

```text
과제
발표
```

를 가져온다.

---

# 28. `findByParentIsNull`

```java
findByParentIsNull()
```

은:

```text
parent_id IS NULL
```

인 폴더를 가져온다.

즉 Root 폴더다.

---

# 29. FileRepository.java

파일:

```text
backend/src/main/java/com/example/backend/repository/FileRepository.java
```

코드:

```java
package com.example.backend.repository;

import com.example.backend.entity.FileEntity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FileRepository
        extends JpaRepository<FileEntity, Long> {

    List<FileEntity> findByFolder_Id(Long folderId);

    List<FileEntity> findByFolderIsNull();
}
```

---

# 30. DTO 폴더 생성

```bash
mkdir -p backend/src/main/java/com/example/backend/dto
```

---

# 31. CreateFolderRequest.java

```java
package com.example.backend.dto;

public record CreateFolderRequest(
        String name,
        Long parentFolderId
) {
}
```

---

# 32. 요청 예시

Root:

```json
{
  "name": "문서",
  "parentFolderId": null
}
```

하위:

```json
{
  "name": "과제",
  "parentFolderId": 1
}
```

---

# 33. RenameRequest.java

```java
package com.example.backend.dto;

public record RenameRequest(
        String name
) {
}
```

---

# 34. FolderResponse.java

```java
package com.example.backend.dto;

import com.example.backend.entity.FolderEntity;

import java.time.LocalDateTime;

public record FolderResponse(
        Long id,
        String name,
        Long parentFolderId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    public static FolderResponse from(FolderEntity folder) {

        Long parentId =
                folder.getParent() == null
                        ? null
                        : folder.getParent().getId();

        return new FolderResponse(
                folder.getId(),
                folder.getName(),
                parentId,
                folder.getCreatedAt(),
                folder.getUpdatedAt()
        );
    }
}
```

---

# 35. FileResponse.java

```java
package com.example.backend.dto;

import com.example.backend.entity.FileEntity;

import java.time.LocalDateTime;

public record FileResponse(
        Long id,
        String name,
        String originalName,
        Long size,
        String contentType,
        Long folderId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    public static FileResponse from(FileEntity file) {

        Long folderId =
                file.getFolder() == null
                        ? null
                        : file.getFolder().getId();

        return new FileResponse(
                file.getId(),
                file.getName(),
                file.getOriginalName(),
                file.getSize(),
                file.getContentType(),
                folderId,
                file.getCreatedAt(),
                file.getUpdatedAt()
        );
    }
}
```

---

# 36. 왜 DTO를 쓰는가?

Entity를 API에 직접 노출하는 것보다:

```text
DB 구조
```

와:

```text
API 응답
```

을 분리하는 것이 좋다.

특히:

```text
s3Key
```

는 외부 사용자에게 직접 보여줄 필요가 없다.

---

# 37. Service 폴더 생성

```bash
mkdir -p backend/src/main/java/com/example/backend/service
```

---

# 38. FolderService.java

```java
package com.example.backend.service;

import com.example.backend.dto.CreateFolderRequest;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.RenameRequest;
import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.FolderRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional
public class FolderService {

    private final FolderRepository folderRepository;
    private final FileRepository fileRepository;

    public FolderService(
            FolderRepository folderRepository,
            FileRepository fileRepository
    ) {
        this.folderRepository = folderRepository;
        this.fileRepository = fileRepository;
    }

    public FolderResponse createFolder(
            CreateFolderRequest request
    ) {

        if (request.name() == null ||
                request.name().isBlank()) {

            throw new IllegalArgumentException(
                    "폴더 이름을 입력해야 합니다."
            );
        }

        FolderEntity parent = null;

        if (request.parentFolderId() != null) {

            parent = folderRepository
                    .findById(request.parentFolderId())
                    .orElseThrow(() ->
                            new IllegalArgumentException(
                                    "부모 폴더를 찾을 수 없습니다."
                            ));
        }

        FolderEntity folder =
                new FolderEntity(
                        request.name().trim(),
                        parent
                );

        folderRepository.save(folder);

        return FolderResponse.from(folder);
    }

    @Transactional(readOnly = true)
    public List<FolderResponse> getFolders(
            Long parentFolderId
    ) {

        List<FolderEntity> folders;

        if (parentFolderId == null) {
            folders = folderRepository.findByParentIsNull();
        } else {
            folders =
                    folderRepository.findByParent_Id(
                            parentFolderId
                    );
        }

        return folders.stream()
                .map(FolderResponse::from)
                .toList();
    }

    public FolderResponse renameFolder(
            Long folderId,
            RenameRequest request
    ) {

        if (request.name() == null ||
                request.name().isBlank()) {

            throw new IllegalArgumentException(
                    "폴더 이름을 입력해야 합니다."
            );
        }

        FolderEntity folder =
                folderRepository.findById(folderId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "폴더를 찾을 수 없습니다."
                                ));

        folder.setName(request.name().trim());

        return FolderResponse.from(folder);
    }

    public void deleteFolder(Long folderId) {

        FolderEntity folder =
                folderRepository.findById(folderId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "폴더를 찾을 수 없습니다."
                                ));

        List<FileEntity> files =
                fileRepository.findByFolder_Id(folderId);

        List<FolderEntity> children =
                folderRepository.findByParent_Id(folderId);

        if (!files.isEmpty() || !children.isEmpty()) {

            throw new IllegalStateException(
                    "파일 또는 하위 폴더가 있는 폴더는 삭제할 수 없습니다."
            );
        }

        folderRepository.delete(folder);
    }
}
```

---

# 39. 폴더 삭제를 이렇게 하는 이유

실수 방지를 위해:

```text
폴더 안에 파일 있음
→ 삭제 금지

하위 폴더 있음
→ 삭제 금지

완전히 빈 폴더
→ 삭제 허용
```

으로 만든다.

나중에 휴지통을 만들면 더 좋은 삭제 구조로 변경한다.

---

# 40. FolderController.java

파일:

```text
backend/src/main/java/com/example/backend/controller/FolderController.java
```

코드:

```java
package com.example.backend.controller;

import com.example.backend.dto.CreateFolderRequest;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.RenameRequest;
import com.example.backend.service.FolderService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/folders")
public class FolderController {

    private final FolderService folderService;

    public FolderController(FolderService folderService) {
        this.folderService = folderService;
    }

    @PostMapping
    public ResponseEntity<FolderResponse> createFolder(
            @RequestBody CreateFolderRequest request
    ) {

        return ResponseEntity.ok(
                folderService.createFolder(request)
        );
    }

    @GetMapping
    public ResponseEntity<List<FolderResponse>> getFolders(
            @RequestParam(required = false)
            Long parentFolderId
    ) {

        return ResponseEntity.ok(
                folderService.getFolders(
                        parentFolderId
                )
        );
    }

    @PatchMapping("/{folderId}")
    public ResponseEntity<FolderResponse> renameFolder(
            @PathVariable Long folderId,
            @RequestBody RenameRequest request
    ) {

        return ResponseEntity.ok(
                folderService.renameFolder(
                        folderId,
                        request
                )
        );
    }

    @DeleteMapping("/{folderId}")
    public ResponseEntity<Void> deleteFolder(
            @PathVariable Long folderId
    ) {

        folderService.deleteFolder(folderId);

        return ResponseEntity.noContent().build();
    }
}
```

---

# 41. 폴더 API

```text
POST   /api/folders
GET    /api/folders
PATCH  /api/folders/{id}
DELETE /api/folders/{id}
```

---

# 42. FileService.java

파일:

```text
backend/src/main/java/com/example/backend/service/FileService.java
```

코드:

```java
package com.example.backend.service;

import com.example.backend.dto.FileResponse;
import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.FolderRepository;
import com.example.backend.storage.S3StorageService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class FileService {

    private final FileRepository fileRepository;
    private final FolderRepository folderRepository;
    private final S3StorageService storageService;

    public FileService(
            FileRepository fileRepository,
            FolderRepository folderRepository,
            S3StorageService storageService
    ) {
        this.fileRepository = fileRepository;
        this.folderRepository = folderRepository;
        this.storageService = storageService;
    }

    public FileResponse upload(
            MultipartFile multipartFile,
            Long folderId
    ) throws IOException {

        if (multipartFile == null ||
                multipartFile.isEmpty()) {

            throw new IllegalArgumentException(
                    "파일이 비어 있습니다."
            );
        }

        FolderEntity folder = null;

        if (folderId != null) {

            folder = folderRepository
                    .findById(folderId)
                    .orElseThrow(() ->
                            new IllegalArgumentException(
                                    "업로드 대상 폴더를 찾을 수 없습니다."
                            ));
        }

        String originalName =
                multipartFile.getOriginalFilename();

        if (originalName == null ||
                originalName.isBlank()) {

            originalName = "unknown";
        }

        String s3Key =
                "users/anonymous/files/"
                        + UUID.randomUUID();

        storageService.upload(
                s3Key,
                multipartFile
        );

        FileEntity file =
                new FileEntity(
                        originalName,
                        originalName,
                        s3Key,
                        multipartFile.getSize(),
                        multipartFile.getContentType(),
                        folder
                );

        fileRepository.save(file);

        return FileResponse.from(file);
    }

    @Transactional(readOnly = true)
    public List<FileResponse> getFiles(
            Long folderId
    ) {

        List<FileEntity> files;

        if (folderId == null) {
            files =
                    fileRepository.findByFolderIsNull();
        } else {
            files =
                    fileRepository.findByFolder_Id(
                            folderId
                    );
        }

        return files.stream()
                .map(FileResponse::from)
                .toList();
    }

    public byte[] download(Long fileId) {

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        return storageService.download(
                file.getS3Key()
        );
    }

    public String getContentType(Long fileId) {

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        if (file.getContentType() == null) {
            return "application/octet-stream";
        }

        return file.getContentType();
    }

    public String getFileName(Long fileId) {

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        return file.getName();
    }

    public void delete(Long fileId) {

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        storageService.delete(
                file.getS3Key()
        );

        fileRepository.delete(file);
    }

    public FileResponse rename(
            Long fileId,
            String name
    ) {

        if (name == null || name.isBlank()) {

            throw new IllegalArgumentException(
                    "파일 이름을 입력해야 합니다."
            );
        }

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        file.setName(name.trim());

        return FileResponse.from(file);
    }

    public FileResponse move(
            Long fileId,
            Long folderId
    ) {

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        FolderEntity folder = null;

        if (folderId != null) {

            folder =
                    folderRepository.findById(folderId)
                            .orElseThrow(() ->
                                    new IllegalArgumentException(
                                            "이동할 폴더를 찾을 수 없습니다."
                                    ));
        }

        file.setFolder(folder);

        return FileResponse.from(file);
    }
}
```

---

# 43. FileService가 하는 일

```text
파일 업로드
파일 목록
파일 다운로드
파일 삭제
파일 이름 변경
파일 이동
```

을 담당한다.

---

# 44. Upload 과정

파일을 업로드하면:

```text
MultipartFile
      ↓
Folder 확인
      ↓
UUID 생성
      ↓
S3 Upload
      ↓
FileEntity 생성
      ↓
PostgreSQL 저장
```

이다.

---

# 45. S3 Key

이번에는:

```text
users/anonymous/files/{UUID}
```

를 사용한다.

예:

```text
users/anonymous/files/8b7c2a...
```

나중에 인증을 붙이면:

```text
users/{실제 userId}/files/{UUID}
```

로 바꾼다.

---

# 46. FileController 수정

Day 3의 기존:

```text
backend/src/main/java/.../controller/FileController.java
```

를 연다.

기존 Controller가 S3StorageService를 직접 호출하고 있다면:

```text
FileController
    ↓
S3StorageService
```

에서:

```text
FileController
    ↓
FileService
    ↓
+--------+--------+
|                 |
v                 v
DB                S3
```

로 변경한다.

---

# 47. FileController 코드

기존 API가 크게 다르지 않다면 다음 구조로 맞춘다.

```java
package com.example.backend.controller;

import com.example.backend.dto.FileResponse;
import com.example.backend.service.FileService;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileService fileService;

    public FileController(FileService fileService) {
        this.fileService = fileService;
    }

    @PostMapping
    public ResponseEntity<FileResponse> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false)
            Long folderId
    ) throws IOException {

        return ResponseEntity.ok(
                fileService.upload(
                        file,
                        folderId
                )
        );
    }

    @GetMapping
    public ResponseEntity<List<FileResponse>> getFiles(
            @RequestParam(required = false)
            Long folderId
    ) {

        return ResponseEntity.ok(
                fileService.getFiles(folderId)
        );
    }

    @GetMapping("/{fileId}/download")
    public ResponseEntity<ByteArrayResource> download(
            @PathVariable Long fileId
    ) {

        byte[] data =
                fileService.download(fileId);

        ByteArrayResource resource =
                new ByteArrayResource(data);

        String contentType =
                fileService.getContentType(fileId);

        String fileName =
                fileService.getFileName(fileId);

        return ResponseEntity.ok()
                .contentType(
                        MediaType.parseMediaType(
                                contentType
                        )
                )
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=""
                                + fileName
                                + """
                )
                .contentLength(data.length)
                .body(resource);
    }

    @PatchMapping("/{fileId}/rename")
    public ResponseEntity<FileResponse> rename(
            @PathVariable Long fileId,
            @RequestParam String name
    ) {

        return ResponseEntity.ok(
                fileService.rename(
                        fileId,
                        name
                )
        );
    }

    @PatchMapping("/{fileId}/move")
    public ResponseEntity<FileResponse> move(
            @PathVariable Long fileId,
            @RequestParam(required = false)
            Long folderId
    ) {

        return ResponseEntity.ok(
                fileService.move(
                        fileId,
                        folderId
                )
        );
    }

    @DeleteMapping("/{fileId}")
    public ResponseEntity<Void> delete(
            @PathVariable Long fileId
    ) {

        fileService.delete(fileId);

        return ResponseEntity.noContent().build();
    }
}
```

---

# 48. 여기서 가장 중요한 변화

기존에는 Controller에서:

```java
s3Client
```

또는:

```java
storageService
```

를 직접 처리했다.

이제 Controller는:

```java
fileService.upload(...)
```

만 호출한다.

즉:

```text
Controller
→ HTTP

Service
→ 비즈니스 로직

Repository
→ DB

S3StorageService
→ S3
```

로 역할이 분리된다.

---

# 49. 컴파일

```bash
cd backend
./gradlew clean build
```

여기서 오류가 나면 실행하지 말고 먼저 오류를 해결한다.

---

# 50. Spring Boot 실행

PostgreSQL이 켜져 있어야 한다.

```bash
docker compose ps
```

그리고:

```bash
./gradlew bootRun
```

---

# 51. DB 테이블 생성 확인

다른 Terminal:

```bash
docker exec -it cloud-file-postgres   psql -U cloud_user -d cloud_file
```

PostgreSQL에서:

```sql
\dt
```

다음과 비슷하게 보여야 한다.

```text
files
folders
```

---

# 52. Folder 테이블 확인

```sql
SELECT * FROM folders;
```

아직 데이터가 없으면:

```text
0 rows
```

여도 정상이다.

---

# 53. File 테이블 확인

```sql
SELECT * FROM files;
```

---

# 54. PostgreSQL 종료

```sql
\q
```

---

# 55. 첫 번째 실제 파일 시스템 테스트

이제부터는 "코드가 컴파일된다"가 아니라:

> **실제로 파일 시스템이 동작하는지**

테스트한다.

---

# 56. 테스트 1 — Root 폴더 생성

```bash
curl -X POST   http://localhost:8080/api/folders   -H "Content-Type: application/json"   -d '{"name":"문서","parentFolderId":null}'
```

예상:

```json
{
  "id": 1,
  "name": "문서",
  "parentFolderId": null
}
```

---

# 57. 테스트 2 — 사진 폴더

```bash
curl -X POST   http://localhost:8080/api/folders   -H "Content-Type: application/json"   -d '{"name":"사진","parentFolderId":null}'
```

---

# 58. 테스트 3 — 프로젝트 폴더

```bash
curl -X POST   http://localhost:8080/api/folders   -H "Content-Type: application/json"   -d '{"name":"프로젝트","parentFolderId":null}'
```

---

# 59. 현재 Root 구조

```text
My Drive
├── 문서
├── 사진
└── 프로젝트
```

---

# 60. 테스트 4 — 문서 하위 폴더

문서 ID가 `1`이라면:

```bash
curl -X POST   http://localhost:8080/api/folders   -H "Content-Type: application/json"   -d '{"name":"과제","parentFolderId":1}'
```

---

# 61. 결과

```text
My Drive
├── 문서
│   └── 과제
├── 사진
└── 프로젝트
```

이것이 실제 파일 시스템 Tree다.

---

# 62. 테스트 5 — Root 폴더 조회

```bash
curl   "http://localhost:8080/api/folders"
```

---

# 63. 테스트 6 — 문서 하위 폴더 조회

```bash
curl   "http://localhost:8080/api/folders?parentFolderId=1"
```

결과에:

```text
과제
```

가 있어야 한다.

---

# 64. 테스트 7 — 파일 만들기

```bash
echo "Hello Cloud File System" > report.txt
```

---

# 65. 테스트 8 — Root에 업로드

```bash
curl -X POST   -F "file=@report.txt"   http://localhost:8080/api/files
```

---

# 66. 테스트 9 — 특정 폴더에 업로드

문서 ID가 `1`이라면:

```bash
curl -X POST   -F "file=@report.txt"   -F "folderId=1"   http://localhost:8080/api/files
```

---

# 67. 테스트 10 — 과제 폴더에 업로드

과제 ID가 `4`라고 가정한다.

```bash
curl -X POST   -F "file=@report.txt"   -F "folderId=4"   http://localhost:8080/api/files
```

---

# 68. 테스트 11 — 파일 목록

Root:

```bash
curl   "http://localhost:8080/api/files"
```

문서:

```bash
curl   "http://localhost:8080/api/files?folderId=1"
```

과제:

```bash
curl   "http://localhost:8080/api/files?folderId=4"
```

---

# 69. 이제 DB를 확인한다

```bash
docker exec -it cloud-file-postgres   psql -U cloud_user -d cloud_file   -c "SELECT id,name,s3_key,folder_id FROM files;"
```

예:

```text
id | name       | s3_key                         | folder_id
---+------------+--------------------------------+----------
1  | report.txt | users/anonymous/files/abc...  | 4
```

---

# 70. S3도 확인한다

```bash
aws s3 ls s3://$S3_BUCKET/ --recursive
```

예:

```text
users/anonymous/files/abc...
```

가 있어야 한다.

---

# 71. 여기서 중요한 사실

파일 하나가:

```text
PostgreSQL
```

과:

```text
S3
```

두 곳에 연결되어 있다.

DB:

```text
report.txt
folder_id = 4
s3_key = users/anonymous/files/abc
```

S3:

```text
users/anonymous/files/abc
```

---

# 72. 다운로드

파일 ID가 `1`이라면:

```bash
curl   "http://localhost:8080/api/files/1/download"   -o downloaded.txt
```

확인:

```bash
cat downloaded.txt
```

결과:

```text
Hello Cloud File System
```

---

# 73. 원본과 비교

```bash
diff report.txt downloaded.txt
```

아무 출력도 없다면 동일한 파일이다.

---

# 74. 파일 이름 변경

```bash
curl -X PATCH   "http://localhost:8080/api/files/1/rename?name=최종보고서.txt"
```

다시 조회:

```bash
curl   "http://localhost:8080/api/files?folderId=4"
```

이름이:

```text
최종보고서.txt
```

로 변경되어야 한다.

---

# 75. S3는 그대로인지 확인

```bash
aws s3 ls s3://$S3_BUCKET/ --recursive
```

S3 Key가 그대로라면 정상이다.

즉:

```text
DB name
```

만 바뀌었다.

이것이 우리가 의도한 구조다.

---

# 76. 파일 이동

파일 ID:

```text
1
```

현재 폴더:

```text
4
```

사진 폴더가:

```text
2
```

라면:

```bash
curl -X PATCH   "http://localhost:8080/api/files/1/move?folderId=2"
```

---

# 77. 이동 확인

```bash
curl   "http://localhost:8080/api/files?folderId=2"
```

파일이 보여야 한다.

기존 폴더:

```bash
curl   "http://localhost:8080/api/files?folderId=4"
```

에서는 없어야 한다.

---

# 78. 중요한 점

파일을 이동했지만:

```text
S3 Copy
S3 Delete
```

를 하지 않았다.

DB의:

```text
folder_id
```

만 변경했다.

이것이 현재 설계의 핵심이다.

---

# 79. 폴더 이름 변경

```bash
curl -X PATCH   http://localhost:8080/api/folders/1   -H "Content-Type: application/json"   -d '{"name":"중요 문서"}'
```

---

# 80. 빈 폴더 삭제

빈 폴더라면:

```bash
curl -X DELETE   http://localhost:8080/api/folders/3
```

---

# 81. 파일이 있는 폴더 삭제

파일이 있는 폴더에서:

```bash
curl -X DELETE   http://localhost:8080/api/folders/2
```

현재 구현에서는:

```text
파일 또는 하위 폴더가 있는 폴더는 삭제할 수 없습니다.
```

오류가 발생하는 것이 정상이다.

---

# 82. 파일 삭제

```bash
curl -X DELETE   http://localhost:8080/api/files/1
```

이때:

```text
1. DB FileEntity 확인
2. S3 Object 삭제
3. DB FileEntity 삭제
```

가 수행된다.

---

# 83. 삭제 확인

DB:

```bash
docker exec -it cloud-file-postgres   psql -U cloud_user -d cloud_file   -c "SELECT id,name,s3_key,folder_id FROM files;"
```

S3:

```bash
aws s3 ls s3://$S3_BUCKET/ --recursive
```

둘 다 없어져야 한다.

---

# 84. 실제 Google Drive 느낌으로 생각하기

현재 API를 UI로 표현하면:

```text
┌─────────────────────────────────────────────┐
│ Cloud Drive                     🔍 Search    │
├──────────────┬──────────────────────────────┤
│ My Drive     │                              │
│              │ 📁 문서                      │
│ 📁 문서      │ 📁 사진                      │
│ 📁 사진      │ 📁 프로젝트                  │
│ 📁 프로젝트  │                              │
│              │ 📄 report.txt                │
│ 🗑 휴지통     │ 📄 README.md                 │
└──────────────┴──────────────────────────────┘
```

이 화면은 Day 6에서 Frontend로 만든다.

---

# 85. Frontend와 Backend의 관계

Frontend:

```text
폴더 클릭
```

↓

```http
GET /api/files?folderId=1
```

Backend:

```text
DB 조회
```

↓

```json
[
  {
    "id": 1,
    "name": "report.pdf",
    "folderId": 1
  }
]
```

Frontend가 목록을 화면에 표시한다.

---

# 86. 파일 업로드 버튼

Frontend에서:

```text
파일 선택
```

↓

```http
POST /api/files
```

↓

```text
FileService
```

↓

```text
S3 + PostgreSQL
```

이다.

---

# 87. 폴더 생성 버튼

Frontend:

```text
+ 새 폴더
```

↓

```http
POST /api/folders
```

Body:

```json
{
  "name": "새 폴더",
  "parentFolderId": 1
}
```

↓

DB:

```text
folders
```

에 저장된다.

---

# 88. Breadcrumb

현재 Folder의:

```text
parent
```

관계를 이용하면:

```text
My Drive
>
문서
>
과제
>
클라우드
```

같은 경로를 만들 수 있다.

향후:

```text
GET /api/folders/{id}/path
```

API를 추가한다.

---

# 89. 검색 기능은 다음 단계

현재:

```text
GET /api/files?folderId=1
```

이지만 향후:

```text
GET /api/files/search?q=report
```

를 추가한다.

PostgreSQL에서:

```text
ILIKE
```

등을 사용할 수 있다.

---

# 90. 정렬 기능

향후:

```text
이름
크기
생성일
수정일
```

기준으로 정렬한다.

예:

```text
GET /api/files?folderId=1&sort=name
```

---

# 91. 휴지통

현재 삭제:

```text
DELETE
 ↓
S3 삭제
 ↓
DB 삭제
```

실제 Drive 스타일은:

```text
DELETE
 ↓
Trash
 ↓
Restore
 ↓
Permanent Delete
```

가 더 좋다.

Day 6~7에서 추가한다.

---

# 92. User 시스템은 아직 완성하지 않는다

현재 S3 Key:

```text
users/anonymous/files/{UUID}
```

이다.

향후:

```text
users/{userId}/files/{UUID}
```

로 변경한다.

DB에도:

```text
owner
```

를 추가한다.

---

# 93. 왜 지금 User를 넣지 않는가?

User 인증까지 한꺼번에 구현하면:

```text
Spring Security
JWT
Login
Password
Refresh Token
Authorization
```

이 들어오면서 파일 시스템 학습의 핵심이 흐려진다.

이번 단계는:

```text
파일 시스템
```

을 먼저 완성한다.

---

# 94. DB + S3의 정합성 문제

중요하다.

현재 업로드:

```text
S3 업로드
 ↓
DB 저장
```

인데:

```text
S3 성공
DB 실패
```

하면 S3에 고아 파일이 남는다.

반대 상황도 문제가 된다.

이번 Day 3.5에서는 기본 구현을 완성하고, 이후 예외 처리와 정합성을 개선한다.

---

# 95. 대용량 파일 문제

현재 다운로드는:

```java
getObjectAsBytes()
```

를 사용한다.

즉 파일 전체를 메모리로 가져온다.

작은 파일에서는 괜찮다.

하지만:

```text
500MB
1GB
```

같은 파일에서는 좋지 않다.

향후:

```text
Presigned URL
Streaming
Multipart Upload
```

를 사용한다.

---

# 96. 실제 서비스에서 S3가 좋은 이유

Container:

```text
ECS Task
```

가 죽고 새로 생성되어도:

```text
S3
```

의 파일은 그대로다.

즉:

```text
Container
= Stateless

S3
= Persistent File Storage
```

구조가 된다.

---

# 97. Docker Container 재생성 실험

현재 Docker Compose로 실행한다면:

```bash
docker compose down
```

다시:

```bash
docker compose up --build
```

PostgreSQL volume:

```text
postgres_data
```

을 유지하면 DB 데이터가 남는다.

S3 파일도 그대로 남는다.

---

# 98. 이 실험이 중요한 이유

다음 구조를 직접 경험하게 된다.

```text
Backend Container
       |
       +------ PostgreSQL
       |
       +------ S3
```

Backend Container 자체를 영속 저장소로 사용하지 않는다.

이것이 ECS/Kubernetes 환경에서 매우 중요하다.

---

# 99. Docker Compose에서 중요한 DB 주소

Backend를 Codespace Host에서 실행:

```text
localhost:5432
```

Backend를 Docker Container에서 실행:

```text
postgres:5432
```

이다.

일반 Docker 환경에서는:

```text
postgres
```

가 Service Name이다.

다만 현재 GitHub Codespaces 환경에서는 Compose 컨테이너에서 `postgres:5432`로 직접 연결하지 않고, 호스트에 공개한 PostgreSQL 포트를 통해 다음 주소를 사용한다.

```text
host.docker.internal:5432
```

현재 프로젝트의 `docker-compose.yml`에는 `host.docker.internal:host-gateway`가 설정되어 있다. ECS/Fargate에서는 이 주소도 사용할 수 없으며, 반드시 실제 PostgreSQL endpoint를 사용한다.

---

# 100. Backend Container 환경변수

Compose에서 Backend를 같이 실행한다면:

```yaml
environment:
        DB_URL: jdbc:postgresql://host.docker.internal:5432/cloud_file
  DB_USERNAME: cloud_user
  DB_PASSWORD: cloud_password
```

를 사용한다.

---

# 101. Compose 예시

기존 Compose 파일을 무조건 덮어쓰지 말고 필요한 부분을 통합한다.

```yaml
services:

  postgres:
    image: postgres:16
    container_name: cloud-file-postgres
    environment:
      POSTGRES_DB: cloud_file
      POSTGRES_USER: cloud_user
      POSTGRES_PASSWORD: cloud_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

        cloud-file-service:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: cloud-file-backend
    ports:
        - "18080:8080"
    environment:
      AWS_REGION: ${AWS_REGION}
      S3_BUCKET: ${S3_BUCKET}

      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}

                        DB_URL: jdbc:postgresql://host.docker.internal:5432/cloud_file
      DB_USERNAME: cloud_user
      DB_PASSWORD: cloud_password
                extra_hosts:
                        - "host.docker.internal:host-gateway"

    depends_on:
      - postgres

volumes:
  postgres_data:
```

**이 Credential 전달 방식은 로컬 학습용이다. ECS에서는 Task Role을 사용하도록 변경한다.**

---

# 102. Docker Compose 실행

JAR을 먼저 만든다.

```bash
cd backend
./gradlew clean build
cd ..
```

실행:

```bash
docker compose up --build
```

---

# 103. 상태 확인

```bash
docker compose ps
```

---

# 104. Backend 로그

```bash
docker compose logs -f backend
```

---

# 105. PostgreSQL 로그

```bash
docker compose logs -f postgres
```

---

# 106. Docker에서 파일 업로드

```bash
echo "Docker File System Test" > docker-test.txt
```

```bash
curl -X POST   -F "file=@docker-test.txt"   http://localhost:8080/api/files
```

S3:

```bash
aws s3 ls s3://$S3_BUCKET/ --recursive
```

DB:

```bash
docker exec -it cloud-file-postgres   psql -U cloud_user -d cloud_file   -c "SELECT id,name,s3_key,folder_id FROM files;"
```

둘 모두 확인한다.

---

# 107. Day 3.5 최종 API

## Folder

```http
POST   /api/folders
GET    /api/folders
PATCH  /api/folders/{id}
DELETE /api/folders/{id}
```

## File

```http
POST   /api/files
GET    /api/files
GET    /api/files/{id}/download
PATCH  /api/files/{id}/rename
PATCH  /api/files/{id}/move
DELETE /api/files/{id}
```

---

# 108. 파일 시스템 동작 흐름

## 폴더 생성

```text
POST /api/folders
        ↓
FolderController
        ↓
FolderService
        ↓
FolderRepository
        ↓
PostgreSQL
```

## 파일 업로드

```text
POST /api/files
        ↓
FileController
        ↓
FileService
        ↓
+-------------+
|             |
v             v
S3         PostgreSQL
```

## 파일 다운로드

```text
GET /api/files/{id}/download
        ↓
FileService
        ↓
DB에서 s3Key 조회
        ↓
S3
        ↓
파일 반환
```

## 파일 이동

```text
PATCH /api/files/{id}/move
        ↓
FileService
        ↓
folder_id 변경
        ↓
PostgreSQL
```

**S3는 건드리지 않는다.**

---

# 109. 최종 폴더 구조

```text
cloud-file-service/
│
├── backend/
│   ├── build.gradle
│   │
│   └── src/main/
│       ├── java/com/example/backend/
│       │
│       │   ├── config/
│       │   │   └── S3Config.java
│       │   │
│       │   ├── controller/
│       │   │   ├── FileController.java
│       │   │   └── FolderController.java
│       │   │
│       │   ├── dto/
│       │   │   ├── CreateFolderRequest.java
│       │   │   ├── RenameRequest.java
│       │   │   ├── FileResponse.java
│       │   │   └── FolderResponse.java
│       │   │
│       │   ├── entity/
│       │   │   ├── FileEntity.java
│       │   │   └── FolderEntity.java
│       │   │
│       │   ├── repository/
│       │   │   ├── FileRepository.java
│       │   │   └── FolderRepository.java
│       │   │
│       │   ├── service/
│       │   │   ├── FileService.java
│       │   │   └── FolderService.java
│       │   │
│       │   └── storage/
│       │       └── S3StorageService.java
│       │
│       └── resources/
│           └── application.properties
│
├── Dockerfile
├── docker-compose.yml
└── .gitignore
```

---

# 110. Day 3.5 완료 체크리스트

## PostgreSQL

- [ ] PostgreSQL Container 실행
- [ ] Spring Data JPA 추가
- [ ] PostgreSQL JDBC Driver 추가
- [ ] datasource 설정
- [ ] `folders` 생성 확인
- [ ] `files` 생성 확인

## 파일 시스템

- [ ] FolderEntity
- [ ] FileEntity
- [ ] parent-child Folder
- [ ] File-Folder 관계

## Repository

- [ ] FolderRepository
- [ ] FileRepository

## Service

- [ ] FolderService
- [ ] FileService
- [ ] S3 연동
- [ ] DB 연동

## API

- [ ] 폴더 생성
- [ ] 폴더 조회
- [ ] 폴더 이름 변경
- [ ] 빈 폴더 삭제
- [ ] 파일 업로드
- [ ] 파일 목록
- [ ] 파일 다운로드
- [ ] 파일 이름 변경
- [ ] 파일 이동
- [ ] 파일 삭제

## 실제 동작

- [ ] S3에 실제 파일 생성
- [ ] PostgreSQL에 메타데이터 생성
- [ ] 파일 다운로드 성공
- [ ] 파일 이동 성공
- [ ] 파일 이름 변경 성공
- [ ] 파일 삭제 성공
- [ ] S3 삭제 확인
- [ ] DB 삭제 확인
- [ ] Docker에서도 동작

---

# 111. 반드시 해볼 최종 시나리오

이것을 성공시키는 것이 Day 3.5의 핵심이다.

```text
My Drive
   ↓
문서 폴더 생성
   ↓
과제 폴더 생성
   ↓
report.pdf 업로드
   ↓
과제 폴더에서 파일 확인
   ↓
파일 다운로드
   ↓
파일 이름 변경
   ↓
사진 폴더로 이동
   ↓
사진 폴더에서 파일 확인
   ↓
파일 삭제
   ↓
S3에서도 파일 삭제 확인
   ↓
DB에서도 파일 삭제 확인
```

---

# 112. Git Commit

모든 테스트가 성공하면:

```bash
git status
```

```bash
git add .
```

```bash
git commit -m "build real cloud file system"
```

```bash
git push
```

---

# 113. 보안 체크

다음은 절대 Git에 올리지 않는다.

```text
❌ AWS Secret Access Key
❌ 실제 .env
❌ DB 운영 비밀번호
❌ 개인 Credential
```

`.gitignore`:

```gitignore
.env
.env.*
!.env.example

.gradle/
build/
```

확인:

```bash
git status
```

---

# 114. Day 3.5 이후의 아키텍처

현재:

```text
GitHub Codespaces
       |
       v
Docker
       |
       +------ Spring Boot
       |
       +------ PostgreSQL


Spring Boot
       |
       v
      S3
```

---

# 115. Day 4

**새 프로젝트를 만들지 않는다.**

현재 프로젝트를 그대로 사용한다.

```text
cloud-file-service
```

그리고:

```text
Docker Image
     ↓
Amazon ECR
     ↓
ECS Fargate
     ↓
Spring Boot
     ↓
S3
```

로 이동한다.

DB는 이후 RDS로 분리한다.

---

# 116. Day 5

Terraform/IaC를 붙인다.

기준:

```text
현재 프로젝트
        ↓
Terraform
        ↓
AWS Infrastructure
```

대상:

```text
VPC
Security Group
S3
IAM
ECR
ECS
RDS
ALB
```

---

# 117. Day 6

Frontend를 붙인다.

```text
Google Drive 느낌
```

의 화면을 만든다.

기능:

```text
Folder Tree
File List/Grid
Upload
New Folder
Rename
Move
Delete
Download
Search
```

---

# 118. Day 7

배포와 발표용 기능을 완성한다.

```text
ECS / Kubernetes
CI/CD
Monitoring
Logging
Health Check
```

등을 붙인다.

---

# 119. Kubernetes와의 연결

최종적으로:

```text
User
 ↓
Frontend
 ↓
Kubernetes
 ↓
Spring Boot
 ├── PostgreSQL/RDS
 └── S3
```

가 가능하다.

중요한 것은 Kubernetes Pod가 삭제되어도:

```text
S3
PostgreSQL
```

의 데이터가 남는 구조를 이미 만들었다는 것이다.

---

# 120. 해커톤에서 이 프로젝트를 설명하는 방법

다음처럼 설명할 수 있다.

> **"Spring Boot 기반의 클라우드 파일 서비스를 구축하고, Amazon S3를 실제 파일 Binary 저장소로, PostgreSQL을 파일 시스템 메타데이터 저장소로 분리했습니다."**

> **"폴더는 parent-child 관계를 이용해 Tree 구조로 구성하고, 파일은 folder_id를 통해 폴더와 연결했습니다."**

> **"S3 Object Key는 UUID 기반으로 관리하여 파일 이름 변경이나 폴더 이동 시 실제 Object를 재배치하지 않아도 되도록 설계했습니다."**

> **"Container는 Stateless하게 유지하고 영속 데이터는 S3와 PostgreSQL에 저장하기 때문에 이후 ECS Fargate와 Kubernetes 환경으로 확장할 수 있습니다."**

---

# 121. 이 프로젝트가 단순 CRUD가 아닌 이유

겉으로는:

```text
파일 업로드
파일 다운로드
폴더 생성
```

처럼 보이지만 내부적으로는:

```text
Object Storage
+
Database
+
Container
+
Cloud Architecture
```

를 연결한다.

이 구조가 앞으로:

```text
AWS
Docker
S3
ECS
Terraform
Kubernetes
```

를 하나의 프로젝트에서 연습하게 해준다.

---

# 122. Day 3.5에서 아직 일부러 안 만든 것

다음 기능은 이후 단계로 남겨둔다.

```text
로그인
회원가입
JWT
사용자별 권한
공유 링크
파일 공유
휴지통
파일 복구
검색
정렬
이미지 미리보기
썸네일
대용량 파일
Presigned URL
Multipart Upload
파일 버전
중복 파일명 처리
```

이것들은 프로젝트를 더 실제 서비스처럼 만드는 확장 기능이다.

---

# 123. 하지만 핵심 파일 시스템은 이미 만들었다

이제 시스템은 단순히:

```text
"파일을 S3에 업로드"
```

하는 것이 아니라:

```text
"파일을 특정 폴더에 저장하고,
그 파일의 메타데이터를 DB에서 관리하고,
필요할 때 S3에서 실제 파일을 가져오는 시스템"
```

이다.

---

# 124. ⭐ 가장 중요한 그림

```text
                         Cloud File Service
                                  |
                         Spring Boot API
                                  |
              +-------------------+-------------------+
              |                                       |
              v                                       v
       PostgreSQL                                  Amazon S3
              |                                       |
       +------+-------+                               |
       |              |                               |
    Folders         Files                             |
       |              |                               |
       |          s3Key ------------------------------+
       |
    parent_id
       |
       v
   Folder Tree
```

---

# 125. 최종 목표

우리가 만들고 있는 서비스는:

```text
Google Drive의 모든 기능을 복제하는 것
```

이 아니다.

대신:

```text
Google Drive와 비슷한 사용자 경험
+
실제로 동작하는 파일 시스템
+
AWS Cloud Architecture
+
Docker
+
IaC
+
ECS
+
Kubernetes
```

를 하나의 프로젝트로 연결하는 것이다.

---

# 126. Day 3.5 한 문장

> **Day 3에서 만든 S3 파일 저장 서비스를 PostgreSQL 기반의 파일/폴더 메타데이터 시스템과 결합하여, 실제로 폴더를 만들고 파일을 업로드·조회·다운로드·이동·이름 변경·삭제할 수 있는 Google Drive 스타일의 클라우드 파일 시스템으로 업그레이드한다.**

---

# 127. 앞으로 Day 4~7의 절대 기준

```text
DAY 3
S3 연결
      ↓
DAY 3.5
실제 파일 시스템 완성
      ↓
DAY 4
Docker + ECR + ECS
      ↓
DAY 5
Terraform / IaC + AWS Infrastructure
      ↓
DAY 6
Frontend + Google Drive UI
      ↓
DAY 7
Kubernetes + CI/CD + Monitoring + 발표
```

그리고 Day 4부터는 반드시 **이 Day 3.5의 구조를 기준으로 작업한다.**

```text
FileEntity
FolderEntity
FileRepository
FolderRepository
FileService
FolderService
FileController
FolderController
S3StorageService
PostgreSQL
S3
```

을 프로젝트의 기본 뼈대로 유지한다.

---

# END OF DAY 3.5
