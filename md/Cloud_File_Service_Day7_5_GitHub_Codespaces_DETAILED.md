# Cloud File Service --- Day 7.5

## Day 7 완료 상태에서 로그인/회원 관리 + 사용자별 드라이브 + Google Drive 수준 기능 + UI 개선

> 이 문서는 `Cloud_File_Service_Day7_GitHub_Codespaces_DETAILED.md`를 끝낸
> 상태에서 이어간다.
>
> Day 7까지 만든 Spring Boot Backend, PostgreSQL/RDS, S3, Docker, ECR, ECS,
> Terraform, kind(Kubernetes), GitHub Actions를 **삭제하거나 처음부터 다시
> 만들지 않는다.**
>
> Day 7.5의 핵심은 **누구나 모든 파일을 보던 "공용 드라이브"를, 회원가입·로그인한
> 사용자가 자기 파일만 보는 "개인 드라이브"로 바꾸고, 휴지통·중요 표시·검색·최근
> 문서·미리보기·저장 용량 같은 Google Drive의 기본 기능과 새 UI를 붙이는 것**이다.

> **이미 저장소에 있는 파일:** 현재 저장소에는 Day 7.5 코드가 이미 들어 있을 수
> 있다. 문서에 나온 파일이 **이미 저장소에 있으면 내용만 비교하고 넘어간다.**
> 코드 블록은 모두 저장소의 실제 파일을 그대로 옮긴 것이다. 직접 따라 치는 경우에도
> 오타를 막기 위해 **파일 전체를 복사해 붙여 넣는 것**을 권장한다.

> **개인정보 보호:** 문서의 이메일·비밀번호(`password123`)는 예시다. 실제
> 비밀번호, AWS Access Key, 계정 ID(`<ACCOUNT_ID>`), JWT 서명 키는 문서나 Git에
> 저장하지 않는다.

------------------------------------------------------------------------

# 0. Day 7.5 최종 목표

Day 7:

``` text
Browser (누구나)
   |
React + Vite
   |
Spring Boot (kind Pod / ECS)
   |
+-- PostgreSQL/RDS -> 모든 사람이 같은 files/folders 를 공유
+-- S3             -> users/anonymous/files/{uuid}
```

Day 7.5:

``` text
Browser
   |
   |  1) POST /api/auth/login {email, password}
   |  <- 200 { token: "eyJhbGciOiJIUzI1NiJ9...", user: {...} }
   |     token 을 localStorage("cfs_token") 에 저장
   |
   |  2) GET /api/files
   |     Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
   v
React (hash router, AuthProvider)
   |
   v  (Vite proxy /api -> localhost:8080 -> port-forward -> Service -> Pod)
Spring Security FilterChain
   |
   +-- 토큰 없음/위조/만료 ------------> 401 {"message":"로그인이 필요합니다."}
   +-- /api/admin/** 인데 ROLE_ADMIN 아님 -> 403 {"message":"권한이 없습니다."}
   |
   v  토큰 서명 OK -> Jwt(sub = userId, role = USER|ADMIN)
Controller (@AuthenticationPrincipal Jwt -> CurrentUser.id(jwt))
   |
   v
Service (모든 조회에 owner_id = 현재 사용자 조건)
   |
   +-- PostgreSQL/RDS : users, folders(owner_id...), files(owner_id...)
   +-- S3             : users/{userId}/files/{uuid}
```

## 새로 생기는 기능

``` text
[인증/회원]
[ ] 회원가입 (이메일 + 비밀번호 8자 이상 + 이름)
[ ] 로그인 / 로그아웃 (JWT, 기본 24시간 유효)
[ ] 새로고침(F5)해도 로그인 유지 (localStorage 토큰 + /api/auth/me)
[ ] 내 계정: 이름 변경, 비밀번호 변경, 회원 탈퇴(모든 파일 삭제)
[ ] 관리자(ADMIN_EMAILS): 전체 사용자 목록, 사용자 삭제

[사용자별 드라이브]
[ ] 내 파일/폴더만 보인다 (다른 사람 것은 id 를 알아도 404)
[ ] S3 key 가 users/{userId}/files/{uuid}

[Google Drive 수준 기능]
[ ] 휴지통 (삭제 = 휴지통 이동, 복원, 영구 삭제, 휴지통 비우기)
[ ] 폴더 삭제 시 하위 폴더/파일까지 함께 휴지통으로
[ ] 중요 문서함 (별표)
[ ] 검색 (이름 부분 일치, 대소문자 무시)
[ ] 최근 문서함 (최근 수정 50개)
[ ] 저장 용량 표시 / 사용자별 한도 (기본 1GB)
[ ] 브레드크럼 경로, 폴더 트리 이동 대화상자, 순환 이동 방지
[ ] 파일 미리보기 (이미지/동영상/오디오/PDF/텍스트)
[ ] 한글 파일명 다운로드
[ ] 업로드 진행률, 여러 파일 업로드, 드래그 앤 드롭
[ ] 업로드 최대 50MB (Day 7: 10MB)

[UI]
[ ] 로그인/회원가입 화면
[ ] 상단 바(검색, 사용자 메뉴) + 사이드바(새로 만들기, 메뉴, 용량)
[ ] 목록/바둑판 보기, 정렬(이름/날짜/크기), 우클릭 메뉴
[ ] 토스트 알림 + "실행 취소", 확인/입력 대화상자
[ ] 모바일 화면, 다크 모드
```

## Day 7과 비교해서 바뀌는 것

``` text
Backend
  + Spring Security + OAuth2 Resource Server(JWT 검증) 의존성
  + users 테이블, files/folders 에 owner_id, starred, trashed, trash_root, trashed_at
  + 인증/사용자/관리자/드라이브 API
  ~ 모든 파일/폴더 API 가 "로그인 사용자 소유" 기준으로 동작
  ~ 삭제 = 휴지통 이동 (S3 객체는 영구 삭제 때 지움)
  ~ S3 업로드 방식 (fromInputStream -> fromBytes)
  ~ 업로드 최대 10MB -> 50MB

Frontend
  ~ 거의 전체를 다시 작성 (api / hooks / components / pages / utils)

Infra
  + k8s Secret 에 JWT_SECRET, ConfigMap 에 ADMIN_EMAILS
  + Terraform: JWT 서명 키(random_password + Secrets Manager), admin_emails 변수

유지
  kind 클러스터, Deployment/Service, Dockerfile, GitHub Actions, RDS, S3, ECR, ECS
```

## 이 문서의 진행 순서

``` text
1       시작 전 확인
2~5     설계 (JWT, 소유권, 휴지통, DB 변화) / API 표
6~17    Backend 구현 + 통합 테스트
18      bootRun + curl 로 API 확인
19~27   Frontend 구현 + lint/build
28~29   kind 배포 + 관리자 계정
30      (선택) ECS/Terraform 반영
31      CI / Commit
32~33   전체 기능 테스트 / 문제 해결
34~37   확장 과제 / 파일 목록 / 체크리스트
```

------------------------------------------------------------------------

# 1. 시작 전 확인

## Codespace를 켤 때마다 할 것

Day 7 [1번](./Cloud_File_Service_Day7_GitHub_Codespaces_DETAILED.md#1-day-6-상태-저장)의
"Codespace를 켤 때마다" 절차를 그대로 실행한다. (재시작하면 초기화된다)

``` bash
# ① kind Pod의 외부 통신 허용 (Day 7 6-1번, 재시작 시 초기화됨)
sudo iptables-legacy -C FORWARD -i br-+ -j ACCEPT 2>/dev/null \
  || sudo iptables-legacy -I FORWARD 1 -i br-+ -j ACCEPT
sudo iptables-legacy -C FORWARD -o br-+ -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null \
  || sudo iptables-legacy -I FORWARD 2 -o br-+ -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

# ② 로컬 PostgreSQL
docker compose up -d postgres

# ③ Frontend가 kind Backend(port-forward 8080)를 보도록 확인
cat frontend/.env.local   # VITE_API_TARGET=http://localhost:8080 이어야 한다

# ④ 디스크 여유 공간 확인 (Avail이 3GB 이상이어야 한다)
df -h /
```

Day 7.5에서는 Backend 이미지를 새로 build하고 Gradle 의존성(Spring Security)과
npm build도 새로 받으므로 **디스크가 3GB 이상 비어 있어야 한다.** 부족하면 Day 7
1번의 정리 명령(`docker rmi <옛 태그>`, `docker builder prune -af`,
`crictl rmi --prune`)을 먼저 실행한다. `docker system prune --volumes`는 DB
데이터까지 지우므로 사용하지 않는다.

## kind 클러스터가 살아 있는지 확인

``` bash
kubectl config current-context
# kind-cloud-file-service

kubectl get pods -n cloud-file-service
```

모든 Pod가 `1/1 Running`이어야 한다. 클러스터가 없으면 Day 7 6번, Secret이
없으면 Day 7 13번부터 다시 만든다.

## Day 7 상태를 Git에 저장 (체크포인트)

Day 7.5는 Backend·Frontend를 크게 바꾼다. 문제가 생기면 되돌아갈 수 있도록
먼저 커밋한다.

``` bash
git status
git add .
git commit -m "checkpoint before day7.5"
git push
```

> `git status`에 `k8s/secret.yaml`이나 `infra/terraform/terraform.tfvars`가
> 보이면 **커밋하지 않는다.** 둘 다 `.gitignore`에 등록되어 있어야 한다
> (`grep -n "secret.yaml\|tfvars" .gitignore`).

되돌리는 방법(필요할 때만):

``` bash
git log --oneline -3             # checkpoint before day7.5 커밋 확인
git restore --source=HEAD -- backend frontend   # 커밋 전 변경을 모두 버림
```

------------------------------------------------------------------------

# 2. 설계 (1) --- 인증: 왜 JWT인가

## 2-1. 세션 방식과 JWT 방식

``` text
세션 방식
  로그인 → 서버 메모리에 "세션 123 = 사용자 7" 저장 → 브라우저에 쿠키(JSESSIONID=123)
  다음 요청 → 서버가 메모리에서 세션 123을 찾음

JWT 방식 (Day 7.5)
  로그인 → 서버가 "사용자 7, ADMIN 아님, 24시간 유효" 를 비밀 키로 서명한 문자열(JWT)을 돌려줌
  다음 요청 → Authorization: Bearer <JWT> → 서버는 서명만 확인 (저장소 조회 없음)
```

Day 7에서 Backend는 **Pod 2개(replicas: 2)** 로 실행되고, Pod는 언제든
교체된다(Day 7 44·45번). 세션을 Pod 메모리에 저장하면

``` text
- 로그인은 Pod A 에서 했는데 다음 요청이 Pod B 로 가면 "로그인 안 됨"
- Pod 가 재시작되면 모든 사용자가 로그아웃
```

이 된다. 해결하려면 Redis 같은 세션 저장소가 필요하다. JWT는 토큰 자체에
정보와 서명이 들어 있어 **어느 Pod든 같은 비밀 키(`JWT_SECRET`)만 있으면 검증할 수
있다.** 이것을 **stateless(무상태)** 라고 한다.

> 모든 Pod가 **같은 `JWT_SECRET`** 을 가져야 한다. 그래서 JWT 서명 키는 코드가
> 아니라 Kubernetes Secret / AWS Secrets Manager에 넣고 환경변수로 주입한다.

## 2-2. 토큰 안에 들어가는 것 (claims)

``` json
{
  "iss": "cloud-file-service",
  "sub": "7",
  "iat": 1790000000,
  "exp": 1790086400,
  "email": "alice@example.com",
  "role": "USER"
}
```

| claim | 의미 |
|---|---|
| `iss` | 발급자. 우리 서버가 만든 토큰만 인정 |
| `sub` | 사용자 id. Controller가 `CurrentUser.id(jwt)`로 꺼낸다 |
| `iat` / `exp` | 발급 / 만료 시각 (`JWT_EXPIRATION_MINUTES`, 기본 1440분 = 24시간) |
| `role` | `USER` 또는 `ADMIN`. Spring Security가 `ROLE_ADMIN` 권한으로 바꾼다 |

JWT는 **암호화가 아니라 서명**이다. 누구나 내용을 읽을 수 있으므로 비밀번호 같은
비밀 정보는 넣지 않는다. 대신 내용을 바꾸면 서명이 맞지 않아 401이 된다.

알고리즘은 **HS256**(대칭 키 HMAC-SHA256)이다. 서버 하나가 발급과 검증을 모두 하므로
공개 키/개인 키(RS256)가 필요 없다. 키는 **32바이트 이상**이어야 하며, 짧으면
애플리케이션이 시작되지 않는다(`JwtKeyProvider`).

## 2-3. 비밀번호는 BCrypt로 저장

``` text
DB에 저장되는 값:  $2a$10$N9qo8uLOickgx2ZMRZoMye...   (60자)
```

- 평문을 저장하지 않는다. DB가 유출되어도 원래 비밀번호를 알기 어렵다.
- 같은 비밀번호도 매번 다른 salt가 붙어 해시 값이 다르다.
- 의도적으로 느리게(cost 10) 계산되어 무차별 대입이 어렵다.
- BCrypt는 **72바이트**까지만 사용하므로 가입 시 8~72자, UTF-8 72바이트 이하로 제한한다.

## 2-4. 관리자(ADMIN)

``` text
ADMIN_EMAILS=admin@example.com,ops@example.com
```

- 이 목록의 이메일로 **가입**하면 `ADMIN`이 된다.
- 이미 가입한 사용자를 나중에 목록에 넣으면 **다시 로그인할 때** `ADMIN`으로 승격된다.
- 역할(`role`)은 토큰 안에 들어 있으므로, 승격된 뒤에도 **예전 토큰은 여전히 USER**다.
  → 관리자 메뉴가 안 보이면 로그아웃 후 다시 로그인한다.
- 목록에서 빼도 자동으로 강등하지는 않는다(실수로 관리자를 잃지 않도록).

------------------------------------------------------------------------

# 3. 설계 (2) --- 사용자별 소유권 · 휴지통 · 부가 기능

## 3-1. 모든 파일/폴더에 주인(owner)이 있다

``` text
users   (id=7, alice)          users (id=8, bob)
  │                              │
folders.owner_id = 7           folders.owner_id = 8
files.owner_id   = 7           files.owner_id   = 8
```

규칙:

``` text
1. 모든 조회 쿼리에 owner_id = 현재 사용자 조건을 붙인다
     findByIdAndOwner_Id(id, userId)
     findByOwner_IdAndFolder_IdAndTrashedFalseOrderByNameAsc(userId, folderId) ...
2. 남의 리소스는 403 이 아니라 404 로 응답한다
     → "그 id 가 존재한다" 는 사실조차 알려주지 않는다
3. 업로드/이동 대상 폴더도 "내 폴더이면서 휴지통에 없는 폴더" 여야 한다
```

`findById(id)`로 가져온 뒤 `if (owner != me) throw`처럼 검사하면 한 곳만
빠뜨려도 남의 파일이 보인다. **Repository 메서드 이름 자체에 `Owner_Id`를 넣어
실수할 여지를 없애는 것**이 핵심이다.

## 3-2. S3 key

``` text
Day 7   : users/anonymous/files/5b1c...-uuid
Day 7.5 : users/{userId}/files/5b1c...-uuid
```

- 파일 이름은 DB(`files.name`)에만 저장하고 S3 key에는 UUID를 쓴다.
  → 한글/특수문자/같은 이름 파일 문제를 피한다.
- `users/{userId}/` 접두어 덕분에 S3 콘솔에서 사용자별 파일을 구분할 수 있다.
- 권한 검사는 S3 key가 아니라 **DB의 owner_id** 로 한다.

## 3-3. 휴지통 설계 (soft delete)

**soft delete**: 행을 지우지 않고 "삭제됨" 표시만 한다. 복원이 가능하다.

``` text
files / folders 에 추가되는 컬럼
  trashed     boolean   휴지통에 있는가
  trash_root  boolean   사용자가 "직접" 삭제한 항목인가 (휴지통 목록에 보일 항목)
  trashed_at  timestamp 휴지통에 들어간 시각 (같은 삭제 작업 = 같은 값)
```

폴더 `A`를 삭제하면:

``` text
A/            trashed=true  trash_root=true   trashed_at=10:00:00.123456
├── B/        trashed=true  trash_root=false  trashed_at=10:00:00.123456
│   └── b.txt trashed=true  trash_root=false  trashed_at=10:00:00.123456
└── a.txt     trashed=true  trash_root=false  trashed_at=10:00:00.123456

휴지통 화면에는 A 하나만 보인다 (trash_root=true 인 것만)
```

복원 규칙:

``` text
1. 폴더를 복원하면 "같은 trashed_at 으로 함께 들어간" 하위 항목만 복원한다
   → A 삭제 전에 a2.txt 를 따로 먼저 삭제했다면 a2.txt 는 휴지통에 남는다
2. 원래 부모 폴더가 휴지통에 있으면 루트(내 드라이브)로 복원한다
3. 휴지통에 있는 항목은 목록/검색/최근/중요/이동 대상에서 모두 제외된다
```

영구 삭제 / 휴지통 비우기만 **DB 행과 S3 객체를 실제로 삭제**한다.

> `trashed_at`을 마이크로초로 자르는 이유: PostgreSQL `timestamp`는 마이크로초까지만
> 저장한다. Java의 나노초 값을 그대로 쓰면 DB에 저장된 값과 메모리 값이 달라
> "같은 배치" 비교가 틀어질 수 있다(`FolderService.trashTimestamp()`).

## 3-4. 중요 · 검색 · 최근 · 용량

| 기능 | 구현 |
|---|---|
| 중요(별표) | `starred` 컬럼, `PATCH .../star?starred=true` |
| 검색 | `name ILIKE %q%` (JPA `ContainingIgnoreCase`), 폴더·파일 각 최대 100개 |
| 최근 | 파일을 `updated_at` 내림차순 50개 (이름 변경/이동 시 갱신) |
| 용량 | `used` = 휴지통 포함 내 모든 파일 크기 합, `limit` = `STORAGE_LIMIT_BYTES`(기본 1GB) |

용량에 휴지통을 포함하는 이유: 휴지통 파일도 S3 공간을 차지하기 때문이다(Google
Drive도 같다). 업로드 시 `used + 파일 크기 > limit`이면 **413**을 돌려준다.

------------------------------------------------------------------------

# 4. 설계 (3) --- DB 스키마 변화와 기존 데이터

## 4-1. 무엇이 바뀌는가

``` text
[새 테이블] users
  id, email(unique), password_hash, name, role, created_at

[folders 추가 컬럼]
  owner_id (FK users.id, NULL 허용), starred, trashed, trash_root, trashed_at

[files 추가 컬럼]
  owner_id (FK users.id, NULL 허용), starred, trashed, trash_root, trashed_at
```

`application.properties`의 `spring.jpa.hibernate.ddl-auto=update`(Day 3.5)가
애플리케이션 시작 시 **없는 테이블/컬럼을 자동으로 추가**한다. 따로 SQL을 실행할
필요는 없다.

> `starred` 같은 `boolean NOT NULL` 컬럼을 기존 행이 있는 테이블에 추가하면
> PostgreSQL이 "기존 행에 넣을 값이 없다"며 실패한다. 그래서 엔티티에
> `@ColumnDefault("false")`를 붙여 `DEFAULT false`로 추가되게 했다.
> (`created_at`, `updated_at`은 Day 7에도 이미 있던 컬럼이라 새로 추가되지 않는다.)

## 4-2. 기존(Day 7) 데이터는 보이지 않는다

Day 7까지 업로드한 파일/폴더는 `owner_id`가 `NULL`이다. 모든 쿼리가
`owner_id = 현재 사용자`로 조회하므로 **어떤 사용자에게도 보이지 않는다.** (삭제된
것은 아니다.)

로컬 PostgreSQL(kind와 bootRun이 함께 쓰는 DB)에서 확인:

``` bash
docker exec -it cloud-file-postgres psql -U cloud_user -d cloud_file
```

``` sql
\dt
select count(*) from files   where owner_id is null;
select count(*) from folders where owner_id is null;
select id, email, role, created_at from users;
\q
```

## 4-3. (선택) 기존 데이터 정리

연습용 데이터라면 지워도 된다. **되돌릴 수 없으니** 필요한 파일은 먼저 받아 둔다.

``` bash
docker exec -it cloud-file-postgres psql -U cloud_user -d cloud_file
```

``` sql
begin;
delete from files where owner_id is null;
update folders set parent_id = null where owner_id is null;
delete from folders where owner_id is null;
commit;
```

폴더는 자기 자신을 참조(`parent_id`)하므로 부모 연결을 먼저 끊은 뒤 지운다.

S3에 남은 옛 객체(`users/anonymous/`)도 정리할 수 있다.

``` bash
S3_BUCKET=$(kubectl get configmap cloud-file-service-config \
  -n cloud-file-service -o jsonpath='{.data.S3_BUCKET}')
echo "$S3_BUCKET"

aws s3 ls "s3://$S3_BUCKET/users/anonymous/files/" | head
# 확인 후 삭제
aws s3 rm "s3://$S3_BUCKET/users/anonymous/" --recursive
```

> RDS(ECS 경로)의 데이터도 같은 이유로 보이지 않는다. RDS는 private subnet에 있어
> Codespace에서 바로 접속할 수 없으므로, 그대로 두어도 서비스에는 영향이 없다.

------------------------------------------------------------------------

# 5. API 표

모든 응답은 JSON이다. 오류는 항상 `{"message": "..."}` 형식이다.

`/api/auth/signup`, `/api/auth/login`, `/health`, `/actuator/health/**`,
`/actuator/info`를 제외한 **모든 `/api/**` 요청에는 헤더가 필요하다.**

``` text
Authorization: Bearer <JWT>
```

## 5-1. 공통 상태 코드

| 상태 | 언제 | 예시 message |
|---|---|---|
| 400 | 입력 검증 실패, 잘못된 요청 형식, 현재 비밀번호 틀림, 순환 이동 | `비밀번호는 8자 이상 72자 이하여야 합니다.` |
| 401 | 토큰 없음/위조/만료, 탈퇴한 사용자의 토큰, 로그인 실패 | `로그인이 필요합니다.` |
| 403 | 관리자 API를 일반 사용자가 호출 | `권한이 없습니다.` |
| 404 | 없는 id **또는 남의 리소스**, 휴지통에 있는 항목에 일반 동작 | `파일을 찾을 수 없습니다.` |
| 409 | 이미 가입된 이메일 | `이미 가입된 이메일입니다.` |
| 413 | 50MB 초과, 저장 공간 부족 | `저장 공간이 부족합니다.` |
| 502 | S3 처리 오류 | `파일 저장소 처리 중 오류가 발생했습니다.` |

## 5-2. 응답 타입

``` text
UserResponse      { id, email, name, role: "USER"|"ADMIN", storageUsed, storageLimit, createdAt }
AuthResponse      { token, user: UserResponse }
FileResponse      { id, name, originalName, size, contentType, folderId|null,
                    starred, trashed, createdAt, updatedAt, trashedAt|null }
FolderResponse    { id, name, parentFolderId|null, starred, trashed, createdAt, updatedAt, trashedAt|null }
DriveItems        { folders: FolderResponse[], files: FileResponse[] }
StorageResponse   { used, limit }                     (단위: byte)
AdminUserResponse { id, email, name, role, storageUsed, fileCount, createdAt }
날짜              "2026-09-25T06:55:25.946" (타임존 없는 LocalDateTime, 서버 UTC 기준)
```

## 5-3. 인증 / 계정

| Method | Path | Body / Query | 성공 | 주요 실패 |
|---|---|---|---|---|
| POST | `/api/auth/signup` | `{email, password, name}` | 201 AuthResponse | 400, 409 |
| POST | `/api/auth/login` | `{email, password}` | 200 AuthResponse | 401 `이메일 또는 비밀번호가 올바르지 않습니다.` |
| GET | `/api/auth/me` | | 200 UserResponse | 401 |
| PATCH | `/api/users/me` | `{name}` | 200 UserResponse | 400 |
| PATCH | `/api/users/me/password` | `{currentPassword, newPassword}` | 204 | 400 (현재 비밀번호 틀림) |
| DELETE | `/api/users/me` | `{password}` (JSON body) | 204 (S3 객체·파일·폴더·계정 모두 삭제) | 400 (비밀번호 틀림) |
| GET | `/api/admin/users` | | 200 AdminUserResponse[] | 403 |
| DELETE | `/api/admin/users/{id}` | | 204 | 400 (자기 자신), 403, 404 |

이메일은 앞뒤 공백을 제거하고 소문자로 저장한다(`Alice@Example.com` → `alice@example.com`).

## 5-4. 파일

| Method | Path | Body / Query | 성공 | 비고 |
|---|---|---|---|---|
| GET | `/api/files` | `?folderId=` (없으면 루트) | 200 FileResponse[] | 휴지통 제외, 이름순 |
| POST | `/api/files` | multipart `file`, `folderId`(선택) | 201 FileResponse | 413 용량/크기 초과 |
| GET | `/api/files/{id}/download` | | 200 bytes | `Content-Disposition: attachment; filename*=UTF-8''...` |
| GET | `/api/files/{id}/preview` | | 200 bytes | `Content-Disposition: inline`, 실제 Content-Type |
| PATCH | `/api/files/{id}/rename` | `?name=` | 200 FileResponse | |
| PATCH | `/api/files/{id}/move` | `?folderId=` (없으면 루트) | 200 FileResponse | |
| PATCH | `/api/files/{id}/star` | `?starred=true\|false` | 200 FileResponse | |
| DELETE | `/api/files/{id}` | | 204 | **휴지통으로 이동** (S3는 유지) |

## 5-5. 폴더

| Method | Path | Body / Query | 성공 | 비고 |
|---|---|---|---|---|
| GET | `/api/folders` | `?parentFolderId=` | 200 FolderResponse[] | 휴지통 제외, 이름순 |
| POST | `/api/folders` | `{name, parentFolderId}` | 201 FolderResponse | |
| GET | `/api/folders/{id}` | | 200 FolderResponse | 휴지통이면 404 |
| GET | `/api/folders/{id}/path` | | 200 FolderResponse[] | 루트 → … → 자신 (브레드크럼) |
| GET | `/api/folders/tree` | | 200 FolderResponse[] | 휴지통 제외 전체 폴더 (이동 대화상자) |
| PATCH | `/api/folders/{id}` | `{name}` | 200 FolderResponse | 이름 변경 |
| PATCH | `/api/folders/{id}/move` | `?parentFolderId=` | 200 FolderResponse | 자기 자신/하위로 이동 시 400 |
| PATCH | `/api/folders/{id}/star` | `?starred=` | 200 FolderResponse | |
| DELETE | `/api/folders/{id}` | | 204 | 하위 전체와 함께 **휴지통으로** (비어 있지 않아도 됨) |

## 5-6. 드라이브 화면

| Method | Path | 성공 | 비고 |
|---|---|---|---|
| GET | `/api/drive/search?q=` | 200 DriveItems | 이름 부분 일치, 대소문자 무시, 각 최대 100개. q가 비면 빈 목록 |
| GET | `/api/drive/recent` | 200 FileResponse[] | 최근 수정 순 50개 |
| GET | `/api/drive/starred` | 200 DriveItems | 중요 & 휴지통 아님 |
| GET | `/api/drive/trash` | 200 DriveItems | 직접 삭제한 항목(trash root)만, 최근 삭제 순 |
| POST | `/api/drive/trash/files/{id}/restore` | 200 FileResponse | 원래 폴더가 없으면 루트로 |
| POST | `/api/drive/trash/folders/{id}/restore` | 200 FolderResponse | 함께 삭제된 하위만 복원 |
| DELETE | `/api/drive/trash/files/{id}` | 204 | 영구 삭제 (S3 포함) |
| DELETE | `/api/drive/trash/folders/{id}` | 204 | 하위 전체 영구 삭제 (S3 포함) |
| DELETE | `/api/drive/trash` | 204 | 휴지통 비우기 |
| GET | `/api/drive/storage` | 200 StorageResponse | |

## 5-7. 환경변수

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `JWT_SECRET` | 개발용 고정 문자열 | **운영에서는 반드시 설정**. 32바이트 이상 |
| `JWT_EXPIRATION_MINUTES` | `1440` | 토큰 유효 시간(분) |
| `ADMIN_EMAILS` | (빈 값) | 관리자 이메일, 쉼표 구분 |
| `STORAGE_LIMIT_BYTES` | `1073741824` | 사용자별 용량(1GB) |
| `DB_*`, `SPRING_DATASOURCE_*`, `AWS_REGION`, `S3_BUCKET` | Day 7과 동일 | 변경 없음 |

------------------------------------------------------------------------

# 6. Backend --- 의존성 추가

파일: `backend/build.gradle`

`dependencies { ... }` 안에 다음 3줄을 추가한다. (나머지는 Day 7 그대로)

``` groovy
	implementation 'org.springframework.boot:spring-boot-starter-security'
	implementation 'org.springframework.boot:spring-boot-starter-security-oauth2-resource-server'
```

``` groovy
	testImplementation 'org.springframework.boot:spring-boot-starter-security-test'
```

추가한 뒤의 모양(해당 부분):

``` groovy
	implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
	implementation 'org.springframework.boot:spring-boot-starter-validation'
	implementation 'org.springframework.boot:spring-boot-starter-webmvc'
	implementation 'org.springframework.boot:spring-boot-starter-security'
	implementation 'org.springframework.boot:spring-boot-starter-security-oauth2-resource-server'
	runtimeOnly 'org.postgresql:postgresql'
	testImplementation 'org.springframework.boot:spring-boot-starter-actuator-test'
	testImplementation 'org.springframework.boot:spring-boot-starter-validation-test'
	testImplementation 'org.springframework.boot:spring-boot-starter-webmvc-test'
	testImplementation 'org.springframework.boot:spring-boot-starter-security-test'
	testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
```

| 의존성 | 역할 |
|---|---|
| `spring-boot-starter-security` | 모든 요청 앞에 보안 필터(FilterChain)를 둔다. BCrypt 포함 |
| `spring-boot-starter-security-oauth2-resource-server` | `Authorization: Bearer <JWT>`를 읽어 검증. JWT 발급용 Nimbus 라이브러리 포함 |
| `spring-boot-starter-security-test` | 테스트용 |

> **Spring Security를 추가하는 순간 모든 API가 잠긴다.** 기본 설정은 모든 요청에
> 로그인을 요구하고, 로그에 임시 비밀번호를 출력한다. 9번의 `SecurityConfig`까지
> 만들어야 정상 동작한다. 중간에 build가 되더라도 API 테스트는 17번 이후에 한다.

별도의 JWT 라이브러리(jjwt 등)는 쓰지 않는다. Resource Server에 들어 있는
`NimbusJwtEncoder`/`NimbusJwtDecoder`로 발급과 검증을 모두 한다.

------------------------------------------------------------------------

# 7. Backend --- application.properties

Day 7과 비교해 바뀐 것:

``` text
~ multipart 최대 크기 10MB → 50MB
+ app.jwt.secret, app.jwt.expiration-minutes
+ app.admin-emails
+ app.storage.limit-bytes
```

`${JWT_SECRET:기본값}`은 "환경변수 `JWT_SECRET`이 있으면 그 값, 없으면 기본값"이라는
뜻이다. 기본값은 **로컬 개발 전용**이다. 이 값은 Git에 공개되어 있으므로 누구나 이
키로 관리자 토큰을 위조할 수 있다. kind와 ECS에는 반드시 무작위 값을 주입한다(28·30번).

파일: `backend/src/main/resources/application.properties`

``` properties
spring.application.name=backend

server.address=0.0.0.0
server.port=8080

# PostgreSQL
spring.datasource.url=${SPRING_DATASOURCE_URL:${DB_URL:jdbc:postgresql://localhost:5432/cloud_file}}
spring.datasource.username=${SPRING_DATASOURCE_USERNAME:${DB_USERNAME:cloud_user}}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD:${DB_PASSWORD:cloud_password}}
spring.jpa.hibernate.ddl-auto=update

# JPA
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true

# AWS
aws.region=${AWS_REGION:ap-northeast-2}

# S3
aws.s3.bucket=${S3_BUCKET:local-cloud-file-service}

# Multipart
spring.servlet.multipart.max-file-size=50MB
spring.servlet.multipart.max-request-size=50MB

#Actuator 설정
management.endpoints.web.exposure.include=health,info
management.endpoint.health.probes.enabled=true

# JWT (HS256) - 기본값은 로컬 개발 전용! 운영에서는 반드시 JWT_SECRET(32바이트 이상)을 주입할 것
app.jwt.secret=${JWT_SECRET:dev-only-insecure-jwt-secret-change-me-0123456789abcdef}
app.jwt.expiration-minutes=${JWT_EXPIRATION_MINUTES:1440}

# 가입 시 ADMIN 권한을 받을 이메일 (쉼표 구분)
app.admin-emails=${ADMIN_EMAILS:}

# 사용자별 저장 용량 (기본 1GB)
app.storage.limit-bytes=${STORAGE_LIMIT_BYTES:1073741824}
```

------------------------------------------------------------------------

# 8. Backend --- 사용자 엔티티와 Repository

만들 파일:

``` text
backend/src/main/java/com/example/backend/
├── entity/Role.java
├── entity/UserEntity.java
└── repository/UserRepository.java
```

파일: `backend/src/main/java/com/example/backend/entity/Role.java`

``` java
package com.example.backend.entity;

public enum Role {
    USER,
    ADMIN
}
```

`@Table(name = "users")`: PostgreSQL에서 `user`는 예약어이므로 테이블 이름을
`users`로 한다. 비밀번호는 `passwordHash`(BCrypt 결과 60자)만 저장한다.
`@Enumerated(EnumType.STRING)`은 역할을 숫자(0, 1)가 아니라 `"USER"`, `"ADMIN"`
문자열로 저장해 enum 순서가 바뀌어도 데이터가 깨지지 않게 한다.

파일: `backend/src/main/java/com/example/backend/entity/UserEntity.java`

``` java
package com.example.backend.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class UserEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(nullable = false, length = 100)
    private String passwordHash;

    @Column(nullable = false, length = 50)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected UserEntity() {
    }

    public UserEntity(
            String email,
            String passwordHash,
            String name,
            Role role
    ) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.name = name;
        this.role = role;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
```

파일: `backend/src/main/java/com/example/backend/repository/UserRepository.java`

``` java
package com.example.backend.repository;

import com.example.backend.entity.UserEntity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository
        extends JpaRepository<UserEntity, Long> {

    Optional<UserEntity> findByEmail(String email);

    boolean existsByEmail(String email);

    List<UserEntity> findAllByOrderByCreatedAtAsc();
}
```

------------------------------------------------------------------------

# 9. Backend --- Security (JWT 발급/검증)

만들 파일:

``` text
backend/src/main/java/com/example/backend/
├── security/JwtKeyProvider.java           JWT_SECRET → HMAC 키 (32바이트 미만이면 시작 실패)
├── security/JwtTokenService.java          로그인/가입 성공 시 JWT 발급
├── security/CurrentUser.java              Jwt → 사용자 id
├── security/JsonSecurityErrorHandler.java 401/403 을 JSON 으로
└── config/SecurityConfig.java             SecurityFilterChain, BCrypt, JwtEncoder/Decoder
```

## 9-1. JwtKeyProvider

`JWT_SECRET` 문자열을 HS256용 키로 바꾼다. 32바이트 미만이면
`IllegalStateException`으로 **애플리케이션 시작을 막는다.** 약한 키로 조용히
운영되는 것보다 시작 실패가 안전하다.

파일: `backend/src/main/java/com/example/backend/security/JwtKeyProvider.java`

``` java
package com.example.backend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

@Component
public class JwtKeyProvider {

    private final SecretKey secretKey;

    public JwtKeyProvider(
            @Value("${app.jwt.secret}") String secret
    ) {
        byte[] bytes =
                secret.getBytes(StandardCharsets.UTF_8);

        if (bytes.length < 32) {
            throw new IllegalStateException(
                    "app.jwt.secret(JWT_SECRET)은 32바이트 이상이어야 합니다."
            );
        }

        this.secretKey =
                new SecretKeySpec(bytes, "HmacSHA256");
    }

    public SecretKey secretKey() {
        return secretKey;
    }
}
```

## 9-2. JwtTokenService

2-2의 claims(`iss`, `sub`, `iat`, `exp`, `email`, `role`)를 만들어 서명한다.

파일: `backend/src/main/java/com/example/backend/security/JwtTokenService.java`

``` java
package com.example.backend.security;

import com.example.backend.entity.UserEntity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

@Service
public class JwtTokenService {

    public static final String ISSUER = "cloud-file-service";

    private final JwtEncoder jwtEncoder;
    private final Duration expiration;

    public JwtTokenService(
            JwtEncoder jwtEncoder,
            @Value("${app.jwt.expiration-minutes}") long expirationMinutes
    ) {
        this.jwtEncoder = jwtEncoder;
        this.expiration = Duration.ofMinutes(expirationMinutes);
    }

    public String issue(UserEntity user) {

        Instant now = Instant.now();

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .subject(String.valueOf(user.getId()))
                .issuedAt(now)
                .expiresAt(now.plus(expiration))
                .claim("email", user.getEmail())
                .claim("role", user.getRole().name())
                .build();

        JwsHeader header =
                JwsHeader.with(MacAlgorithm.HS256).build();

        return jwtEncoder
                .encode(JwtEncoderParameters.from(header, claims))
                .getTokenValue();
    }
}
```

## 9-3. CurrentUser

Controller 메서드에 `@AuthenticationPrincipal Jwt jwt`를 쓰면 Spring Security가
**검증을 통과한 토큰**을 넣어 준다. `CurrentUser.id(jwt)`는 그 토큰의 `sub`를
`Long` 사용자 id로 바꾼다. 요청 body나 query로 사용자 id를 받지 않는 것이
중요하다. 클라이언트가 보낸 id는 조작할 수 있지만 토큰의 `sub`는 서명으로 보호된다.

파일: `backend/src/main/java/com/example/backend/security/CurrentUser.java`

``` java
package com.example.backend.security;

import com.example.backend.exception.UnauthorizedException;

import org.springframework.security.oauth2.jwt.Jwt;

/**
 * 컨트롤러에서 {@code @AuthenticationPrincipal Jwt jwt} 로 받은 토큰에서
 * 현재 사용자 id(subject)를 꺼내는 헬퍼.
 */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static Long id(Jwt jwt) {

        if (jwt == null || jwt.getSubject() == null) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }

        try {
            return Long.valueOf(jwt.getSubject());
        } catch (NumberFormatException e) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }
    }
}
```

## 9-4. JsonSecurityErrorHandler

Spring Security의 기본 401 응답은 body가 비어 있고 `WWW-Authenticate` 헤더만 있다.
Frontend는 모든 오류를 `{"message": ...}`로 처리하므로 같은 형식으로 맞춘다.

- `AuthenticationEntryPoint` → 로그인 안 됨(401)
- `AccessDeniedHandler` → 로그인은 했지만 권한 없음(403)

파일: `backend/src/main/java/com/example/backend/security/JsonSecurityErrorHandler.java`

``` java
package com.example.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 인증/인가 실패 시 HTML 이나 WWW-Authenticate 팝업 대신
 * {"message": "..."} JSON 을 돌려준다.
 */
@Component
public class JsonSecurityErrorHandler
        implements AuthenticationEntryPoint, AccessDeniedHandler {

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException
    ) throws IOException {

        write(response, HttpServletResponse.SC_UNAUTHORIZED, "로그인이 필요합니다.");
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException
    ) throws IOException {

        write(response, HttpServletResponse.SC_FORBIDDEN, "권한이 없습니다.");
    }

    private void write(
            HttpServletResponse response,
            int status,
            String message
    ) throws IOException {

        if (response.isCommitted()) {
            return;
        }

        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"message\":\"" + message + "\"}");
        response.getWriter().flush();
    }
}
```

## 9-5. SecurityConfig

**SecurityFilterChain**은 모든 HTTP 요청이 Controller에 도착하기 전에 거치는
필터 목록이다.

``` text
요청 → [Bearer 토큰 읽기 → 서명/만료/발급자 검증 → 권한 확인] → Controller
                  │ 실패                               │ 실패
                  └→ 401 JSON                          └→ 403 JSON
```

설정 요약:

| 설정 | 이유 |
|---|---|
| `csrf.disable()` | CSRF는 쿠키로 인증할 때의 공격이다. 우리는 쿠키가 아닌 `Authorization` 헤더를 쓴다 |
| `httpBasic/formLogin/logout.disable()` | 브라우저 로그인 팝업과 기본 로그인 페이지를 끈다 |
| `SessionCreationPolicy.STATELESS` | 서버 세션을 만들지 않는다(JWT) |
| `permitAll()` | 가입/로그인, health, actuator health/info, `/error` |
| `/api/admin/**` → `hasRole("ADMIN")` | 토큰의 `role` claim이 `ADMIN`이어야 한다 |
| `anyRequest().authenticated()` | 나머지는 모두 로그인 필요 |
| `oauth2ResourceServer.jwt(...)` | Bearer 토큰을 `JwtDecoder`로 검증 |
| `JwtIssuerValidator` | 우리 서버(`cloud-file-service`)가 발급한 토큰만 인정 |
| `JwtGrantedAuthoritiesConverter` | `role: "ADMIN"` → 권한 `ROLE_ADMIN` (`hasRole`이 `ROLE_` 접두어를 붙여 비교) |

> `/actuator/health/**`를 열어 두어야 Kubernetes readiness/liveness probe(Day 7
> 18번)가 401을 받지 않는다. 열지 않으면 Pod가 `0/1 Ready`로 멈춘다.

파일: `backend/src/main/java/com/example/backend/config/SecurityConfig.java`

``` java
package com.example.backend.config;

import com.example.backend.security.JsonSecurityErrorHandler;
import com.example.backend.security.JwtKeyProvider;
import com.example.backend.security.JwtTokenService;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JsonSecurityErrorHandler errorHandler
    ) throws Exception {

        http
                .csrf(csrf -> csrf.disable())
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/api/auth/signup", "/api/auth/login").permitAll()
                        .requestMatchers("/health", "/actuator/health/**", "/actuator/info", "/error").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
                        .authenticationEntryPoint(errorHandler)
                        .accessDeniedHandler(errorHandler))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(errorHandler)
                        .accessDeniedHandler(errorHandler));

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public JwtEncoder jwtEncoder(JwtKeyProvider keyProvider) {
        return new NimbusJwtEncoder(
                new ImmutableSecret<>(keyProvider.secretKey())
        );
    }

    @Bean
    public JwtDecoder jwtDecoder(JwtKeyProvider keyProvider) {

        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withSecretKey(keyProvider.secretKey())
                .macAlgorithm(MacAlgorithm.HS256)
                .build();

        decoder.setJwtValidator(
                new DelegatingOAuth2TokenValidator<>(
                        JwtValidators.createDefault(),
                        new JwtIssuerValidator(JwtTokenService.ISSUER)
                )
        );

        return decoder;
    }

    private JwtAuthenticationConverter jwtAuthenticationConverter() {

        JwtGrantedAuthoritiesConverter authorities =
                new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("role");
        authorities.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter converter =
                new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);

        return converter;
    }
}
```

------------------------------------------------------------------------

# 10. Backend --- DTO

**DTO**는 API 입출력 전용 객체다. 엔티티를 그대로 JSON으로 돌려주면
`passwordHash`나 `s3Key` 같은 내부 값이 노출될 수 있으므로 필요한 필드만 담는다.
`record`는 필드·생성자·getter를 자동으로 만들어 주는 Java 문법이다.

요청 DTO의 `@NotBlank`, `@Size`, `@Email`은 Controller의 `@Valid`와 함께 동작해
조건을 어기면 400과 여기 적힌 한국어 메시지를 돌려준다(11번 `handleValidation`).

## 10-1. 새로 만드는 DTO

파일: `backend/src/main/java/com/example/backend/dto/SignupRequest.java`

``` java
package com.example.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SignupRequest(

        @NotBlank(message = "이메일을 입력해야 합니다.")
        @Email(message = "올바른 이메일 형식이 아닙니다.")
        @Size(max = 255, message = "이메일은 255자 이하여야 합니다.")
        String email,

        @NotNull(message = "비밀번호를 입력해야 합니다.")
        @Size(min = 8, max = 72, message = "비밀번호는 8자 이상 72자 이하여야 합니다.")
        String password,

        @NotBlank(message = "이름을 입력해야 합니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name
) {

    public SignupRequest {
        // 검증 전에 앞뒤 공백 제거 (이메일은 서비스에서 소문자로 정규화)
        email = email == null ? null : email.trim();
        name = name == null ? null : name.trim();
    }
}
```

파일: `backend/src/main/java/com/example/backend/dto/LoginRequest.java`

``` java
package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(

        @NotBlank(message = "이메일을 입력해야 합니다.")
        String email,

        @NotBlank(message = "비밀번호를 입력해야 합니다.")
        String password
) {

    public LoginRequest {
        email = email == null ? null : email.trim();
    }
}
```

파일: `backend/src/main/java/com/example/backend/dto/UpdateProfileRequest.java`

``` java
package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(

        @NotBlank(message = "이름을 입력해야 합니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name
) {
}
```

파일: `backend/src/main/java/com/example/backend/dto/ChangePasswordRequest.java`

``` java
package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(

        @NotBlank(message = "현재 비밀번호를 입력해야 합니다.")
        String currentPassword,

        @NotNull(message = "새 비밀번호를 입력해야 합니다.")
        @Size(min = 8, max = 72, message = "비밀번호는 8자 이상 72자 이하여야 합니다.")
        String newPassword
) {
}
```

파일: `backend/src/main/java/com/example/backend/dto/DeleteAccountRequest.java`

``` java
package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record DeleteAccountRequest(

        @NotBlank(message = "비밀번호를 입력해야 합니다.")
        String password
) {
}
```

파일: `backend/src/main/java/com/example/backend/dto/UserResponse.java`

``` java
package com.example.backend.dto;

import com.example.backend.entity.Role;
import com.example.backend.entity.UserEntity;

import java.time.LocalDateTime;

public record UserResponse(
        Long id,
        String email,
        String name,
        Role role,
        long storageUsed,
        long storageLimit,
        LocalDateTime createdAt
) {

    public static UserResponse of(
            UserEntity user,
            long storageUsed,
            long storageLimit
    ) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getName(),
                user.getRole(),
                storageUsed,
                storageLimit,
                user.getCreatedAt()
        );
    }
}
```

파일: `backend/src/main/java/com/example/backend/dto/AuthResponse.java`

``` java
package com.example.backend.dto;

public record AuthResponse(
        String token,
        UserResponse user
) {
}
```

파일: `backend/src/main/java/com/example/backend/dto/AdminUserResponse.java`

``` java
package com.example.backend.dto;

import com.example.backend.entity.Role;

import java.time.LocalDateTime;

public record AdminUserResponse(
        Long id,
        String email,
        String name,
        Role role,
        long storageUsed,
        long fileCount,
        LocalDateTime createdAt
) {
}
```

파일: `backend/src/main/java/com/example/backend/dto/DriveItems.java`

``` java
package com.example.backend.dto;

import java.util.List;

public record DriveItems(
        List<FolderResponse> folders,
        List<FileResponse> files
) {

    public static DriveItems empty() {
        return new DriveItems(List.of(), List.of());
    }
}
```

파일: `backend/src/main/java/com/example/backend/dto/StorageResponse.java`

``` java
package com.example.backend.dto;

public record StorageResponse(
        long used,
        long limit
) {
}
```

## 10-2. 수정하는 DTO

`starred`, `trashed`, `trashedAt`이 추가된다.

파일: `backend/src/main/java/com/example/backend/dto/FileResponse.java`

``` java
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
        boolean starred,
        boolean trashed,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime trashedAt
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
                file.isStarred(),
                file.isTrashed(),
                file.getCreatedAt(),
                file.getUpdatedAt(),
                file.getTrashedAt()
        );
    }
}
```

파일: `backend/src/main/java/com/example/backend/dto/FolderResponse.java`

``` java
package com.example.backend.dto;

import com.example.backend.entity.FolderEntity;

import java.time.LocalDateTime;

public record FolderResponse(
        Long id,
        String name,
        Long parentFolderId,
        boolean starred,
        boolean trashed,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime trashedAt
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
                folder.isStarred(),
                folder.isTrashed(),
                folder.getCreatedAt(),
                folder.getUpdatedAt(),
                folder.getTrashedAt()
        );
    }
}
```

`CreateFolderRequest`, `RenameRequest`, `CreateFileRequest`는 Day 7 그대로다.

------------------------------------------------------------------------

# 11. Backend --- 예외와 GlobalExceptionHandler

Service는 상황에 맞는 예외를 던지기만 하고, **HTTP 상태 코드로 바꾸는 일은
`GlobalExceptionHandler` 한 곳**에서 한다.

``` text
ResourceNotFoundException  → 404   (없음 / 남의 것)
UnauthorizedException      → 401   (로그인 실패, 탈퇴한 사용자의 토큰)
ConflictException          → 409   (이메일 중복)
QuotaExceededException     → 413   (저장 공간 부족)
IllegalArgumentException   → 400   (잘못된 입력, 순환 이동, 비밀번호 틀림)
MaxUploadSizeExceeded      → 413   (50MB 초과)
Validation 실패            → 400   (DTO 의 message)
SdkException(S3)           → 502
```

## 11-1. 새 예외 클래스

파일: `backend/src/main/java/com/example/backend/exception/ResourceNotFoundException.java`

``` java
package com.example.backend.exception;

public class ResourceNotFoundException
        extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }
}
```

파일: `backend/src/main/java/com/example/backend/exception/UnauthorizedException.java`

``` java
package com.example.backend.exception;

public class UnauthorizedException
        extends RuntimeException {

    public UnauthorizedException(String message) {
        super(message);
    }
}
```

파일: `backend/src/main/java/com/example/backend/exception/ConflictException.java`

``` java
package com.example.backend.exception;

public class ConflictException
        extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
```

파일: `backend/src/main/java/com/example/backend/exception/QuotaExceededException.java`

``` java
package com.example.backend.exception;

public class QuotaExceededException
        extends RuntimeException {

    public QuotaExceededException(String message) {
        super(message);
    }
}
```

## 11-2. GlobalExceptionHandler (전체 교체)

`HttpStatus.CONTENT_TOO_LARGE`는 413이다(예전 이름 `PAYLOAD_TOO_LARGE`).
S3 오류는 내부 메시지를 그대로 보여주지 않고 로그에만 남긴다.

파일: `backend/src/main/java/com/example/backend/exception/GlobalExceptionHandler.java`

``` java
package com.example.backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log =
            LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(
            FileNotFoundException.class
    )
    public ResponseEntity<Map<String, String>>
    handleFileNotFound(
            FileNotFoundException exception
    ) {
        return message(HttpStatus.NOT_FOUND, exception.getMessage());
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, String>>
    handleNotFound(
            ResourceNotFoundException exception
    ) {
        return message(HttpStatus.NOT_FOUND, exception.getMessage());
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<Map<String, String>>
    handleUnauthorized(
            UnauthorizedException exception
    ) {
        return message(HttpStatus.UNAUTHORIZED, exception.getMessage());
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<Map<String, String>>
    handleConflictException(
            ConflictException exception
    ) {
        return message(HttpStatus.CONFLICT, exception.getMessage());
    }

    @ExceptionHandler(QuotaExceededException.class)
    public ResponseEntity<Map<String, String>>
    handleQuotaExceeded(
            QuotaExceededException exception
    ) {
        return message(HttpStatus.CONTENT_TOO_LARGE, exception.getMessage());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>>
    handleMaxUploadSize(
            MaxUploadSizeExceededException exception
    ) {
        return message(HttpStatus.CONTENT_TOO_LARGE, "파일 크기는 50MB를 초과할 수 없습니다.");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>>
    handleValidation(
            MethodArgumentNotValidException exception
    ) {
        FieldError fieldError = exception.getBindingResult().getFieldError();

        String text = fieldError != null && fieldError.getDefaultMessage() != null
                ? fieldError.getDefaultMessage()
                : "요청 값이 올바르지 않습니다.";

        return message(HttpStatus.BAD_REQUEST, text);
    }

    @ExceptionHandler({
            MissingServletRequestParameterException.class,
            MissingServletRequestPartException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class
    })
    public ResponseEntity<Map<String, String>>
    handleMalformedRequest(
            Exception exception
    ) {
        return message(HttpStatus.BAD_REQUEST, "요청 형식이 올바르지 않습니다.");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>>
    handleBadRequest(
            IllegalArgumentException exception
    ) {
        return message(HttpStatus.BAD_REQUEST, exception.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>>
    handleConflict(
            IllegalStateException exception
    ) {
        return message(HttpStatus.CONFLICT, exception.getMessage());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>>
    handleDataIntegrity(
            DataIntegrityViolationException exception
    ) {
        log.warn("데이터 무결성 오류: {}", exception.getMostSpecificCause().getMessage());
        return message(HttpStatus.CONFLICT, "요청이 기존 데이터와 충돌합니다.");
    }

    @ExceptionHandler(NoSuchKeyException.class)
    public ResponseEntity<Map<String, String>>
    handleNoSuchKey(
            NoSuchKeyException exception
    ) {
        return message(HttpStatus.NOT_FOUND, "저장소에서 파일 데이터를 찾을 수 없습니다.");
    }

    @ExceptionHandler(SdkException.class)
    public ResponseEntity<Map<String, String>>
    handleStorageError(
            SdkException exception
    ) {
        log.error("S3 처리 오류", exception);
        return message(HttpStatus.BAD_GATEWAY, "파일 저장소 처리 중 오류가 발생했습니다.");
    }

    private static ResponseEntity<Map<String, String>> message(
            HttpStatus status,
            String message
    ) {
        return ResponseEntity
                .status(status)
                .body(
                        Map.of(
                                "message",
                                message == null ? status.getReasonPhrase() : message
                        )
                );
    }
}
```

`FileNotFoundException`(Day 7)은 남겨 두었다. 새 코드는 `ResourceNotFoundException`을 쓴다.

------------------------------------------------------------------------

# 12. Backend --- FileEntity / FolderEntity 변경

추가되는 필드:

``` text
owner      @ManyToOne UserEntity (owner_id, NULL 허용 → 기존 데이터 호환)
starred    boolean (@ColumnDefault("false"))
trashed    boolean (@ColumnDefault("false"))
trashRoot  boolean (@ColumnDefault("false"))
trashedAt  LocalDateTime
(updatedAt 은 Day 7에도 이미 있었다. 이름 변경/이동 시 갱신 → 최근 문서함 정렬에 사용)
```

`moveToTrash(trashedAt, root)` / `restore()`는 휴지통 상태를 한 번에 바꾸는
메서드다. 여러 필드를 따로 setter로 바꾸다가 하나를 빠뜨리는 실수를 막는다.

`@ManyToOne(fetch = FetchType.LAZY)`: 파일을 조회할 때 주인(UserEntity)을 바로
불러오지 않고 실제로 필요할 때 불러온다. 우리는 주로 `owner_id` 조건으로만 쓰므로
불필요한 조회를 줄인다.

파일: `backend/src/main/java/com/example/backend/entity/FileEntity.java`

``` java
package com.example.backend.entity;

import jakarta.persistence.*;

import org.hibernate.annotations.ColumnDefault;

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

    // 기존 데이터와의 호환을 위해 DB 컬럼은 nullable 로 둔다.
    // owner 가 null 인 기존 행은 어떤 사용자에게도 보이지 않는다.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private UserEntity owner;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean starred = false;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean trashed = false;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean trashRoot = false;

    private LocalDateTime trashedAt;

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
            FolderEntity folder,
            UserEntity owner
    ) {
        this.name = name;
        this.originalName = originalName;
        this.s3Key = s3Key;
        this.size = size;
        this.contentType = contentType;
        this.folder = folder;
        this.owner = owner;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public void moveToTrash(LocalDateTime trashedAt, boolean root) {
        this.trashed = true;
        this.trashRoot = root;
        this.trashedAt = trashedAt;
    }

    public void restore() {
        this.trashed = false;
        this.trashRoot = false;
        this.trashedAt = null;
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

    public UserEntity getOwner() {
        return owner;
    }

    public boolean isStarred() {
        return starred;
    }

    public void setStarred(boolean starred) {
        this.starred = starred;
    }

    public boolean isTrashed() {
        return trashed;
    }

    public boolean isTrashRoot() {
        return trashRoot;
    }

    public LocalDateTime getTrashedAt() {
        return trashedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
```

파일: `backend/src/main/java/com/example/backend/entity/FolderEntity.java`

``` java
package com.example.backend.entity;

import jakarta.persistence.*;

import org.hibernate.annotations.ColumnDefault;

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

    // 기존 데이터와의 호환을 위해 DB 컬럼은 nullable 로 둔다.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private UserEntity owner;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean starred = false;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean trashed = false;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean trashRoot = false;

    private LocalDateTime trashedAt;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected FolderEntity() {
    }

    public FolderEntity(
            String name,
            FolderEntity parent,
            UserEntity owner
    ) {
        this.name = name;
        this.parent = parent;
        this.owner = owner;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public void moveToTrash(LocalDateTime trashedAt, boolean root) {
        this.trashed = true;
        this.trashRoot = root;
        this.trashedAt = trashedAt;
    }

    public void restore() {
        this.trashed = false;
        this.trashRoot = false;
        this.trashedAt = null;
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

    public UserEntity getOwner() {
        return owner;
    }

    public boolean isStarred() {
        return starred;
    }

    public void setStarred(boolean starred) {
        this.starred = starred;
    }

    public boolean isTrashed() {
        return trashed;
    }

    public boolean isTrashRoot() {
        return trashRoot;
    }

    public LocalDateTime getTrashedAt() {
        return trashedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
```

------------------------------------------------------------------------

# 13. Backend --- Repository 변경

Spring Data JPA는 **메서드 이름을 읽어 SQL을 만든다.**

``` text
findByOwner_IdAndFolder_IdAndTrashedFalseOrderByNameAsc(ownerId, folderId)
  → select * from files
     where owner_id = ? and folder_id = ? and trashed = false
     order by name asc

findTop100ByOwner_IdAndTrashedFalseAndNameContainingIgnoreCaseOrderByNameAsc(ownerId, "보고")
  → ... where owner_id = ? and trashed = false and upper(name) like upper('%보고%')
     order by name asc limit 100
```

`Owner_Id`의 `_`는 "owner 필드의 id"라는 뜻이다. 이름이 길지만 **읽기만 해도 어떤
조건으로 조회하는지 알 수 있고, owner 조건을 빠뜨릴 수 없다.**

`@Query` + `@Modifying`은 여러 행을 한 번에 지우거나 바꾸는 JPQL이다.
`flushAutomatically/clearAutomatically`는 실행 전 변경 사항을 DB에 반영하고, 실행 후
메모리의 오래된 엔티티를 비워 결과가 어긋나지 않게 한다.

파일: `backend/src/main/java/com/example/backend/repository/FileRepository.java`

``` java
package com.example.backend.repository;

import com.example.backend.entity.FileEntity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FileRepository
        extends JpaRepository<FileEntity, Long> {

    Optional<FileEntity> findByIdAndOwner_Id(Long id, Long ownerId);

    List<FileEntity> findByOwner_IdAndFolderIsNullAndTrashedFalseOrderByNameAsc(
            Long ownerId
    );

    List<FileEntity> findByOwner_IdAndFolder_IdAndTrashedFalseOrderByNameAsc(
            Long ownerId,
            Long folderId
    );

    List<FileEntity> findByOwner_IdAndFolder_IdIn(
            Long ownerId,
            Collection<Long> folderIds
    );

    List<FileEntity> findTop100ByOwner_IdAndTrashedFalseAndNameContainingIgnoreCaseOrderByNameAsc(
            Long ownerId,
            String keyword
    );

    List<FileEntity> findTop50ByOwner_IdAndTrashedFalseOrderByUpdatedAtDesc(
            Long ownerId
    );

    List<FileEntity> findByOwner_IdAndStarredTrueAndTrashedFalseOrderByNameAsc(
            Long ownerId
    );

    List<FileEntity> findByOwner_IdAndTrashedTrueAndTrashRootTrueOrderByTrashedAtDesc(
            Long ownerId
    );

    List<FileEntity> findByOwner_IdAndTrashedTrue(Long ownerId);

    List<FileEntity> findByOwner_Id(Long ownerId);

    @Query("select coalesce(sum(f.size), 0) from FileEntity f where f.owner.id = :ownerId")
    long sumSizeByOwnerId(@Param("ownerId") Long ownerId);

    @Query("select f.owner.id, coalesce(sum(f.size), 0), count(f) "
            + "from FileEntity f where f.owner is not null group by f.owner.id")
    List<Object[]> summarizeByOwner();

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from FileEntity f where f.id in :ids")
    void deleteAllByIdIn(@Param("ids") Collection<Long> ids);
}
```

파일: `backend/src/main/java/com/example/backend/repository/FolderRepository.java`

``` java
package com.example.backend.repository;

import com.example.backend.entity.FolderEntity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FolderRepository
        extends JpaRepository<FolderEntity, Long> {

    Optional<FolderEntity> findByIdAndOwner_Id(Long id, Long ownerId);

    List<FolderEntity> findByOwner_IdAndParentIsNullAndTrashedFalseOrderByNameAsc(
            Long ownerId
    );

    List<FolderEntity> findByOwner_IdAndParent_IdAndTrashedFalseOrderByNameAsc(
            Long ownerId,
            Long parentId
    );

    List<FolderEntity> findByOwner_IdAndTrashedFalseOrderByNameAsc(Long ownerId);

    List<FolderEntity> findTop100ByOwner_IdAndTrashedFalseAndNameContainingIgnoreCaseOrderByNameAsc(
            Long ownerId,
            String keyword
    );

    List<FolderEntity> findByOwner_IdAndStarredTrueAndTrashedFalseOrderByNameAsc(
            Long ownerId
    );

    List<FolderEntity> findByOwner_IdAndTrashedTrueAndTrashRootTrueOrderByTrashedAtDesc(
            Long ownerId
    );

    List<FolderEntity> findByOwner_IdAndTrashedTrue(Long ownerId);

    List<FolderEntity> findByOwner_Id(Long ownerId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update FolderEntity f set f.parent = null where f.id in :ids")
    void detachParents(@Param("ids") Collection<Long> ids);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from FolderEntity f where f.id in :ids")
    void deleteAllByIdIn(@Param("ids") Collection<Long> ids);
}
```

------------------------------------------------------------------------

# 14. Backend --- S3StorageService 변경

바뀐 점 두 가지:

**① 업로드: `RequestBody.fromInputStream` → `RequestBody.fromBytes`**

Day 7 6-1에서 본 오류를 기억하자.

``` text
Content input stream does not support mark/reset, and was already read once.
```

AWS SDK는 네트워크 오류가 나면 **같은 요청을 다시 보낸다(재시도).** 이때 body를
처음부터 다시 읽어야 하는데, 업로드 파일의 InputStream은 한 번 읽으면 되감을 수 없어
재시도 자체가 위 오류로 실패한다. 원래 원인(네트워크)이 가려지고, 일시적인 오류도
복구되지 않는다.

`fromBytes`는 메모리의 byte 배열이므로 몇 번이든 다시 보낼 수 있다. 업로드는
최대 50MB로 제한되어 있어 메모리에 올려도 괜찮다. (더 큰 파일은 확장 과제의
presigned URL 방식을 쓴다.)

**② `deleteAll(keys)` 추가**

영구 삭제·휴지통 비우기·회원 탈퇴 때 여러 객체를 `DeleteObjects`로 최대 1000개씩
한 번에 지운다. S3 오류는 로그만 남기고 무시한다. DB 삭제가 S3 일시 오류 때문에
실패하면 사용자는 탈퇴도 못 하게 되기 때문이다. (남은 객체는 로그로 확인해 따로 지울
수 있다.)

파일: `backend/src/main/java/com/example/backend/storage/S3StorageService.java`

``` java
package com.example.backend.storage;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsResponse;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class S3StorageService {

    private static final Logger log =
            LoggerFactory.getLogger(S3StorageService.class);

    // S3 DeleteObjects 한 번에 최대 1000개
    private static final int DELETE_BATCH_SIZE = 1000;

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

        // fromInputStream 은 SDK 재시도 시 mark/reset 오류가 날 수 있어
        // 재시도 가능한 byte[] 기반 RequestBody 를 사용한다. (최대 50MB)
        byte[] bytes = file.getBytes();

        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(
                        file.getContentType() != null
                                ? file.getContentType()
                                : "application/octet-stream"
                )
                .contentLength((long) bytes.length)
                .build();

        s3Client.putObject(
                request,
                RequestBody.fromBytes(bytes)
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

    /**
     * 여러 객체를 삭제한다. 존재하지 않는 객체나 S3 오류는 로그만 남기고 무시한다.
     * (DB 정리가 S3 오류 때문에 실패하지 않도록)
     */
    public void deleteAll(Collection<String> keys) {

        if (keys == null || keys.isEmpty()) {
            return;
        }

        List<String> keyList = new ArrayList<>(keys);

        for (int start = 0; start < keyList.size(); start += DELETE_BATCH_SIZE) {

            List<ObjectIdentifier> objects = keyList
                    .subList(start, Math.min(start + DELETE_BATCH_SIZE, keyList.size()))
                    .stream()
                    .map(key -> ObjectIdentifier.builder().key(key).build())
                    .toList();

            try {
                DeleteObjectsResponse response = s3Client.deleteObjects(
                        DeleteObjectsRequest.builder()
                                .bucket(bucket)
                                .delete(Delete.builder()
                                        .objects(objects)
                                        .quiet(true)
                                        .build())
                                .build()
                );

                if (response != null && response.hasErrors()) {
                    response.errors().forEach(error -> log.warn(
                            "S3 객체 삭제 실패 key={} code={} message={}",
                            error.key(), error.code(), error.message()));
                }
            } catch (RuntimeException e) {
                log.warn("S3 객체 일괄 삭제 실패 ({}개): {}", objects.size(), e.getMessage());
            }
        }
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

------------------------------------------------------------------------

# 15. Backend --- Service

만들거나 바꿀 파일:

``` text
service/
├── StorageQuota.java     (새) 사용량/한도
├── StoredFile.java       (새) 다운로드 응답용 (이름, 타입, 바이트)
├── FolderTree.java       (새) 한 사용자의 폴더 트리 → 하위 폴더 계산
├── UserDataCleaner.java  (새) DB 행 + S3 객체 영구 삭제
├── UserService.java      (새) 가입/로그인/내 정보/비밀번호/탈퇴
├── AdminService.java     (새) 사용자 목록/삭제
├── FolderService.java    (교체) owner, 휴지통, 경로, 트리, 이동, 별표
├── FileService.java      (교체) owner, 용량, 휴지통, 미리보기, 별표
└── DriveService.java     (새) 검색/최근/중요/휴지통/복원/영구 삭제/용량
```

## 15-0. `@Transactional`이란

``` java
@Service
@Transactional
public class FolderService { ... }
```

- 메서드 하나가 **하나의 DB 트랜잭션**으로 실행된다. 중간에 예외가 나면 그
  메서드에서 바꾼 DB 내용이 모두 취소(rollback)된다.
  → 폴더 삭제 중 일부 하위 항목만 휴지통에 들어가는 일이 없다.
- 트랜잭션 안에서 조회한 엔티티의 필드를 바꾸면(`file.setName(...)`) `save()`를
  부르지 않아도 끝날 때 자동으로 UPDATE된다(**dirty checking**).
- `@Transactional(readOnly = true)`는 조회 전용이라는 표시로, 불필요한 변경 감지를 줄인다.

## 15-1. StorageQuota, StoredFile, FolderTree

파일: `backend/src/main/java/com/example/backend/service/StorageQuota.java`

``` java
package com.example.backend.service;

import com.example.backend.repository.FileRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 사용자별 저장 용량 정책.
 * used = 휴지통을 포함한 사용자의 모든 파일 크기 합계.
 */
@Component
public class StorageQuota {

    private final FileRepository fileRepository;
    private final long limitBytes;

    public StorageQuota(
            FileRepository fileRepository,
            @Value("${app.storage.limit-bytes}") long limitBytes
    ) {
        this.fileRepository = fileRepository;
        this.limitBytes = limitBytes;
    }

    public long limit() {
        return limitBytes;
    }

    public long used(Long userId) {
        return fileRepository.sumSizeByOwnerId(userId);
    }
}
```

파일: `backend/src/main/java/com/example/backend/service/StoredFile.java`

``` java
package com.example.backend.service;

/** 다운로드/미리보기 응답용 파일 내용 + 메타데이터 */
public record StoredFile(
        String name,
        String contentType,
        byte[] data
) {
}
```

`FolderTree`는 한 사용자의 모든 폴더를 한 번에 읽어 `부모 id → 자식 목록` 지도를
만들고, BFS(너비 우선 탐색)로 하위 폴더 전체를 구한다. 폴더마다 DB를 다시
조회하지 않으므로 깊은 트리에서도 쿼리 수가 일정하다. `visited`는 데이터가 꼬여
순환이 생겨도 무한 반복하지 않게 한다.

파일: `backend/src/main/java/com/example/backend/service/FolderTree.java`

``` java
package com.example.backend.service;

import com.example.backend.entity.FolderEntity;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 한 사용자의 전체 폴더 목록으로 부모→자식 관계를 만들어
 * 하위 트리(자기 자신 포함)를 계산하는 헬퍼.
 */
final class FolderTree {

    private final Map<Long, List<FolderEntity>> children = new HashMap<>();

    FolderTree(Collection<FolderEntity> allFoldersOfOwner) {

        for (FolderEntity folder : allFoldersOfOwner) {

            if (folder.getParent() != null) {
                children
                        .computeIfAbsent(folder.getParent().getId(), k -> new ArrayList<>())
                        .add(folder);
            }
        }
    }

    /** root 를 포함한 모든 하위 폴더 (BFS 순서) */
    List<FolderEntity> subtree(FolderEntity root) {

        Set<Long> visited = new LinkedHashSet<>();
        List<FolderEntity> result = new ArrayList<>();
        Deque<FolderEntity> queue = new ArrayDeque<>();
        queue.add(root);

        while (!queue.isEmpty()) {

            FolderEntity current = queue.poll();

            if (!visited.add(current.getId())) {
                continue;
            }

            result.add(current);
            queue.addAll(children.getOrDefault(current.getId(), List.of()));
        }

        return result;
    }
}
```

## 15-2. UserDataCleaner

폴더는 `parent_id`로 자기 테이블을 참조한다. 부모를 먼저 지우면 FK 오류가 나므로
**부모 연결을 끊고(`detachParents`) 한꺼번에 지운다.** 파일 행을 먼저 지우고, S3
객체는 마지막에 지운다.

파일: `backend/src/main/java/com/example/backend/service/UserDataCleaner.java`

``` java
package com.example.backend.service;

import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.FolderRepository;
import com.example.backend.storage.S3StorageService;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;

/**
 * 파일/폴더 영구 삭제 (DB 행 + S3 객체).
 * 폴더는 self FK(parent_id) 때문에 부모 연결을 먼저 끊은 뒤 일괄 삭제한다.
 */
@Component
@Transactional
public class UserDataCleaner {

    private final FileRepository fileRepository;
    private final FolderRepository folderRepository;
    private final S3StorageService storageService;

    public UserDataCleaner(
            FileRepository fileRepository,
            FolderRepository folderRepository,
            S3StorageService storageService
    ) {
        this.fileRepository = fileRepository;
        this.folderRepository = folderRepository;
        this.storageService = storageService;
    }

    public void purge(
            Collection<FileEntity> files,
            Collection<FolderEntity> folders
    ) {

        List<String> s3Keys = files.stream()
                .map(FileEntity::getS3Key)
                .distinct()
                .toList();

        List<Long> fileIds = files.stream()
                .map(FileEntity::getId)
                .distinct()
                .toList();

        List<Long> folderIds = folders.stream()
                .map(FolderEntity::getId)
                .distinct()
                .toList();

        if (!fileIds.isEmpty()) {
            fileRepository.deleteAllByIdIn(fileIds);
        }

        if (!folderIds.isEmpty()) {
            folderRepository.detachParents(folderIds);
            folderRepository.deleteAllByIdIn(folderIds);
        }

        // S3 오류는 S3StorageService 에서 로그만 남기고 무시한다.
        storageService.deleteAll(s3Keys);
    }

    public void purgeAllOf(Long userId) {

        purge(
                fileRepository.findByOwner_Id(userId),
                folderRepository.findByOwner_Id(userId)
        );
    }
}
```

## 15-3. UserService

- 가입: 이메일 정규화(소문자) → 중복 확인(409) → BCrypt 해시 → 저장 → 토큰 발급
- 로그인: 이메일이 없어도, 비밀번호가 틀려도 **같은 메시지**(`이메일 또는 비밀번호가
  올바르지 않습니다.`)로 401. 어느 쪽이 틀렸는지 알려주면 가입된 이메일을 알아낼 수 있다.
- `getUser()`: 토큰은 유효하지만 사용자가 DB에 없으면(탈퇴/관리자 삭제) 401
- 탈퇴: 비밀번호 확인 후 `UserDataCleaner.purgeAllOf()` → 사용자 행 삭제

파일: `backend/src/main/java/com/example/backend/service/UserService.java`

``` java
package com.example.backend.service;

import com.example.backend.dto.AuthResponse;
import com.example.backend.dto.ChangePasswordRequest;
import com.example.backend.dto.DeleteAccountRequest;
import com.example.backend.dto.LoginRequest;
import com.example.backend.dto.SignupRequest;
import com.example.backend.dto.UpdateProfileRequest;
import com.example.backend.dto.UserResponse;
import com.example.backend.entity.Role;
import com.example.backend.entity.UserEntity;
import com.example.backend.exception.ConflictException;
import com.example.backend.exception.UnauthorizedException;
import com.example.backend.repository.UserRepository;
import com.example.backend.security.JwtTokenService;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional
public class UserService {

    private static final String LOGIN_REQUIRED = "로그인이 필요합니다.";
    private static final String BAD_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않습니다.";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenService tokenService;
    private final StorageQuota storageQuota;
    private final UserDataCleaner dataCleaner;
    private final Set<String> adminEmails;

    public UserService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtTokenService tokenService,
            StorageQuota storageQuota,
            UserDataCleaner dataCleaner,
            @Value("${app.admin-emails:}") String adminEmails
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.storageQuota = storageQuota;
        this.dataCleaner = dataCleaner;
        this.adminEmails = Arrays.stream(adminEmails.split(","))
                .map(UserService::normalizeEmail)
                .filter(email -> !email.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public AuthResponse signup(SignupRequest request) {

        String email = normalizeEmail(request.email());
        validatePasswordBytes(request.password());

        if (userRepository.existsByEmail(email)) {
            throw new ConflictException("이미 가입된 이메일입니다.");
        }

        Role role = adminEmails.contains(email) ? Role.ADMIN : Role.USER;

        UserEntity user = new UserEntity(
                email,
                passwordEncoder.encode(request.password()),
                request.name().trim(),
                role
        );

        userRepository.saveAndFlush(user);

        return new AuthResponse(
                tokenService.issue(user),
                toResponse(user)
        );
    }

    public AuthResponse login(LoginRequest request) {

        UserEntity user = userRepository
                .findByEmail(normalizeEmail(request.email()))
                .orElseThrow(() -> new UnauthorizedException(BAD_CREDENTIALS));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new UnauthorizedException(BAD_CREDENTIALS);
        }

        // 가입 이후 ADMIN_EMAILS 에 추가된 계정은 로그인 시 승격 (강등은 하지 않음)
        if (user.getRole() != Role.ADMIN && adminEmails.contains(user.getEmail())) {
            user.setRole(Role.ADMIN);
        }

        return new AuthResponse(
                tokenService.issue(user),
                toResponse(user)
        );
    }

    @Transactional(readOnly = true)
    public UserResponse me(Long userId) {
        return toResponse(getUser(userId));
    }

    public UserResponse updateProfile(Long userId, UpdateProfileRequest request) {

        UserEntity user = getUser(userId);
        user.setName(request.name().trim());

        return toResponse(user);
    }

    public void changePassword(Long userId, ChangePasswordRequest request) {

        UserEntity user = getUser(userId);

        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new IllegalArgumentException("현재 비밀번호가 올바르지 않습니다.");
        }

        validatePasswordBytes(request.newPassword());

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
    }

    public void deleteAccount(Long userId, DeleteAccountRequest request) {

        UserEntity user = getUser(userId);

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new IllegalArgumentException("비밀번호가 올바르지 않습니다.");
        }

        deleteUserAndData(userId);
    }

    /** 사용자의 S3 객체, 파일, 폴더, 사용자 행을 모두 삭제한다. */
    public void deleteUserAndData(Long userId) {

        dataCleaner.purgeAllOf(userId);
        userRepository.deleteById(userId);
    }

    /** 토큰의 사용자가 DB 에 없으면 (탈퇴/삭제됨) 401 */
    @Transactional(readOnly = true)
    public UserEntity getUser(Long userId) {

        return userRepository
                .findById(userId)
                .orElseThrow(() -> new UnauthorizedException(LOGIN_REQUIRED));
    }

    private UserResponse toResponse(UserEntity user) {

        return UserResponse.of(
                user,
                storageQuota.used(user.getId()),
                storageQuota.limit()
        );
    }

    private static void validatePasswordBytes(String password) {

        // BCrypt 는 72바이트까지만 지원
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalArgumentException("비밀번호가 너무 깁니다.");
        }
    }

    static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
```

## 15-4. AdminService

사용자별 사용량/파일 수는 `summarizeByOwner()` 한 번의 `group by` 쿼리로 구한다.
사용자마다 쿼리하면 사용자 수만큼 쿼리가 나간다(N+1 문제).

파일: `backend/src/main/java/com/example/backend/service/AdminService.java`

``` java
package com.example.backend.service;

import com.example.backend.dto.AdminUserResponse;
import com.example.backend.exception.ResourceNotFoundException;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.UserRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Transactional
public class AdminService {

    private final UserRepository userRepository;
    private final FileRepository fileRepository;
    private final UserService userService;

    public AdminService(
            UserRepository userRepository,
            FileRepository fileRepository,
            UserService userService
    ) {
        this.userRepository = userRepository;
        this.fileRepository = fileRepository;
        this.userService = userService;
    }

    @Transactional(readOnly = true)
    public List<AdminUserResponse> getUsers() {

        Map<Long, long[]> summary = new HashMap<>();

        for (Object[] row : fileRepository.summarizeByOwner()) {
            summary.put(
                    ((Number) row[0]).longValue(),
                    new long[]{((Number) row[1]).longValue(), ((Number) row[2]).longValue()}
            );
        }

        return userRepository.findAllByOrderByCreatedAtAsc()
                .stream()
                .map(user -> {
                    long[] stats = summary.getOrDefault(user.getId(), new long[]{0, 0});
                    return new AdminUserResponse(
                            user.getId(),
                            user.getEmail(),
                            user.getName(),
                            user.getRole(),
                            stats[0],
                            stats[1],
                            user.getCreatedAt()
                    );
                })
                .toList();
    }

    public void deleteUser(Long adminId, Long targetUserId) {

        if (adminId.equals(targetUserId)) {
            throw new IllegalArgumentException("자기 자신은 삭제할 수 없습니다.");
        }

        if (!userRepository.existsById(targetUserId)) {
            throw new ResourceNotFoundException("사용자를 찾을 수 없습니다.");
        }

        userService.deleteUserAndData(targetUserId);
    }
}
```

## 15-5. FolderService (전체 교체)

핵심 메서드:

| 메서드 | 설명 |
|---|---|
| `findOwnedFolder` | 내 폴더(휴지통 포함). 없으면 404 |
| `findActiveFolder` | 내 폴더 + 휴지통 아님. 업로드/이동 대상 확인에 사용 |
| `getPath` | 부모를 따라 올라가며 루트 → 자신 경로 |
| `moveFolder` | 새 부모에서 루트까지 올라가다 자기 자신을 만나면 400 (순환 방지) |
| `deleteFolder` | 하위 트리 전체를 같은 `trashedAt`으로 휴지통에. 이미 따로 휴지통에 있던 것은 그대로 |

순환 이동 예:

``` text
A
└── B
    └── C

A 를 C 안으로 이동?  → C → B → A(자기 자신 발견) → 400
```

파일: `backend/src/main/java/com/example/backend/service/FolderService.java`

``` java
package com.example.backend.service;

import com.example.backend.dto.CreateFolderRequest;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.RenameRequest;
import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.entity.UserEntity;
import com.example.backend.exception.ResourceNotFoundException;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.FolderRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@Service
@Transactional
public class FolderService {

    static final int MAX_NAME_LENGTH = 255;

    private final FolderRepository folderRepository;
    private final FileRepository fileRepository;
    private final UserService userService;

    public FolderService(
            FolderRepository folderRepository,
            FileRepository fileRepository,
            UserService userService
    ) {
        this.folderRepository = folderRepository;
        this.fileRepository = fileRepository;
        this.userService = userService;
    }

    public FolderResponse createFolder(
            Long userId,
            CreateFolderRequest request
    ) {

        String name = validateName(request.name());

        UserEntity owner = userService.getUser(userId);

        FolderEntity parent = null;

        if (request.parentFolderId() != null) {
            parent = findActiveFolder(
                    userId,
                    request.parentFolderId(),
                    "부모 폴더를 찾을 수 없습니다."
            );
        }

        FolderEntity folder =
                new FolderEntity(
                        name,
                        parent,
                        owner
                );

        folderRepository.save(folder);

        return FolderResponse.from(folder);
    }

    @Transactional(readOnly = true)
    public List<FolderResponse> getFolders(
            Long userId,
            Long parentFolderId
    ) {

        List<FolderEntity> folders;

        if (parentFolderId == null) {
            folders = folderRepository
                    .findByOwner_IdAndParentIsNullAndTrashedFalseOrderByNameAsc(userId);
        } else {
            findActiveFolder(userId, parentFolderId, "폴더를 찾을 수 없습니다.");
            folders = folderRepository
                    .findByOwner_IdAndParent_IdAndTrashedFalseOrderByNameAsc(
                            userId,
                            parentFolderId
                    );
        }

        return folders.stream()
                .map(FolderResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public FolderResponse getFolder(Long userId, Long folderId) {

        return FolderResponse.from(
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.")
        );
    }

    /** 루트 → … → 자기 자신 순서의 경로 (브레드크럼용) */
    @Transactional(readOnly = true)
    public List<FolderResponse> getPath(Long userId, Long folderId) {

        FolderEntity folder =
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");

        List<FolderResponse> path = new ArrayList<>();
        List<Long> visited = new ArrayList<>();

        FolderEntity current = folder;

        while (current != null && !visited.contains(current.getId())) {
            visited.add(current.getId());
            path.addFirst(FolderResponse.from(current));
            current = current.getParent();
        }

        return path;
    }

    @Transactional(readOnly = true)
    public List<FolderResponse> getTree(Long userId) {

        return folderRepository
                .findByOwner_IdAndTrashedFalseOrderByNameAsc(userId)
                .stream()
                .map(FolderResponse::from)
                .toList();
    }

    public FolderResponse renameFolder(
            Long userId,
            Long folderId,
            RenameRequest request
    ) {

        String name = validateName(request == null ? null : request.name());

        FolderEntity folder =
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");

        folder.setName(name);

        return FolderResponse.from(folder);
    }

    public FolderResponse moveFolder(
            Long userId,
            Long folderId,
            Long parentFolderId
    ) {

        FolderEntity folder =
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");

        FolderEntity newParent = null;

        if (parentFolderId != null) {

            newParent = findActiveFolder(
                    userId,
                    parentFolderId,
                    "이동할 폴더를 찾을 수 없습니다."
            );

            // 대상 폴더에서 루트까지 거슬러 올라가며 자기 자신이 나오면 순환
            FolderEntity cursor = newParent;
            List<Long> visited = new ArrayList<>();

            while (cursor != null && !visited.contains(cursor.getId())) {

                if (cursor.getId().equals(folder.getId())) {
                    throw new IllegalArgumentException(
                            "폴더를 자기 자신이나 하위 폴더로 이동할 수 없습니다."
                    );
                }

                visited.add(cursor.getId());
                cursor = cursor.getParent();
            }
        }

        folder.setParent(newParent);

        return FolderResponse.from(folder);
    }

    public FolderResponse setStarred(
            Long userId,
            Long folderId,
            boolean starred
    ) {

        FolderEntity folder =
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");

        folder.setStarred(starred);

        return FolderResponse.from(folder);
    }

    /**
     * 폴더와 모든 하위 항목을 휴지통으로 이동한다.
     * 직접 삭제한 폴더만 trashRoot=true, 하위 항목은 같은 trashedAt 으로 표시된다.
     * 이미 따로 휴지통에 있던 하위 항목은 건드리지 않는다.
     */
    public void deleteFolder(Long userId, Long folderId) {

        FolderEntity folder =
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");

        LocalDateTime now = trashTimestamp();

        List<FolderEntity> subtree = subtree(userId, folder);

        for (FolderEntity item : subtree) {

            if (item == folder) {
                item.moveToTrash(now, true);
            } else if (!item.isTrashed()) {
                item.moveToTrash(now, false);
            }
        }

        for (FileEntity file : filesIn(userId, subtree)) {

            if (!file.isTrashed()) {
                file.moveToTrash(now, false);
            }
        }
    }

    // ---- 다른 서비스에서 사용하는 헬퍼 ----

    FolderEntity findOwnedFolder(Long userId, Long folderId, String message) {

        return folderRepository
                .findByIdAndOwner_Id(folderId, userId)
                .orElseThrow(() -> new ResourceNotFoundException(message));
    }

    FolderEntity findActiveFolder(Long userId, Long folderId, String message) {

        FolderEntity folder = findOwnedFolder(userId, folderId, message);

        if (folder.isTrashed()) {
            throw new ResourceNotFoundException(message);
        }

        return folder;
    }

    List<FolderEntity> subtree(Long userId, FolderEntity root) {

        return new FolderTree(folderRepository.findByOwner_Id(userId))
                .subtree(root);
    }

    List<FileEntity> filesIn(Long userId, List<FolderEntity> folders) {

        if (folders.isEmpty()) {
            return List.of();
        }

        return fileRepository.findByOwner_IdAndFolder_IdIn(
                userId,
                folders.stream().map(FolderEntity::getId).toList()
        );
    }

    static LocalDateTime trashTimestamp() {
        // PostgreSQL timestamp 정밀도(마이크로초)에 맞춰 같은 배치 비교가 정확하도록 자른다.
        return LocalDateTime.now().truncatedTo(ChronoUnit.MICROS);
    }

    static String validateName(String raw) {

        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException(
                    "폴더 이름을 입력해야 합니다."
            );
        }

        String name = raw.trim();

        if (name.length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException(
                    "이름은 255자 이하여야 합니다."
            );
        }

        return name;
    }
}
```

## 15-6. FileService (전체 교체)

- 업로드 순서: 파일 비었는지 → 사용자 확인 → 대상 폴더 확인 → **용량 확인** →
  S3 업로드 → DB 저장
- `sanitizeFileName`: 일부 브라우저는 `C:\Users\...\a.txt` 같은 전체 경로를 보내므로
  마지막 부분만 쓴다.
- `load()`: 다운로드/미리보기. 휴지통에 있어도 본인 파일이면 열 수 있다.
- `delete()`: 휴지통 이동만 한다. S3는 그대로다.

파일: `backend/src/main/java/com/example/backend/service/FileService.java`

``` java
package com.example.backend.service;

import com.example.backend.dto.FileResponse;
import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.entity.UserEntity;
import com.example.backend.exception.QuotaExceededException;
import com.example.backend.exception.ResourceNotFoundException;
import com.example.backend.repository.FileRepository;
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

    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";
    private static final String NOT_FOUND = "파일을 찾을 수 없습니다.";

    private final FileRepository fileRepository;
    private final FolderService folderService;
    private final UserService userService;
    private final StorageQuota storageQuota;
    private final S3StorageService storageService;

    public FileService(
            FileRepository fileRepository,
            FolderService folderService,
            UserService userService,
            StorageQuota storageQuota,
            S3StorageService storageService
    ) {
        this.fileRepository = fileRepository;
        this.folderService = folderService;
        this.userService = userService;
        this.storageQuota = storageQuota;
        this.storageService = storageService;
    }

    public FileResponse upload(
            Long userId,
            MultipartFile multipartFile,
            Long folderId
    ) throws IOException {

        if (multipartFile == null ||
                multipartFile.isEmpty()) {

            throw new IllegalArgumentException(
                    "파일이 비어 있습니다."
            );
        }

        UserEntity owner = userService.getUser(userId);

        FolderEntity folder = null;

        if (folderId != null) {
            folder = folderService.findActiveFolder(
                    userId,
                    folderId,
                    "업로드 대상 폴더를 찾을 수 없습니다."
            );
        }

        long used = storageQuota.used(userId);

        if (used + multipartFile.getSize() > storageQuota.limit()) {
            throw new QuotaExceededException(
                    "저장 공간이 부족합니다."
            );
        }

        String originalName =
                sanitizeFileName(multipartFile.getOriginalFilename());

        String contentType =
                multipartFile.getContentType() == null
                        || multipartFile.getContentType().isBlank()
                        ? DEFAULT_CONTENT_TYPE
                        : multipartFile.getContentType();

        String s3Key =
                "users/" + userId + "/files/"
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
                        contentType,
                        folder,
                        owner
                );

        fileRepository.save(file);

        return FileResponse.from(file);
    }

    @Transactional(readOnly = true)
    public List<FileResponse> getFiles(
            Long userId,
            Long folderId
    ) {

        List<FileEntity> files;

        if (folderId == null) {
            files = fileRepository
                    .findByOwner_IdAndFolderIsNullAndTrashedFalseOrderByNameAsc(userId);
        } else {
            folderService.findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");
            files = fileRepository
                    .findByOwner_IdAndFolder_IdAndTrashedFalseOrderByNameAsc(
                            userId,
                            folderId
                    );
        }

        return files.stream()
                .map(FileResponse::from)
                .toList();
    }

    /** 다운로드/미리보기용. 휴지통에 있는 파일도 본인 소유면 열람 가능하다. */
    @Transactional(readOnly = true)
    public StoredFile load(Long userId, Long fileId) {

        FileEntity file = findOwnedFile(userId, fileId);

        byte[] data = storageService.download(file.getS3Key());

        String contentType =
                file.getContentType() == null
                        ? DEFAULT_CONTENT_TYPE
                        : file.getContentType();

        return new StoredFile(
                file.getName(),
                contentType,
                data
        );
    }

    public FileResponse rename(
            Long userId,
            Long fileId,
            String name
    ) {

        if (name == null || name.isBlank()) {

            throw new IllegalArgumentException(
                    "파일 이름을 입력해야 합니다."
            );
        }

        String trimmed = name.trim();

        if (trimmed.length() > FolderService.MAX_NAME_LENGTH) {
            throw new IllegalArgumentException(
                    "이름은 255자 이하여야 합니다."
            );
        }

        FileEntity file = findActiveFile(userId, fileId);

        file.setName(trimmed);

        return FileResponse.from(file);
    }

    public FileResponse move(
            Long userId,
            Long fileId,
            Long folderId
    ) {

        FileEntity file = findActiveFile(userId, fileId);

        FolderEntity folder = null;

        if (folderId != null) {
            folder = folderService.findActiveFolder(
                    userId,
                    folderId,
                    "이동할 폴더를 찾을 수 없습니다."
            );
        }

        file.setFolder(folder);

        return FileResponse.from(file);
    }

    public FileResponse setStarred(
            Long userId,
            Long fileId,
            boolean starred
    ) {

        FileEntity file = findActiveFile(userId, fileId);

        file.setStarred(starred);

        return FileResponse.from(file);
    }

    /** 휴지통으로 이동 (S3 객체는 유지) */
    public void delete(Long userId, Long fileId) {

        FileEntity file = findActiveFile(userId, fileId);

        file.moveToTrash(FolderService.trashTimestamp(), true);
    }

    FileEntity findOwnedFile(Long userId, Long fileId) {

        return fileRepository
                .findByIdAndOwner_Id(fileId, userId)
                .orElseThrow(() -> new ResourceNotFoundException(NOT_FOUND));
    }

    FileEntity findActiveFile(Long userId, Long fileId) {

        FileEntity file = findOwnedFile(userId, fileId);

        if (file.isTrashed()) {
            throw new ResourceNotFoundException(NOT_FOUND);
        }

        return file;
    }

    private static String sanitizeFileName(String raw) {

        if (raw == null || raw.isBlank()) {
            return "unknown";
        }

        // 일부 브라우저는 전체 경로를 보내므로 마지막 경로 요소만 사용
        String name = raw.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).trim();

        if (name.isEmpty()) {
            return "unknown";
        }

        if (name.length() > FolderService.MAX_NAME_LENGTH) {
            name = name.substring(0, FolderService.MAX_NAME_LENGTH);
        }

        return name;
    }
}
```

## 15-7. DriveService

`restoreFolder`는 3-3의 복원 규칙을 그대로 구현한다. 하위 항목 중
`trashRoot=false`이고 `trashedAt`이 폴더와 같은 것만 복원한다.

`emptyTrash`는 휴지통의 모든 폴더(와 하위), 휴지통의 모든 파일, 휴지통 폴더 안의
파일을 모아 한 번에 `purge`한다.

파일: `backend/src/main/java/com/example/backend/service/DriveService.java`

``` java
package com.example.backend.service;

import com.example.backend.dto.DriveItems;
import com.example.backend.dto.FileResponse;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.StorageResponse;
import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.exception.ResourceNotFoundException;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.FolderRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@Transactional
public class DriveService {

    private final FileRepository fileRepository;
    private final FolderRepository folderRepository;
    private final FileService fileService;
    private final FolderService folderService;
    private final StorageQuota storageQuota;
    private final UserDataCleaner dataCleaner;

    public DriveService(
            FileRepository fileRepository,
            FolderRepository folderRepository,
            FileService fileService,
            FolderService folderService,
            StorageQuota storageQuota,
            UserDataCleaner dataCleaner
    ) {
        this.fileRepository = fileRepository;
        this.folderRepository = folderRepository;
        this.fileService = fileService;
        this.folderService = folderService;
        this.storageQuota = storageQuota;
        this.dataCleaner = dataCleaner;
    }

    @Transactional(readOnly = true)
    public DriveItems search(Long userId, String q) {

        if (q == null || q.isBlank()) {
            return DriveItems.empty();
        }

        String keyword = q.trim();

        return new DriveItems(
                folderRepository
                        .findTop100ByOwner_IdAndTrashedFalseAndNameContainingIgnoreCaseOrderByNameAsc(userId, keyword)
                        .stream().map(FolderResponse::from).toList(),
                fileRepository
                        .findTop100ByOwner_IdAndTrashedFalseAndNameContainingIgnoreCaseOrderByNameAsc(userId, keyword)
                        .stream().map(FileResponse::from).toList()
        );
    }

    @Transactional(readOnly = true)
    public List<FileResponse> recent(Long userId) {

        return fileRepository
                .findTop50ByOwner_IdAndTrashedFalseOrderByUpdatedAtDesc(userId)
                .stream().map(FileResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public DriveItems starred(Long userId) {

        return new DriveItems(
                folderRepository
                        .findByOwner_IdAndStarredTrueAndTrashedFalseOrderByNameAsc(userId)
                        .stream().map(FolderResponse::from).toList(),
                fileRepository
                        .findByOwner_IdAndStarredTrueAndTrashedFalseOrderByNameAsc(userId)
                        .stream().map(FileResponse::from).toList()
        );
    }

    /** 휴지통: 사용자가 직접 삭제한 항목(trashRoot)만, 최근 삭제 순 */
    @Transactional(readOnly = true)
    public DriveItems trash(Long userId) {

        return new DriveItems(
                folderRepository
                        .findByOwner_IdAndTrashedTrueAndTrashRootTrueOrderByTrashedAtDesc(userId)
                        .stream().map(FolderResponse::from).toList(),
                fileRepository
                        .findByOwner_IdAndTrashedTrueAndTrashRootTrueOrderByTrashedAtDesc(userId)
                        .stream().map(FileResponse::from).toList()
        );
    }

    public FileResponse restoreFile(Long userId, Long fileId) {

        FileEntity file = findTrashedFile(userId, fileId);

        file.restore();

        // 원래 폴더가 휴지통에 있으면 루트로 복원
        if (file.getFolder() != null && file.getFolder().isTrashed()) {
            file.setFolder(null);
        }

        return FileResponse.from(file);
    }

    /**
     * 폴더와, 그 폴더와 함께(같은 trashedAt 배치로) 휴지통에 들어간 하위 항목을 복원한다.
     * 따로 먼저 삭제된 하위 항목은 휴지통에 남는다.
     */
    public FolderResponse restoreFolder(Long userId, Long folderId) {

        FolderEntity folder = findTrashedFolder(userId, folderId);

        LocalDateTime batch = folder.getTrashedAt();

        List<FolderEntity> subtree = folderService.subtree(userId, folder);

        for (FolderEntity item : subtree) {

            if (item != folder
                    && item.isTrashed()
                    && !item.isTrashRoot()
                    && Objects.equals(batch, item.getTrashedAt())) {
                item.restore();
            }
        }

        for (FileEntity file : folderService.filesIn(userId, subtree)) {

            if (file.isTrashed()
                    && !file.isTrashRoot()
                    && Objects.equals(batch, file.getTrashedAt())) {
                file.restore();
            }
        }

        folder.restore();

        if (folder.getParent() != null && folder.getParent().isTrashed()) {
            folder.setParent(null);
        }

        return FolderResponse.from(folder);
    }

    public void deleteFilePermanently(Long userId, Long fileId) {

        FileEntity file = findTrashedFile(userId, fileId);

        dataCleaner.purge(List.of(file), List.of());
    }

    public void deleteFolderPermanently(Long userId, Long folderId) {

        FolderEntity folder = findTrashedFolder(userId, folderId);

        List<FolderEntity> subtree = folderService.subtree(userId, folder);

        dataCleaner.purge(
                folderService.filesIn(userId, subtree),
                subtree
        );
    }

    /** 휴지통 비우기: 사용자의 휴지통 항목 전체와 그 하위 항목, S3 객체까지 삭제 */
    public void emptyTrash(Long userId) {

        List<FolderEntity> allFolders = folderRepository.findByOwner_Id(userId);
        FolderTree tree = new FolderTree(allFolders);

        Map<Long, FolderEntity> folders = new LinkedHashMap<>();

        allFolders.stream()
                .filter(FolderEntity::isTrashed)
                .sorted(Comparator.comparing(FolderEntity::getId))
                .forEach(root -> tree.subtree(root)
                        .forEach(f -> folders.putIfAbsent(f.getId(), f)));

        Map<Long, FileEntity> files = new LinkedHashMap<>();

        fileRepository.findByOwner_IdAndTrashedTrue(userId)
                .forEach(f -> files.put(f.getId(), f));

        folderService.filesIn(userId, List.copyOf(folders.values()))
                .forEach(f -> files.putIfAbsent(f.getId(), f));

        dataCleaner.purge(files.values(), folders.values());
    }

    @Transactional(readOnly = true)
    public StorageResponse storage(Long userId) {

        return new StorageResponse(
                storageQuota.used(userId),
                storageQuota.limit()
        );
    }

    private FileEntity findTrashedFile(Long userId, Long fileId) {

        FileEntity file = fileService.findOwnedFile(userId, fileId);

        if (!file.isTrashed()) {
            throw new ResourceNotFoundException("휴지통에서 파일을 찾을 수 없습니다.");
        }

        return file;
    }

    private FolderEntity findTrashedFolder(Long userId, Long folderId) {

        FolderEntity folder = folderService.findOwnedFolder(
                userId,
                folderId,
                "휴지통에서 폴더를 찾을 수 없습니다."
        );

        if (!folder.isTrashed()) {
            throw new ResourceNotFoundException("휴지통에서 폴더를 찾을 수 없습니다.");
        }

        return folder;
    }
}
```

------------------------------------------------------------------------

# 16. Backend --- Controller

모든 Controller는 같은 패턴이다.

``` java
@GetMapping
public ResponseEntity<List<FileResponse>> getFiles(
        @AuthenticationPrincipal Jwt jwt,          // ← Security 가 검증한 토큰
        @RequestParam(required = false) Long folderId
) {
    return ResponseEntity.ok(
            fileService.getFiles(CurrentUser.id(jwt), folderId)   // ← 사용자 id 는 토큰에서만
    );
}
```

## 16-1. 새 Controller

파일: `backend/src/main/java/com/example/backend/controller/AuthController.java`

``` java
package com.example.backend.controller;

import com.example.backend.dto.AuthResponse;
import com.example.backend.dto.LoginRequest;
import com.example.backend.dto.SignupRequest;
import com.example.backend.dto.UserResponse;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.UserService;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signup(
            @Valid @RequestBody SignupRequest request
    ) {

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(userService.signup(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest request
    ) {

        return ResponseEntity.ok(
                userService.login(request)
        );
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(
            @AuthenticationPrincipal Jwt jwt
    ) {

        return ResponseEntity.ok(
                userService.me(CurrentUser.id(jwt))
        );
    }
}
```

`DELETE /api/users/me`는 body(`{password}`)를 받는다. HTTP DELETE에 body를 쓰는
것이 흔하지는 않지만, 탈퇴처럼 되돌릴 수 없는 작업은 비밀번호를 한 번 더 확인하는
것이 안전하다. (URL query에 비밀번호를 넣으면 로그에 남으므로 body를 쓴다.)

파일: `backend/src/main/java/com/example/backend/controller/UserController.java`

``` java
package com.example.backend.controller;

import com.example.backend.dto.ChangePasswordRequest;
import com.example.backend.dto.DeleteAccountRequest;
import com.example.backend.dto.UpdateProfileRequest;
import com.example.backend.dto.UserResponse;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.UserService;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users/me")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PatchMapping
    public ResponseEntity<UserResponse> updateProfile(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdateProfileRequest request
    ) {

        return ResponseEntity.ok(
                userService.updateProfile(CurrentUser.id(jwt), request)
        );
    }

    @PatchMapping("/password")
    public ResponseEntity<Void> changePassword(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ChangePasswordRequest request
    ) {

        userService.changePassword(CurrentUser.id(jwt), request);

        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> deleteAccount(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody DeleteAccountRequest request
    ) {

        userService.deleteAccount(CurrentUser.id(jwt), request);

        return ResponseEntity.noContent().build();
    }
}
```

파일: `backend/src/main/java/com/example/backend/controller/AdminController.java`

``` java
package com.example.backend.controller;

import com.example.backend.dto.AdminUserResponse;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.AdminService;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** /api/admin/** 는 SecurityConfig 에서 ROLE_ADMIN 만 허용 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/users")
    public ResponseEntity<List<AdminUserResponse>> getUsers() {

        return ResponseEntity.ok(
                adminService.getUsers()
        );
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Void> deleteUser(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long userId
    ) {

        adminService.deleteUser(CurrentUser.id(jwt), userId);

        return ResponseEntity.noContent().build();
    }
}
```

파일: `backend/src/main/java/com/example/backend/controller/DriveController.java`

``` java
package com.example.backend.controller;

import com.example.backend.dto.DriveItems;
import com.example.backend.dto.FileResponse;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.StorageResponse;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.DriveService;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/drive")
public class DriveController {

    private final DriveService driveService;

    public DriveController(DriveService driveService) {
        this.driveService = driveService;
    }

    @GetMapping("/search")
    public ResponseEntity<DriveItems> search(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String q
    ) {

        return ResponseEntity.ok(
                driveService.search(CurrentUser.id(jwt), q)
        );
    }

    @GetMapping("/recent")
    public ResponseEntity<List<FileResponse>> recent(
            @AuthenticationPrincipal Jwt jwt
    ) {

        return ResponseEntity.ok(
                driveService.recent(CurrentUser.id(jwt))
        );
    }

    @GetMapping("/starred")
    public ResponseEntity<DriveItems> starred(
            @AuthenticationPrincipal Jwt jwt
    ) {

        return ResponseEntity.ok(
                driveService.starred(CurrentUser.id(jwt))
        );
    }

    @GetMapping("/storage")
    public ResponseEntity<StorageResponse> storage(
            @AuthenticationPrincipal Jwt jwt
    ) {

        return ResponseEntity.ok(
                driveService.storage(CurrentUser.id(jwt))
        );
    }

    @GetMapping("/trash")
    public ResponseEntity<DriveItems> trash(
            @AuthenticationPrincipal Jwt jwt
    ) {

        return ResponseEntity.ok(
                driveService.trash(CurrentUser.id(jwt))
        );
    }

    @PostMapping("/trash/files/{fileId}/restore")
    public ResponseEntity<FileResponse> restoreFile(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId
    ) {

        return ResponseEntity.ok(
                driveService.restoreFile(CurrentUser.id(jwt), fileId)
        );
    }

    @PostMapping("/trash/folders/{folderId}/restore")
    public ResponseEntity<FolderResponse> restoreFolder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId
    ) {

        return ResponseEntity.ok(
                driveService.restoreFolder(CurrentUser.id(jwt), folderId)
        );
    }

    @DeleteMapping("/trash/files/{fileId}")
    public ResponseEntity<Void> deleteFilePermanently(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId
    ) {

        driveService.deleteFilePermanently(CurrentUser.id(jwt), fileId);

        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/trash/folders/{folderId}")
    public ResponseEntity<Void> deleteFolderPermanently(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId
    ) {

        driveService.deleteFolderPermanently(CurrentUser.id(jwt), folderId);

        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/trash")
    public ResponseEntity<Void> emptyTrash(
            @AuthenticationPrincipal Jwt jwt
    ) {

        driveService.emptyTrash(CurrentUser.id(jwt));

        return ResponseEntity.noContent().build();
    }
}
```

## 16-2. FileController (전체 교체)

다운로드와 미리보기는 같은 데이터를 보내고 `Content-Disposition`만 다르다.

``` text
download → Content-Disposition: attachment; filename="..."; filename*=UTF-8''%EB%B3%B4%EA%B3%A0%EC%84%9C.pdf
preview  → Content-Disposition: inline; ...
```

`filename*=UTF-8''...`(RFC 5987) 덕분에 **한글 파일명이 깨지지 않는다.**
`X-Content-Type-Options: nosniff`는 브라우저가 내용을 보고 타입을 멋대로 추측(예:
텍스트를 HTML로 실행)하지 못하게 한다.

파일: `backend/src/main/java/com/example/backend/controller/FileController.java`

``` java
package com.example.backend.controller;

import com.example.backend.dto.FileResponse;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.FileService;
import com.example.backend.service.StoredFile;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
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
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false)
            Long folderId
    ) throws IOException {

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(fileService.upload(
                        CurrentUser.id(jwt),
                        file,
                        folderId
                ));
    }

    @GetMapping
    public ResponseEntity<List<FileResponse>> getFiles(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false)
            Long folderId
    ) {

        return ResponseEntity.ok(
                fileService.getFiles(CurrentUser.id(jwt), folderId)
        );
    }

    @GetMapping("/{fileId}/download")
    public ResponseEntity<ByteArrayResource> download(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId
    ) {

        StoredFile file =
                fileService.load(CurrentUser.id(jwt), fileId);

        return fileResponse(
                file,
                ContentDisposition.attachment()
        );
    }

    @GetMapping("/{fileId}/preview")
    public ResponseEntity<ByteArrayResource> preview(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId
    ) {

        StoredFile file =
                fileService.load(CurrentUser.id(jwt), fileId);

        return fileResponse(
                file,
                ContentDisposition.inline()
        );
    }

    @PatchMapping("/{fileId}/rename")
    public ResponseEntity<FileResponse> rename(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId,
            @RequestParam String name
    ) {

        return ResponseEntity.ok(
                fileService.rename(
                        CurrentUser.id(jwt),
                        fileId,
                        name
                )
        );
    }

    @PatchMapping("/{fileId}/move")
    public ResponseEntity<FileResponse> move(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId,
            @RequestParam(required = false)
            Long folderId
    ) {

        return ResponseEntity.ok(
                fileService.move(
                        CurrentUser.id(jwt),
                        fileId,
                        folderId
                )
        );
    }

    @PatchMapping("/{fileId}/star")
    public ResponseEntity<FileResponse> star(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId,
            @RequestParam boolean starred
    ) {

        return ResponseEntity.ok(
                fileService.setStarred(
                        CurrentUser.id(jwt),
                        fileId,
                        starred
                )
        );
    }

    /** 휴지통으로 이동 */
    @DeleteMapping("/{fileId}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId
    ) {

        fileService.delete(CurrentUser.id(jwt), fileId);

        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<ByteArrayResource> fileResponse(
            StoredFile file,
            ContentDisposition.Builder disposition
    ) {

        // RFC 5987 (filename*=UTF-8''...) 로 한글 파일명 지원
        ContentDisposition contentDisposition = disposition
                .filename(file.name(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .contentType(parseContentType(file.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentLength(file.data().length)
                .body(new ByteArrayResource(file.data()));
    }

    private static MediaType parseContentType(String contentType) {

        try {
            return MediaType.parseMediaType(contentType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
```

## 16-3. FolderController (전체 교체)

`/tree`를 `/{folderId}`보다 먼저 선언했지만, Spring은 경로 변수보다 고정 경로를
우선하므로 순서와 관계없이 `/api/folders/tree`는 `getTree`로 간다.

파일: `backend/src/main/java/com/example/backend/controller/FolderController.java`

``` java
package com.example.backend.controller;


import com.example.backend.dto.CreateFolderRequest;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.RenameRequest;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.FolderService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
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
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody CreateFolderRequest request
    ) {

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(folderService.createFolder(CurrentUser.id(jwt), request));
    }

    @GetMapping
    public ResponseEntity<List<FolderResponse>> getFolders(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false)
            Long parentFolderId
    ) {

        return ResponseEntity.ok(
                folderService.getFolders(
                        CurrentUser.id(jwt),
                        parentFolderId
                )
        );
    }

    @GetMapping("/tree")
    public ResponseEntity<List<FolderResponse>> getTree(
            @AuthenticationPrincipal Jwt jwt
    ) {

        return ResponseEntity.ok(
                folderService.getTree(CurrentUser.id(jwt))
        );
    }

    @GetMapping("/{folderId}")
    public ResponseEntity<FolderResponse> getFolder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId
    ) {

        return ResponseEntity.ok(
                folderService.getFolder(CurrentUser.id(jwt), folderId)
        );
    }

    @GetMapping("/{folderId}/path")
    public ResponseEntity<List<FolderResponse>> getPath(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId
    ) {

        return ResponseEntity.ok(
                folderService.getPath(CurrentUser.id(jwt), folderId)
        );
    }

    @PatchMapping("/{folderId}")
    public ResponseEntity<FolderResponse> renameFolder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId,
            @RequestBody RenameRequest request
    ) {

        return ResponseEntity.ok(
                folderService.renameFolder(
                        CurrentUser.id(jwt),
                        folderId,
                        request
                )
        );
    }

    @PatchMapping("/{folderId}/move")
    public ResponseEntity<FolderResponse> moveFolder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId,
            @RequestParam(required = false)
            Long parentFolderId
    ) {

        return ResponseEntity.ok(
                folderService.moveFolder(
                        CurrentUser.id(jwt),
                        folderId,
                        parentFolderId
                )
        );
    }

    @PatchMapping("/{folderId}/star")
    public ResponseEntity<FolderResponse> star(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId,
            @RequestParam boolean starred
    ) {

        return ResponseEntity.ok(
                folderService.setStarred(
                        CurrentUser.id(jwt),
                        folderId,
                        starred
                )
        );
    }

    @DeleteMapping("/{folderId}")
    public ResponseEntity<Void> deleteFolder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId
    ) {

        folderService.deleteFolder(CurrentUser.id(jwt), folderId);

        return ResponseEntity.noContent().build();
    }
}
```

`HealthController`(`/health`)는 Day 7 그대로다.

------------------------------------------------------------------------

# 17. Backend --- 통합 테스트

파일: `backend/src/test/java/com/example/backend/api/` 폴더를 새로 만든다.

``` bash
mkdir -p backend/src/test/java/com/example/backend/api
```

이 테스트는

- 실제 로컬 PostgreSQL(`docker compose`의 `cloud-file-postgres`)에 붙어서
- `MockMvc`로 HTTP 요청을 흉내 내고
- S3는 `@MockitoBean`으로 가짜(Mock)로 바꿔서

가입/로그인, 401/403 JSON, 사용자 간 격리(404), 휴지통/복원/영구 삭제, 별표/최근/용량을
검사한다. 용량 한도는 테스트에서만 1000바이트로 줄인다(`@DynamicPropertySource`).
끝나면 만든 계정을 탈퇴시켜 로컬 DB를 깨끗하게 유지한다.

파일: `backend/src/test/java/com/example/backend/api/DriveApiIntegrationTests.java`

``` java
package com.example.backend.api;

import com.example.backend.storage.S3StorageService;
import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 로컬 PostgreSQL(application.properties 설정)에 붙어서 실행되는 API 통합 테스트.
 * S3 는 Mock 으로 대체한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class DriveApiIntegrationTests {

    private static final String ADMIN_EMAIL =
            "admin-" + UUID.randomUUID() + "@test.local";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.admin-emails", () -> ADMIN_EMAIL);
        registry.add("app.storage.limit-bytes", () -> "1000");
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private S3StorageService storageService;

    // 테스트가 만든 계정은 끝나고 탈퇴시켜 로컬 DB 를 더럽히지 않는다.
    private final List<String> createdTokens = new ArrayList<>();

    @AfterEach
    void cleanUpUsers() throws Exception {

        for (String token : createdTokens) {
            mockMvc.perform(delete("/api/users/me")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json("{'password':'password123'}"))
                    .header(HttpHeaders.AUTHORIZATION, bearer(token)));
        }
    }

    @Test
    void signupLoginAndMe() throws Exception {

        String email = randomEmail();

        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'  %s ','password':'password123','name':'테스터'}"
                                .formatted(email.toUpperCase()))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.user.email").value(email))
                .andExpect(jsonPath("$.user.role").value("USER"))
                .andExpect(jsonPath("$.user.storageUsed").value(0))
                .andExpect(jsonPath("$.user.storageLimit").value(1000));

        // 중복 가입 → 409
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'%s','password':'password123','name':'x'}".formatted(email))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("이미 가입된 이메일입니다."));

        // 짧은 비밀번호 → 400
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'%s','password':'short','name':'x'}".formatted(randomEmail()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isString());

        // 잘못된 비밀번호 → 401
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'%s','password':'wrong-password'}".formatted(email))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("이메일 또는 비밀번호가 올바르지 않습니다."));

        MvcResult login = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'%s','password':'password123'}".formatted(email))))
                .andExpect(status().isOk())
                .andReturn();

        String token = JsonPath.read(login.getResponse().getContentAsString(), "$.token");
        createdTokens.add(token);

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.name").value("테스터"));
    }

    @Test
    void requestsWithoutValidTokenGet401Json() throws Exception {

        mockMvc.perform(get("/api/files"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE + "-basic"))
                .andExpect(jsonPath("$.message").value("로그인이 필요합니다."));

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("로그인이 필요합니다."));

        mockMvc.perform(get("/health"))
                .andExpect(status().isOk());
    }

    @Test
    void adminEndpointsRequireAdminRole() throws Exception {

        String user = signup(randomEmail());

        mockMvc.perform(get("/api/admin/users").header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("권한이 없습니다."));

        String admin = signup(ADMIN_EMAIL);

        mockMvc.perform(get("/api/admin/users").header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].email", hasItem(ADMIN_EMAIL)));

        long adminId = meId(admin);

        mockMvc.perform(delete("/api/admin/users/" + adminId).header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isBadRequest());

        long userId = meId(user);

        mockMvc.perform(delete("/api/admin/users/" + userId).header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isNoContent());

        // 삭제된 사용자의 토큰 → 401
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void userCannotAccessAnotherUsersFolderOrFile() throws Exception {

        String alice = signup(randomEmail());
        String bob = signup(randomEmail());

        long folderId = createFolder(alice, "앨리스 폴더", null);
        long fileId = upload(alice, "보고서 2026.txt", "hello".getBytes(), folderId);

        when(storageService.download(anyString())).thenReturn("hello".getBytes());

        // 앨리스는 볼 수 있다
        mockMvc.perform(get("/api/files").param("folderId", String.valueOf(folderId))
                        .header(HttpHeaders.AUTHORIZATION, bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].starred").value(false))
                .andExpect(jsonPath("$[0].trashed").value(false));

        mockMvc.perform(get("/api/files/" + fileId + "/download").header(HttpHeaders.AUTHORIZATION, bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("attachment")))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        containsString("filename*=UTF-8''%EB%B3%B4%EA%B3%A0%EC%84%9C%202026.txt")));

        mockMvc.perform(get("/api/files/" + fileId + "/preview").header(HttpHeaders.AUTHORIZATION, bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("text/plain")))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("inline")));

        // 밥은 존재 자체를 알 수 없다 (404)
        mockMvc.perform(get("/api/folders/" + folderId).header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value(containsString("찾을 수 없습니다")));

        mockMvc.perform(get("/api/files").param("folderId", String.valueOf(folderId))
                        .header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/files/" + fileId + "/download").header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/files/" + fileId).header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/folders").header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));

        mockMvc.perform(get("/api/drive/search").param("q", "보고서").header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.files", hasSize(0)));

        mockMvc.perform(get("/api/drive/search").param("q", "보고서").header(HttpHeaders.AUTHORIZATION, bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.files", hasSize(1)))
                .andExpect(jsonPath("$.folders", hasSize(0)));
    }

    @Test
    void trashAndRestoreFolderTree() throws Exception {

        String token = signup(randomEmail());

        long parent = createFolder(token, "parent", null);
        long child = createFolder(token, "child", parent);
        long separately = createFolder(token, "separately", parent);
        long fileInChild = upload(token, "a.txt", "abc".getBytes(), child);

        // 하위 폴더를 먼저 따로 삭제
        mockMvc.perform(delete("/api/folders/" + separately).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());

        // 상위 폴더 삭제 → 하위 전체가 휴지통으로
        mockMvc.perform(delete("/api/folders/" + parent).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/folders/" + child).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/drive/trash").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.folders", hasSize(2)))
                .andExpect(jsonPath("$.folders[0].id").value(parent))
                .andExpect(jsonPath("$.folders[0].trashed").value(true))
                .andExpect(jsonPath("$.folders[0].trashedAt").isString())
                .andExpect(jsonPath("$.files", hasSize(0)));

        // 휴지통에 있어도 용량에는 포함
        mockMvc.perform(get("/api/drive/storage").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.used").value(3))
                .andExpect(jsonPath("$.limit").value(1000));

        mockMvc.perform(post("/api/drive/trash/folders/" + parent + "/restore")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trashed").value(false));

        mockMvc.perform(get("/api/folders").param("parentFolderId", String.valueOf(parent))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(child));

        mockMvc.perform(get("/api/files").param("folderId", String.valueOf(child))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$[0].id").value(fileInChild));

        mockMvc.perform(get("/api/folders/" + child + "/path").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$[0].id").value(parent))
                .andExpect(jsonPath("$[1].id").value(child));

        // 따로 삭제했던 폴더는 휴지통에 남아 있다
        mockMvc.perform(get("/api/drive/trash").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.folders", hasSize(1)))
                .andExpect(jsonPath("$.folders[0].id").value(separately));

        // 자기 하위로 이동 불가
        mockMvc.perform(patch("/api/folders/" + parent + "/move").param("parentFolderId", String.valueOf(child))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("폴더를 자기 자신이나 하위 폴더로 이동할 수 없습니다."));

        // 파일 삭제 후 영구 삭제 → S3 삭제 호출
        mockMvc.perform(delete("/api/files/" + fileInChild).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());

        mockMvc.perform(delete("/api/drive/trash").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());

        verify(storageService).deleteAll(argThat((Collection<String> keys) ->
                keys.size() == 1 && keys.iterator().next().startsWith("users/")));

        mockMvc.perform(get("/api/drive/trash").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.folders", hasSize(0)))
                .andExpect(jsonPath("$.files", hasSize(0)));

        mockMvc.perform(get("/api/drive/storage").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.used").value(0));
    }

    @Test
    void starRecentAndQuota() throws Exception {

        String token = signup(randomEmail());

        long fileId = upload(token, "star.txt", "12345".getBytes(), null);

        mockMvc.perform(patch("/api/files/" + fileId + "/star").param("starred", "true")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.starred").value(true));

        mockMvc.perform(get("/api/drive/starred").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.files[0].id").value(fileId));

        mockMvc.perform(get("/api/drive/recent").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$[0].id").value(fileId));

        // 제한(1000바이트) 초과 → 413
        mockMvc.perform(multipart("/api/files")
                        .file(new MockMultipartFile("file", "big.bin", "application/octet-stream", new byte[996]))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isContentTooLarge())
                .andExpect(jsonPath("$.message").value("저장 공간이 부족합니다."));

        mockMvc.perform(get("/api/drive/search").param("q", " ")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.files", hasSize(0)))
                .andExpect(jsonPath("$.folders", hasSize(0)));

        mockMvc.perform(delete("/api/users/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'password':'wrong-password'}"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest());

        mockMvc.perform(delete("/api/users/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'password':'password123'}"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message", not(containsString("Exception"))));
    }

    // ---- helpers ----

    private String signup(String email) throws Exception {

        MvcResult result = mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'%s','password':'password123','name':'user'}".formatted(email))))
                .andExpect(status().isCreated())
                .andReturn();

        String token = JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.token");
        createdTokens.add(token);

        return token;
    }

    private long meId(String token) throws Exception {

        MvcResult result = mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn();

        return ((Number) JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.id"))
                .longValue();
    }

    private long createFolder(String token, String name, Long parentId) throws Exception {

        String body = "{\"name\":\"" + name + "\",\"parentFolderId\":" + parentId + "}";

        MvcResult result = mockMvc.perform(post("/api/folders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isCreated())
                .andReturn();

        return ((Number) JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.id"))
                .longValue();
    }

    private long upload(String token, String name, byte[] content, Long folderId) throws Exception {

        var request = multipart("/api/files")
                .file(new MockMultipartFile("file", name, "text/plain", content))
                .header(HttpHeaders.AUTHORIZATION, bearer(token));

        if (folderId != null) {
            request.param("folderId", String.valueOf(folderId));
        }

        MvcResult result = mockMvc.perform(request)
                .andExpect(status().isCreated())
                .andReturn();

        String json = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat((String) JsonPath.read(json, "$.name")).isEqualTo(name);

        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private static String randomEmail() {
        return "user-" + UUID.randomUUID() + "@test.local";
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    private static String json(String singleQuoted) {
        return singleQuoted.replace('\'', '"');
    }
}
```

## 17-1. 테스트 실행

``` bash
# 프로젝트 루트
docker compose up -d postgres
docker compose ps        # postgres 가 healthy 인지

cd backend
./gradlew clean build
```

`BUILD SUCCESSFUL`이 나와야 한다. 특정 테스트만:

``` bash
./gradlew test --tests 'com.example.backend.api.DriveApiIntegrationTests'
```

실패하면 보고서를 연다.

``` bash
ls build/reports/tests/test/index.html
# Codespaces: 파일 탐색기에서 우클릭 → Open with Live Server 또는 다운로드
```

| 증상 | 원인 |
|---|---|
| `Connection to localhost:5432 refused` | `docker compose up -d postgres`를 안 함 |
| `No space left on device` | 디스크 부족 (33-9) |
| `app.jwt.secret(JWT_SECRET)은 32바이트 이상이어야 합니다.` | 터미널에 짧은 `JWT_SECRET`이 export되어 있음 → `unset JWT_SECRET` |

``` bash
cd ..
```

------------------------------------------------------------------------

# 18. 로컬 실행 확인 (bootRun + curl)

> **포트 충돌 주의:** `bootRun`과 `kubectl port-forward`(Day 7 27번)는 둘 다
> **8080**을 쓴다. port-forward 반복문이 실행 중이면 그 터미널에서 `Ctrl+C`를 두 번
> 눌러 멈춘 뒤 진행한다. 이 절이 끝나면 `bootRun`을 끄고 28번에서 port-forward를
> 다시 켠다.

터미널 1:

``` bash
export S3_BUCKET=$(kubectl get configmap cloud-file-service-config \
  -n cloud-file-service -o jsonpath='{.data.S3_BUCKET}')
echo "$S3_BUCKET"

cd backend
./gradlew bootRun
```

`Started BackendApplication`이 보이면 준비된 것이다. (JWT_SECRET을 주지 않았으므로
개발용 기본 키가 쓰인다. 로컬에서만 괜찮다.)

터미널 2 (jq가 없으면 `sudo apt-get update && sudo apt-get install -y jq`):

``` bash
API=http://localhost:8080

# 1) 토큰 없이 → 401 JSON
curl -s -i $API/api/files | head -n 1
curl -s $API/api/files; echo
# {"message":"로그인이 필요합니다."}

# 2) 회원가입 → 201
curl -s -X POST $API/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"password123","name":"앨리스"}' | jq

# 3) 로그인 → 토큰 저장
TOKEN=$(curl -s -X POST $API/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"password123"}' | jq -r .token)
echo "${TOKEN:0:30}..."
AUTH="Authorization: Bearer $TOKEN"

# 4) 내 정보
curl -s $API/api/auth/me -H "$AUTH" | jq

# 5) 폴더 만들기
FOLDER_ID=$(curl -s -X POST $API/api/folders -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"name":"문서","parentFolderId":null}' | jq -r .id)
echo "$FOLDER_ID"

# 6) 한글 이름 파일 업로드
echo "안녕하세요 Day 7.5" > /tmp/보고서.txt
FILE_ID=$(curl -s -X POST $API/api/files -H "$AUTH" \
  -F "file=@/tmp/보고서.txt" -F "folderId=$FOLDER_ID" | jq -r .id)
echo "$FILE_ID"

# 7) 다운로드 → Content-Disposition 에 filename*=UTF-8''... 확인
curl -s -D - -o /tmp/down.txt $API/api/files/$FILE_ID/download -H "$AUTH" | grep -i content-disposition
cat /tmp/down.txt

# 8) 검색 / 최근 / 용량
curl -s "$API/api/drive/search?q=보고" -H "$AUTH" | jq '.files[].name'
curl -s $API/api/drive/recent -H "$AUTH" | jq '.[].name'
curl -s $API/api/drive/storage -H "$AUTH" | jq

# 9) 폴더 삭제 → 휴지통 (하위 파일도 함께)
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE $API/api/folders/$FOLDER_ID -H "$AUTH"   # 204
curl -s $API/api/drive/trash -H "$AUTH" | jq '{folders: [.folders[].name], files: [.files[].name]}'
curl -s -o /dev/null -w '%{http_code}\n' $API/api/files/$FILE_ID/download -H "$AUTH"         # 200 (휴지통도 열람 가능)
curl -s "$API/api/files?folderId=$FOLDER_ID" -H "$AUTH"; echo                                  # 404 (휴지통 폴더)

# 10) 복원 → 파일도 함께 돌아온다
curl -s -X POST $API/api/drive/trash/folders/$FOLDER_ID/restore -H "$AUTH" | jq .trashed     # false
curl -s "$API/api/files?folderId=$FOLDER_ID" -H "$AUTH" | jq '.[].name'
```

URL에 한글(`q=보고`)을 그대로 넣어도 curl이 보내 주지만, 안 되면
`--data-urlencode`를 쓴다: `curl -s -G $API/api/drive/search --data-urlencode 'q=보고' -H "$AUTH"`.

다른 사용자로 격리 확인:

``` bash
BOB=$(curl -s -X POST $API/api/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"bob@example.com","password":"password123","name":"밥"}' | jq -r .token)

curl -s -i $API/api/files/$FILE_ID/download -H "Authorization: Bearer $BOB" | head -n 1
# HTTP/1.1 404   ← 403 이 아니라 404 (존재 자체를 숨김)
curl -s $API/api/files -H "Authorization: Bearer $BOB"; echo
# []
```

탈퇴(연습 계정 정리):

``` bash
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE $API/api/users/me \
  -H "Authorization: Bearer $BOB" -H 'Content-Type: application/json' \
  -d '{"password":"password123"}'                     # 204

curl -s -o /dev/null -w '%{http_code}\n' $API/api/auth/me -H "Authorization: Bearer $BOB"   # 401
```

> 탈퇴 후에도 토큰 자체는 만료 전까지 서명이 유효하다. 하지만 `getUser()`가 DB에서
> 사용자를 찾지 못해 401이 된다.

확인이 끝나면 **터미널 1에서 `Ctrl+C`로 bootRun을 종료한다.** (alice 계정은 남겨
두고 브라우저 테스트에 써도 된다. kind Pod도 같은 로컬 PostgreSQL을 쓴다.)

------------------------------------------------------------------------

# 19. Frontend --- 구조

Day 7의 Frontend(`App.jsx` 한 파일 + 작은 컴포넌트, `useDrive` 훅)는 로그인·라우팅·
휴지통·미리보기를 담기에 구조가 맞지 않아 **새로 구성한다.** 외부 라이브러리는
추가하지 않는다(React 19 + Vite만 사용). `package.json`, `vite.config.js`,
`eslint.config.js`, `.env.local`은 Day 7 그대로다.

## 19-1. 삭제하는 파일

``` bash
cd frontend
rm -f public/icons.svg \
  src/assets/hero.png src/assets/react.svg src/assets/vite.svg \
  src/components/CreateFolderModal.jsx src/components/ErrorMessage.jsx \
  src/components/FileRow.jsx src/components/FolderRow.jsx \
  src/components/Header.jsx src/components/Loading.jsx \
  src/components/MoveModal.jsx src/components/RenameModal.jsx \
  src/components/Toolbar.jsx src/hooks/useDrive.js
mkdir -p src/pages
cd ..
```

(이미 Day 7.5 코드가 있는 저장소라면 이 파일들은 이미 없다.)

## 19-2. 새 구조

``` text
frontend/
├── index.html                    제목 "Cloud Drive", lang=ko, 다크 모드 meta
├── public/favicon.svg            구름 + 업로드 화살표 아이콘
└── src/
    ├── main.jsx                  React 시작점
    ├── App.jsx                   Provider 조립 + 로그인 여부에 따라 화면 선택
    ├── index.css                 기본 reset / 글꼴
    ├── App.css                   디자인 토큰(라이트/다크) + 모든 화면 스타일
    ├── api/
    │   ├── client.js             request(): 토큰 헤더, 오류 → ApiError, 401 → 로그아웃
    │   ├── authApi.js            가입 / 로그인 / 내 정보
    │   ├── userApi.js            이름 변경 / 비밀번호 변경 / 탈퇴
    │   ├── adminApi.js           사용자 목록 / 삭제
    │   ├── fileApi.js            파일 목록·이름·이동·별표·휴지통, blob 다운로드, XHR 업로드
    │   ├── folderApi.js          폴더 목록·경로·트리·생성·이름·이동·별표·휴지통
    │   └── driveApi.js           검색 / 최근 / 중요 / 휴지통 / 복원 / 영구 삭제 / 용량
    ├── utils/
    │   ├── format.js             용량·날짜(UTC 해석) 표시, 오류 메시지
    │   ├── fileTypes.js          확장자/Content-Type → 종류, 미리보기 가능 여부, 위험 형식
    │   ├── items.js              {folders, files} → 목록, 정렬(폴더 먼저)
    │   └── validation.js         로그인/가입 폼 검증
    ├── hooks/
    │   ├── useHashRoute.js       #/drive, #/folders/12 ... 해시 라우터
    │   ├── useAuth.js            AuthContext 읽기
    │   ├── useToast.js           ToastContext 읽기
    │   ├── useDialogs.js         confirm / prompt (Promise)
    │   ├── useDismiss.js         Esc / 바깥 클릭으로 닫기
    │   ├── useResource.js        비동기 로더 (loading/refreshing/error)
    │   ├── useLocalStorageState.js  localStorage 에 저장되는 state (목록/바둑판 보기)
    │   ├── useDriveData.js       현재 화면(드라이브/폴더/최근/중요/검색/휴지통) 데이터
    │   ├── useItemActions.js     열기·이름 변경·이동·별표·삭제·복원 등 공통 동작
    │   └── useUploads.js         업로드 큐 (순차, 진행률, 취소)
    ├── components/
    │   ├── AuthProvider.jsx      로그인 상태 관리, 세션 복원, 401 수신
    │   ├── ToastProvider.jsx     토스트 알림 (실행 취소 버튼)
    │   ├── DialogProvider.jsx    confirm/prompt 대화상자 제공
    │   ├── Modal.jsx             공통 모달 (포커스 트랩, Esc)
    │   ├── ConfirmDialog.jsx     확인 대화상자
    │   ├── PromptDialog.jsx      이름 입력 대화상자 (확장자 앞까지 선택)
    │   ├── AppShell.jsx          로그인 후 레이아웃 (TopBar + Sidebar + 본문 + 업로드 패널)
    │   ├── TopBar.jsx            로고, 검색창, 사용자 메뉴, 모바일 메뉴 버튼
    │   ├── SearchBox.jsx         300ms 디바운스 검색 → #/search?q=
    │   ├── UserMenu.jsx          내 계정 / 관리자 / 로그아웃
    │   ├── Sidebar.jsx           새로 만들기, 메뉴, 저장 용량
    │   ├── NewMenuButton.jsx     "새로 만들기" (새 폴더 / 파일 업로드), 모바일 FAB
    │   ├── StorageMeter.jsx      용량 막대
    │   ├── Breadcrumb.jsx        내 드라이브 > A > B
    │   ├── ItemList.jsx          목록/바둑판 보기, 정렬 헤더, 키보드 조작, 스켈레톤
    │   ├── Menu.jsx              ⋮ 메뉴 / 우클릭 메뉴 (방향키 이동)
    │   ├── MoveDialog.jsx        폴더 트리에서 이동 위치 선택
    │   ├── PreviewModal.jsx      전체 화면 미리보기 (← → 이동)
    │   ├── UploadPanel.jsx       오른쪽 아래 업로드 진행 패널
    │   ├── EmptyState.jsx        빈 화면 일러스트 + 안내
    │   ├── FileIcon.jsx          종류별 색 아이콘
    │   ├── Icon.jsx              인라인 SVG 아이콘 모음
    │   ├── Avatar.jsx            이름 첫 글자 원형 아바타
    │   ├── Logo.jsx              로고
    │   ├── Spinner.jsx           로딩 표시
    │   ├── FormField.jsx         라벨 + 입력 + 오류 문구
    │   └── AuthLayout.jsx        로그인/가입 화면 틀
    └── pages/
        ├── LoginPage.jsx         로그인
        ├── SignupPage.jsx        회원가입
        ├── DrivePage.jsx         내 드라이브/폴더/최근/중요/검색/휴지통 공용 화면
        ├── AccountPage.jsx       내 계정 (프로필, 비밀번호, 용량, 탈퇴)
        └── AdminPage.jsx         관리자 (사용자 목록/삭제)
```

## 19-3. 핵심 개념 미리 보기

**해시 라우터(`#/...`)**

``` text
https://...-5173.app.github.dev/#/folders/12
                                └── 이 부분만 바뀐다 (서버에 요청하지 않음)
```

- 주소에 현재 위치가 남으므로 **F5를 눌러도 같은 폴더/화면이 유지**되고, 뒤로 가기도 된다.
- `#` 뒤는 서버로 전송되지 않으므로 Vite dev 서버, nginx, S3 정적 호스팅 어디서든
  별도 설정 없이 동작한다. (`/folders/12` 같은 경로 방식은 서버가 모든 경로에
  `index.html`을 돌려주도록 설정해야 한다.)
- 외부 라우터 라이브러리 없이 `hashchange` 이벤트 + `useSyncExternalStore`로 구현했다.

**AuthContext**

``` text
AuthProvider  ──(Context)──>  어느 컴포넌트든 useAuth() 로
  status: loading | authenticated | anonymous | error
  user, login(), signup(), logout(), updateUser(), retry()
```

앱이 시작될 때 localStorage에 토큰이 있으면 `/api/auth/me`로 확인해 로그인 상태를
복원한다(`loading` → `authenticated`).

**401 처리**

``` text
어떤 API 든 401 → client.js handleUnauthorized()
  → 토큰 삭제 → onUnauthorized 리스너 호출 → AuthProvider 가 anonymous 로
  → App 이 로그인 화면 표시 ("세션이 만료되었습니다" 안내)
```

컴포넌트마다 401을 처리하지 않아도 된다.

**인증이 필요한 다운로드/미리보기**

`<a href="/api/files/3/download">`는 브라우저가 `Authorization` 헤더를 붙여 주지
않으므로 401이 된다. 그래서

``` text
fetch(Authorization 포함) → Blob → URL.createObjectURL(blob) → <a download> 클릭 / <img src>
```

순서로 처리하고, 다 쓴 object URL은 `URL.revokeObjectURL`로 해제한다.

**XHR 업로드**

`fetch`는 업로드 진행률 이벤트를 제공하지 않는다. `XMLHttpRequest`의
`xhr.upload.onprogress`로 진행률을 표시하고, `xhr.abort()`로 취소한다.

**미리보기 보안**

사용자가 올린 HTML/SVG/XML을 blob URL로 그대로 열면 그 안의 `<script>`가 실행될 수
있다(XSS). 그래서 이 형식은 **렌더링하지 않고 텍스트(`<pre>`)로만 보여준다**
(`fileTypes.js`의 `isUnsafeType`, `PreviewModal.jsx`).

**UTC 날짜**

서버의 `LocalDateTime`은 타임존 없이 `"2026-09-25T06:55:25.946"`처럼 온다.
Codespaces·kind Pod·ECS 컨테이너는 UTC로 동작하므로, 이 값을 그대로
`new Date()`에 넣으면 브라우저가 **한국 시간으로 오해해 9시간 틀린다.**
`format.js`의 `parseDate`는 타임존이 없으면 끝에 `Z`(UTC)를 붙여 해석한 뒤
브라우저 로컬 시간(KST)으로 표시한다.

------------------------------------------------------------------------

# 20. Frontend --- api

`client.js`의 `request()`가 모든 API 호출의 입구다. 여기서 토큰 헤더, JSON 변환,
오류 메시지 추출, 401 처리를 한 번에 한다. 나머지 api 파일은 URL만 정의한다.

파일: `frontend/src/api/client.js`

``` javascript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export const TOKEN_KEY = "cfs_token";

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* ---------- token ---------- */

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage unavailable (private mode 등) — 세션 동안만 유지되지 않음
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/* ---------- 401 handling ---------- */

const unauthorizedListeners = new Set();

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export function handleUnauthorized() {
  clearToken();
  unauthorizedListeners.forEach((listener) => listener());
}

/* ---------- helpers ---------- */

const STATUS_MESSAGES = {
  400: "요청이 올바르지 않습니다.",
  401: "로그인이 필요합니다.",
  403: "권한이 없습니다.",
  404: "항목을 찾을 수 없습니다.",
  409: "요청이 현재 상태와 충돌합니다.",
  413: "저장 공간이 부족하거나 파일이 너무 큽니다.",
  500: "서버 오류가 발생했습니다.",
};

export function messageForStatus(status) {
  return STATUS_MESSAGES[status] || `요청에 실패했습니다. (HTTP ${status})`;
}

export function parseErrorText(text, status) {
  if (text) {
    try {
      const data = JSON.parse(text);
      if (data && typeof data.message === "string" && data.message) {
        return data.message;
      }
    } catch {
      // JSON이 아닌 응답
    }
  }
  return messageForStatus(status);
}

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export function buildQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

/**
 * 모든 API 호출의 진입점.
 * options: { method, json, body, headers, auth = true, raw = false, signal }
 *  - json: JSON body (Content-Type 자동 설정)
 *  - auth: false면 Authorization 헤더를 붙이지 않고 401이어도 로그아웃하지 않음
 *  - raw: true면 Response 객체를 그대로 반환
 */
export async function request(path, options = {}) {
  const { method = "GET", json, body, headers = {}, auth = true, raw = false, signal } = options;

  const finalHeaders = { ...headers };
  let finalBody = body;

  if (json !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(json);
  }

  const token = auth ? getToken() : null;
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: finalHeaders,
      body: finalBody,
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.", 0);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const message = parseErrorText(text, response.status);

    if (response.status === 401 && auth) {
      handleUnauthorized();
    }

    throw new ApiError(message, response.status);
  }

  if (raw) return response;

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text || null;
}

/** 인증된 요청으로 바이너리를 받아 Blob으로 반환 */
export async function requestBlob(path, options = {}) {
  const response = await request(path, { ...options, raw: true });
  return response.blob();
}
```

파일: `frontend/src/api/authApi.js`

``` javascript
import { request } from "./client";

export function signup({ email, password, name }) {
  return request("/api/auth/signup", {
    method: "POST",
    json: { email, password, name },
    auth: false,
  });
}

export function login({ email, password }) {
  return request("/api/auth/login", {
    method: "POST",
    json: { email, password },
    auth: false,
  });
}

export function getMe() {
  return request("/api/auth/me");
}
```

파일: `frontend/src/api/userApi.js`

``` javascript
import { request } from "./client";

export function updateProfile(name) {
  return request("/api/users/me", { method: "PATCH", json: { name } });
}

export function changePassword(currentPassword, newPassword) {
  return request("/api/users/me/password", {
    method: "PATCH",
    json: { currentPassword, newPassword },
  });
}

export function deleteAccount(password) {
  return request("/api/users/me", { method: "DELETE", json: { password } });
}
```

파일: `frontend/src/api/adminApi.js`

``` javascript
import { request } from "./client";

export function listUsers() {
  return request("/api/admin/users");
}

export function deleteUser(id) {
  return request(`/api/admin/users/${id}`, { method: "DELETE" });
}
```

`fileApi.js`의 `MAX_UPLOAD_BYTES`(50MB)는 Backend의
`spring.servlet.multipart.max-file-size`와 같아야 한다. 큰 파일을 보내기 전에
브라우저에서 먼저 막아 불필요한 전송을 줄인다.

파일: `frontend/src/api/fileApi.js`

``` javascript
import {
  ApiError,
  apiUrl,
  buildQuery,
  getToken,
  handleUnauthorized,
  parseErrorText,
  request,
  requestBlob,
} from "./client";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function listFiles(folderId = null) {
  return request(`/api/files${buildQuery({ folderId })}`);
}

export function renameFile(id, name) {
  return request(`/api/files/${id}/rename${buildQuery({ name })}`, {
    method: "PATCH",
  });
}

export function moveFile(id, folderId = null) {
  return request(`/api/files/${id}/move${buildQuery({ folderId })}`, {
    method: "PATCH",
  });
}

export function starFile(id, starred) {
  return request(`/api/files/${id}/star${buildQuery({ starred })}`, {
    method: "PATCH",
  });
}

/** 휴지통으로 이동 */
export function trashFile(id) {
  return request(`/api/files/${id}`, { method: "DELETE" });
}

export function fetchDownloadBlob(id) {
  return requestBlob(`/api/files/${id}/download`);
}

export function fetchPreviewBlob(id, signal) {
  return requestBlob(`/api/files/${id}/preview`, { signal });
}

/** 인증된 fetch → Blob → object URL → <a download> 클릭 */
export async function downloadFile(file) {
  const blob = await fetchDownloadBlob(file.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name || file.originalName || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * XHR 업로드 (진행률 + Authorization 헤더).
 * @returns {{ promise: Promise<object>, abort: () => void }}
 */
export function uploadFile(file, folderId, onProgress) {
  const xhr = new XMLHttpRequest();

  const promise = new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    if (folderId !== null && folderId !== undefined) {
      form.append("folderId", String(folderId));
    }

    xhr.open("POST", apiUrl("/api/files"));
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
        } catch {
          resolve(null);
        }
        return;
      }
      if (xhr.status === 401) handleUnauthorized();
      const message =
        xhr.status === 413
          ? parseErrorText(xhr.responseText, 413)
          : parseErrorText(xhr.responseText, xhr.status);
      reject(new ApiError(message, xhr.status));
    };

    xhr.onerror = () =>
      reject(new ApiError("서버에 연결할 수 없습니다.", 0));
    xhr.onabort = () => {
      const error = new ApiError("업로드가 취소되었습니다.", 0);
      error.name = "AbortError";
      reject(error);
    };

    xhr.send(form);
  });

  return { promise, abort: () => xhr.abort() };
}
```

파일: `frontend/src/api/folderApi.js`

``` javascript
import { buildQuery, request } from "./client";

export function listFolders(parentFolderId = null) {
  return request(`/api/folders${buildQuery({ parentFolderId })}`);
}

export function getFolder(id) {
  return request(`/api/folders/${id}`);
}

export function getFolderPath(id) {
  return request(`/api/folders/${id}/path`);
}

export function getFolderTree() {
  return request("/api/folders/tree");
}

export function createFolder(name, parentFolderId = null) {
  return request("/api/folders", {
    method: "POST",
    json: { name, parentFolderId },
  });
}

export function renameFolder(id, name) {
  return request(`/api/folders/${id}`, { method: "PATCH", json: { name } });
}

export function moveFolder(id, parentFolderId = null) {
  return request(`/api/folders/${id}/move${buildQuery({ parentFolderId })}`, {
    method: "PATCH",
  });
}

export function starFolder(id, starred) {
  return request(`/api/folders/${id}/star${buildQuery({ starred })}`, {
    method: "PATCH",
  });
}

/** 휴지통으로 이동 (하위 항목 포함) */
export function trashFolder(id) {
  return request(`/api/folders/${id}`, { method: "DELETE" });
}
```

파일: `frontend/src/api/driveApi.js`

``` javascript
import { buildQuery, request } from "./client";

export function searchDrive(q) {
  return request(`/api/drive/search${buildQuery({ q })}`);
}

export function getRecent() {
  return request("/api/drive/recent");
}

export function getStarred() {
  return request("/api/drive/starred");
}

export function getTrash() {
  return request("/api/drive/trash");
}

export function restoreFile(id) {
  return request(`/api/drive/trash/files/${id}/restore`, { method: "POST" });
}

export function restoreFolder(id) {
  return request(`/api/drive/trash/folders/${id}/restore`, { method: "POST" });
}

export function deleteFileForever(id) {
  return request(`/api/drive/trash/files/${id}`, { method: "DELETE" });
}

export function deleteFolderForever(id) {
  return request(`/api/drive/trash/folders/${id}`, { method: "DELETE" });
}

export function emptyTrash() {
  return request("/api/drive/trash", { method: "DELETE" });
}

export function getStorage() {
  return request("/api/drive/storage");
}
```

------------------------------------------------------------------------

# 21. Frontend --- utils

파일: `frontend/src/utils/format.js`

``` javascript
const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** 1536 → "1.5 KB", 1073741824 → "1 GB" */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) {
    return "—";
  }
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;

  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), UNITS.length - 1);
  const scaled = value / 1024 ** index;
  const digits = scaled < 10 ? 1 : 0;
  const text = scaled.toFixed(digits).replace(/\.0$/, "");
  return `${text} ${UNITS[index]}`;
}

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * 서버 LocalDateTime → Date.
 * 서버는 UTC로 동작하므로 타임존 없는 문자열은 UTC로 해석하고, 표시할 때 브라우저 로컬 시간으로 변환한다.
 * 소수점 이하 초(6~9자리)는 3자리로 자른다. [y,m,d,h,mi,s,nano] 배열 형식도 UTC로 처리.
 */
export function parseDate(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const [y, m = 1, d = 1, h = 0, mi = 0, s = 0, nano = 0] = value;
    return new Date(Date.UTC(y, m - 1, d, h, mi, s, Math.floor(nano / 1e6)));
  }
  let text = String(value).trim().replace(" ", "T");
  text = text.replace(/(\.\d{3})\d+/, "$1");
  if (/T/.test(text) && !HAS_ZONE.test(text)) text += "Z";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateValue(value) {
  const date = parseDate(value);
  return date ? date.getTime() : 0;
}

const timeFormat = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });
const monthDayFormat = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" });
const fullDateFormat = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Drive 스타일 짧은 날짜: 오늘이면 "오후 3:12", 올해면 "9월 25일", 아니면 "2025. 9. 25." */
export function formatShortDate(value) {
  const date = parseDate(value);
  if (!date) return "—";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return timeFormat.format(date);
  if (date.getFullYear() === now.getFullYear()) return monthDayFormat.format(date);
  return fullDateFormat.format(date);
}

export function formatDateTime(value) {
  const date = parseDate(value);
  return date ? dateTimeFormat.format(date) : "—";
}

export function formatJoinDate(value) {
  const date = parseDate(value);
  return date ? fullDateFormat.format(date) : "—";
}

export function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value ?? 0);
}

export function errorMessage(error, fallback = "문제가 발생했습니다.") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  return error.message || fallback;
}
```

파일: `frontend/src/utils/fileTypes.js`

``` javascript
const EXT_KIND = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif", "heic"],
  video: ["mp4", "webm", "mov", "mkv", "avi", "m4v", "ogv"],
  audio: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "oga", "opus"],
  pdf: ["pdf"],
  doc: ["doc", "docx", "odt", "rtf", "hwp", "hwpx", "pages"],
  sheet: ["xls", "xlsx", "ods", "csv", "tsv", "numbers"],
  slides: ["ppt", "pptx", "odp", "key"],
  archive: ["zip", "tar", "gz", "tgz", "rar", "7z", "bz2", "xz", "jar", "war"],
  code: [
    "js", "jsx", "ts", "tsx", "java", "py", "go", "rs", "c", "h", "cpp", "cs", "rb",
    "php", "kt", "swift", "sh", "sql", "html", "css", "scss", "json", "xml", "yaml",
    "yml", "toml", "gradle", "properties", "tf", "dockerfile",
  ],
  text: ["txt", "md", "log", "ini", "conf", "env"],
};

const EXT_LOOKUP = Object.entries(EXT_KIND).reduce((acc, [kind, exts]) => {
  exts.forEach((ext) => {
    acc[ext] = kind;
  });
  return acc;
}, {});

export function extensionOf(name = "") {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
}

/** 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'archive' | 'code' | 'text' | 'other' */
export function fileKind(file) {
  const type = (file?.contentType || "").toLowerCase();
  const byExt = EXT_LOOKUP[extensionOf(file?.name || file?.originalName)];

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";
  if (byExt) return byExt;
  if (type.includes("spreadsheet") || type.includes("excel") || type === "text/csv") return "sheet";
  if (type.includes("presentation") || type.includes("powerpoint")) return "slides";
  if (type.includes("word") || type.includes("opendocument.text")) return "doc";
  if (type.includes("zip") || type.includes("compressed") || type.includes("tar")) return "archive";
  if (type.includes("json") || type.includes("javascript") || type.includes("xml")) return "code";
  if (type.startsWith("text/")) return "text";
  return "other";
}

export const KIND_LABEL = {
  folder: "폴더",
  image: "이미지",
  video: "동영상",
  audio: "오디오",
  pdf: "PDF",
  doc: "문서",
  sheet: "스프레드시트",
  slides: "프레젠테이션",
  archive: "압축 파일",
  code: "코드",
  text: "텍스트",
  other: "파일",
};

const TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024;

/* 스크립트를 실행할 수 있는 형식은 절대 렌더링하지 않고 텍스트로만 보여준다 */
const UNSAFE_TYPE = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)\b/i;
const UNSAFE_EXT = new Set(["html", "htm", "xhtml", "svg", "xml", "xsl", "xslt"]);

export function isUnsafeType(contentType) {
  return UNSAFE_TYPE.test((contentType || "").trim());
}

function isUnsafeFile(file) {
  return isUnsafeType(file?.contentType) || UNSAFE_EXT.has(extensionOf(file?.name || file?.originalName));
}

/** 미리보기 방식: 'image' | 'video' | 'audio' | 'pdf' | 'text' | null */
export function previewKind(file) {
  const size = file?.size ?? 0;
  if (isUnsafeFile(file)) return size <= TEXT_PREVIEW_LIMIT ? "text" : null;

  const kind = fileKind(file);
  if (["image", "video", "audio", "pdf"].includes(kind)) return kind;
  const ext = extensionOf(file?.name);
  const textLike = kind === "text" || kind === "code" || ext === "csv" || ext === "tsv";
  if (textLike && size <= TEXT_PREVIEW_LIMIT) return "text";
  return null;
}
```

파일: `frontend/src/utils/items.js`

``` javascript
import { dateValue } from "./format";

export const itemKey = (item) => `${item.kind}-${item.id}`;

/** { folders, files } → [{ kind, ...folder }, { kind, ...file }] */
export function toItems(data) {
  if (!data) return [];
  return [
    ...(data.folders || []).map((folder) => ({ ...folder, kind: "folder" })),
    ...(data.files || []).map((file) => ({ ...file, kind: "file" })),
  ];
}

const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

function dateField(item, view) {
  return view === "trash" ? item.trashedAt || item.updatedAt : item.updatedAt || item.createdAt;
}

/** 폴더 먼저, 그 다음 sort 기준 (이름/날짜/크기) */
export function sortItems(items, sort, view) {
  const dir = sort.dir === "desc" ? -1 : 1;
  const compare = (a, b) => {
    let result = 0;
    if (sort.key === "date") result = dateValue(dateField(a, view)) - dateValue(dateField(b, view));
    else if (sort.key === "size") result = (a.size ?? 0) - (b.size ?? 0);
    if (result === 0) result = collator.compare(a.name || "", b.name || "");
    return result * dir;
  };
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    // 폴더는 크기가 없으므로 크기 정렬 시 이름순
    if (a.kind === "folder" && sort.key === "size") return collator.compare(a.name, b.name);
    return compare(a, b);
  });
}
```

파일: `frontend/src/utils/validation.js`

``` javascript
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value) {
  const email = value.trim();
  if (!email) return "이메일을 입력해 주세요.";
  if (!EMAIL_RE.test(email)) return "올바른 이메일 형식이 아닙니다.";
  return null;
}

export function validatePassword(value) {
  if (!value) return "비밀번호를 입력해 주세요.";
  if (value.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  return null;
}

export function validateName(value) {
  const name = value.trim();
  if (!name) return "이름을 입력해 주세요.";
  if (name.length > 50) return "이름은 50자 이하로 입력해 주세요.";
  return null;
}

export function validateConfirm(password, confirm) {
  if (!confirm) return "비밀번호를 한 번 더 입력해 주세요.";
  if (password !== confirm) return "비밀번호가 일치하지 않습니다.";
  return null;
}

export function hasErrors(errors) {
  return Object.values(errors).some(Boolean);
}
```

------------------------------------------------------------------------

# 22. Frontend --- hooks

## 22-1. 라우팅 / Context 읽기

파일: `frontend/src/hooks/useHashRoute.js`

``` javascript
import { useMemo, useSyncExternalStore } from "react";

/**
 * 아주 작은 해시 라우터.
 *   #/drive, #/folders/12, #/recent, #/starred, #/trash,
 *   #/search?q=..., #/account, #/admin, #/login, #/signup
 */
export function parseHash(hash) {
  const raw = (hash || "").replace(/^#/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  const params = new URLSearchParams(queryPart);
  const [head, second] = segments;

  switch (head) {
    case undefined:
    case "drive":
      return { name: "drive", folderId: null };
    case "folders": {
      const id = Number(second);
      return Number.isInteger(id) && id > 0
        ? { name: "folder", folderId: id }
        : { name: "drive", folderId: null };
    }
    case "recent":
    case "starred":
    case "trash":
    case "account":
    case "admin":
    case "login":
    case "signup":
      return { name: head, folderId: null };
    case "search":
      return { name: "search", folderId: null, q: params.get("q") || "" };
    default:
      return { name: "notfound", folderId: null };
  }
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path.startsWith("/") ? path : `/${path}`}`;
  if (window.location.hash === target) return;
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${target}`;
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target;
  }
}

export function folderPath(folderId) {
  return folderId === null || folderId === undefined ? "/drive" : `/folders/${folderId}`;
}

export function searchPath(q) {
  return `/search?${new URLSearchParams({ q }).toString()}`;
}

function subscribe(callback) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function getSnapshot() {
  return window.location.hash;
}

export default function useHashRoute() {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => "");
  return useMemo(() => parseHash(hash), [hash]);
}
```

파일: `frontend/src/hooks/useAuth.js`

``` javascript
import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

/** { status: 'loading'|'authenticated'|'anonymous'|'error', user, login, signup, logout, updateUser, retry } */
export default function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
```

파일: `frontend/src/hooks/useToast.js`

``` javascript
import { createContext, useContext } from "react";

export const ToastContext = createContext(null);

/** toast.success(msg, opts) / toast.error(errOrMsg, opts) / toast.info(msg, opts); opts: { action: { label, onClick } } */
export default function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>");
  return value;
}
```

파일: `frontend/src/hooks/useDialogs.js`

``` javascript
import { createContext, useContext } from "react";

export const DialogContext = createContext(null);

/**
 * confirm({ title, message, confirmLabel, danger }) → Promise<boolean>
 * prompt({ title, label, initialValue, confirmLabel, selectBaseName, validate }) → Promise<string|null>
 */
export default function useDialogs() {
  const value = useContext(DialogContext);
  if (!value) throw new Error("useDialogs must be used inside <DialogProvider>");
  return value;
}
```

## 22-2. 공통 동작

파일: `frontend/src/hooks/useDismiss.js`

``` javascript
import { useEffect, useRef } from "react";

/* Esc는 가장 위에 열린 레이어(모달/메뉴/드로어) 하나만 닫는다. */
const layers = [];

function onKeyDown(event) {
  if (event.key !== "Escape" || layers.length === 0) return;
  event.preventDefault();
  layers[layers.length - 1].current();
}

/**
 * @param active 활성 여부
 * @param onDismiss 닫기 콜백
 * @param containerRef (선택) 지정 시 컨테이너 바깥 mousedown으로도 닫힘
 */
export default function useDismiss(active, onDismiss, containerRef) {
  const handlerRef = useRef(onDismiss);

  useEffect(() => {
    handlerRef.current = onDismiss;
  });

  useEffect(() => {
    if (!active) return undefined;

    const layer = handlerRef;
    layers.push(layer);
    if (layers.length === 1) document.addEventListener("keydown", onKeyDown);

    function onPointerDown(event) {
      const node = containerRef?.current;
      if (node && !node.contains(event.target) && layers[layers.length - 1] === layer) {
        layer.current();
      }
    }
    if (containerRef) document.addEventListener("mousedown", onPointerDown);

    return () => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      if (layers.length === 0) document.removeEventListener("keydown", onKeyDown);
      if (containerRef) document.removeEventListener("mousedown", onPointerDown);
    };
  }, [active, containerRef]);
}
```

파일: `frontend/src/hooks/useLocalStorageState.js`

``` javascript
import { useCallback, useState } from "react";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export default function useLocalStorageState(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback));

  const update = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // ignore
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, update];
}
```

`useResource`는 "key가 바뀌면 새로 불러오고(이전 데이터 숨김), version만 바뀌면
이전 데이터를 보여 준 채 새로 고친다"는 규칙의 작은 데이터 로더다. 업로드가 끝날
때마다 목록 전체가 깜빡이지 않게 한다.

파일: `frontend/src/hooks/useResource.js`

``` javascript
import { useEffect, useState } from "react";

/**
 * 비동기 데이터 로더.
 *  - key가 바뀌면 loading(이전 데이터 숨김)
 *  - version만 바뀌면 이전 데이터를 유지한 채 백그라운드 새로고침
 *  - loader는 key가 바뀔 때만 바뀌도록 useCallback으로 고정할 것
 */
export default function useResource(key, loader, version = 0) {
  const [state, setState] = useState({ key: null, version: null, data: undefined, error: null });

  useEffect(() => {
    let alive = true;
    loader().then(
      (data) => {
        if (alive) setState({ key, version, data, error: null });
      },
      (error) => {
        if (alive) setState({ key, version, data: undefined, error });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, loader, version]);

  const matches = state.key === key;
  return {
    data: matches ? state.data : undefined,
    error: matches ? state.error : null,
    loading: !matches,
    refreshing: matches && state.version !== version,
  };
}
```

## 22-3. 드라이브 데이터 / 동작 / 업로드

파일: `frontend/src/hooks/useDriveData.js`

``` javascript
import { useCallback } from "react";
import * as driveApi from "../api/driveApi";
import { listFiles } from "../api/fileApi";
import { getFolderPath, listFolders } from "../api/folderApi";
import useResource from "./useResource";

const EMPTY = { folders: [], files: [] };

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(result) {
  return {
    folders: asArray(result?.folders),
    files: asArray(result?.files),
  };
}

async function loadView(view, folderId, q) {
  switch (view) {
    case "drive":
    case "folder": {
      const [folders, files, path] = await Promise.all([
        listFolders(folderId),
        listFiles(folderId),
        folderId === null ? Promise.resolve([]) : getFolderPath(folderId),
      ]);
      return { folders: asArray(folders), files: asArray(files), path: asArray(path) };
    }
    case "recent":
      return { folders: [], files: asArray(await driveApi.getRecent()) };
    case "starred":
      return normalize(await driveApi.getStarred());
    case "search":
      return q.trim() ? normalize(await driveApi.searchDrive(q.trim())) : EMPTY;
    case "trash":
      return normalize(await driveApi.getTrash());
    default:
      return EMPTY;
  }
}

/** 현재 라우트(드라이브/폴더/최근/중요/검색/휴지통)의 항목을 불러온다. */
export default function useDriveData(route, version) {
  const view = route.name;
  const folderId = route.folderId ?? null;
  const q = route.q ?? "";
  const key = `${view}|${folderId}|${q}`;
  const loader = useCallback(() => loadView(view, folderId, q), [view, folderId, q]);
  return useResource(key, loader, version);
}
```

`useItemActions`는 목록의 ⋮ 메뉴, 우클릭 메뉴, 키보드(Delete 등), 미리보기에서
공통으로 쓰는 동작이다. 휴지통으로 보낸 뒤 토스트의 **실행 취소**를 누르면 바로
복원한다.

파일: `frontend/src/hooks/useItemActions.js`

``` javascript
import { useMemo } from "react";
import * as driveApi from "../api/driveApi";
import * as fileApi from "../api/fileApi";
import * as folderApi from "../api/folderApi";
import { errorMessage } from "../utils/format";
import useDialogs from "./useDialogs";
import useToast from "./useToast";

/**
 * 파일/폴더 공통 동작. item은 { kind: 'file'|'folder', id, name, ... } 형태.
 * onChanged: 서버 데이터가 바뀌었을 때 호출 (목록/용량 새로고침)
 */
export default function useItemActions(onChanged) {
  const toast = useToast();
  const { confirm, prompt } = useDialogs();

  return useMemo(() => {
    async function run(task, successMessage, fallbackError, options) {
      try {
        const result = await task();
        onChanged();
        if (successMessage) toast.success(successMessage, options);
        return result;
      } catch (error) {
        toast.error(errorMessage(error, fallbackError));
        return undefined;
      }
    }

    function validateName(value) {
      const name = value.trim();
      if (!name) return "이름을 입력해 주세요.";
      if (name.length > 255) return "이름이 너무 깁니다.";
      if (/[\\/]/.test(name)) return "이름에 / 또는 \\ 문자를 사용할 수 없습니다.";
      return null;
    }

    async function restore(item) {
      return run(
        () =>
          item.kind === "folder" ? driveApi.restoreFolder(item.id) : driveApi.restoreFile(item.id),
        `"${item.name}" 항목을 복원했습니다.`,
        "복원하지 못했습니다.",
      );
    }

    return {
      validateName,

      async createFolder(parentFolderId) {
        const name = await prompt({
          title: "새 폴더",
          label: "폴더 이름",
          initialValue: "제목 없는 폴더",
          confirmLabel: "만들기",
          validate: validateName,
        });
        if (name === null) return;
        await run(
          () => folderApi.createFolder(name.trim(), parentFolderId ?? null),
          `"${name.trim()}" 폴더를 만들었습니다.`,
          "폴더를 만들지 못했습니다.",
        );
      },

      async download(file) {
        toast.info(`"${file.name}" 다운로드를 준비하고 있습니다…`);
        try {
          await fileApi.downloadFile(file);
        } catch (error) {
          toast.error(errorMessage(error, "다운로드하지 못했습니다."));
        }
      },

      async rename(item) {
        const name = await prompt({
          title: "이름 바꾸기",
          label: item.kind === "folder" ? "폴더 이름" : "파일 이름",
          initialValue: item.name,
          confirmLabel: "확인",
          selectBaseName: item.kind === "file",
          validate: validateName,
        });
        if (name === null || name.trim() === item.name) return;
        await run(
          () =>
            item.kind === "folder"
              ? folderApi.renameFolder(item.id, name.trim())
              : fileApi.renameFile(item.id, name.trim()),
          "이름을 변경했습니다.",
          "이름을 변경하지 못했습니다.",
        );
      },

      async move(item, targetFolderId, targetName) {
        await run(
          () =>
            item.kind === "folder"
              ? folderApi.moveFolder(item.id, targetFolderId)
              : fileApi.moveFile(item.id, targetFolderId),
          `"${item.name}" 항목을 ${targetName}(으)로 이동했습니다.`,
          "이동하지 못했습니다.",
        );
      },

      async toggleStar(item) {
        const next = !item.starred;
        await run(
          () =>
            item.kind === "folder"
              ? folderApi.starFolder(item.id, next)
              : fileApi.starFile(item.id, next),
          next ? "중요 문서함에 추가했습니다." : "중요 표시를 해제했습니다.",
          "중요 표시를 변경하지 못했습니다.",
        );
      },

      async trash(item) {
        await run(
          () =>
            item.kind === "folder" ? folderApi.trashFolder(item.id) : fileApi.trashFile(item.id),
          `"${item.name}" 항목을 휴지통으로 이동했습니다.`,
          "휴지통으로 이동하지 못했습니다.",
          { action: { label: "실행 취소", onClick: () => restore(item) } },
        );
      },

      restore,

      async deleteForever(item) {
        const ok = await confirm({
          title: "영구적으로 삭제할까요?",
          message:
            item.kind === "folder"
              ? `"${item.name}" 폴더와 그 안의 모든 항목이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`
              : `"${item.name}" 파일이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`,
          confirmLabel: "영구 삭제",
          danger: true,
        });
        if (!ok) return;
        await run(
          () =>
            item.kind === "folder"
              ? driveApi.deleteFolderForever(item.id)
              : driveApi.deleteFileForever(item.id),
          "영구적으로 삭제했습니다.",
          "삭제하지 못했습니다.",
        );
      },

      async emptyTrash() {
        const ok = await confirm({
          title: "휴지통을 비울까요?",
          message: "휴지통의 모든 항목이 영구적으로 삭제되며 되돌릴 수 없습니다.",
          confirmLabel: "휴지통 비우기",
          danger: true,
        });
        if (!ok) return;
        await run(() => driveApi.emptyTrash(), "휴지통을 비웠습니다.", "휴지통을 비우지 못했습니다.");
      },
    };
  }, [confirm, prompt, toast, onChanged]);
}
```

`useUploads`는 여러 파일을 **한 번에 하나씩(순차)** 올린다. 동시에 올리면 용량
검사가 서로 겹쳐 한도를 넘을 수 있고 Codespaces 네트워크에도 부담이 된다. 50MB를
넘는 파일은 서버에 보내기 전에 오류로 표시한다.

파일: `frontend/src/hooks/useUploads.js`

``` javascript
import { useCallback, useRef, useState } from "react";
import { MAX_UPLOAD_BYTES, uploadFile } from "../api/fileApi";
import { errorMessage, formatBytes } from "../utils/format";
import useToast from "./useToast";

let nextId = 1;

/**
 * 업로드 큐 (순차 처리, XHR 진행률).
 * items: [{ id, name, size, progress, status: 'queued'|'uploading'|'done'|'error'|'canceled', error }]
 * completed: 성공한 업로드 수 (데이터 새로고침 트리거로 사용)
 */
export default function useUploads() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [completed, setCompleted] = useState(0);

  const queueRef = useRef([]);
  const activeRef = useRef(null);
  const runningRef = useRef(false);

  const patch = useCallback((id, changes) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    let quotaWarned = false;

    while (queueRef.current.length > 0) {
      const job = queueRef.current.shift();
      patch(job.id, { status: "uploading", progress: 0 });

      const { promise, abort } = uploadFile(job.file, job.folderId, (progress) =>
        patch(job.id, { progress }),
      );
      activeRef.current = { id: job.id, abort };

      try {
        await promise;
        patch(job.id, { status: "done", progress: 100 });
        setCompleted((count) => count + 1);
      } catch (error) {
        if (error?.name === "AbortError") {
          patch(job.id, { status: "canceled" });
        } else {
          const quota = error?.status === 413;
          const message = quota
            ? errorMessage(error, "저장 공간이 부족합니다.")
            : errorMessage(error, "업로드에 실패했습니다.");
          patch(job.id, { status: "error", error: message });
          if (quota && !quotaWarned) {
            quotaWarned = true;
            toast.error(`저장 공간이 부족해 "${job.file.name}"을(를) 업로드하지 못했습니다.`);
          }
          if (error?.status === 401) {
            queueRef.current = [];
            break;
          }
        }
      } finally {
        activeRef.current = null;
      }
    }

    runningRef.current = false;
  }, [patch, toast]);

  const startUpload = useCallback(
    (fileList, folderId = null) => {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;

      const newItems = [];
      files.forEach((file) => {
        const id = nextId++;
        if (file.size > MAX_UPLOAD_BYTES) {
          newItems.push({
            id,
            name: file.name,
            size: file.size,
            progress: 0,
            status: "error",
            error: `파일당 최대 ${formatBytes(MAX_UPLOAD_BYTES)}까지 업로드할 수 있습니다.`,
          });
          return;
        }
        newItems.push({ id, name: file.name, size: file.size, progress: 0, status: "queued", error: null });
        queueRef.current.push({ id, file, folderId });
      });

      setItems((prev) => [...prev, ...newItems]);
      pump();
    },
    [pump],
  );

  const cancel = useCallback(
    (id) => {
      if (activeRef.current?.id === id) {
        activeRef.current.abort();
        return;
      }
      const before = queueRef.current.length;
      queueRef.current = queueRef.current.filter((job) => job.id !== id);
      if (queueRef.current.length !== before) patch(id, { status: "canceled" });
    },
    [patch],
  );

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status === "queued" || item.status === "uploading"));
  }, []);

  return { items, completed, startUpload, cancel, clearFinished };
}
```

------------------------------------------------------------------------

# 23. Frontend --- components

## 23-1. Provider (Context 제공자)

`App.jsx`에서 `ToastProvider > DialogProvider > AuthProvider` 순서로 감싼다.

파일: `frontend/src/components/AuthProvider.jsx`

``` jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import * as authApi from "../api/authApi";
import { clearToken, getToken, onUnauthorized, setToken } from "../api/client";
import { AuthContext } from "../hooks/useAuth";

function initialState() {
  return getToken() ? { status: "loading", user: null, error: null } : { status: "anonymous", user: null, error: null };
}

function AuthProvider({ children }) {
  const [state, setState] = useState(initialState);
  const [attempt, setAttempt] = useState(0);

  // 세션 복원: 토큰이 있으면 /api/auth/me 로 사용자 확인
  const needsRestore = state.status === "loading";
  useEffect(() => {
    if (!needsRestore) return undefined;
    let alive = true;
    authApi.getMe().then(
      (user) => {
        if (alive) setState({ status: "authenticated", user, error: null });
      },
      (error) => {
        if (!alive) return;
        if (error?.status === 401) setState({ status: "anonymous", user: null, error: null });
        else setState({ status: "error", user: null, error });
      },
    );
    return () => {
      alive = false;
    };
  }, [needsRestore, attempt]);

  // 어떤 API든 401 → 로그아웃
  useEffect(
    () =>
      onUnauthorized(() => {
        setState((prev) =>
          prev.status === "anonymous"
            ? prev
            : { status: "anonymous", user: null, error: null, expired: prev.status === "authenticated" },
        );
      }),
    [],
  );

  const login = useCallback(async (credentials) => {
    const { token, user } = await authApi.login(credentials);
    setToken(token);
    setState({ status: "authenticated", user, error: null });
    return user;
  }, []);

  const signup = useCallback(async (payload) => {
    const { token, user } = await authApi.signup(payload);
    setToken(token);
    setState({ status: "authenticated", user, error: null });
    return user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ status: "anonymous", user: null, error: null });
  }, []);

  const updateUser = useCallback((user) => {
    setState((prev) => (prev.status === "authenticated" ? { ...prev, user } : prev));
  }, []);

  const retry = useCallback(() => {
    setState({ status: getToken() ? "loading" : "anonymous", user: null, error: null });
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ ...state, login, signup, logout, updateUser, retry }),
    [state, login, signup, logout, updateUser, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
```

파일: `frontend/src/components/ToastProvider.jsx`

``` jsx
import { useCallback, useMemo, useState } from "react";
import { ToastContext } from "../hooks/useToast";
import { errorMessage } from "../utils/format";
import Icon from "./Icon";

let nextId = 1;
const DURATION = { success: 4000, info: 3000, error: 6000 };
const ICONS = { success: "checkCircle", info: "info", error: "alert" };

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (type, message, options = {}) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { id, type, message, action: options.action }]);
      setTimeout(() => dismiss(id), options.duration ?? DURATION[type]);
      return id;
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (message, options) => push("success", message, options),
      info: (message, options) => push("info", message, options),
      error: (error, options) => push("error", errorMessage(error), options),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="region" aria-label="알림" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
            <Icon name={ICONS[toast.type]} size={20} />
            <span className="toast-message">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  dismiss(toast.id);
                  toast.action.onClick();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button type="button" className="toast-close" aria-label="알림 닫기" onClick={() => dismiss(toast.id)}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
```

파일: `frontend/src/components/DialogProvider.jsx`

``` jsx
import { useCallback, useMemo, useState } from "react";
import { DialogContext } from "../hooks/useDialogs";
import ConfirmDialog from "./ConfirmDialog";
import PromptDialog from "./PromptDialog";

let nextId = 1;

/** Promise 기반 confirm / prompt 다이얼로그 (window.confirm 대체) */
function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const open = useCallback(
    (type, options) =>
      new Promise((resolve) => {
        setDialog({ id: nextId++, type, options, resolve });
      }),
    [],
  );

  const api = useMemo(
    () => ({
      confirm: (options) => open("confirm", options),
      prompt: (options) => open("prompt", options),
    }),
    [open],
  );

  function finish(result) {
    dialog?.resolve(result);
    setDialog(null);
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog?.type === "confirm" ? <ConfirmDialog key={dialog.id} {...dialog.options} onResult={finish} /> : null}
      {dialog?.type === "prompt" ? <PromptDialog key={dialog.id} {...dialog.options} onResult={finish} /> : null}
    </DialogContext.Provider>
  );
}

export default DialogProvider;
```

## 23-2. 모달 / 대화상자

`window.confirm`/`window.prompt`는 디자인을 바꿀 수 없고 모바일에서 불편하므로
직접 만든다. `Modal`은 Esc로 닫기, Tab 포커스 가두기(focus trap), 닫힌 뒤 원래
버튼으로 포커스 돌려주기를 처리한다(키보드 사용자 접근성).

파일: `frontend/src/components/Modal.jsx`

``` jsx
import { useEffect, useId, useRef } from "react";
import useDismiss from "../hooks/useDismiss";
import Icon from "./Icon";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 공통 모달. Esc / 배경 클릭으로 닫힘, 포커스 트랩, 닫힐 때 포커스 복원.
 */
function Modal({ title, onClose, children, footer, size = "md", className = "", closeOnBackdrop = true }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useDismiss(true, onClose);

  useEffect(() => {
    const previous = document.activeElement;
    const node = dialogRef.current;
    const target = node?.querySelector("[data-autofocus]") || node?.querySelector(FOCUSABLE) || node;
    target?.focus();
    return () => {
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, []);

  function onKeyDown(event) {
    if (event.key !== "Tab") return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE) || []);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal modal-${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export default Modal;
```

파일: `frontend/src/components/ConfirmDialog.jsx`

``` jsx
import Modal from "./Modal";

function ConfirmDialog({ title, message, confirmLabel = "확인", cancelLabel = "취소", danger, onResult }) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={() => onResult(false)}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => onResult(false)}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "btn btn-danger" : "btn btn-primary"}
            onClick={() => onResult(true)}
            data-autofocus
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="dialog-message">{message}</p>
    </Modal>
  );
}

export default ConfirmDialog;
```

파일: `frontend/src/components/PromptDialog.jsx`

``` jsx
import { useEffect, useId, useRef, useState } from "react";
import Modal from "./Modal";

function PromptDialog({ title, label, initialValue = "", confirmLabel = "확인", selectBaseName, validate, onResult }) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const inputId = useId();

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = initialValue.lastIndexOf(".");
    if (selectBaseName && dot > 0) input.setSelectionRange(0, dot);
    else input.select();
  }, [initialValue, selectBaseName]);

  function submit(event) {
    event.preventDefault();
    const message = validate ? validate(value) : null;
    if (message) {
      setError(message);
      return;
    }
    onResult(value);
  }

  return (
    <Modal title={title} size="sm" onClose={() => onResult(null)}>
      <form onSubmit={submit} noValidate>
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          className={`input${error ? " has-error" : ""}`}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          autoComplete="off"
          data-autofocus
        />
        {error ? (
          <p className="field-error" id={`${inputId}-error`}>
            {error}
          </p>
        ) : null}
        <div className="modal-footer inline">
          <button type="button" className="btn btn-ghost" onClick={() => onResult(null)}>
            취소
          </button>
          <button type="submit" className="btn btn-primary">
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default PromptDialog;
```

## 23-3. 레이아웃

파일: `frontend/src/components/AppShell.jsx`

``` jsx
import { useCallback, useRef, useState } from "react";
import { getStorage } from "../api/driveApi";
import useAuth from "../hooks/useAuth";
import useItemActions from "../hooks/useItemActions";
import useLocalStorageState from "../hooks/useLocalStorageState";
import useResource from "../hooks/useResource";
import useUploads from "../hooks/useUploads";
import AccountPage from "../pages/AccountPage";
import AdminPage from "../pages/AdminPage";
import DrivePage from "../pages/DrivePage";
import EmptyState from "./EmptyState";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import UploadPanel from "./UploadPanel";

const DRIVE_VIEWS = new Set(["drive", "folder", "recent", "starred", "search", "trash"]);

/** 로그인 후 레이아웃: 상단 바 + 사이드바 + 메인 영역 + 업로드 패널 */
function AppShell({ route }) {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [viewMode, setViewMode] = useLocalStorageState("cfs_view_mode", "list");
  const fileInputRef = useRef(null);

  const uploads = useUploads();
  const dataVersion = version + uploads.completed;

  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const actions = useItemActions(refresh);
  const storage = useResource("storage", getStorage, dataVersion);

  // login/signup 라우트는 App에서 /drive로 교체되는 중 → 드라이브로 취급
  const effectiveRoute = route.name === "login" || route.name === "signup" ? { name: "drive", folderId: null } : route;
  const uploadFolderId = effectiveRoute.name === "folder" ? effectiveRoute.folderId : null;

  const pickFiles = useCallback(() => fileInputRef.current?.click(), []);
  const newFolder = useCallback(() => actions.createFolder(uploadFolderId), [actions, uploadFolderId]);
  const uploadFiles = useCallback((files) => uploads.startUpload(files, uploadFolderId), [uploads, uploadFolderId]);

  let content;
  if (DRIVE_VIEWS.has(effectiveRoute.name)) {
    content = (
      <DrivePage
        key={`${effectiveRoute.name}-${effectiveRoute.folderId ?? "root"}`}
        route={effectiveRoute}
        version={dataVersion}
        actions={actions}
        viewMode={viewMode === "grid" ? "grid" : "list"}
        onViewModeChange={setViewMode}
        onUploadFiles={uploadFiles}
        onNewFolder={newFolder}
        onPickFiles={pickFiles}
        onRefresh={refresh}
      />
    );
  } else if (effectiveRoute.name === "account") {
    content = <AccountPage storage={storage.data} />;
  } else if (effectiveRoute.name === "admin") {
    content =
      user.role === "ADMIN" ? (
        <AdminPage version={version} onChanged={refresh} />
      ) : (
        <EmptyState variant="error" title="권한이 없습니다" description="관리자만 접근할 수 있는 페이지입니다.">
          <a className="btn btn-primary" href="#/drive">
            내 드라이브로 이동
          </a>
        </EmptyState>
      );
  } else {
    content = (
      <EmptyState variant="search" title="페이지를 찾을 수 없습니다" description="주소를 다시 확인해 주세요.">
        <a className="btn btn-primary" href="#/drive">
          내 드라이브로 이동
        </a>
      </EmptyState>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <TopBar route={effectiveRoute} onOpenNav={() => setNavOpen(true)} />
      <div className="shell-body">
        <Sidebar
          route={effectiveRoute}
          open={navOpen}
          onClose={closeNav}
          storage={storage.data}
          onNewFolder={newFolder}
          onUpload={pickFiles}
        />
        <main className="main-panel" id="main-content" tabIndex={-1}>
          {content}
        </main>
      </div>
      <UploadPanel items={uploads.items} onCancel={uploads.cancel} onClear={uploads.clearFinished} />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          uploadFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export default AppShell;
```

파일: `frontend/src/components/TopBar.jsx`

``` jsx
import Icon from "./Icon";
import Logo from "./Logo";
import SearchBox from "./SearchBox";
import UserMenu from "./UserMenu";

function TopBar({ route, onOpenNav }) {
  return (
    <header className="topbar">
      <button type="button" className="icon-button nav-toggle" onClick={onOpenNav} aria-label="메뉴 열기">
        <Icon name="menu" />
      </button>
      <a href="#/drive" className="topbar-brand" aria-label="Cloud Drive 홈">
        <Logo size={34} />
      </a>
      <SearchBox route={route} />
      <div className="topbar-actions">
        <UserMenu />
      </div>
    </header>
  );
}

export default TopBar;
```

파일: `frontend/src/components/SearchBox.jsx`

``` jsx
import { useEffect, useRef, useState } from "react";
import { navigate, searchPath } from "../hooks/useHashRoute";
import Icon from "./Icon";

const DEBOUNCE_MS = 300;

/** 전역 검색창: 입력 후 300ms 디바운스로 #/search?q= 이동 */
function SearchBox({ route }) {
  const onSearch = route.name === "search";
  const routeQuery = onSearch ? route.q : "";
  const [value, setValue] = useState(routeQuery);
  const [syncedQuery, setSyncedQuery] = useState(routeQuery);
  const inputRef = useRef(null);

  // 라우트가 외부에서 바뀌면(뒤로가기, 다른 메뉴 클릭) 입력값 동기화
  if (routeQuery !== syncedQuery) {
    setSyncedQuery(routeQuery);
    if (value.trim() !== routeQuery.trim()) setValue(routeQuery);
  }

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === routeQuery.trim()) return undefined;
    const timer = setTimeout(() => {
      if (trimmed) navigate(searchPath(trimmed), { replace: onSearch });
      else if (onSearch) navigate("/drive");
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, routeQuery, onSearch]);

  function submit(event) {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) navigate(searchPath(trimmed), { replace: onSearch });
  }

  return (
    <form className="search-box" role="search" onSubmit={submit}>
      <Icon name="search" size={20} className="search-icon" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.stopPropagation();
            setValue("");
          }
        }}
        placeholder="드라이브에서 검색"
        aria-label="드라이브에서 검색"
      />
      {value ? (
        <button
          type="button"
          className="icon-button small"
          aria-label="검색어 지우기"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
        >
          <Icon name="close" size={18} />
        </button>
      ) : null}
    </form>
  );
}

export default SearchBox;
```

파일: `frontend/src/components/UserMenu.jsx`

``` jsx
import { useState } from "react";
import useAuth from "../hooks/useAuth";
import { navigate } from "../hooks/useHashRoute";
import Avatar from "./Avatar";
import Menu from "./Menu";

function UserMenu() {
  const { user, logout } = useAuth();
  const [position, setPosition] = useState(null);

  function toggle(event) {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.right, y: rect.bottom + 6, alignRight: true });
  }

  const items = [
    { key: "account", label: "내 계정", icon: "user", onSelect: () => navigate("/account") },
    ...(user?.role === "ADMIN"
      ? [{ key: "admin", label: "관리자", icon: "shield", onSelect: () => navigate("/admin") }]
      : []),
    { key: "d1", divider: true },
    {
      key: "logout",
      label: "로그아웃",
      icon: "logout",
      onSelect: () => {
        logout();
        navigate("/login", { replace: true });
      },
    },
  ];

  return (
    <>
      <button
        type="button"
        className="avatar-button"
        onClick={toggle}
        onMouseDown={(event) => position && event.stopPropagation()}
        aria-label={`계정 메뉴: ${user?.name ?? ""}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
      >
        <Avatar user={user} size={34} />
      </button>
      {position ? (
        <Menu
          position={position}
          onClose={() => setPosition(null)}
          items={items}
          label="계정 메뉴"
          className="user-menu"
          header={
            <div className="menu-header">
              <Avatar user={user} size={44} />
              <div className="menu-header-text">
                <strong>{user?.name}</strong>
                <span>{user?.email}</span>
                {user?.role === "ADMIN" ? <span className="badge">관리자</span> : null}
              </div>
            </div>
          }
        />
      ) : null}
    </>
  );
}

export default UserMenu;
```

파일: `frontend/src/components/Sidebar.jsx`

``` jsx
import useDismiss from "../hooks/useDismiss";
import Icon from "./Icon";
import Logo from "./Logo";
import NewMenuButton from "./NewMenuButton";
import StorageMeter from "./StorageMeter";

const NAV = [
  { name: "drive", href: "#/drive", label: "내 드라이브", icon: "drive" },
  { name: "recent", href: "#/recent", label: "최근 문서함", icon: "clock" },
  { name: "starred", href: "#/starred", label: "중요 문서함", icon: "star" },
  { name: "trash", href: "#/trash", label: "휴지통", icon: "trash" },
];

function Sidebar({ route, open, onClose, storage, onNewFolder, onUpload }) {
  useDismiss(open, onClose);
  const active = route.name === "folder" ? "drive" : route.name;

  return (
    <>
      <div className={`drawer-backdrop${open ? " visible" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="탐색">
        <div className="drawer-head">
          <Logo size={32} />
          <button type="button" className="icon-button" onClick={onClose} aria-label="메뉴 닫기">
            <Icon name="close" />
          </button>
        </div>
        <NewMenuButton
          onNewFolder={() => {
            onClose();
            onNewFolder();
          }}
          onUpload={() => {
            onClose();
            onUpload();
          }}
        />
        <nav className="side-nav">
          {NAV.map((item) => (
            <a
              key={item.name}
              href={item.href}
              className={`side-link${active === item.name ? " active" : ""}`}
              aria-current={active === item.name ? "page" : undefined}
              onClick={onClose}
            >
              <Icon name={active === item.name && item.icon === "star" ? "starFilled" : item.icon} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <StorageMeter storage={storage} />
      </aside>
    </>
  );
}

export default Sidebar;
```

파일: `frontend/src/components/NewMenuButton.jsx`

``` jsx
import { useState } from "react";
import Icon from "./Icon";
import Menu from "./Menu";

/** "+ 새로 만들기" 버튼 (사이드바) / 모바일 FAB */
function NewMenuButton({ onNewFolder, onUpload, variant = "sidebar" }) {
  const [position, setPosition] = useState(null);

  function open(event) {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition(
      variant === "fab"
        ? { x: rect.right, y: rect.top - 8, alignRight: true, flipY: rect.top - 8 }
        : { x: rect.left, y: rect.bottom + 6 },
    );
  }

  return (
    <>
      <button
        type="button"
        className={variant === "fab" ? "fab" : "new-button"}
        onClick={open}
        onMouseDown={(event) => position && event.stopPropagation()}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        aria-label={variant === "fab" ? "새로 만들기" : undefined}
      >
        <Icon name="plus" size={variant === "fab" ? 26 : 22} strokeWidth={2.2} />
        {variant === "fab" ? null : <span>새로 만들기</span>}
      </button>
      {position ? (
        <Menu
          position={position}
          onClose={() => setPosition(null)}
          label="새로 만들기"
          items={[
            { key: "folder", label: "새 폴더", icon: "folderPlus", onSelect: onNewFolder },
            { key: "d", divider: true },
            { key: "upload", label: "파일 업로드", icon: "fileUpload", onSelect: onUpload },
          ]}
        />
      ) : null}
    </>
  );
}

export default NewMenuButton;
```

파일: `frontend/src/components/StorageMeter.jsx`

``` jsx
import { formatBytes } from "../utils/format";

function StorageMeter({ storage }) {
  const used = storage?.used ?? 0;
  const limit = storage?.limit ?? 0;
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 0;
  const level = ratio >= 0.95 ? "danger" : ratio >= 0.8 ? "warn" : "ok";

  return (
    <div className="storage-meter">
      <div className="storage-title">저장용량</div>
      <div
        className={`meter meter-${level}`}
        role="progressbar"
        aria-label="저장 공간 사용량"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <span style={{ width: `${Math.max(ratio * 100, storage ? 1 : 0)}%` }} />
      </div>
      <div className="storage-text">
        {storage ? `${formatBytes(used)} / ${formatBytes(limit)} 사용` : "용량 확인 중…"}
      </div>
    </div>
  );
}

export default StorageMeter;
```

파일: `frontend/src/components/Breadcrumb.jsx`

``` jsx
import Icon from "./Icon";

/** 내 드라이브 > A > B (마지막 항목은 현재 폴더) */
function Breadcrumb({ path }) {
  const crumbs = [{ id: null, name: "내 드라이브" }, ...path];
  return (
    <nav className="breadcrumb" aria-label="현재 위치">
      <ol>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.id ?? "root"}>
              {index > 0 ? <Icon name="chevronRight" size={18} className="crumb-sep" /> : null}
              {last ? (
                <h1 className="crumb current" aria-current="page" title={crumb.name}>
                  {crumb.name}
                </h1>
              ) : (
                <a className="crumb" href={crumb.id === null ? "#/drive" : `#/folders/${crumb.id}`} title={crumb.name}>
                  {crumb.name}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumb;
```

## 23-4. 목록 / 메뉴 / 이동

파일: `frontend/src/components/ItemList.jsx`

``` jsx
import { KIND_LABEL, fileKind } from "../utils/fileTypes";
import { formatBytes, formatDateTime, formatShortDate } from "../utils/format";
import FileIcon from "./FileIcon";
import Icon from "./Icon";
import { itemKey } from "../utils/items";

function dateOf(item, view) {
  return view === "trash" ? item.trashedAt || item.updatedAt : item.updatedAt || item.createdAt;
}

function SortHeader({ label, field, sort, onSortChange, className }) {
  const active = sort.key === field;
  return (
    <div className={`col ${className}`} role="columnheader" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={`sort-header${active ? " active" : ""}`}
        onClick={() =>
          onSortChange(active ? { key: field, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: field, dir: field === "name" ? "asc" : "desc" })
        }
      >
        {label}
        {active ? <Icon name={sort.dir === "asc" ? "arrowUp" : "arrowDown"} size={15} /> : null}
      </button>
    </div>
  );
}

function MoreButton({ item, onMenu }) {
  return (
    <button
      type="button"
      className="icon-button more-button"
      aria-label={`${item.name} 작업 더보기`}
      aria-haspopup="menu"
      onClick={(event) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onMenu(item, { x: rect.right, y: rect.bottom + 2, alignRight: true, flipY: rect.top - 2 });
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Icon name="more" />
    </button>
  );
}

function itemHandlers(item, { onSelect, onOpen, onMenu, onDeleteKey }) {
  return {
    tabIndex: 0,
    onClick: () => onSelect(item),
    onDoubleClick: () => onOpen(item),
    onContextMenu: (event) => {
      event.preventDefault();
      onSelect(item, { keepFocus: true });
      onMenu(item, { x: event.clientX, y: event.clientY });
    },
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter") {
        event.preventDefault();
        onOpen(item);
      } else if (event.key === " ") {
        event.preventDefault();
        onSelect(item);
      } else if (event.key === "Delete") {
        event.preventDefault();
        onDeleteKey(item);
      } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onMenu(item, { x: rect.left + 24, y: rect.bottom, flipY: rect.top });
      }
    },
  };
}

function ItemName({ item }) {
  return (
    <>
      <span className="item-name-text" title={item.name}>
        {item.name}
      </span>
      {item.starred ? <Icon name="starFilled" size={15} className="star-badge" title="중요" /> : null}
    </>
  );
}

function ListView({ items, view, selectedKey, sort, onSortChange, handlers }) {
  return (
    <div className="item-table" role="table" aria-label="파일 목록">
      <div className="item-table-head" role="row">
        <SortHeader label="이름" field="name" sort={sort} onSortChange={onSortChange} className="col-name" />
        <SortHeader
          label={view === "trash" ? "삭제한 날짜" : "수정한 날짜"}
          field="date"
          sort={sort}
          onSortChange={onSortChange}
          className="col-date"
        />
        <SortHeader label="파일 크기" field="size" sort={sort} onSortChange={onSortChange} className="col-size" />
        <div className="col col-actions" role="columnheader">
          <span className="sr-only">작업</span>
        </div>
      </div>
      <ul className="item-rows" role="rowgroup">
        {items.map((item) => {
          const key = itemKey(item);
          const date = dateOf(item, view);
          return (
            <li
              key={key}
              role="row"
              className={`item-row${selectedKey === key ? " selected" : ""}`}
              aria-selected={selectedKey === key}
              aria-label={`${item.kind === "folder" ? "폴더" : KIND_LABEL[fileKind(item)]} ${item.name}`}
              data-item-key={key}
              {...itemHandlers(item, handlers)}
            >
              <div className="col col-name" role="cell">
                <FileIcon item={item} size={24} />
                <div className="item-name">
                  <div className="item-name-line">
                    <ItemName item={item} />
                  </div>
                  <span className="item-sub">
                    {formatShortDate(date)}
                    {item.kind === "file" ? ` · ${formatBytes(item.size)}` : ""}
                  </span>
                </div>
              </div>
              <div className="col col-date" role="cell" title={formatDateTime(date)}>
                {formatShortDate(date)}
              </div>
              <div className="col col-size" role="cell">
                {item.kind === "file" ? formatBytes(item.size) : "—"}
              </div>
              <div className="col col-actions" role="cell">
                <MoreButton item={item} onMenu={handlers.onMenu} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GridSection({ title, items, selectedKey, handlers, view }) {
  if (items.length === 0) return null;
  return (
    <section className="grid-section" aria-label={title}>
      <h2 className="grid-title">{title}</h2>
      <ul className={items[0].kind === "folder" ? "folder-grid" : "file-grid"}>
        {items.map((item) => {
          const key = itemKey(item);
          const selected = selectedKey === key;
          if (item.kind === "folder") {
            return (
              <li
                key={key}
                className={`folder-card${selected ? " selected" : ""}`}
                aria-label={`폴더 ${item.name}`}
                aria-selected={selected}
                data-item-key={key}
                {...itemHandlers(item, handlers)}
              >
                <FileIcon item={item} size={24} />
                <span className="card-name">
                  <ItemName item={item} />
                </span>
                <MoreButton item={item} onMenu={handlers.onMenu} />
              </li>
            );
          }
          return (
            <li
              key={key}
              className={`file-card${selected ? " selected" : ""}`}
              aria-label={`${KIND_LABEL[fileKind(item)]} ${item.name}`}
              aria-selected={selected}
              data-item-key={key}
              {...itemHandlers(item, handlers)}
            >
              <div className="card-head">
                <FileIcon item={item} size={20} />
                <span className="card-name">
                  <ItemName item={item} />
                </span>
                <MoreButton item={item} onMenu={handlers.onMenu} />
              </div>
              <div className={`card-thumb kind-bg-${fileKind(item)}`}>
                <FileIcon item={item} size={64} />
              </div>
              <div className="card-meta">
                {formatShortDate(dateOf(item, view))} · {formatBytes(item.size)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 목록/바둑판 보기 */
function ItemList({ items, viewMode, view, selectedKey, sort, onSortChange, onSelect, onOpen, onMenu, onDeleteKey }) {
  const handlers = { onSelect, onOpen, onMenu, onDeleteKey };
  if (viewMode === "grid") {
    const folders = items.filter((item) => item.kind === "folder");
    const files = items.filter((item) => item.kind === "file");
    return (
      <div className="item-grid-wrap">
        <GridSection title="폴더" items={folders} selectedKey={selectedKey} handlers={handlers} view={view} />
        <GridSection title="파일" items={files} selectedKey={selectedKey} handlers={handlers} view={view} />
      </div>
    );
  }
  return (
    <ListView
      items={items}
      view={view}
      selectedKey={selectedKey}
      sort={sort}
      onSortChange={onSortChange}
      handlers={handlers}
    />
  );
}

export function ItemListSkeleton({ viewMode }) {
  if (viewMode === "grid") {
    return (
      <div className="item-grid-wrap" aria-busy="true" aria-label="불러오는 중">
        <ul className="file-grid">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index} className="file-card skeleton-card">
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-thumb" />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="item-table" aria-busy="true" aria-label="불러오는 중">
      <ul className="item-rows">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index} className="item-row skeleton-row">
            <span className="skeleton skeleton-icon" />
            <span className="skeleton skeleton-line" style={{ width: `${30 + ((index * 17) % 40)}%` }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ItemList;
```

파일: `frontend/src/components/Menu.jsx`

``` jsx
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import useDismiss from "../hooks/useDismiss";
import Icon from "./Icon";

/**
 * 팝업 메뉴 (⋮ 메뉴, 우클릭 컨텍스트 메뉴, 새로 만들기, 사용자 메뉴 공용).
 * position: { x, y, alignRight?, flipY? }  (viewport 좌표)
 * items: [{ key, label, icon, onSelect, danger, disabled } | { key, divider: true }]
 */
function Menu({ position, items, onClose, header, label = "메뉴", className = "" }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useDismiss(true, onClose, ref);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { innerWidth, innerHeight } = window;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    let left = position.alignRight ? position.x - width : position.x;
    left = Math.max(8, Math.min(left, innerWidth - width - 8));
    let top = position.y;
    if (top + height > innerHeight - 8) {
      top = Math.max(8, (position.flipY ?? position.y) - height);
    }
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.style.visibility = "visible";
  }, [position]);

  useEffect(() => {
    const previous = document.activeElement;
    const first = ref.current?.querySelector('[role="menuitem"]:not([disabled])');
    first?.focus();

    function close() {
      onCloseRef.current();
    }
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      // 메뉴가 닫히면 포커스를 연 요소로 되돌림 (다른 곳을 클릭해 닫힌 경우 제외)
      const active = document.activeElement;
      if (previous instanceof HTMLElement && previous.isConnected && (!active || active === document.body)) {
        previous.focus();
      }
    };
  }, []);

  function onKeyDown(event) {
    const nodes = Array.from(ref.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || []);
    const index = nodes.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      nodes[(index + 1) % nodes.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nodes[(index - 1 + nodes.length) % nodes.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      nodes[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (event.key === "Tab") {
      onClose();
    }
  }

  return createPortal(
    <div
      ref={ref}
      className={`menu ${className}`}
      role="menu"
      aria-label={label}
      style={{ left: position.x, top: position.y, visibility: "hidden" }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {header}
      {items.map((item) =>
        item.divider ? (
          <div key={item.key} className="menu-divider" role="separator" />
        ) : (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className={`menu-item${item.danger ? " danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect?.();
            }}
          >
            {item.icon ? <Icon name={item.icon} size={18} /> : <span className="menu-icon-space" />}
            <span>{item.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

export default Menu;
```

`MoveDialog`는 `/api/folders/tree`로 전체 폴더를 받아 트리를 그린다. 폴더를 옮길
때는 **자기 자신과 하위 폴더를 목록에서 뺀다.** (서버도 400으로 막지만, 애초에
고를 수 없게 하는 것이 친절하다.)

파일: `frontend/src/components/MoveDialog.jsx`

``` jsx
import { useEffect, useMemo, useState } from "react";
import { getFolderTree } from "../api/folderApi";
import { errorMessage } from "../utils/format";
import Icon from "./Icon";
import Modal from "./Modal";
import Spinner from "./Spinner";

const ROOT = "root";

function buildTree(folders, excludeId) {
  const children = new Map();
  folders.forEach((folder) => {
    const parent = folder.parentFolderId ?? ROOT;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(folder);
  });
  children.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name, "ko")));

  // 폴더 이동 시 자기 자신과 하위 폴더 제외
  const excluded = new Set();
  if (excludeId !== null) {
    const stack = [excludeId];
    while (stack.length) {
      const id = stack.pop();
      excluded.add(id);
      (children.get(id) || []).forEach((child) => stack.push(child.id));
    }
  }
  return { children, excluded };
}

function TreeNode({ folder, depth, tree, selected, expanded, onSelect, onToggle, onConfirm }) {
  const kids = (tree.children.get(folder.id) || []).filter((child) => !tree.excluded.has(child.id));
  const isOpen = expanded.has(folder.id);
  return (
    <li role="treeitem" aria-expanded={kids.length ? isOpen : undefined} aria-selected={selected === folder.id}>
      <div className={`tree-row${selected === folder.id ? " selected" : ""}`} style={{ paddingLeft: 8 + depth * 18 }}>
        {kids.length ? (
          <button
            type="button"
            className="tree-toggle"
            onClick={() => onToggle(folder.id)}
            aria-label={isOpen ? `${folder.name} 접기` : `${folder.name} 펼치기`}
          >
            <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={16} />
          </button>
        ) : (
          <span className="tree-toggle-space" />
        )}
        <button
          type="button"
          className="tree-label"
          onClick={() => onSelect(folder.id)}
          onDoubleClick={() => onConfirm(folder.id)}
        >
          <Icon name="folder" size={18} />
          <span>{folder.name}</span>
        </button>
      </div>
      {isOpen && kids.length ? (
        <ul role="group">
          {kids.map((child) => (
            <TreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              tree={tree}
              selected={selected}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
              onConfirm={onConfirm}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** 폴더 트리에서 이동 위치 선택 (null = 내 드라이브) */
function MoveDialog({ item, onClose, onMove }) {
  const currentParent = (item.kind === "folder" ? item.parentFolderId : item.folderId) ?? null;
  const [result, setResult] = useState({ folders: null, error: null });
  const [selected, setSelected] = useState(currentParent);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    getFolderTree().then(
      (folders) => {
        if (!alive) return;
        const list = Array.isArray(folders) ? folders : [];
        // 현재 위치까지 펼쳐 두기
        const byId = new Map(list.map((folder) => [folder.id, folder]));
        const open = new Set();
        let cursor = currentParent === null ? null : byId.get(currentParent);
        while (cursor) {
          if (cursor.parentFolderId != null) open.add(cursor.parentFolderId);
          cursor = cursor.parentFolderId == null ? null : byId.get(cursor.parentFolderId);
        }
        setExpanded(open);
        setResult({ folders: list, error: null });
      },
      (error) => {
        if (alive) setResult({ folders: null, error });
      },
    );
    return () => {
      alive = false;
    };
  }, [currentParent]);

  const tree = useMemo(
    () => buildTree(result.folders || [], item.kind === "folder" ? item.id : null),
    [result.folders, item],
  );
  const rootChildren = (tree.children.get(ROOT) || []).filter((folder) => !tree.excluded.has(folder.id));

  const nameOf = (id) =>
    id === null ? "내 드라이브" : (result.folders || []).find((folder) => folder.id === id)?.name ?? "폴더";

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm(target = selected) {
    if (target === currentParent) return;
    onMove(target, nameOf(target));
  }

  const same = selected === currentParent;

  return (
    <Modal
      title={`"${item.name}" 이동`}
      onClose={onClose}
      footer={
        <>
          <span className="move-hint">{same ? "현재 위치입니다" : `${nameOf(selected)}(으)로 이동`}</span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn btn-primary" disabled={same || !result.folders} onClick={() => confirm()}>
            여기로 이동
          </button>
        </>
      }
    >
      {result.error ? (
        <p className="form-alert" role="alert">
          <Icon name="alert" size={18} />
          {errorMessage(result.error, "폴더 목록을 불러오지 못했습니다.")}
        </p>
      ) : !result.folders ? (
        <div className="center-pad">
          <Spinner />
        </div>
      ) : (
        <ul className="folder-tree" role="tree" aria-label="이동할 폴더">
          <li role="treeitem" aria-selected={selected === null} aria-expanded>
            <div className={`tree-row${selected === null ? " selected" : ""}`} style={{ paddingLeft: 8 }}>
              <span className="tree-toggle-space" />
              <button
                type="button"
                className="tree-label"
                onClick={() => setSelected(null)}
                onDoubleClick={() => confirm(null)}
              >
                <Icon name="drive" size={18} />
                <span>내 드라이브</span>
              </button>
            </div>
            <ul role="group">
              {rootChildren.map((folder) => (
                <TreeNode
                  key={folder.id}
                  folder={folder}
                  depth={1}
                  tree={tree}
                  selected={selected}
                  expanded={expanded}
                  onSelect={setSelected}
                  onToggle={toggle}
                  onConfirm={confirm}
                />
              ))}
            </ul>
          </li>
        </ul>
      )}
    </Modal>
  );
}

export default MoveDialog;
```

## 23-5. 미리보기 / 업로드 패널

`PreviewContent`는 파일마다 인증된 요청으로 blob을 받아 object URL을 만들고,
다른 파일로 넘어가거나 닫으면 `AbortController`로 요청을 취소하고 URL을 해제한다.
HTML/SVG/XML은 텍스트로만 표시한다(19-3).

파일: `frontend/src/components/PreviewModal.jsx`

``` jsx
import { useEffect, useRef, useState } from "react";
import { fetchPreviewBlob } from "../api/fileApi";
import useDismiss from "../hooks/useDismiss";
import { KIND_LABEL, fileKind, isUnsafeType, previewKind } from "../utils/fileTypes";
import { errorMessage, formatBytes, formatDateTime } from "../utils/format";
import FileIcon from "./FileIcon";
import Icon from "./Icon";
import Spinner from "./Spinner";

const FORCED_TYPE = { pdf: "application/pdf" };

function Unsupported({ file, onDownload, message }) {
  return (
    <div className="preview-unsupported">
      <FileIcon item={file} size={72} />
      <h3>{message || "미리보기를 지원하지 않는 형식입니다"}</h3>
      <p>
        {KIND_LABEL[fileKind(file)]} · {formatBytes(file.size)}
      </p>
      <button type="button" className="btn btn-primary" onClick={() => onDownload(file)}>
        <Icon name="download" size={18} />
        다운로드
      </button>
    </div>
  );
}

/** 파일 하나의 미리보기. 인증된 fetch → blob object URL, 언마운트 시 revoke */
function PreviewContent({ file, onDownload }) {
  const kind = previewKind(file);
  const [state, setState] = useState({ status: kind ? "loading" : "unsupported" });

  useEffect(() => {
    if (!kind) return undefined;
    let alive = true;
    let url = null;
    const controller = new AbortController();

    fetchPreviewBlob(file.id, controller.signal)
      .then(async (blob) => {
        if (!alive) return;
        // HTML/SVG/XML 등은 blob URL로 렌더링하지 않고 텍스트로만 표시
        if (kind === "text" || isUnsafeType(blob.type)) {
          const text = await blob.text();
          if (alive) setState({ status: "ready", text, asText: true });
          return;
        }
        let wanted =
          FORCED_TYPE[kind] ||
          (!blob.type || blob.type === "application/octet-stream" ? file.contentType : blob.type) ||
          "";
        if (isUnsafeType(wanted)) wanted = "application/octet-stream";
        const typed = blob.type === wanted ? blob : new Blob([blob], { type: wanted });
        url = URL.createObjectURL(typed);
        setState({ status: "ready", url });
      })
      .catch((error) => {
        if (alive && error?.name !== "AbortError") setState({ status: "error", error });
      });

    return () => {
      alive = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.id, file.contentType, kind]);

  if (state.status === "unsupported") return <Unsupported file={file} onDownload={onDownload} />;
  if (state.status === "loading") {
    return (
      <div className="preview-loading">
        <Spinner size={40} label="미리보기 불러오는 중" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Unsupported
        file={file}
        onDownload={onDownload}
        message={errorMessage(state.error, "미리보기를 불러오지 못했습니다")}
      />
    );
  }
  if (state.status === "media-error") {
    return <Unsupported file={file} onDownload={onDownload} message="이 브라우저에서 재생할 수 없는 형식입니다" />;
  }

  const onMediaError = () => setState({ status: "media-error" });

  if (state.asText) return <pre className="preview-text">{state.text}</pre>;

  switch (kind) {
    case "image":
      return <img className="preview-image" src={state.url} alt={file.name} onError={onMediaError} />;
    case "video":
      return <video className="preview-video" src={state.url} controls autoPlay onError={onMediaError} />;
    case "audio":
      return (
        <div className="preview-audio">
          <FileIcon item={file} size={96} />
          <audio src={state.url} controls autoPlay onError={onMediaError} />
        </div>
      );
    case "pdf":
      return (
        <object className="preview-pdf" data={state.url} type="application/pdf" aria-label={file.name}>
          <Unsupported file={file} onDownload={onDownload} message="이 브라우저에서는 PDF를 표시할 수 없습니다" />
        </object>
      );
    default:
      return <Unsupported file={file} onDownload={onDownload} />;
  }
}

/** 전체 화면 미리보기 (← → 로 목록 내 다른 파일 이동) */
function PreviewModal({ files, initialFile, onClose, onDownload }) {
  const [currentId, setCurrentId] = useState(initialFile.id);
  const closeRef = useRef(null);
  useDismiss(true, onClose);

  const index = files.findIndex((file) => file.id === currentId);
  const file = index >= 0 ? files[index] : initialFile;
  const prev = index > 0 ? files[index - 1] : null;
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null;

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "VIDEO", "AUDIO"].includes(event.target.tagName)) return;
      if (event.key === "ArrowLeft" && prev) setCurrentId(prev.id);
      if (event.key === "ArrowRight" && next) setCurrentId(next.id);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [prev, next]);

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label={`미리보기: ${file.name}`}>
      <header className="preview-bar">
        <button ref={closeRef} type="button" className="icon-button on-dark" onClick={onClose} aria-label="미리보기 닫기">
          <Icon name="close" />
        </button>
        <FileIcon item={file} size={24} />
        <div className="preview-title">
          <strong title={file.name}>{file.name}</strong>
          <span>
            {formatBytes(file.size)} · {formatDateTime(file.updatedAt || file.createdAt)}
          </span>
        </div>
        <button type="button" className="btn btn-on-dark" onClick={() => onDownload(file)}>
          <Icon name="download" size={18} />
          <span className="hide-sm">다운로드</span>
        </button>
      </header>
      <div
        className="preview-stage"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <PreviewContent key={file.id} file={file} onDownload={onDownload} />
      </div>
      {prev ? (
        <button type="button" className="preview-nav prev" onClick={() => setCurrentId(prev.id)} aria-label="이전 파일">
          <Icon name="chevronLeft" size={28} />
        </button>
      ) : null}
      {next ? (
        <button type="button" className="preview-nav next" onClick={() => setCurrentId(next.id)} aria-label="다음 파일">
          <Icon name="chevronRight" size={28} />
        </button>
      ) : null}
    </div>
  );
}

export default PreviewModal;
```

파일: `frontend/src/components/UploadPanel.jsx`

``` jsx
import { useState } from "react";
import { formatBytes } from "../utils/format";
import FileIcon from "./FileIcon";
import Icon from "./Icon";

function statusText(item) {
  switch (item.status) {
    case "queued":
      return "대기 중";
    case "uploading":
      return `${item.progress}% · ${formatBytes(item.size)}`;
    case "done":
      return formatBytes(item.size);
    case "canceled":
      return "취소됨";
    default:
      return item.error || "실패";
  }
}

/** 오른쪽 아래 업로드 진행 패널 */
function UploadPanel({ items, onCancel, onClear }) {
  const [collapsed, setCollapsed] = useState(false);
  if (items.length === 0) return null;

  const active = items.filter((item) => item.status === "queued" || item.status === "uploading").length;
  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "error").length;

  let title;
  if (active > 0) title = `${active}개 항목 업로드 중`;
  else if (failed > 0) title = `${done}개 완료, ${failed}개 실패`;
  else title = `${done}개 업로드 완료`;

  return (
    <section className={`upload-panel${collapsed ? " collapsed" : ""}`} aria-label="업로드 진행 상황">
      <header className="upload-head">
        <strong aria-live="polite">{title}</strong>
        <button
          type="button"
          className="icon-button small on-dark"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "업로드 목록 펼치기" : "업로드 목록 접기"}
          aria-expanded={!collapsed}
        >
          <Icon name="chevronDown" className={collapsed ? "rot-180" : ""} size={20} />
        </button>
        {active === 0 ? (
          <button type="button" className="icon-button small on-dark" onClick={onClear} aria-label="업로드 목록 닫기">
            <Icon name="close" size={20} />
          </button>
        ) : null}
      </header>
      {collapsed ? null : (
        <ul className="upload-list">
          {items.map((item) => (
            <li key={item.id} className={`upload-item status-${item.status}`}>
              <FileIcon item={{ kind: "file", name: item.name }} size={26} />
              <div className="upload-info">
                <span className="upload-name" title={item.name}>
                  {item.name}
                </span>
                <span className="upload-status">{statusText(item)}</span>
                {item.status === "uploading" ? (
                  <span className="upload-bar" aria-hidden="true">
                    <span style={{ width: `${item.progress}%` }} />
                  </span>
                ) : null}
              </div>
              {item.status === "done" ? (
                <Icon name="checkCircle" className="upload-ok" size={22} title="완료" />
              ) : item.status === "error" ? (
                <Icon name="alert" className="upload-fail" size={22} title="실패" />
              ) : item.status === "queued" || item.status === "uploading" ? (
                <button
                  type="button"
                  className="icon-button small"
                  onClick={() => onCancel(item.id)}
                  aria-label={`${item.name} 업로드 취소`}
                >
                  <Icon name="close" size={18} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default UploadPanel;
```

## 23-6. 작은 표시용 컴포넌트

파일: `frontend/src/components/EmptyState.jsx`

``` jsx
/* 친근한 일러스트 스타일의 빈 상태 */
function Illustration({ variant }) {
  const common = (
    <>
      <ellipse cx="80" cy="128" rx="58" ry="8" className="ill-shadow" />
      <circle cx="30" cy="30" r="4" className="ill-dot" />
      <circle cx="138" cy="44" r="3" className="ill-dot" />
      <circle cx="126" cy="16" r="2" className="ill-dot" />
    </>
  );

  switch (variant) {
    case "trash":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <rect x="52" y="38" width="56" height="10" rx="5" className="ill-accent" />
          <rect x="70" y="30" width="20" height="10" rx="4" className="ill-accent" />
          <path d="M56 52h48l-5 66a6 6 0 0 1-6 5.5H67a6 6 0 0 1-6-5.5z" className="ill-paper" />
          <path d="M71 64v46M80 64v46M89 64v46" className="ill-line" />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <path
            d="M80 22l15 30 33 5-24 23 6 33-30-16-30 16 6-33-24-23 33-5z"
            className="ill-paper"
          />
          <path d="M80 44l8 16 17 3-12 12 3 17-16-8-16 8 3-17-12-12 17-3z" className="ill-accent" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <rect x="34" y="28" width="62" height="80" rx="8" className="ill-paper" />
          <path d="M46 48h38M46 60h30M46 72h34" className="ill-line" />
          <circle cx="102" cy="82" r="20" className="ill-lens" />
          <path d="M116 96l16 16" className="ill-handle" />
        </svg>
      );
    case "recent":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <circle cx="80" cy="70" r="46" className="ill-paper" />
          <circle cx="80" cy="70" r="34" className="ill-accent-soft" />
          <path d="M80 48v24l16 10" className="ill-handle" />
        </svg>
      );
    case "error":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <path d="M31 57a18 18 0 0 1 20-27 26 26 0 0 1 48 6 18 18 0 0 1 21 26z" className="ill-paper" />
          <path d="M70 84l20 20M90 84l-20 20" className="ill-handle" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <circle cx="80" cy="54" r="22" className="ill-accent-soft" />
          <path d="M40 120a40 40 0 0 1 80 0z" className="ill-paper" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <path d="M28 44a8 8 0 0 1 8-8h28l10 10h50a8 8 0 0 1 8 8v58a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8z" className="ill-folder-back" />
          <rect x="48" y="30" width="58" height="50" rx="6" className="ill-paper" transform="rotate(-6 77 55)" />
          <path d="M28 62h104v50a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8z" className="ill-folder" />
          <path d="M70 90h20M80 80v20" className="ill-plus" />
        </svg>
      );
  }
}

function EmptyState({ variant = "folder", title, description, children }) {
  return (
    <div className="empty-state">
      <div className="empty-illustration">
        <Illustration variant={variant} />
      </div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children ? <div className="empty-actions">{children}</div> : null}
    </div>
  );
}

export default EmptyState;
```

파일: `frontend/src/components/FileIcon.jsx`

``` jsx
import { fileKind } from "../utils/fileTypes";

/* 파일 종류별 컬러 아이콘 (인라인 SVG) */
const GLYPHS = {
  image: (
    <>
      <circle cx="9" cy="9.5" r="1.6" fill="#fff" />
      <path d="M6 17l3.8-4.2 2.6 2.7 2-2 3.6 3.5z" fill="#fff" />
    </>
  ),
  video: <path d="M9.5 8v8l6.5-4z" fill="#fff" />,
  audio: (
    <>
      <path d="M10 15.5V7.5l7-1.5v8" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
      <circle cx="8.6" cy="15.6" r="1.8" fill="#fff" />
      <circle cx="15.6" cy="14.1" r="1.8" fill="#fff" />
    </>
  ),
  pdf: (
    <text x="12" y="14.6" textAnchor="middle" fontSize="6.4" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
      PDF
    </text>
  ),
  doc: <path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />,
  text: <path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />,
  sheet: (
    <path
      d="M7 7.5h10v9H7zM7 10.5h10M7 13.5h10M11 7.5v9"
      stroke="#fff"
      strokeWidth="1.4"
      fill="none"
    />
  ),
  slides: (
    <>
      <rect x="7" y="8" width="10" height="7" rx="1" stroke="#fff" strokeWidth="1.5" fill="none" />
      <path d="M12 15v2" stroke="#fff" strokeWidth="1.5" />
    </>
  ),
  archive: (
    <path
      d="M12 6v1.5M12 9v1.5M12 12v1.5M10.5 14.5h3v2.5h-3z"
      stroke="#fff"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
    />
  ),
  code: (
    <path
      d="M9.5 8.5L6.5 12l3 3.5M14.5 8.5l3 3.5-3 3.5"
      stroke="#fff"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  other: (
    <path d="M9 7h4l3 3v7H9z" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
  ),
};

function FileIcon({ item, size = 24 }) {
  if (item.kind === "folder") {
    return (
      <svg className="file-icon kind-folder" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M2.5 6.5A2 2 0 0 1 4.5 4.5h4.6l2 2.2h8.4a2 2 0 0 1 2 2v9.8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z"
          fill="var(--folder-color)"
        />
        <path d="M2.5 9.2h19v9.3a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z" fill="var(--folder-front)" />
      </svg>
    );
  }

  const kind = fileKind(item);
  return (
    <svg className={`file-icon kind-${kind}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="currentColor" />
      {GLYPHS[kind] || GLYPHS.other}
    </svg>
  );
}

export default FileIcon;
```

파일: `frontend/src/components/Icon.jsx`

``` jsx
/* 인라인 SVG 아이콘 세트 (24x24, stroke 기반) */
const PATHS = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  more: (
    <>
      <circle cx="12" cy="5.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  drive: (
    <>
      <path d="M3 13.5l2.6-7.1A2 2 0 0 1 7.5 5h9a2 2 0 0 1 1.9 1.4l2.6 7.1" />
      <rect x="3" y="13.5" width="18" height="5.5" rx="2" />
      <path d="M7 16.25h.01M10 16.25h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  star: (
    <path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.6l-5 2.6.9-5.6-4-3.9 5.6-.8z" />
  ),
  starFilled: (
    <path
      d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.6l-5 2.6.9-5.6-4-3.9 5.6-.8z"
      fill="currentColor"
    />
  ),
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 1.8h6A2 2 0 0 0 17 19l1-12" />
      <path d="M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" />
    </>
  ),
  restore: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4.5h4.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M7 10.5l5 5 5-5" />
      <path d="M5 19.5h14" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5M7 9.5l5-5 5 5" />
      <path d="M5 19.5h14" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  move: (
    <>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M10 13.5h6M13.5 11l2.5 2.5-2.5 2.5" />
    </>
  ),
  folder: (
    <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  ),
  folderPlus: (
    <>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M12 11v6M9 14h6" />
    </>
  ),
  fileUpload: (
    <>
      <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" />
      <path d="M14 3.5v5h5M12 17.5v-6M9.5 14l2.5-2.5 2.5 2.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  open: (
    <>
      <path d="M13.5 4.5H19.5V10.5M19.5 4.5l-8 8" />
      <path d="M17.5 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h4" />
    </>
  ),
  location: (
    <>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M9.5 13.5h5M12.5 11.5l2 2-2 2" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  chevronLeft: <path d="M14.5 6l-6 6 6 6" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5l7 2.8v5.2c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V6.3z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14" />
      <path d="M10 12h10M16.5 8.5L20 12l-3.5 3.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 12.3l2.5 2.5 5-5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.3h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.7h.01" />
    </>
  ),
  cloud: (
    <path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 18.5z" />
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0" />
      <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.3a6.2 6.2 0 0 1 3.7 5.2" />
    </>
  ),
};

function Icon({ name, size = 20, className, title, strokeWidth = 1.8 }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name] || PATHS.info}
    </svg>
  );
}

export default Icon;
```

파일: `frontend/src/components/Avatar.jsx`

``` jsx
const COLORS = ["#5b7cff", "#e2587a", "#1f9d74", "#e08a1e", "#8a5cff", "#1e8fc7", "#c2410c", "#0f766e"];

function colorFor(text = "") {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function Avatar({ user, size = 32 }) {
  const label = (user?.name || user?.email || "?").trim();
  const initial = label.charAt(0).toUpperCase();
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.44, background: colorFor(user?.email || label) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export default Avatar;
```

파일: `frontend/src/components/Logo.jsx`

``` jsx
function Logo({ size = 36, withText = true }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5b7cff" />
            <stop offset="1" stopColor="#8a5cff" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#logo-grad)" />
        <path
          d="M13.2 28.5a5.7 5.7 0 0 1-.8-11.3 7.6 7.6 0 0 1 14.6 2 4.8 4.8 0 0 1-.6 9.3z"
          fill="#fff"
        />
        <path d="M20 26v-6.2M17.3 22.3L20 19.6l2.7 2.7" stroke="#6a6cff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withText ? (
        <span className="logo-text">
          Cloud <strong>Drive</strong>
        </span>
      ) : null}
    </span>
  );
}

export default Logo;
```

파일: `frontend/src/components/Spinner.jsx`

``` jsx
function Spinner({ size = 24, label = "불러오는 중" }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} role="status" aria-label={label} />
  );
}

export default Spinner;
```

파일: `frontend/src/components/FormField.jsx`

``` jsx
import { useId } from "react";

function FormField({ label, error, hint, className = "", ...inputProps }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field ${className}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`input${error ? " has-error" : ""}`}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default FormField;
```

파일: `frontend/src/components/AuthLayout.jsx`

``` jsx
import Logo from "./Logo";

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden="true">
        <span className="blob blob-1" />
        <span className="blob blob-2" />
        <span className="blob blob-3" />
      </div>
      <main className="auth-card">
        <div className="auth-brand">
          <Logo size={44} withText={false} />
          <span className="auth-product">Cloud Drive</span>
        </div>
        <h1>{title}</h1>
        {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
        {children}
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </main>
    </div>
  );
}

export default AuthLayout;
```

------------------------------------------------------------------------

# 24. Frontend --- pages

## 24-1. 로그인 / 회원가입

브라우저에서 먼저 형식을 검사(`validation.js`)하고, 서버 오류(409 이메일 중복 등)는
서버의 `message`를 그대로 보여 준다.

파일: `frontend/src/pages/LoginPage.jsx`

``` jsx
import { useState } from "react";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Icon from "../components/Icon";
import Spinner from "../components/Spinner";
import useAuth from "../hooks/useAuth";
import { errorMessage } from "../utils/format";
import { hasErrors, validateEmail } from "../utils/validation";

function LoginPage() {
  const { login, expired } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(expired ? "세션이 만료되었습니다. 다시 로그인해 주세요." : "");
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (event) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
      setErrors((prev) => ({ ...prev, [field]: null }));
    };
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {
      email: validateEmail(form.email),
      password: form.password ? null : "비밀번호를 입력해 주세요.",
    };
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setSubmitting(true);
    setServerError("");
    try {
      await login({ email: form.email.trim(), password: form.password });
    } catch (error) {
      setServerError(errorMessage(error, "로그인에 실패했습니다."));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="로그인"
      subtitle="내 파일에 어디서든 안전하게 접근하세요."
      footer={
        <>
          계정이 없으신가요?{" "}
          <a href="#/signup" className="link">
            회원가입
          </a>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        {serverError ? (
          <div className="form-alert" role="alert">
            <Icon name="alert" size={18} />
            <span>{serverError}</span>
          </div>
        ) : null}
        <FormField
          label="이메일"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={update("email")}
          error={errors.email}
          autoFocus
        />
        <FormField
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={update("password")}
          error={errors.password}
        />
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={submitting}>
          {submitting ? <Spinner size={18} label="로그인 중" /> : null}
          {submitting ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </AuthLayout>
  );
}

export default LoginPage;
```

파일: `frontend/src/pages/SignupPage.jsx`

``` jsx
import { useState } from "react";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Icon from "../components/Icon";
import Spinner from "../components/Spinner";
import useAuth from "../hooks/useAuth";
import { errorMessage } from "../utils/format";
import {
  hasErrors,
  validateConfirm,
  validateEmail,
  validateName,
  validatePassword,
} from "../utils/validation";

function SignupPage() {
  const { signup } = useAuth();
  const [form, setForm] = useState({ email: "", name: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (event) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
      setErrors((prev) => ({ ...prev, [field]: null }));
    };
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {
      email: validateEmail(form.email),
      name: validateName(form.name),
      password: validatePassword(form.password),
      confirm: validateConfirm(form.password, form.confirm),
    };
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setSubmitting(true);
    setServerError("");
    try {
      await signup({ email: form.email.trim(), name: form.name.trim(), password: form.password });
    } catch (error) {
      if (error?.status === 409) {
        setErrors((prev) => ({ ...prev, email: errorMessage(error, "이미 가입된 이메일입니다.") }));
      } else {
        setServerError(errorMessage(error, "회원가입에 실패했습니다."));
      }
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="계정 만들기"
      subtitle="1 GB 무료 저장 공간으로 시작하세요."
      footer={
        <>
          이미 계정이 있으신가요?{" "}
          <a href="#/login" className="link">
            로그인
          </a>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        {serverError ? (
          <div className="form-alert" role="alert">
            <Icon name="alert" size={18} />
            <span>{serverError}</span>
          </div>
        ) : null}
        <FormField
          label="이메일"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={update("email")}
          error={errors.email}
          autoFocus
        />
        <FormField
          label="이름"
          autoComplete="name"
          value={form.name}
          onChange={update("name")}
          error={errors.name}
          maxLength={50}
        />
        <FormField
          label="비밀번호"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update("password")}
          error={errors.password}
          hint="8자 이상 입력해 주세요."
        />
        <FormField
          label="비밀번호 확인"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={update("confirm")}
          error={errors.confirm}
        />
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={submitting}>
          {submitting ? <Spinner size={18} label="가입 중" /> : null}
          {submitting ? "가입 중…" : "가입하기"}
        </button>
      </form>
    </AuthLayout>
  );
}

export default SignupPage;
```

## 24-2. DrivePage

내 드라이브·폴더·최근·중요·검색·휴지통을 **한 컴포넌트**가 보여 준다. 화면마다
다른 것은 불러오는 API(`useDriveData`), 제목, 빈 화면 안내, 메뉴 항목뿐이다.
`AppShell`이 라우트마다 `key`를 바꿔 주므로, 화면이 바뀌면 선택·정렬·메뉴 상태가
깨끗하게 초기화된다.

파일: `frontend/src/pages/DrivePage.jsx`

``` jsx
import { useCallback, useMemo, useRef, useState } from "react";
import Breadcrumb from "../components/Breadcrumb";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import ItemList, { ItemListSkeleton } from "../components/ItemList";
import Menu from "../components/Menu";
import MoveDialog from "../components/MoveDialog";
import NewMenuButton from "../components/NewMenuButton";
import PreviewModal from "../components/PreviewModal";
import Spinner from "../components/Spinner";
import useDriveData from "../hooks/useDriveData";
import { folderPath, navigate } from "../hooks/useHashRoute";
import useToast from "../hooks/useToast";
import { errorMessage } from "../utils/format";
import { itemKey, sortItems, toItems } from "../utils/items";

const TITLES = {
  recent: "최근 문서함",
  starred: "중요 문서함",
  trash: "휴지통",
};

const DEFAULT_SORT = {
  recent: { key: "date", dir: "desc" },
  trash: { key: "date", dir: "desc" },
};

const SORT_LABEL = { name: "이름", date: "날짜", size: "크기" };

function emptyStateFor(view, q) {
  switch (view) {
    case "recent":
      return { variant: "recent", title: "최근 문서가 없습니다", description: "파일을 업로드하거나 수정하면 여기에 표시됩니다." };
    case "starred":
      return { variant: "star", title: "중요 문서함이 비어 있습니다", description: "자주 찾는 파일과 폴더에 중요 표시를 해 보세요." };
    case "trash":
      return { variant: "trash", title: "휴지통이 비어 있습니다", description: "삭제한 항목은 영구 삭제하기 전까지 여기에 보관됩니다." };
    case "search":
      return q.trim()
        ? { variant: "search", title: "검색 결과가 없습니다", description: `"${q.trim()}"와(과) 일치하는 파일이나 폴더가 없습니다.` }
        : { variant: "search", title: "검색어를 입력하세요", description: "파일과 폴더 이름으로 검색할 수 있습니다." };
    case "folder":
      return { variant: "folder", title: "빈 폴더입니다", description: "파일을 여기로 끌어다 놓거나 ‘새로 만들기’ 버튼을 사용하세요." };
    default:
      return { variant: "folder", title: "내 드라이브에 오신 것을 환영합니다", description: "파일을 끌어다 놓거나 ‘새로 만들기’로 업로드해 보세요." };
  }
}

function isTouchDevice() {
  return typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches;
}

function hasFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

/**
 * 내 드라이브 / 폴더 / 최근 / 중요 / 검색 / 휴지통 공용 페이지.
 * 라우트가 바뀌면(App에서 key 변경) 새로 마운트된다.
 */
function DrivePage({ route, version, actions, viewMode, onViewModeChange, onUploadFiles, onNewFolder, onPickFiles, onRefresh }) {
  const toast = useToast();
  const view = route.name;
  const q = route.q ?? "";
  const isDrive = view === "drive" || view === "folder";
  const isTrash = view === "trash";

  const { data, error, loading, refreshing } = useDriveData(route, version);
  const [sort, setSort] = useState(DEFAULT_SORT[view] || { key: "name", dir: "asc" });
  const [selectedKey, setSelectedKey] = useState(null);
  const [menu, setMenu] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const items = useMemo(() => sortItems(toItems(data), sort, view), [data, sort, view]);
  const previewable = useMemo(() => items.filter((item) => item.kind === "file"), [items]);

  const open = useCallback(
    (item) => {
      if (isTrash) {
        toast.info("휴지통에 있는 항목은 복원한 뒤에 열 수 있습니다.");
        return;
      }
      if (item.kind === "folder") navigate(folderPath(item.id));
      else setPreviewFile(item);
    },
    [isTrash, toast],
  );

  const select = useCallback(
    (item) => {
      setSelectedKey(itemKey(item));
      if (isTouchDevice()) open(item);
    },
    [open],
  );

  const onMenu = useCallback((item, position) => {
    setSelectedKey(itemKey(item));
    setMenu({ item, position });
  }, []);

  const onDeleteKey = useCallback(
    (item) => {
      if (isTrash) actions.deleteForever(item);
      else actions.trash(item);
    },
    [actions, isTrash],
  );

  function menuItems(item) {
    if (isTrash) {
      return [
        { key: "restore", label: "복원", icon: "restore", onSelect: () => actions.restore(item) },
        { key: "d1", divider: true },
        { key: "forever", label: "영구 삭제", icon: "trash", danger: true, onSelect: () => actions.deleteForever(item) },
      ];
    }
    const parentId = item.kind === "folder" ? item.parentFolderId : item.folderId;
    const locate = !isDrive
      ? [{ key: "locate", label: "위치 열기", icon: "location", onSelect: () => navigate(folderPath(parentId ?? null)) }]
      : [];
    const star = {
      key: "star",
      label: item.starred ? "중요 표시 해제" : "중요 표시",
      icon: item.starred ? "starFilled" : "star",
      onSelect: () => actions.toggleStar(item),
    };
    const common = [
      { key: "rename", label: "이름 바꾸기", icon: "edit", onSelect: () => actions.rename(item) },
      { key: "move", label: "이동", icon: "move", onSelect: () => setMoveTarget(item) },
      star,
      ...locate,
      { key: "d2", divider: true },
    ];
    if (item.kind === "folder") {
      return [
        { key: "open", label: "열기", icon: "open", onSelect: () => open(item) },
        { key: "d1", divider: true },
        ...common,
        { key: "trash", label: "삭제", icon: "trash", danger: true, onSelect: () => actions.trash(item) },
      ];
    }
    return [
      { key: "preview", label: "미리보기", icon: "eye", onSelect: () => open(item) },
      { key: "download", label: "다운로드", icon: "download", onSelect: () => actions.download(item) },
      { key: "d1", divider: true },
      ...common,
      { key: "trash", label: "휴지통으로 이동", icon: "trash", danger: true, onSelect: () => actions.trash(item) },
    ];
  }

  /* ---------- drag & drop upload ---------- */

  const dropHandlers = isDrive
    ? {
        onDragEnter: (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        },
        onDragOver: (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (event) => {
          if (!hasFiles(event)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        },
        onDrop: (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          const files = [];
          let skipped = 0;
          const transferItems = Array.from(event.dataTransfer.items || []);
          if (transferItems.length) {
            transferItems.forEach((entry) => {
              if (entry.kind !== "file") return;
              if (entry.webkitGetAsEntry?.()?.isDirectory) {
                skipped += 1;
                return;
              }
              const file = entry.getAsFile();
              if (file) files.push(file);
            });
          } else {
            files.push(...Array.from(event.dataTransfer.files || []));
          }
          if (skipped) toast.info("폴더 업로드는 지원하지 않습니다. 파일만 업로드합니다.");
          if (files.length) onUploadFiles(files);
        },
      }
    : {};

  /* ---------- header ---------- */

  const path = data?.path || [];
  const folderName = view === "folder" ? path[path.length - 1]?.name : "내 드라이브";
  const notFound = view === "folder" && error?.status === 404;

  let heading;
  if (isDrive) {
    heading =
      view === "folder" && loading ? (
        <div className="breadcrumb">
          <span className="skeleton skeleton-title" />
        </div>
      ) : (
        <Breadcrumb path={path} />
      );
  } else if (view === "search") {
    heading = <h1 className="page-title">{q.trim() ? `‘${q.trim()}’ 검색 결과` : "검색"}</h1>;
  } else {
    heading = <h1 className="page-title">{TITLES[view]}</h1>;
  }

  /* ---------- body ---------- */

  let body;
  if (loading) {
    body = <ItemListSkeleton viewMode={viewMode} />;
  } else if (notFound) {
    body = (
      <EmptyState variant="error" title="폴더를 찾을 수 없습니다" description="삭제되었거나 접근 권한이 없는 폴더입니다.">
        <a className="btn btn-primary" href="#/drive">
          내 드라이브로 이동
        </a>
      </EmptyState>
    );
  } else if (error) {
    body = (
      <EmptyState variant="error" title="목록을 불러오지 못했습니다" description={errorMessage(error)}>
        <button type="button" className="btn btn-primary" onClick={onRefresh}>
          <Icon name="refresh" size={18} />
          다시 시도
        </button>
      </EmptyState>
    );
  } else if (items.length === 0) {
    const empty = emptyStateFor(view, q);
    body = (
      <EmptyState {...empty}>
        {isDrive ? (
          <button type="button" className="btn btn-primary" onClick={onPickFiles}>
            <Icon name="upload" size={18} />
            파일 업로드
          </button>
        ) : null}
      </EmptyState>
    );
  } else {
    body = (
      <ItemList
        items={items}
        viewMode={viewMode}
        view={view}
        selectedKey={selectedKey}
        sort={sort}
        onSortChange={setSort}
        onSelect={select}
        onOpen={open}
        onMenu={onMenu}
        onDeleteKey={onDeleteKey}
      />
    );
  }

  return (
    <div
      className={`drive-page${dragging ? " is-dragging" : ""}`}
      {...dropHandlers}
      onClick={(event) => {
        if (!event.target.closest?.("[data-item-key]")) setSelectedKey(null);
      }}
    >
      <div className="page-head">
        <div className="page-heading">
          {heading}
          {refreshing ? <Spinner size={16} label="새로고침 중" /> : null}
        </div>
        <div className="page-tools">
          {isTrash && items.length > 0 ? (
            <button type="button" className="btn btn-danger-ghost" onClick={() => actions.emptyTrash()}>
              <Icon name="trash" size={18} />
              휴지통 비우기
            </button>
          ) : null}
          <label className="sort-select">
            <span className="sr-only">정렬 기준</span>
            <select value={sort.key} onChange={(event) => setSort((prev) => ({ ...prev, key: event.target.value }))}>
              {Object.entries(SORT_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="icon-button"
            onClick={() => setSort((prev) => ({ ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }))}
            aria-label={sort.dir === "asc" ? "오름차순 (클릭하면 내림차순)" : "내림차순 (클릭하면 오름차순)"}
            title={sort.dir === "asc" ? "오름차순" : "내림차순"}
          >
            <Icon name={sort.dir === "asc" ? "arrowUp" : "arrowDown"} size={18} />
          </button>
          <div className="segmented" role="group" aria-label="보기 방식">
            <button
              type="button"
              className={viewMode === "list" ? "active" : ""}
              aria-pressed={viewMode === "list"}
              aria-label="목록 보기"
              onClick={() => onViewModeChange("list")}
            >
              <Icon name="list" size={18} />
            </button>
            <button
              type="button"
              className={viewMode === "grid" ? "active" : ""}
              aria-pressed={viewMode === "grid"}
              aria-label="바둑판 보기"
              onClick={() => onViewModeChange("grid")}
            >
              <Icon name="grid" size={18} />
            </button>
          </div>
        </div>
      </div>

      {isTrash && items.length > 0 ? (
        <div className="info-banner">
          <Icon name="info" size={18} />
          휴지통의 항목도 영구 삭제하기 전까지 저장 공간을 차지합니다.
        </div>
      ) : null}

      <div className="page-body">{body}</div>

      {dragging ? (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-card">
            <Icon name="upload" size={40} />
            <strong>파일을 놓아 업로드</strong>
            <span>{folderName || "현재 폴더"}에 업로드됩니다</span>
          </div>
        </div>
      ) : null}

      {isDrive ? (
        <div className="fab-wrap">
          <NewMenuButton variant="fab" onNewFolder={onNewFolder} onUpload={onPickFiles} />
        </div>
      ) : null}

      {menu ? (
        <Menu
          position={menu.position}
          items={menuItems(menu.item)}
          onClose={() => setMenu(null)}
          label={`${menu.item.name} 작업`}
        />
      ) : null}

      {moveTarget ? (
        <MoveDialog
          item={moveTarget}
          onClose={() => setMoveTarget(null)}
          onMove={(targetId, targetName) => {
            const item = moveTarget;
            setMoveTarget(null);
            actions.move(item, targetId, targetName);
          }}
        />
      ) : null}

      {previewFile ? (
        <PreviewModal
          files={previewable}
          initialFile={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={actions.download}
        />
      ) : null}
    </div>
  );
}

export default DrivePage;
```

## 24-3. 내 계정 / 관리자

파일: `frontend/src/pages/AccountPage.jsx`

``` jsx
import { useState } from "react";
import * as userApi from "../api/userApi";
import Avatar from "../components/Avatar";
import FormField from "../components/FormField";
import Icon from "../components/Icon";
import StorageMeter from "../components/StorageMeter";
import useAuth from "../hooks/useAuth";
import useDialogs from "../hooks/useDialogs";
import { navigate } from "../hooks/useHashRoute";
import useToast from "../hooks/useToast";
import { errorMessage, formatJoinDate } from "../utils/format";
import { hasErrors, validateConfirm, validateName, validatePassword } from "../utils/validation";

function ProfileSection() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name || "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const message = validateName(name);
    setError(message);
    if (message) return;
    setSaving(true);
    try {
      const updated = await userApi.updateProfile(name.trim());
      updateUser(updated);
      setName(updated?.name ?? name.trim());
      toast.success("이름을 변경했습니다.");
    } catch (err) {
      setError(errorMessage(err, "이름을 변경하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  const unchanged = name.trim() === (user.name || "");

  return (
    <section className="card">
      <h2 className="card-title">
        <Icon name="user" size={20} />
        프로필
      </h2>
      <form className="stack" onSubmit={submit} noValidate>
        <FormField
          label="이름"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          error={error}
          maxLength={50}
          autoComplete="name"
        />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || unchanged}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </section>
  );
}

function PasswordSection() {
  const toast = useToast();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function update(field) {
    return (event) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
      setErrors((prev) => ({ ...prev, [field]: null }));
    };
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {
      current: form.current ? null : "현재 비밀번호를 입력해 주세요.",
      next: validatePassword(form.next),
      confirm: validateConfirm(form.next, form.confirm),
    };
    if (!nextErrors.next && form.next === form.current) nextErrors.next = "현재 비밀번호와 다른 비밀번호를 입력해 주세요.";
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setSaving(true);
    try {
      await userApi.changePassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      toast.success("비밀번호를 변경했습니다.");
    } catch (err) {
      if (err?.status === 400) setErrors({ current: errorMessage(err, "현재 비밀번호가 올바르지 않습니다.") });
      else toast.error(errorMessage(err, "비밀번호를 변경하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">
        <Icon name="lock" size={20} />
        비밀번호 변경
      </h2>
      <form className="stack" onSubmit={submit} noValidate>
        <FormField
          label="현재 비밀번호"
          type="password"
          autoComplete="current-password"
          value={form.current}
          onChange={update("current")}
          error={errors.current}
        />
        <FormField
          label="새 비밀번호"
          type="password"
          autoComplete="new-password"
          value={form.next}
          onChange={update("next")}
          error={errors.next}
          hint="8자 이상 입력해 주세요."
        />
        <FormField
          label="새 비밀번호 확인"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={update("confirm")}
          error={errors.confirm}
        />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "변경 중…" : "비밀번호 변경"}
          </button>
        </div>
      </form>
    </section>
  );
}

function DeleteAccountSection() {
  const { logout } = useAuth();
  const { confirm } = useDialogs();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!password) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    const ok = await confirm({
      title: "정말 탈퇴하시겠어요?",
      message: "계정과 모든 파일, 폴더가 즉시 영구 삭제되며 복구할 수 없습니다.",
      confirmLabel: "탈퇴하기",
      danger: true,
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await userApi.deleteAccount(password);
      logout();
      navigate("/login", { replace: true });
      toast.success("회원 탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.");
    } catch (err) {
      setDeleting(false);
      if (err?.status === 400) setError(errorMessage(err, "비밀번호가 올바르지 않습니다."));
      else toast.error(errorMessage(err, "회원 탈퇴에 실패했습니다."));
    }
  }

  return (
    <section className="card card-danger">
      <h2 className="card-title">
        <Icon name="alert" size={20} />
        회원 탈퇴
      </h2>
      <p className="muted">
        탈퇴하면 업로드한 모든 파일과 폴더(휴지통 포함)가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
      </p>
      <form className="stack" onSubmit={submit} noValidate>
        <FormField
          label="비밀번호 확인"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          error={error}
        />
        <div className="form-actions">
          <button type="submit" className="btn btn-danger" disabled={deleting}>
            {deleting ? "처리 중…" : "회원 탈퇴"}
          </button>
        </div>
      </form>
    </section>
  );
}

function AccountPage({ storage }) {
  const { user } = useAuth();
  return (
    <div className="settings-page">
      <div className="page-head">
        <h1 className="page-title">내 계정</h1>
      </div>
      <div className="settings-grid">
        <section className="card profile-card">
          <Avatar user={user} size={72} />
          <div className="profile-info">
            <strong className="profile-name">{user.name}</strong>
            <span className="muted">{user.email}</span>
            <div className="profile-tags">
              <span className={`badge${user.role === "ADMIN" ? " badge-admin" : ""}`}>
                {user.role === "ADMIN" ? "관리자" : "일반 사용자"}
              </span>
              <span className="muted small">가입일 {formatJoinDate(user.createdAt)}</span>
            </div>
          </div>
          <div className="profile-storage">
            <StorageMeter storage={storage} />
          </div>
        </section>
        <ProfileSection />
        <PasswordSection />
        <DeleteAccountSection />
      </div>
    </div>
  );
}

export default AccountPage;
```

파일: `frontend/src/pages/AdminPage.jsx`

``` jsx
import { useMemo } from "react";
import * as adminApi from "../api/adminApi";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import Spinner from "../components/Spinner";
import useAuth from "../hooks/useAuth";
import useDialogs from "../hooks/useDialogs";
import useResource from "../hooks/useResource";
import useToast from "../hooks/useToast";
import { errorMessage, formatBytes, formatJoinDate, formatNumber } from "../utils/format";

function AdminPage({ version, onChanged }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const { confirm } = useDialogs();
  const { data, error, loading, refreshing } = useResource("admin-users", adminApi.listUsers, version);

  const users = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const totals = useMemo(
    () => ({
      users: users.length,
      storage: users.reduce((sum, user) => sum + (user.storageUsed || 0), 0),
      files: users.reduce((sum, user) => sum + (user.fileCount || 0), 0),
    }),
    [users],
  );

  async function remove(user) {
    const ok = await confirm({
      title: "사용자를 삭제할까요?",
      message: `${user.name} (${user.email}) 계정과 모든 파일이 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    try {
      await adminApi.deleteUser(user.id);
      toast.success(`${user.email} 계정을 삭제했습니다.`);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "사용자를 삭제하지 못했습니다."));
    }
  }

  let body;
  if (loading) {
    body = (
      <div className="center-pad">
        <Spinner size={32} />
      </div>
    );
  } else if (error) {
    body = (
      <EmptyState variant="error" title="사용자 목록을 불러오지 못했습니다" description={errorMessage(error)}>
        <button type="button" className="btn btn-primary" onClick={onChanged}>
          다시 시도
        </button>
      </EmptyState>
    );
  } else if (users.length === 0) {
    body = <EmptyState variant="users" title="사용자가 없습니다" />;
  } else {
    body = (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">사용자</th>
              <th scope="col">권한</th>
              <th scope="col" className="num">
                사용량
              </th>
              <th scope="col" className="num">
                파일 수
              </th>
              <th scope="col">가입일</th>
              <th scope="col">
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const self = user.id === me.id;
              return (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <Avatar user={user} size={32} />
                      <div>
                        <strong>
                          {user.name}
                          {self ? <span className="badge badge-soft">나</span> : null}
                        </strong>
                        <span className="muted small">{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge${user.role === "ADMIN" ? " badge-admin" : ""}`}>
                      {user.role === "ADMIN" ? "관리자" : "사용자"}
                    </span>
                  </td>
                  <td className="num">{formatBytes(user.storageUsed)}</td>
                  <td className="num">{formatNumber(user.fileCount)}</td>
                  <td>{formatJoinDate(user.createdAt)}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-sm"
                      disabled={self}
                      title={self ? "자기 자신은 삭제할 수 없습니다" : undefined}
                      onClick={() => remove(user)}
                      aria-label={`${user.email} 삭제`}
                    >
                      <Icon name="trash" size={16} />
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="settings-page wide">
      <div className="page-head">
        <div className="page-heading">
          <h1 className="page-title">관리자</h1>
          {refreshing ? <Spinner size={16} label="새로고침 중" /> : null}
        </div>
      </div>
      {!loading && !error ? (
        <div className="stat-row">
          <div className="stat">
            <span className="stat-label">전체 사용자</span>
            <strong className="stat-value">{formatNumber(totals.users)}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">전체 파일</span>
            <strong className="stat-value">{formatNumber(totals.files)}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">전체 사용량</span>
            <strong className="stat-value">{formatBytes(totals.storage)}</strong>
          </div>
        </div>
      ) : null}
      <section className="card flush">{body}</section>
    </div>
  );
}

export default AdminPage;
```

------------------------------------------------------------------------

# 25. Frontend --- App.jsx / main.jsx / index.html / favicon

`App.jsx`는 로그인 상태에 따라 화면을 고른다.

``` text
auth.status
  loading        → 스플래시 (세션 확인 중)
  error          → 서버 연결 실패 화면 (다시 시도 / 로그인 화면으로)
  anonymous      → #/signup 이면 SignupPage, 아니면 LoginPage
  authenticated  → AppShell (로그인/가입 주소였다면 #/drive 로 교체)
```

파일: `frontend/src/App.jsx`

``` jsx
import { useEffect } from "react";
import AppShell from "./components/AppShell";
import AuthProvider from "./components/AuthProvider";
import DialogProvider from "./components/DialogProvider";
import EmptyState from "./components/EmptyState";
import Logo from "./components/Logo";
import Spinner from "./components/Spinner";
import ToastProvider from "./components/ToastProvider";
import useAuth from "./hooks/useAuth";
import useHashRoute, { navigate } from "./hooks/useHashRoute";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import { errorMessage } from "./utils/format";
import "./App.css";

function Root() {
  const auth = useAuth();
  const route = useHashRoute();
  const authed = auth.status === "authenticated";
  const onAuthRoute = route.name === "login" || route.name === "signup";

  // 로그인 상태에서 로그인/회원가입 주소면 드라이브로
  useEffect(() => {
    if (authed && onAuthRoute) navigate("/drive", { replace: true });
  }, [authed, onAuthRoute]);

  if (auth.status === "loading") {
    return (
      <div className="splash">
        <Logo size={48} />
        <Spinner size={28} label="세션 확인 중" />
      </div>
    );
  }

  if (auth.status === "error") {
    return (
      <div className="splash">
        <EmptyState
          variant="error"
          title="서버에 연결할 수 없습니다"
          description={errorMessage(auth.error, "잠시 후 다시 시도해 주세요.")}
        >
          <button type="button" className="btn btn-primary" onClick={auth.retry}>
            다시 시도
          </button>
          <button type="button" className="btn btn-ghost" onClick={auth.logout}>
            로그인 화면으로
          </button>
        </EmptyState>
      </div>
    );
  }

  if (!authed) {
    return route.name === "signup" ? <SignupPage /> : <LoginPage />;
  }

  return <AppShell route={route} />;
}

function App() {
  return (
    <ToastProvider>
      <DialogProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </DialogProvider>
    </ToastProvider>
  );
}

export default App;
```

파일: `frontend/src/main.jsx`

``` jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

파일: `frontend/index.html`

``` html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="description" content="Cloud Drive — 개인 클라우드 파일 저장소" />
    <title>Cloud Drive</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

파일: `frontend/public/favicon.svg`

``` xml
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b7cff"/><stop offset="1" stop-color="#8a5cff"/></linearGradient></defs><rect width="40" height="40" rx="11" fill="url(#g)"/><path d="M13.2 28.5a5.7 5.7 0 0 1-.8-11.3 7.6 7.6 0 0 1 14.6 2 4.8 4.8 0 0 1-.6 9.3z" fill="#fff"/><path d="M20 26v-6.2M17.3 22.3L20 19.6l2.7 2.7" stroke="#6a6cff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

------------------------------------------------------------------------

# 26. Frontend --- CSS

`index.css`는 reset과 글꼴만, `App.css`는 전체 디자인이다.

`App.css` 구조:

``` text
design tokens    :root 의 색/그림자/반경 변수 (라이트) + @media (prefers-color-scheme: dark) 다크 값
Utilities        공통 유틸리티, 스피너, 스켈레톤
Buttons / Forms  버튼, 입력, 오류 문구
Logo / avatar
Auth pages       로그인/가입 카드
App shell        TopBar, Sidebar, 본문, 모바일 drawer
Drive page       목록/바둑판, 선택/호버, 정렬 헤더, 드래그 앤 드롭 오버레이
Empty states / Menus / Modals / Preview / Upload panel / Toasts
Settings / admin 내 계정, 관리자 페이지
Responsive       @media (max-width: ...) 모바일 레이아웃
```

색을 직접 쓰지 않고 `var(--primary)`처럼 변수로만 쓰기 때문에 **다크 모드는 변수 값만
바꾸면 된다.** 운영체제/브라우저가 다크 모드면 자동으로 적용된다.

파일: `frontend/src/index.css`

``` css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  font-family: "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, -apple-system, "Segoe UI",
    Roboto, "Malgun Gothic", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

h1,
h2,
h3,
p {
  margin: 0;
}

ul,
ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
}

img,
svg,
video,
iframe {
  display: block;
}

a {
  color: inherit;
}
```

`App.css`는 길다(약 2,400줄). 그대로 복사한다.

파일: `frontend/src/App.css`

``` css
/* =========================================================
   Cloud Drive — design tokens
   ========================================================= */
:root {
  color-scheme: light;
  --bg: #f4f6fb;
  --surface: #ffffff;
  --surface-2: #f3f5fa;
  --surface-3: #e9edf5;
  --hover: rgba(40, 60, 110, 0.06);
  --active: rgba(40, 60, 110, 0.1);
  --border: #e3e7ef;
  --border-strong: #cfd5e1;
  --text: #1a1f2c;
  --text-2: #525c6e;
  --text-3: #858fa1;
  --primary: #4461f2;
  --primary-hover: #3450dc;
  --primary-soft: #e7ecff;
  --primary-soft-text: #2d45c4;
  --on-primary: #ffffff;
  --selected: #dce4ff;
  --danger: #d6343f;
  --danger-hover: #bb2833;
  --danger-soft: #fdecee;
  --success: #17915a;
  --warning: #d98a00;
  --focus: 0 0 0 3px rgba(68, 97, 242, 0.35);
  --shadow-1: 0 1px 2px rgba(20, 30, 60, 0.06), 0 1px 3px rgba(20, 30, 60, 0.05);
  --shadow-2: 0 6px 24px rgba(20, 30, 60, 0.12), 0 2px 6px rgba(20, 30, 60, 0.06);
  --shadow-3: 0 20px 60px rgba(20, 30, 60, 0.22);
  --radius-sm: 8px;
  --radius: 12px;
  --radius-lg: 18px;
  --topbar-h: 64px;
  --sidebar-w: 256px;
  --folder-color: #f2b233;
  --folder-front: #f8c75a;
  --k-image: #e8505b;
  --k-video: #c2408f;
  --k-audio: #f08a24;
  --k-pdf: #e53935;
  --k-doc: #3b73e8;
  --k-text: #6b7a90;
  --k-sheet: #1e9e5a;
  --k-slides: #f3a712;
  --k-archive: #8d6e63;
  --k-code: #0f9aa8;
  --k-other: #8a94a6;
  --skeleton: #e8ecf3;
  --skeleton-shine: #f4f6fa;
  --ill-a: #dfe6ff;
  --ill-b: #ffffff;
  --ill-c: #4461f2;
  --ill-line: #c7d1ee;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: #0e1117;
    --surface: #161a22;
    --surface-2: #1c212b;
    --surface-3: #252b37;
    --hover: rgba(200, 215, 255, 0.06);
    --active: rgba(200, 215, 255, 0.11);
    --border: #262c38;
    --border-strong: #343c4b;
    --text: #e6e9f0;
    --text-2: #a4adbd;
    --text-3: #768093;
    --primary: #7c93ff;
    --primary-hover: #95a8ff;
    --primary-soft: #232c52;
    --primary-soft-text: #b8c5ff;
    --on-primary: #0e1117;
    --selected: #26315e;
    --danger: #ff6b73;
    --danger-hover: #ff8a90;
    --danger-soft: #3a1c22;
    --success: #3fcf8e;
    --warning: #f5b53d;
    --focus: 0 0 0 3px rgba(124, 147, 255, 0.45);
    --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow-2: 0 8px 28px rgba(0, 0, 0, 0.5);
    --shadow-3: 0 24px 70px rgba(0, 0, 0, 0.6);
    --folder-color: #d69a24;
    --folder-front: #eab54a;
    --skeleton: #1f2530;
    --skeleton-shine: #293040;
    --ill-a: #28315a;
    --ill-b: #1f2533;
    --ill-c: #7c93ff;
    --ill-line: #3a4570;
  }
}

body {
  background: var(--bg);
  color: var(--text);
}

::selection {
  background: var(--selected);
}

:focus-visible {
  outline: none;
  box-shadow: var(--focus);
}

/* =========================================================
   Utilities
   ========================================================= */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.skip-link {
  position: absolute;
  left: 12px;
  top: -48px;
  z-index: 100;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--on-primary);
  text-decoration: none;
  transition: top 0.15s;
}

.skip-link:focus {
  top: 12px;
}

.muted {
  color: var(--text-2);
}

.small {
  font-size: 12px;
}

.center-pad {
  display: flex;
  justify-content: center;
  padding: 48px 16px;
}

.rot-180 {
  transform: rotate(180deg);
}

.icon {
  flex: none;
}

.link {
  color: var(--primary);
  font-weight: 600;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

/* spinner */
.spinner {
  display: inline-block;
  flex: none;
  border-radius: 50%;
  border: 2.5px solid var(--primary-soft);
  border-top-color: var(--primary);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* skeleton */
.skeleton {
  display: block;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--skeleton) 25%, var(--skeleton-shine) 50%, var(--skeleton) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.3s ease-in-out infinite;
}

@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

.skeleton-line {
  height: 12px;
  width: 60%;
}

.skeleton-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  flex: none;
}

.skeleton-title {
  width: 180px;
  height: 22px;
}

.skeleton-thumb {
  flex: 1;
  margin-top: 10px;
  border-radius: var(--radius-sm);
}

/* badge */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  background: var(--surface-3);
  color: var(--text-2);
  vertical-align: middle;
}

.badge-admin {
  background: var(--primary-soft);
  color: var(--primary-soft-text);
}

.badge-soft {
  margin-left: 6px;
  background: var(--primary-soft);
  color: var(--primary-soft-text);
}

/* =========================================================
   Buttons
   ========================================================= */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 18px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary);
  color: var(--on-primary);
}

.btn-primary:not(:disabled):hover {
  background: var(--primary-hover);
}

.btn-ghost {
  background: transparent;
  color: var(--primary);
}

.btn-ghost:not(:disabled):hover {
  background: var(--primary-soft);
}

.btn-danger {
  background: var(--danger);
  color: #fff;
}

.btn-danger:not(:disabled):hover {
  background: var(--danger-hover);
}

.btn-danger-ghost {
  background: transparent;
  color: var(--danger);
  border-color: var(--border);
}

.btn-danger-ghost:not(:disabled):hover {
  background: var(--danger-soft);
  border-color: transparent;
}

.btn-on-dark {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.btn-on-dark:hover {
  background: rgba(255, 255, 255, 0.2);
}

.btn-block {
  width: 100%;
}

.btn-lg {
  min-height: 46px;
  font-size: 15px;
}

.btn-sm {
  min-height: 32px;
  padding: 0 12px;
  font-size: 13px;
}

.icon-button {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-2);
  transition: background 0.15s, color 0.15s;
}

.icon-button:hover {
  background: var(--hover);
  color: var(--text);
}

.icon-button:active {
  background: var(--active);
}

.icon-button.small {
  width: 32px;
  height: 32px;
}

.icon-button.on-dark {
  color: #e8ebf3;
}

.icon-button.on-dark:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

/* =========================================================
   Forms
   ========================================================= */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.input::placeholder {
  color: var(--text-3);
}

.input:hover {
  border-color: var(--text-3);
}

.input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: var(--focus);
}

.input.has-error {
  border-color: var(--danger);
}

.input.has-error:focus {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 30%, transparent);
}

.field-error {
  font-size: 12.5px;
  color: var(--danger);
}

.field-hint {
  font-size: 12.5px;
  color: var(--text-3);
}

.form-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13.5px;
}

.form-alert .icon {
  margin-top: 1px;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* =========================================================
   Logo / avatar
   ========================================================= */
.logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.logo-text {
  font-size: 20px;
  letter-spacing: -0.02em;
  color: var(--text-2);
  white-space: nowrap;
}

.logo-text strong {
  color: var(--text);
  font-weight: 700;
}

.avatar {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  color: #fff;
  font-weight: 700;
  line-height: 1;
  user-select: none;
}

.avatar-button {
  display: grid;
  place-items: center;
  padding: 3px;
  border: none;
  border-radius: 50%;
  background: transparent;
}

.avatar-button:hover {
  background: var(--hover);
}

/* =========================================================
   Auth pages
   ========================================================= */
.auth-page {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 100%;
  padding: 32px 16px;
  overflow: hidden;
}

.auth-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.55;
}

.blob-1 {
  width: 420px;
  height: 420px;
  left: -120px;
  top: -120px;
  background: #7d95ff;
}

.blob-2 {
  width: 360px;
  height: 360px;
  right: -100px;
  bottom: -80px;
  background: #b18cff;
}

.blob-3 {
  width: 260px;
  height: 260px;
  right: 18%;
  top: 8%;
  background: #6fd3ff;
  opacity: 0.35;
}

@media (prefers-color-scheme: dark) {
  .blob {
    opacity: 0.25;
  }
}

.auth-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  padding: 40px 36px 32px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-2);
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
}

.auth-product {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.auth-card h1 {
  font-size: 26px;
  letter-spacing: -0.02em;
}

.auth-subtitle {
  margin-top: 6px;
  color: var(--text-2);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 28px;
}

.auth-form .btn-block {
  margin-top: 6px;
}

.auth-footer {
  margin-top: 24px;
  text-align: center;
  color: var(--text-2);
  font-size: 13.5px;
}

.splash {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 24px;
  min-height: 100%;
  padding: 24px;
}

/* =========================================================
   App shell
   ========================================================= */
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: var(--topbar-h);
  padding: 0 16px 0 12px;
  flex: none;
}

.nav-toggle {
  display: none;
}

.topbar-brand {
  display: flex;
  align-items: center;
  width: calc(var(--sidebar-w) - 24px);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  text-decoration: none;
  flex: none;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  max-width: 720px;
  height: 48px;
  padding: 0 6px 0 16px;
  border-radius: 999px;
  background: var(--surface-3);
  transition: background 0.15s, box-shadow 0.15s;
}

.search-box:focus-within {
  background: var(--surface);
  box-shadow: var(--shadow-2);
}

.search-icon {
  color: var(--text-2);
}

.search-box input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 8px;
  border: none;
  background: transparent;
  font-size: 15px;
}

.search-box input:focus {
  outline: none;
  box-shadow: none;
}

.search-box input::-webkit-search-cancel-button {
  display: none;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  flex: none;
}

.shell-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-w);
  flex: none;
  padding: 8px 12px 16px 12px;
  overflow-y: auto;
}

.drawer-head,
.drawer-backdrop {
  display: none;
}

.new-button {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  align-self: flex-start;
  height: 56px;
  margin: 4px 0 16px;
  padding: 0 24px 0 18px;
  border: none;
  border-radius: 16px;
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  font-size: 14.5px;
  box-shadow: var(--shadow-1), 0 1px 3px 1px rgba(20, 30, 60, 0.08);
  transition: box-shadow 0.15s, background 0.15s;
}

.new-button:hover {
  background: var(--primary-soft);
  box-shadow: var(--shadow-2);
}

.new-button .icon {
  color: var(--primary);
}

.side-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.side-link {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  color: var(--text);
  text-decoration: none;
  font-weight: 500;
  transition: background 0.12s;
}

.side-link .icon {
  color: var(--text-2);
}

.side-link:hover {
  background: var(--hover);
}

.side-link.active {
  background: var(--selected);
  color: var(--primary-soft-text);
  font-weight: 700;
}

.side-link.active .icon {
  color: var(--primary-soft-text);
}

.storage-meter {
  margin-top: 20px;
  padding: 12px 16px;
}

.storage-title {
  display: none;
}

.meter {
  height: 5px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--primary);
  transition: width 0.4s ease;
}

.meter-warn span {
  background: var(--warning);
}

.meter-danger span {
  background: var(--danger);
}

.storage-text {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--text-2);
}

.main-panel {
  position: relative;
  flex: 1;
  min-width: 0;
  margin: 0 16px 16px 0;
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow: auto;
  outline: none;
}

/* =========================================================
   Drive page
   ========================================================= */
.drive-page {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.page-head {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 64px;
  padding: 12px 16px 8px 24px;
  background: var(--surface);
}

.page-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.page-title {
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.page-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sort-select select {
  height: 36px;
  padding: 0 30px 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23858fa1' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")
    no-repeat right 12px center;
  appearance: none;
  font-size: 13.5px;
  font-weight: 500;
}

.sort-select select:focus-visible {
  outline: none;
  box-shadow: var(--focus);
}

.segmented {
  display: inline-flex;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  overflow: hidden;
}

.segmented button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 34px;
  border: none;
  background: transparent;
  color: var(--text-2);
}

.segmented button + button {
  border-left: 1px solid var(--border-strong);
}

.segmented button:hover {
  background: var(--hover);
}

.segmented button.active {
  background: var(--selected);
  color: var(--primary-soft-text);
}

.info-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 24px 8px;
  padding: 10px 16px;
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 13px;
}

.page-body {
  flex: 1;
  padding: 0 16px 96px;
}

/* breadcrumb */
.breadcrumb {
  min-width: 0;
}

.breadcrumb ol {
  display: flex;
  align-items: center;
  min-width: 0;
}

.breadcrumb li {
  display: flex;
  align-items: center;
  min-width: 0;
}

.crumb {
  display: block;
  max-width: 220px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 22px;
  font-weight: 500;
  color: var(--text-2);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

a.crumb:hover {
  background: var(--hover);
  color: var(--text);
}

.crumb.current {
  color: var(--text);
  max-width: 360px;
}

.breadcrumb li:first-child .crumb {
  padding-left: 0;
}

.breadcrumb li:first-child a.crumb {
  padding-left: 10px;
  margin-left: -10px;
}

.crumb-sep {
  color: var(--text-3);
}

/* ---------- list view ---------- */
.item-table {
  width: 100%;
}

.item-table-head,
.item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 170px 110px 48px;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}

.item-table-head {
  position: sticky;
  top: 64px;
  z-index: 2;
  height: 44px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
}

.col {
  min-width: 0;
}

.col-date,
.col-size {
  color: var(--text-2);
  font-size: 13px;
  white-space: nowrap;
}

.col-actions {
  display: flex;
  justify-content: flex-end;
}

.sort-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  margin-left: -8px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-weight: 600;
}

.sort-header:hover {
  background: var(--hover);
  color: var(--text);
}

.sort-header.active {
  color: var(--text);
}

.item-row {
  height: 52px;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  cursor: default;
  user-select: none;
  outline: none;
  transition: background 0.1s;
}

.item-row:hover {
  background: var(--hover);
}

.item-row.selected {
  background: var(--selected);
  border-bottom-color: transparent;
  border-radius: 10px;
}

.item-row:focus-visible {
  box-shadow: inset 0 0 0 2px var(--primary);
  border-radius: 10px;
}

.item-row .col-name {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-left: 8px;
}

.item-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.item-name-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.item-name-text {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-sub {
  display: none;
  font-size: 12px;
  color: var(--text-3);
}

.star-badge {
  color: var(--text-3);
}

.more-button {
  width: 36px;
  height: 36px;
  opacity: 0.8;
}

.item-row:hover .more-button,
.item-row.selected .more-button {
  opacity: 1;
}

.skeleton-row {
  display: flex;
  gap: 14px;
  padding: 0 16px;
}

/* ---------- grid view ---------- */
.item-grid-wrap {
  padding: 4px 8px 0;
}

.grid-section + .grid-section {
  margin-top: 20px;
}

.grid-title {
  margin: 8px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-2);
}

.folder-grid,
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
}

.folder-card {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 52px;
  padding: 0 4px 0 16px;
  border-radius: var(--radius);
  background: var(--surface-2);
  cursor: default;
  user-select: none;
  outline: none;
  transition: background 0.1s;
}

.folder-card:hover {
  background: var(--surface-3);
}

.card-name {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  font-weight: 500;
}

.file-card {
  display: flex;
  flex-direction: column;
  height: 232px;
  padding: 4px 4px 10px;
  border-radius: var(--radius);
  background: var(--surface-2);
  cursor: default;
  user-select: none;
  outline: none;
  transition: background 0.1s;
}

.file-card:hover {
  background: var(--surface-3);
}

.folder-card.selected,
.file-card.selected {
  background: var(--selected);
}

.folder-card:focus-visible,
.file-card:focus-visible {
  box-shadow: inset 0 0 0 2px var(--primary);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding-left: 12px;
}

.card-thumb {
  display: grid;
  place-items: center;
  flex: 1;
  margin: 0 8px;
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.card-meta {
  padding: 8px 12px 0;
  font-size: 12px;
  color: var(--text-3);
}

.skeleton-card {
  padding: 16px;
}

/* ---------- file type colors ---------- */
.file-icon {
  flex: none;
}

.kind-image { color: var(--k-image); }
.kind-video { color: var(--k-video); }
.kind-audio { color: var(--k-audio); }
.kind-pdf { color: var(--k-pdf); }
.kind-doc { color: var(--k-doc); }
.kind-text { color: var(--k-text); }
.kind-sheet { color: var(--k-sheet); }
.kind-slides { color: var(--k-slides); }
.kind-archive { color: var(--k-archive); }
.kind-code { color: var(--k-code); }
.kind-other { color: var(--k-other); }

.card-thumb.kind-bg-image { background: color-mix(in srgb, var(--k-image) 10%, var(--surface)); }
.card-thumb.kind-bg-video { background: color-mix(in srgb, var(--k-video) 10%, var(--surface)); }
.card-thumb.kind-bg-audio { background: color-mix(in srgb, var(--k-audio) 10%, var(--surface)); }
.card-thumb.kind-bg-pdf { background: color-mix(in srgb, var(--k-pdf) 10%, var(--surface)); }
.card-thumb.kind-bg-doc { background: color-mix(in srgb, var(--k-doc) 10%, var(--surface)); }
.card-thumb.kind-bg-sheet { background: color-mix(in srgb, var(--k-sheet) 10%, var(--surface)); }
.card-thumb.kind-bg-slides { background: color-mix(in srgb, var(--k-slides) 12%, var(--surface)); }
.card-thumb.kind-bg-code { background: color-mix(in srgb, var(--k-code) 10%, var(--surface)); }

/* ---------- drag & drop ---------- */
.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  border: 2px dashed var(--primary);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  pointer-events: none;
  animation: fade-in 0.12s ease-out;
}

.drop-card {
  position: sticky;
  top: 40%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 22px 32px;
  border-radius: var(--radius-lg);
  background: var(--primary);
  color: var(--on-primary);
  box-shadow: var(--shadow-3);
}

.drop-card strong {
  font-size: 16px;
}

.drop-card span {
  opacity: 0.85;
  font-size: 13px;
}

/* ---------- FAB (mobile) ---------- */
.fab-wrap {
  display: none;
}

.fab {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 18px;
  background: var(--primary);
  color: var(--on-primary);
  box-shadow: var(--shadow-2);
}

/* =========================================================
   Empty states
   ========================================================= */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 24px;
  text-align: center;
}

.empty-illustration svg {
  width: 200px;
  height: auto;
}

.empty-state h2 {
  margin-top: 20px;
  font-size: 19px;
  font-weight: 600;
}

.empty-state p {
  max-width: 420px;
  margin-top: 8px;
  color: var(--text-2);
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
}

.ill-shadow { fill: var(--surface-3); }
.ill-dot { fill: var(--ill-line); }
.ill-paper { fill: var(--ill-b); stroke: var(--ill-line); stroke-width: 2; }
.ill-accent { fill: var(--ill-c); }
.ill-accent-soft { fill: var(--ill-a); }
.ill-line { stroke: var(--ill-line); stroke-width: 4; stroke-linecap: round; fill: none; }
.ill-lens { fill: var(--ill-a); stroke: var(--ill-c); stroke-width: 5; }
.ill-handle { stroke: var(--ill-c); stroke-width: 7; stroke-linecap: round; fill: none; }
.ill-folder-back { fill: var(--folder-color); }
.ill-folder { fill: var(--folder-front); }
.ill-plus { stroke: #fff; stroke-width: 5; stroke-linecap: round; }

/* =========================================================
   Menus
   ========================================================= */
.menu {
  position: fixed;
  z-index: 60;
  min-width: 220px;
  max-width: 320px;
  padding: 6px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-2);
  animation: pop-in 0.1s ease-out;
}

@keyframes pop-in {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  height: 38px;
  padding: 0 18px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 14px;
}

.menu-item .icon {
  color: var(--text-2);
}

.menu-item:hover,
.menu-item:focus-visible {
  background: var(--hover);
  box-shadow: none;
}

.menu-item.danger,
.menu-item.danger .icon {
  color: var(--danger);
}

.menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.menu-icon-space {
  width: 18px;
}

.menu-divider {
  height: 1px;
  margin: 6px 0;
  background: var(--border);
}

.menu-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px 14px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.menu-header-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

.menu-header-text span {
  max-width: 200px;
  color: var(--text-2);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-header-text .badge {
  margin-top: 4px;
}

.user-menu {
  min-width: 260px;
}

/* =========================================================
   Modals
   ========================================================= */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(10, 14, 24, 0.45);
  animation: fade-in 0.12s ease-out;
}

.modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: calc(100vh - 32px);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: var(--shadow-3);
  outline: none;
  animation: pop-in 0.14s ease-out;
}

.modal-sm {
  max-width: 420px;
}

.modal-md {
  max-width: 520px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 16px 8px 24px;
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-body {
  padding: 8px 24px 16px;
  overflow: auto;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 20px;
}

.modal-footer.inline {
  padding: 20px 0 4px;
}

.dialog-message {
  color: var(--text-2);
}

.modal-body .field-label {
  margin-bottom: 6px;
}

.modal-body .field-error {
  margin-top: 6px;
}

/* move dialog */
.folder-tree {
  max-height: 360px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.folder-tree ul {
  padding: 0;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 8px;
}

.tree-row:hover {
  background: var(--hover);
}

.tree-row.selected {
  background: var(--selected);
  color: var(--primary-soft-text);
}

.tree-toggle {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: none;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
}

.tree-toggle:hover {
  background: var(--active);
}

.tree-toggle-space {
  width: 26px;
  flex: none;
}

.tree-label {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
}

.tree-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-label .icon {
  color: var(--text-2);
}

.tree-row.selected .tree-label .icon {
  color: var(--primary-soft-text);
}

.move-hint {
  margin-right: auto;
  font-size: 13px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* =========================================================
   Preview
   ========================================================= */
.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: flex;
  flex-direction: column;
  background: rgba(8, 10, 16, 0.92);
  color: #e8ebf3;
  animation: fade-in 0.15s ease-out;
}

.preview-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 64px;
  padding: 0 16px 0 8px;
  flex: none;
  background: linear-gradient(rgba(0, 0, 0, 0.5), transparent);
}

.preview-title {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.preview-title strong {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-title span {
  font-size: 12px;
  color: #9aa3b5;
}

.preview-stage {
  display: grid;
  place-items: center;
  flex: 1;
  min-height: 0;
  padding: 8px 72px 24px;
  overflow: auto;
}

.preview-image {
  max-width: 100%;
  max-height: calc(100vh - 110px);
  object-fit: contain;
  border-radius: 6px;
  background: repeating-conic-gradient(#2a2f3a 0 25%, #20242d 0 50%) 0 0 / 20px 20px;
  box-shadow: var(--shadow-3);
}

.preview-video {
  max-width: 100%;
  max-height: calc(100vh - 110px);
  border-radius: 8px;
  background: #000;
}

.preview-audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  padding: 40px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.06);
}

.preview-audio audio {
  width: min(420px, 80vw);
}

.preview-pdf {
  width: min(1000px, 100%);
  height: calc(100vh - 100px);
  border: none;
  border-radius: 8px;
  background: #fff;
}

.preview-text {
  width: min(960px, 100%);
  max-height: calc(100vh - 110px);
  margin: 0;
  padding: 24px 28px;
  overflow: auto;
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font-family: ui-monospace, "SFMono-Regular", "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  align-self: start;
}

.preview-unsupported {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 48px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.06);
  text-align: center;
}

.preview-unsupported h3 {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 600;
}

.preview-unsupported p {
  color: #9aa3b5;
  margin-bottom: 8px;
}

.preview-loading {
  display: grid;
  place-items: center;
}

.preview-nav {
  position: absolute;
  top: 50%;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-top: -24px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.preview-nav:hover {
  background: rgba(255, 255, 255, 0.2);
}

.preview-nav.prev {
  left: 12px;
}

.preview-nav.next {
  right: 12px;
}

/* =========================================================
   Upload panel
   ========================================================= */
.upload-panel {
  position: fixed;
  right: 24px;
  bottom: 0;
  z-index: 40;
  width: 380px;
  max-width: calc(100vw - 32px);
  border-radius: 14px 14px 0 0;
  background: var(--surface);
  box-shadow: var(--shadow-3);
  overflow: hidden;
  animation: slide-up 0.2s ease-out;
}

@keyframes slide-up {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
}

.upload-head {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 52px;
  padding: 0 8px 0 20px;
  background: #1f2433;
  color: #fff;
}

.upload-head strong {
  flex: 1;
  font-weight: 600;
}

.upload-list {
  max-height: 300px;
  overflow: auto;
}

.upload-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 12px 8px 20px;
  border-bottom: 1px solid var(--border);
}

.upload-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.upload-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-status {
  font-size: 12px;
  color: var(--text-3);
}

.status-error .upload-status {
  color: var(--danger);
}

.upload-bar {
  display: block;
  height: 3px;
  margin-top: 5px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.upload-bar span {
  display: block;
  height: 100%;
  background: var(--primary);
  transition: width 0.2s;
}

.upload-ok {
  color: var(--success);
}

.upload-fail {
  color: var(--danger);
}

/* =========================================================
   Toasts
   ========================================================= */
.toast-region {
  position: fixed;
  left: 24px;
  bottom: 24px;
  z-index: 70;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: calc(100vw - 48px);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 280px;
  max-width: 480px;
  padding: 12px 8px 12px 16px;
  border-radius: 12px;
  background: #1f2433;
  color: #f1f3f8;
  box-shadow: var(--shadow-2);
  pointer-events: auto;
  animation: slide-up 0.18s ease-out;
}

.toast-success .icon:first-child {
  color: #5fe0a2;
}

.toast-error .icon:first-child {
  color: #ff8a90;
}

.toast-info .icon:first-child {
  color: #9fb1ff;
}

.toast-message {
  flex: 1;
  font-size: 13.5px;
}

.toast-action {
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #9fb1ff;
  font-weight: 700;
  white-space: nowrap;
}

.toast-action:hover {
  background: rgba(255, 255, 255, 0.1);
}

.toast-close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #b8bfcc;
}

.toast-close:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* =========================================================
   Settings / admin
   ========================================================= */
.settings-page {
  max-width: 760px;
  padding-bottom: 48px;
}

.settings-page.wide {
  max-width: 1100px;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 24px 0;
}

.card {
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.card.flush {
  margin: 0 24px;
  padding: 0;
  overflow: hidden;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  font-size: 16px;
  font-weight: 600;
}

.card-title .icon {
  color: var(--text-2);
}

.card-danger {
  border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
}

.card-danger .card-title,
.card-danger .card-title .icon {
  color: var(--danger);
}

.card-danger > .muted {
  margin: -6px 0 18px;
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, var(--primary-soft), var(--surface) 70%);
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 200px;
}

.profile-name {
  font-size: 20px;
}

.profile-tags {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.profile-storage {
  width: 240px;
}

.profile-storage .storage-meter {
  margin: 0;
  padding: 0;
}

.profile-storage .storage-title {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 8px 24px 16px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.stat-label {
  font-size: 12.5px;
  color: var(--text-2);
}

.stat-value {
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

.data-table th {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}

.data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.data-table tbody tr:hover {
  background: var(--hover);
}

.data-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.data-table .actions {
  text-align: right;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-cell > div {
  display: flex;
  flex-direction: column;
}

/* =========================================================
   Responsive
   ========================================================= */
@media (max-width: 1100px) {
  .item-table-head,
  .item-row {
    grid-template-columns: minmax(0, 1fr) 140px 90px 48px;
  }
}

@media (max-width: 900px) {
  :root {
    --topbar-h: 60px;
  }

  .nav-toggle {
    display: inline-grid;
  }

  .topbar {
    gap: 8px;
    padding: 0 8px;
  }

  .topbar-brand {
    width: auto;
  }

  .sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 45;
    width: min(300px, 86vw);
    background: var(--surface);
    box-shadow: var(--shadow-3);
    transform: translateX(-105%);
    transition: transform 0.22s ease;
    visibility: hidden;
  }

  .sidebar.open {
    transform: none;
    visibility: visible;
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0 12px 8px;
  }

  .drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 44;
    background: rgba(10, 14, 24, 0.4);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
  }

  .drawer-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .main-panel {
    margin: 0;
    border-radius: 20px 20px 0 0;
  }

  .fab-wrap {
    display: block;
    position: fixed;
    right: 20px;
    bottom: 24px;
    z-index: 30;
  }

  .upload-panel {
    right: 16px;
  }
}

@media (max-width: 640px) {
  .topbar-brand .logo-text {
    display: none;
  }

  .search-box {
    height: 44px;
  }

  .page-head {
    padding: 12px 12px 8px 16px;
  }

  .page-title,
  .crumb {
    font-size: 19px;
  }

  .crumb {
    max-width: 120px;
  }

  .crumb.current {
    max-width: 180px;
  }

  .page-tools {
    width: 100%;
    justify-content: flex-end;
  }

  .page-body {
    padding: 0 8px 96px;
  }

  .item-table-head {
    display: none;
  }

  .item-table-head,
  .item-row {
    grid-template-columns: minmax(0, 1fr) 44px;
  }

  .item-row .col-date,
  .item-row .col-size {
    display: none;
  }

  .item-row {
    height: 60px;
  }

  .item-sub {
    display: block;
  }

  .folder-grid,
  .file-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .file-card {
    height: 190px;
  }

  .info-banner {
    margin: 4px 16px 8px;
  }

  .settings-grid {
    padding: 8px 12px 0;
  }

  .card {
    padding: 18px;
  }

  .card.flush {
    margin: 0 12px;
  }

  .stat-row {
    grid-template-columns: 1fr;
    padding: 8px 12px 16px;
  }

  .profile-storage {
    width: 100%;
  }

  .preview-stage {
    padding: 8px 8px 16px;
  }

  .preview-nav {
    top: auto;
    bottom: 20px;
  }

  .hide-sm {
    display: none;
  }

  .toast-region {
    left: 16px;
    right: 16px;
    bottom: 16px;
    max-width: none;
  }

  .toast {
    min-width: 0;
    max-width: none;
  }

  .auth-card {
    padding: 32px 22px 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

------------------------------------------------------------------------

# 27. Frontend --- lint / build / 로컬 화면 확인

``` bash
cd frontend
npm ci            # node_modules 가 없거나 package-lock 이 바뀐 경우
npm run lint
npm run build
cd ..
```

- `npm run lint`: 오류 0개여야 한다. (React Hooks 규칙 위반 등을 잡는다)
- `npm run build`: `dist/`가 만들어지면 성공. 새 의존성은 없으므로 Day 7과 같은
  `package.json`으로 빌드된다.

화면은 28번에서 kind Backend를 띄운 뒤 확인한다. (18번처럼 bootRun을 켠 상태에서
`npm run dev`로 먼저 봐도 된다. `.env.local`의 `VITE_API_TARGET=http://localhost:8080`은
bootRun과 port-forward 둘 다에 맞는다.)

------------------------------------------------------------------------

# 28. kind 배포

Day 7 38번과 같은 흐름이다. 새 태그 `day7-5`로 build → kind load → set image.
단, **그 전에 Secret(JWT_SECRET)과 ConfigMap(ADMIN_EMAILS)을 먼저 넣는다.**
Pod는 시작할 때만 환경변수를 읽기 때문이다.

## 28-1. 준비

``` bash
kubectl config current-context   # kind-cloud-file-service
df -h /                          # Avail 3GB 이상
```

18번의 bootRun이 켜져 있으면 끈다(8080 충돌).

## 28-2. Secret에 JWT_SECRET 추가

``` bash
kubectl get secret cloud-file-service-secret -n cloud-file-service \
  -o jsonpath='{.data.JWT_SECRET}' | grep -q . \
  && echo "JWT_SECRET 이미 있음 (그대로 둔다)" \
  || kubectl patch secret cloud-file-service-secret -n cloud-file-service \
       --type merge \
       -p "{\"stringData\":{\"JWT_SECRET\":\"$(openssl rand -hex 32)\"}}"
```

- `openssl rand -hex 32`는 무작위 64자(32바이트) 16진수 문자열을 만든다. 화면에
  출력하지 않고 바로 Secret에 넣는다.
- 이미 값이 있으면 건드리지 않는다. **JWT_SECRET을 바꾸면 이미 발급된 모든 토큰이
  무효가 되어 모든 사용자가 다시 로그인해야 한다.**
- `kubectl patch`는 기존 `DB_URL`, `DB_PASSWORD`, AWS 키 등은 그대로 두고 이 값만 추가한다.

확인(값 대신 길이만 본다):

``` bash
kubectl get secret cloud-file-service-secret -n cloud-file-service \
  -o jsonpath='{.data.JWT_SECRET}' | base64 -d | wc -c
# 64
```

> Day 7 13번에서 `k8s/secret.yaml` 파일 방식을 썼다면 그 파일에 `JWT_SECRET`
> 줄을 추가하고 `kubectl apply -f k8s/secret.yaml` 해도 된다. 저장소의
> `k8s/secret.example.yaml`에도 자리표시자가 추가되어 있다.
>
> ``` yaml
>   # Day 7.5: 로그인 토큰 서명 키 (32자 이상 무작위 문자열, 예: openssl rand -hex 32)
>   JWT_SECRET: "CHANGE_ME_TO_RANDOM_64_HEX"
> ```
>
> `k8s/secret.yaml`은 `.gitignore`에 있으므로 커밋되지 않는다.

## 28-3. ConfigMap에 ADMIN_EMAILS 추가

파일: `k8s/configmap.yaml`

`data:` 아래에 다음 두 줄을 추가한다. (`AWS_REGION`, `S3_BUCKET`은 Day 7의 내
값을 그대로 둔다.)

``` yaml
  # Day 7.5: 이 이메일로 가입하면 관리자(ADMIN)가 된다. 여러 개는 쉼표로 구분.
  ADMIN_EMAILS: ""
```

관리자를 바로 만들고 싶다면 `ADMIN_EMAILS: "admin@example.com"`처럼 넣는다(29번).

``` bash
kubectl apply -f k8s/configmap.yaml
kubectl get configmap cloud-file-service-config -n cloud-file-service -o yaml | grep -A1 ADMIN
```

## 28-4. 이미지 build → kind load → 배포

``` bash
docker build -t cloud-file-service:day7-5 .
kind load docker-image cloud-file-service:day7-5 \
  --name cloud-file-service

kubectl set image \
  deployment/cloud-file-service \
  backend=cloud-file-service:day7-5 \
  -n cloud-file-service

kubectl rollout status deployment/cloud-file-service \
  -n cloud-file-service \
  --timeout=240s
```

`successfully rolled out`이 나오면 성공이다. 첫 시작 때 Hibernate가 `users` 테이블과
새 컬럼을 만든다.

``` bash
kubectl get pods -n cloud-file-service
kubectl logs deployment/cloud-file-service -n cloud-file-service --tail=50 | grep -i "error\|started"
```

실패하면:

``` bash
kubectl describe pod -n cloud-file-service <POD_NAME> | tail -20
kubectl logs -n cloud-file-service <POD_NAME> --previous | tail -50
```

| 로그 | 원인 / 해결 |
|---|---|
| `app.jwt.secret(JWT_SECRET)은 32바이트 이상이어야 합니다.` | Secret 값이 짧음 → 28-2 다시 |
| `Connection to 172.x.0.1:5432 refused` | postgres가 꺼짐 → `docker compose up -d postgres` |
| `ImagePullBackOff` | `kind load`를 안 함 / 태그 오타 |

되돌리기: `kubectl rollout undo deployment/cloud-file-service -n cloud-file-service` (Day 7 41번)

## 28-5. port-forward + Frontend

터미널 1 (Day 7 27번 반복문):

``` bash
while true; do
  kubectl port-forward -n cloud-file-service service/cloud-file-service 8080:8080
  echo "port-forward 끊김 → 2초 후 재연결"
  sleep 2
done
```

터미널 2:

``` bash
curl -s http://localhost:8080/actuator/health; echo      # {"status":"UP"...}
curl -s http://localhost:8080/api/files; echo            # {"message":"로그인이 필요합니다."}

cd frontend
npm run dev -- --host 0.0.0.0
```

Ports 탭에서 **5173**을 연다.

## 28-6. 브라우저 확인

``` text
1. 로그인 화면이 나온다 → "회원가입" → 이메일/이름/비밀번호 입력 → 내 드라이브
2. 새로 만들기 → 새 폴더 → 폴더 더블클릭 → 브레드크럼 "내 드라이브 > 폴더"
3. 파일을 화면에 끌어다 놓기 → 오른쪽 아래 진행률 → 목록에 표시
4. 이미지/PDF/텍스트 더블클릭 → 미리보기, ← → 로 다음 파일
5. ⋮ 메뉴 → 다운로드 → 한글 파일명 그대로 저장되는지
6. F5 → 로그인과 현재 폴더가 유지되는지
7. 사이드바 저장 용량이 늘었는지
```

## 28-7. 디스크 정리 (배포 성공 후)

새 이미지가 정상 동작하면 옛 태그를 지운다. **현재 Deployment가 쓰는 `day7-5`는
지우지 않는다.**

``` bash
kubectl get deployment cloud-file-service -n cloud-file-service \
  -o jsonpath='{.spec.template.spec.containers[0].image}'; echo
# cloud-file-service:day7-5

docker images | grep cloud-file-service
docker rmi cloud-file-service:v2           # 예: Day 7 38번에서 만든 태그 (있을 때만)
docker builder prune -af
docker exec cloud-file-service-control-plane crictl rmi --prune
df -h /
```

> `rollout undo`로 이전 버전에 돌아갈 가능성이 있으면 직전 태그 하나는 남겨 둔다.

------------------------------------------------------------------------

# 29. 관리자 계정 만들기

1. `k8s/configmap.yaml`의 `ADMIN_EMAILS`에 관리자 이메일을 넣는다.

``` yaml
  ADMIN_EMAILS: "admin@example.com"
```

2. 적용하고 Pod를 재시작한다. (환경변수는 Pod 시작 시에만 읽는다)

``` bash
kubectl apply -f k8s/configmap.yaml
kubectl rollout restart deployment/cloud-file-service -n cloud-file-service
kubectl rollout status deployment/cloud-file-service -n cloud-file-service --timeout=240s
```

port-forward 반복문이 새 Pod에 자동으로 다시 붙는다.

3. 브라우저에서

``` text
- 아직 가입 안 한 이메일이면 → 그 이메일로 회원가입 → 바로 관리자
- 이미 가입한 이메일이면     → 로그아웃 → 다시 로그인 → 관리자로 승격
```

4. 오른쪽 위 아바타 메뉴에 **"관리자"** 가 보이고, 이름 옆에 `관리자` 배지가 붙는다.
   관리자 화면(`#/admin`)에서 전체 사용자, 사용량, 파일 수를 보고 다른 사용자를 삭제할
   수 있다. (자기 자신은 삭제할 수 없다.)

curl로 확인:

``` bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"password123"}' | jq -r .token)
curl -s http://localhost:8080/api/admin/users -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

일반 사용자 토큰으로 호출하면 `403 {"message":"권한이 없습니다."}`이다.

------------------------------------------------------------------------

# 30. (선택) ECS / Terraform 반영

> AWS 비용이 발생하는 경로다. Day 5~7에서 ECS를 유지하고 있을 때만 진행한다.
> **운영(ECS)에서는 JWT_SECRET이 반드시 필요하다.** 설정하지 않으면 Git에 공개된
> 개발용 기본 키로 동작하고, 누구나 관리자 토큰을 만들 수 있다. 아래 Terraform
> 변경이 이 값을 Secrets Manager로 자동 주입한다.

## 30-1. Terraform 변경 내용

이미 저장소에 있으면 내용만 비교하고 넘어간다.

**`infra/terraform/secrets.tf` 끝에 추가** --- 서명 키를 Terraform이 무작위로 만들어
Secrets Manager에 저장한다. (코드나 tfvars에 적지 않는다)

``` hcl
# Day 7.5: 로그인 토큰(JWT) 서명 키. 코드나 tfvars에 적지 않고 Terraform이 무작위로 만든다.
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.name_prefix}/jwt-secret"
  recovery_window_in_days = 0

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-jwt-secret"
    }
  )
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}
```

`random` provider는 Day 5에서 S3 bucket 이름에 이미 쓰고 있으므로(`versions.tf`)
새로 설치할 것이 없다. `recovery_window_in_days = 0`은 `terraform destroy` 후 같은
이름으로 바로 다시 만들 수 있게 한다.

**`infra/terraform/ecs.tf`** --- task definition의 `environment`와 `secrets`에 한
항목씩 추가:

``` hcl
        {
          name  = "ADMIN_EMAILS"
          value = var.admin_emails
        }
```

``` hcl
        {
          name      = "JWT_SECRET"
          valueFrom = aws_secretsmanager_secret.jwt_secret.arn
        }
```

**`infra/terraform/iam.tf`** --- execution role이 새 secret을 읽을 수 있게
`task_secrets`의 `resources`에 추가:

``` hcl
    resources = [
      aws_secretsmanager_secret.db_password.arn,
      aws_secretsmanager_secret.jwt_secret.arn
    ]
```

**`infra/terraform/variables.tf`** 끝에 추가 (`enable_eks`는 Day 7 48-1에서 이미
추가했다면 그대로 둔다):

``` hcl
variable "admin_emails" {
  type        = string
  description = "관리자 권한을 받을 이메일 목록 (쉼표로 구분). 이 이메일로 가입하면 ADMIN이 된다."
  default     = ""
}
```

**`infra/terraform/terraform.tfvars`** (로컬 전용, 커밋하지 않음):

``` hcl
admin_emails = "admin@example.com"
```

## 30-2. plan / apply

``` bash
cd infra/terraform
terraform fmt
terraform validate
terraform plan
```

`enable_eks = false`(기본)일 때 예상 결과:

``` text
  # random_password.jwt_secret                         will be created
  # aws_secretsmanager_secret.jwt_secret               will be created
  # aws_secretsmanager_secret_version.jwt_secret       will be created
  # aws_ecs_task_definition.backend                    must be replaced
  # aws_ecs_service.backend                            will be updated in-place
  # aws_iam_role_policy.execution_secrets              will be updated in-place

Plan: 4 to add, 2 to change, 1 to destroy.
```

`1 to destroy`는 **옛 task definition 리비전 교체**다(ECS task definition은 수정할 수
없어 새 리비전을 만든다). RDS, S3, VPC, ECR이 destroy/replace 목록에 있으면
**apply하지 말고** 원인을 먼저 확인한다.

``` bash
terraform apply
cd ../..
```

## 30-3. 새 이미지를 ECR에 올리고 ECS 재배포

ECS task definition은 `ECR:latest` 이미지를 쓴다. 새 코드를 `latest`로 올려야 한다.

방법 A --- GitHub Actions (31번에서 main에 push하면 `backend-deploy.yml`이
`github.sha`와 `latest` 태그로 push한다)

방법 B --- 수동 (Day 7 19번과 같다)

``` bash
ECR_REPOSITORY_URL=$(terraform -chdir=infra/terraform output -raw ecr_repository_url)
aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin "${ECR_REPOSITORY_URL%%/*}"
# ${ECR_REPOSITORY_URL%%/*} = <ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com

docker tag cloud-file-service:day7-5 "$ECR_REPOSITORY_URL:latest"
docker push "$ECR_REPOSITORY_URL:latest"
```

ECR에 새 `latest`가 올라간 뒤 ECS가 새 이미지를 받도록 강제 재배포:

``` bash
CLUSTER=$(terraform -chdir=infra/terraform output -raw ecs_cluster_name)
SERVICE=$(terraform -chdir=infra/terraform output -raw ecs_service_name)

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --force-new-deployment \
  --region ap-northeast-2 > /dev/null

aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE" --region ap-northeast-2
```

새 Task의 공인 IP 확인과 health 체크는 Day 4~6과 같다.

``` bash
curl -s http://<TASK_PUBLIC_IP>:8080/actuator/health; echo
curl -s http://<TASK_PUBLIC_IP>:8080/api/files; echo     # 401 JSON 이어야 한다
```

> ECS 경로의 사용자·파일은 RDS에 저장되므로 kind(로컬 PostgreSQL)에서 가입한 계정과
> 별개다. ECS에서 다시 회원가입한다.

------------------------------------------------------------------------

# 31. CI / Commit & Push

## 31-1. CI는 그대로 동작한다

`.github/workflows/backend-ci.yml`에는 Day 7에서 이미 PostgreSQL service가 들어
있다. 17번의 통합 테스트는 이 PostgreSQL에 붙고, S3는 Mock이므로 AWS 자격 증명 없이
통과한다. 테스트는 JWT_SECRET이 없으면 개발용 기본 키를 쓴다(테스트 전용이므로
괜찮다). **workflow 파일은 수정하지 않는다.**

## 31-2. 커밋 전 확인

``` bash
git status --short
```

비밀 값이 들어간 파일이 목록에 없는지 확인한다.

``` bash
git status --short | grep -E "secret.yaml|tfvars|\.env" \
  && echo "!! 커밋하면 안 되는 파일이 있다" || echo "OK"

git check-ignore -v k8s/secret.yaml infra/terraform/terraform.tfvars frontend/.env.local
```

`k8s/secret.example.yaml`은 자리표시자(`CHANGE_ME...`)만 있으므로 커밋해도 된다.
코드에 실제 키가 없는지도 확인:

``` bash
git diff | grep -nE "AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH) PRIVATE" || echo "키 없음"
```

## 31-3. Commit & Push

``` bash
git add backend frontend infra k8s md
git status --short
git commit -m "feat: day7.5 auth, per-user drive, trash/star/search/preview, new UI"
git push
```

GitHub → Actions에서 **Backend CI**가 초록색인지 확인한다. 실패하면 로그의
`DriveApiIntegrationTests` 부분을 보고 17번과 같은 방법으로 로컬에서 재현한다.

------------------------------------------------------------------------

# 32. 전체 기능 테스트 체크리스트

kind(28번) + Frontend(5173) 기준. **두 브라우저 창**(일반 창 + 시크릿 창)을 쓰면
두 사용자를 동시에 테스트하기 쉽다. (localStorage가 창마다 분리된다)

``` text
[인증]
[ ] 토큰 없이 새로고침 → 로그인 화면
[ ] 잘못된 비밀번호 → "이메일 또는 비밀번호가 올바르지 않습니다."
[ ] 이미 가입된 이메일로 가입 → "이미 가입된 이메일입니다."
[ ] 비밀번호 7자 / 비밀번호 확인 불일치 → 서버 요청 없이 입력칸 아래 안내
[ ] 로그아웃 → 로그인 화면, 뒤로 가기해도 드라이브가 안 보임

[사용자 격리]
[ ] A 창에서 폴더/파일 업로드, B 창(다른 사용자)에는 보이지 않음
[ ] B 창 주소창에 A 의 폴더 주소(#/folders/<A의 id>) 입력 → "찾을 수 없음"
[ ] 두 사용자가 같은 이름의 파일을 올려도 서로 영향 없음

[폴더/파일]
[ ] 새 폴더, 이름 변경(파일은 확장자 앞까지 선택됨), 하위 폴더
[ ] 여러 파일 동시 선택 업로드 → 순서대로 진행률
[ ] 업로드 중 취소
[ ] 50MB 초과 파일 → 업로드 전에 오류 표시
[ ] 폴더 A 를 A 의 하위 폴더로 이동 → 이동 대화상자에 보이지 않음 (API 로는 400)
[ ] 파일을 다른 폴더/내 드라이브로 이동
[ ] 한글 파일명 다운로드

[휴지통]
[ ] 파일 삭제 → 토스트 "실행 취소" → 원래 자리로
[ ] 하위 폴더/파일이 있는 폴더 삭제 → 휴지통에 폴더 하나만 보임
[ ] 휴지통에서 폴더 복원 → 하위 항목도 모두 복원
[ ] 하위 파일을 먼저 따로 삭제한 뒤 폴더 삭제 → 폴더 복원 시 그 파일은 휴지통에 남음
[ ] 원래 폴더를 삭제한 뒤 그 안에 있던 파일(먼저 삭제)을 복원 → 내 드라이브로 복원
[ ] 영구 삭제 / 휴지통 비우기 → 확인 대화상자 → 사라짐, 용량 감소
[ ] 영구 삭제 후 S3 에서도 사라짐: aws s3 ls s3://$S3_BUCKET/users/<내 id>/files/

[중요/검색/최근/용량]
[ ] 별표 → 중요 문서함에 표시, 해제하면 사라짐
[ ] 검색창에 이름 일부(대소문자 무관) → 결과, 휴지통 항목은 제외
[ ] 최근 문서함: 방금 업로드/이름 변경한 파일이 맨 위
[ ] 사이드바 용량이 업로드/영구 삭제에 따라 변함 (휴지통으로 보내기만 하면 그대로)

[미리보기]
[ ] 이미지, PDF, mp4, mp3, txt/md/json 미리보기
[ ] .html / .svg 파일 → 텍스트로만 보임 (스크립트 실행 안 됨)
[ ] 미리보기 지원 안 하는 형식(zip 등) → 다운로드 버튼
[ ] ← → 키로 이전/다음 파일

[계정]
[ ] 내 계정 → 이름 변경 → 오른쪽 위 아바타/이름 즉시 반영
[ ] 비밀번호 변경 (현재 비밀번호 틀리면 오류) → 로그아웃 → 새 비밀번호로 로그인
[ ] 회원 탈퇴 (비밀번호 확인) → 로그인 화면, 같은 계정으로 로그인 불가

[관리자]
[ ] ADMIN_EMAILS 계정 → 관리자 메뉴/페이지
[ ] 일반 사용자 → 주소창에 #/admin 입력해도 사용 불가 (API 403)
[ ] 관리자가 다른 사용자 삭제 → 그 사용자 창에서 아무 동작 → 로그인 화면으로

[화면]
[ ] F5 → 로그인과 현재 위치(폴더/휴지통/검색어) 유지
[ ] 목록/바둑판 보기 전환 → 새로고침해도 유지
[ ] 정렬(이름/날짜/크기) 변경
[ ] 날짜가 한국 시간으로 표시 (방금 올린 파일 = "오후 3:12" 처럼 현재 시각)
[ ] 브라우저 폭을 좁히면 모바일 레이아웃 (햄버거 메뉴, + 버튼)
[ ] OS/브라우저 다크 모드 → 어두운 테마
[ ] 파드 삭제(Day 7 44번) 후 새로고침 → 로그인 유지 (JWT 는 stateless)
```

------------------------------------------------------------------------

# 33. 문제 해결

## 33-1. 배포 후 갑자기 모두 로그인 화면으로 (401)

``` text
원인: JWT_SECRET 이 바뀌었다
  - Secret 을 다시 만들면서 새 무작위 값이 들어감
  - kind 는 기본 키(bootRun) ↔ Secret 키(Pod) 사이를 오감
  - ECS 에서 random_password 가 다시 생성됨
→ 기존 토큰의 서명이 맞지 않아 401 → 프론트가 토큰을 지우고 로그인 화면으로
```

정상 동작이다. **다시 로그인하면 된다.** 자주 일어나면 Secret을 다시 만들지 않았는지
확인한다(28-2의 명령은 값이 있으면 건드리지 않는다).

## 33-2. 예전에 올린 파일/폴더가 안 보인다

Day 7 데이터는 `owner_id`가 `NULL`이라 어떤 사용자에게도 보이지 않는다(4-2).
정리하려면 4-3을 본다.

Pod 로그에 `Error executing DDL "alter table ... add column ..."`이 있다면 컬럼 추가가
실패한 것이다. 보통 새 boolean 컬럼에 기본값이 없을 때 나는데, 이 저장소의 엔티티는
`@ColumnDefault("false")`를 붙여 두었으므로 12번의 엔티티 코드가 그대로인지 확인한다.

## 33-3. 413 --- 업로드 실패

| message | 원인 |
|---|---|
| `파일 크기는 50MB를 초과할 수 없습니다.` | 파일 하나가 50MB 초과 |
| `저장 공간이 부족합니다.` | 사용량(휴지통 포함) + 파일 크기 > 한도 → 휴지통 비우기 |
| (HTML 응답) `413 Request Entity Too Large` | 앞단 프록시 제한 |

앞단 프록시가 있을 때만 해당한다.

``` text
nginx (docker compose 의 nginx 등)   : server/http 블록에 client_max_body_size 50m;
ingress-nginx (Day 7 47번 Ingress)   : metadata.annotations 에
                                       nginx.ingress.kubernetes.io/proxy-body-size: "50m"
```

한도를 바꾸려면 `STORAGE_LIMIT_BYTES` 환경변수(ConfigMap)를 쓴다.

## 33-4. 업로드 시 `mark/reset` 오류

``` text
Content input stream does not support mark/reset, and was already read once.
```

Day 7.5 코드는 `fromBytes`를 쓰므로 이 메시지는 나오지 않아야 한다. 여전히 보이면
**옛 이미지가 실행 중**인 것이다(`kubectl get deployment ... -o jsonpath=...image`로
`day7-5`인지 확인). 대신 `파일 저장소 처리 중 오류가 발생했습니다.`(502)가 나오면 Pod →
S3 네트워크 문제다. Day 7 6-1의 `iptables-legacy` 규칙을 다시 실행한다(Codespace
재시작 후 필수).

## 33-5. 화면에 HTTP 502 / Vite에 ECONNREFUSED

port-forward가 꺼져 있다. 28-5의 반복문을 다시 실행한다. bootRun과 동시에 켜서
8080 충돌(`address already in use`)이 났는지도 확인한다.

## 33-6. 관리자 메뉴가 안 보인다

``` text
1. ConfigMap 의 ADMIN_EMAILS 에 이메일이 정확히 들어갔는지 (대소문자 무관, 공백 무관)
2. ConfigMap 수정 후 kubectl rollout restart 했는지 (Pod 가 시작할 때만 읽음)
3. 로그아웃 후 다시 로그인했는지 (역할은 토큰 안에 있어서 예전 토큰은 USER)
```

``` bash
kubectl exec deployment/cloud-file-service -n cloud-file-service -- printenv ADMIN_EMAILS
```

## 33-7. 날짜/시간이 9시간 틀리다

프론트는 서버 시간을 **UTC로 해석**한다(19-3). 서버 컨테이너의 시간대를
`Asia/Seoul`로 바꾸면(`TZ` 환경변수 등) 오히려 9시간 틀어진다. 서버는 UTC 그대로
둔다. (Codespaces, kind Pod, ECS 기본값이 UTC다.)

## 33-8. 시작 실패: JWT_SECRET이 너무 짧다

``` text
app.jwt.secret(JWT_SECRET)은 32바이트 이상이어야 합니다.
```

HS256은 256비트(32바이트) 이상의 키가 필요하다. `openssl rand -hex 32`(64자)로 만든
값을 넣는다.

``` bash
kubectl patch secret cloud-file-service-secret -n cloud-file-service --type merge \
  -p "{\"stringData\":{\"JWT_SECRET\":\"$(openssl rand -hex 32)\"}}"
kubectl rollout restart deployment/cloud-file-service -n cloud-file-service
```

(값이 바뀌므로 모두 다시 로그인해야 한다.)

## 33-9. `No space left on device`

Docker build, Gradle, npm 어디서든 날 수 있다.

``` bash
df -h /
docker system df
docker images | grep cloud-file-service      # 쓰지 않는 옛 태그 확인
docker rmi <옛 태그>
docker builder prune -af
docker exec cloud-file-service-control-plane crictl rmi --prune
npm cache clean --force
rm -rf backend/build frontend/dist
```

`docker system prune --volumes`는 PostgreSQL 데이터(계정, 파일 메타데이터)까지 지우므로
사용하지 않는다.

## 33-10. 기타

| 증상 | 확인 |
|---|---|
| Pod `0/1 Ready` | `/actuator/health/**`가 `permitAll`인지 (SecurityConfig) |
| 로그인하면 바로 다시 로그인 화면 | 브라우저 콘솔/Network에서 `/api/auth/me` 응답 확인. 401이면 JWT_SECRET이 Pod마다 다른지(Secret 하나를 쓰므로 보통 같다) |
| 다운로드 파일 이름이 `download` | 서버가 오래된 이미지 / `Content-Disposition` 확인 (18번 7) |
| "서버에 연결할 수 없습니다" 화면 | Backend가 꺼짐. "다시 시도" 버튼 |
| 탈퇴/관리자 삭제 후 S3 객체가 남음 | Pod 로그의 `S3 객체 일괄 삭제 실패` 확인 후 `aws s3 rm`으로 정리 |

------------------------------------------------------------------------

# 34. 확장 과제 (이 문서에서는 구현하지 않음)

> 아래는 **아직 구현하지 않은** 다음 단계 아이디어다. 저장소에 코드가 없다.

| 과제 | 방향 |
|---|---|
| Google 로그인 (OAuth2) | `spring-boot-starter-oauth2-client`로 Google 로그인 → 성공 시 우리 JWT 발급. `users`에 `provider`, `provider_id` 컬럼 |
| 공유 링크 | `shares(id, file_id, token, expires_at)` 테이블, 로그인 없이 `GET /s/{token}`으로 다운로드. 만료/비밀번호 옵션 |
| 다른 사용자와 공유 | `permissions(file_id, user_id, role)` → 조회 쿼리를 "내 것 OR 공유받은 것"으로 확장 |
| 폴더 업로드 | `<input webkitdirectory>` + `file.webkitRelativePath`로 폴더 구조를 만들며 업로드 |
| 버전 관리 | 같은 파일 덮어쓰기 시 `file_versions` 테이블 + S3 Versioning |
| presigned URL 직접 업로드 | 서버는 S3 presigned PUT URL만 발급하고 브라우저가 S3로 직접 업로드 → 50MB 제한 해제, 서버 메모리 절약. S3 CORS 설정 필요 |
| 토큰 갱신 | 짧은 access token(15분) + refresh token(HttpOnly 쿠키)로 만료 시 자동 재발급 |
| 로그인 시도 제한 | 같은 이메일/IP의 연속 실패 시 잠시 차단 (무차별 대입 방지) |
| 휴지통 30일 자동 삭제 | `@Scheduled`로 `trashed_at < now - 30일` 영구 삭제 |

------------------------------------------------------------------------

# 35. Day 7.5에서 새로 만들거나 수정하는 파일

## Backend

``` text
backend/build.gradle                                   (의존성 3줄 추가)
backend/src/main/resources/application.properties      (50MB, JWT, 관리자, 용량)

[새로 생성]
config/SecurityConfig.java
security/JwtKeyProvider.java, JwtTokenService.java, CurrentUser.java, JsonSecurityErrorHandler.java
entity/Role.java, UserEntity.java
repository/UserRepository.java
dto/SignupRequest, LoginRequest, UpdateProfileRequest, ChangePasswordRequest, DeleteAccountRequest,
    UserResponse, AuthResponse, AdminUserResponse, DriveItems, StorageResponse
exception/ResourceNotFoundException, UnauthorizedException, ConflictException, QuotaExceededException
service/UserService, AdminService, DriveService, UserDataCleaner, StorageQuota, FolderTree, StoredFile
controller/AuthController, UserController, AdminController, DriveController
src/test/.../api/DriveApiIntegrationTests.java

[수정]
entity/FileEntity, FolderEntity
repository/FileRepository, FolderRepository
dto/FileResponse, FolderResponse
exception/GlobalExceptionHandler
storage/S3StorageService
service/FileService, FolderService
controller/FileController, FolderController
```

## Frontend

``` text
[수정]  index.html, public/favicon.svg, src/main.jsx, src/App.jsx, src/App.css, src/index.css,
        src/api/client.js, fileApi.js, folderApi.js,
        src/components/Breadcrumb.jsx, Sidebar.jsx, src/utils/format.js
[새로]  19-2 구조의 나머지 전부 (api 4, utils 3, hooks 10, components 25, pages 5)
[삭제]  19-1 목록
```

## Infra

``` text
k8s/configmap.yaml             ADMIN_EMAILS
k8s/secret.example.yaml        JWT_SECRET 자리표시자
infra/terraform/secrets.tf     random_password + jwt-secret
infra/terraform/ecs.tf         ADMIN_EMAILS env, JWT_SECRET secret
infra/terraform/iam.tf         execution role 이 jwt-secret 읽기
infra/terraform/variables.tf   admin_emails

로컬에서만 (커밋 안 함)
k8s/secret.yaml / kind Secret 의 JWT_SECRET
infra/terraform/terraform.tfvars 의 admin_emails
```

## 유지

``` text
Dockerfile, docker-compose.yml, k8s/deployment.yaml, k8s/service.yaml,
.github/workflows/*, frontend/package.json, vite.config.js, eslint.config.js
```

------------------------------------------------------------------------

# 36. Day 7.5 최종 체크리스트

``` text
[ ] 체크포인트 커밋 (checkpoint before day7.5)
[ ] build.gradle 에 security / oauth2-resource-server / security-test
[ ] application.properties (50MB, JWT, ADMIN, 용량)
[ ] users 테이블 / owner_id / 휴지통 컬럼이 자동 생성됨
[ ] SecurityConfig: 가입/로그인/health 만 공개, admin 은 ROLE_ADMIN
[ ] 401/403 이 JSON
[ ] 모든 Repository 조회에 Owner_Id
[ ] 남의 리소스 → 404
[ ] S3 key users/{userId}/files/{uuid}
[ ] 휴지통: 이동 / 복원(함께 삭제된 것만) / 영구 삭제 / 비우기
[ ] 중요 / 검색 / 최근 / 용량 / 순환 이동 방지
[ ] 한글 파일명 다운로드, 미리보기(HTML/SVG 는 텍스트)
[ ] DriveApiIntegrationTests 통과 (./gradlew clean build)
[ ] npm run lint / npm run build 통과
[ ] kind: JWT_SECRET Secret, ADMIN_EMAILS ConfigMap, day7-5 이미지 rollout
[ ] 브라우저: 가입 → 업로드 → 미리보기 → 휴지통 → 복원 → F5 유지
[ ] 두 사용자 격리 확인
[ ] 관리자 계정
[ ] (선택) ECS: terraform apply, ECR latest push, force-new-deployment
[ ] 비밀 값 없이 commit & push, Backend CI 통과
```

------------------------------------------------------------------------

# 37. Day 7.5 한 문장 / 종료

> **Day 7의 Kubernetes·CI/CD 구조를 그대로 두고, Spring Security + JWT로
> 무상태 로그인을 붙여 모든 파일·폴더·S3 객체에 주인을 정하고, 휴지통·중요·검색·
> 최근·미리보기·용량을 갖춘 개인 클라우드 드라이브로 완성한다.**

최종적으로:

``` text
[✓] 회원가입 / 로그인 / 로그아웃 (JWT, stateless)
[✓] BCrypt 비밀번호
[✓] 내 계정 (이름, 비밀번호, 탈퇴)
[✓] 관리자 (ADMIN_EMAILS)
[✓] 사용자별 드라이브 (owner_id, 404)
[✓] 휴지통 / 복원 / 영구 삭제
[✓] 중요 / 검색 / 최근 / 용량
[✓] 미리보기 / 한글 다운로드 / 업로드 진행률
[✓] 새 UI (해시 라우터, 목록/바둑판, 모바일, 다크 모드)
[✓] kind 배포 (Secret JWT_SECRET, ConfigMap ADMIN_EMAILS)
[✓] (선택) ECS + Secrets Manager
[✓] 통합 테스트 + CI
```

핵심 흐름:

``` text
사용자
 ↓ 로그인 → JWT
React (Authorization: Bearer ...)
 ↓
Spring Security (서명 검증 → userId, role)
 ↓
Service (owner_id = userId)
 ↓
PostgreSQL/RDS (users, folders, files) + S3 (users/{userId}/files/{uuid})
```

**여기까지 완료하면 Day 7.5가 끝난다.**
