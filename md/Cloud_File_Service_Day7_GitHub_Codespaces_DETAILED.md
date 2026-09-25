# Cloud File Service --- Day 7

## Day 6 완료 상태에서 Kubernetes + CI/CD + Monitoring + 장애 대응까지 연결하기

> 이 문서는 실제
> `Cloud_File_Service_Day6_GitHub_Codespaces_DETAILED.md`를 기준으로
> 이어간다.
>
> Day 6에서 이미 만든 `frontend/`, Spring Boot Backend, RDS, S3, Docker,
> ECR, ECS Fargate, Terraform, CloudWatch를 삭제하거나 처음부터 다시
> 만들지 않는다.
>
> Day 7의 핵심은 **기존 파일 서비스를 Kubernetes로 실행하고, GitHub
> Actions로 테스트/빌드/Docker/ECR 과정을 자동화하며, Health
> Check·Logs·Rollback까지 직접 실습하는 것**이다.

------------------------------------------------------------------------

# 0. Day 7 최종 목표

Day 6:

``` text
Browser
   |
React + Vite
   |
Spring Boot / ECS
   |
+-- RDS  -> Metadata
|
+-- S3   -> Actual Files
```

Day 7:

``` text
GitHub
   |
   v
GitHub Actions
   |
   +--> Test
   +--> Gradle Build
   +--> Docker Build
   +--> ECR Push
   |
   v
Kubernetes
   |
   +--> Deployment
   |      +--> Pod A
   |      +--> Pod B
   |
   +--> Service
   +--> ConfigMap
   +--> Secret
   +--> Health Check
   +--> Rollout / Rollback
   |
   +--> Monitoring
```

## 필수

``` text
[ ] Day 6 기능 정상
[ ] kubectl / Kubernetes Cluster 확인
[ ] Namespace
[ ] ConfigMap
[ ] Secret
[ ] Spring Boot Actuator
[ ] Deployment
[ ] Service
[ ] Readiness Probe
[ ] Liveness Probe
[ ] Pod 로그
[ ] GitHub Actions CI
[ ] Docker Build
[ ] ECR Push
[ ] Kubernetes Rollout
[ ] Kubernetes Rollback
[ ] Pod 삭제 후 자동 복구
[ ] Pod 교체 후 파일 유지
```

## 선택

``` text
[ ] HPA
[ ] Ingress
[ ] Prometheus
[ ] Grafana
[ ] OpenTelemetry
[ ] GitHub OIDC
[ ] Argo CD
[ ] EKS
[ ] Frontend Kubernetes
```

> **중요:** 선택 기능을 먼저 하지 않는다.
> `CI + ECR + Kubernetes Deployment + Health Check + Rollback`이 먼저다.

## 이 문서의 실습 경로 한눈에 보기

``` text
[필수] kind 경로 (Codespaces 안에서, 비용 0원)
  1~6   상태 확인 / kind 클러스터
  7~17  Namespace, ConfigMap, Secret(로컬 PostgreSQL), Actuator
  18~27 로컬 이미지 → kind load → Deployment → Service → port-forward
  29~37 GitHub Actions CI, Docker/ECR Workflow
  38~45 새 버전 배포, Rollout, Rollback, 장애 실습

[선택] EKS 경로 (AWS 비용 발생)
  48-1  Terraform으로 EKS 생성 → kubeconfig 전환 → deployment-eks.yaml 배포
        → 확인 후 반드시 삭제
```

> **이미 저장소에 있는 파일:** 현재 저장소에는 Day 7 진행 중에 만든
> `k8s/namespace.yaml`, `k8s/configmap.yaml`, `k8s/secret.example.yaml`,
> `k8s/deployment.yaml`, `k8s/serviceaccount.yaml`, `k8s/deployment-eks.yaml`,
> `infra/terraform/eks.tf`와 Actuator 설정이 이미 있을 수 있다. 문서에 나온
> 파일이 **이미 저장소에 있으면 내용만 비교하고 넘어간다.** 새로 덮어쓰거나
> 중복으로 추가하지 않는다.

------------------------------------------------------------------------

# 1. Day 6 상태 저장

## Codespaces를 다시 켠 뒤 가장 먼저 할 일

Codespace를 중지했다가 다시 시작하면 터미널 세션은 새로 열리고,
Kubernetes의 `current-context`가 없거나 kind 클러스터가 사라져 있을 수
있다. 아래 명령으로 현재 상태를 먼저 확인한다.

``` bash
pwd
git status --short
docker info
kubectl config current-context
kubectl config get-contexts
kubectl get nodes
```

`current-context is not set`, `no context exists`, 또는 연결 오류가 나오면
아직 Kubernetes 작업을 시작할 수 없는 상태다. 이 경우 [6. kind 사용 시](#6-kind-사용-시)의
클러스터 생성 절차를 실행한다.

Codespaces에서 Docker 자체가 실행되지 않았다면 먼저 Docker 기능을 복구하고
`docker info`가 성공한 뒤 진행한다.

프로젝트 루트:

``` bash
git status
```

문제가 없다면:

``` bash
git add .
git commit -m "checkpoint before day7"
git push
```

현재 브랜치:

``` bash
git branch --show-current
```

원격:

``` bash
git remote -v
```

------------------------------------------------------------------------

# 2. Day 6 기능을 먼저 확인

Backend:

``` bash
cd backend
./gradlew bootRun
```

다른 터미널:

``` bash
cd frontend
npm run dev -- --host 0.0.0.0
```

브라우저에서 반드시 확인:

``` text
1. 내 드라이브
2. 새 폴더
3. 폴더 진입
4. 파일 업로드
5. 파일 목록
6. 다운로드
7. 삭제
8. F5
```

여기까지 정상이어야 Day 7을 시작한다.

현재 저장소의 로컬 DB를 직접 실행할 때는 프로젝트 루트에서:

``` bash
docker compose up -d postgres
docker compose ps
```

호스트에서 실행하는 `./gradlew bootRun`은 기본값인
`jdbc:postgresql://localhost:5432/cloud_file`로 접속한다. 하지만 kind Pod의
`localhost`는 Pod 자신이므로 이 주소를 그대로 Kubernetes Secret에 넣으면
안 된다.

또한 Day 5의 RDS는 `publicly_accessible = false`이고 private subnet에
있으므로 **Codespaces의 kind Pod에서는 RDS에 연결할 수 없다.** 따라서 kind
경로에서는 `docker compose`로 띄운 로컬 PostgreSQL 컨테이너
(`cloud-file-postgres`)를 kind 네트워크의 Gateway IP로 접속해서 사용한다. 구체적인 방법은
[13. 실제 Secret 생성](#13-실제-secret-생성)에서 설명한다.

RDS endpoint는 EKS 경로([48-1](#48-1-선택-eks에-배포하기))에서만 사용한다.

``` bash
terraform -chdir=infra/terraform output -raw rds_endpoint
```

------------------------------------------------------------------------

## kind와 EKS 중 어디에서 실습하는가?

``` text
kind (필수)
  - Codespace 안의 Docker 위에서 동작하는 로컬 Kubernetes
  - 비용 없음
  - 이미지: 로컬에서 build 후 kind load (cloud-file-service:latest)
  - DB: 로컬 PostgreSQL 컨테이너
  - Manifest: k8s/deployment.yaml

EKS (선택)
  - AWS가 관리하는 Kubernetes
  - 비용 발생 (Control Plane + EC2 Node)
  - 이미지: ECR (cloud-file-service-dev)
  - DB: RDS, S3 권한: EKS Pod Identity
  - Manifest: k8s/serviceaccount.yaml + k8s/deployment-eks.yaml
```

EKS는 Day 5 Terraform에 `infra/terraform/eks.tf`를 추가해서 만든다. 전체
절차는 [48-1. 선택: EKS에 배포하기](#48-1-선택-eks에-배포하기)에 있다.
**kind 경로를 끝까지 성공한 뒤에** 진행한다.

`kubectl` 명령은 항상 **현재 context**의 클러스터에 적용된다. EKS를
만든 뒤에는 명령을 실행하기 전에 반드시 context를 확인하는 습관을 들인다.

``` bash
kubectl config current-context
# kind-cloud-file-service  → kind
# arn:aws:eks:ap-northeast-2:...:cluster/cloud-file-service-dev → EKS
```

------------------------------------------------------------------------

# 3. Day 7에서 새로 만드는 폴더

프로젝트 루트:

``` bash
mkdir -p k8s
mkdir -p .github/workflows
mkdir -p monitoring
```

최종 구조:

``` text
cloud-file-service/
├── backend/
├── frontend/
├── infra/
│   └── terraform/
│       └── eks.tf            # 선택: EKS용
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.example.yaml
│   ├── secret.yaml           # 로컬에서 생성, Git에 커밋하지 않음
│   ├── deployment.yaml       # kind용 (로컬 이미지)
│   ├── service.yaml
│   ├── serviceaccount.yaml   # 선택: EKS용
│   ├── deployment-eks.yaml   # 선택: EKS용 (ECR 이미지)
│   ├── ingress.yaml          # 선택
│   └── hpa.yaml              # 선택
├── .github/
│   └── workflows/
│       ├── backend-ci.yml
│       └── backend-deploy.yml
├── monitoring/
│   └── README.md
└── README.md
```

------------------------------------------------------------------------

# 4. Kubernetes 기본 개념

``` text
Pod
→ 실제 Container가 실행되는 단위

Deployment
→ Pod를 원하는 개수로 유지

Service
→ Pod에 안정적으로 접근

ConfigMap
→ 일반 설정

Secret
→ 민감한 설정

Ingress
→ 외부 HTTP 진입점

HPA
→ 부하에 따라 Pod 수 조절
```

Day 4의 ECS와 Day 7의 Kubernetes는 모두 Container를 관리하지만 사용하는
방식과 관리 모델이 다르다.

Day 4:

``` text
Docker → ECR → ECS
```

Day 7:

``` text
Docker → ECR → Kubernetes
```

기존 ECS/Terraform을 삭제하지 않는다.

------------------------------------------------------------------------

# 5. kubectl 확인

``` bash
kubectl version --client
```

``` bash
kubectl cluster-info
```

Node:

``` bash
kubectl get nodes
```

현재 Context:

``` bash
kubectl config current-context
```

`k8s/*.yaml` 파일은 Kubernetes에 "무엇을 만들지" 적은 설명서일 뿐이고,
`kubectl` 명령만 설치되어 있어도 클러스터가 자동으로 생기지 않는다.
Codespaces에서 실습하려면 아래의 kind 클러스터를 먼저 만든다.

`kubectl config current-context`가 실패하면 `kubectl cluster-info`를
반복 실행하지 말고 6번으로 이동한다.

------------------------------------------------------------------------

# 6. kind 사용 시

설치 확인:

``` bash
kind version
```

`kind: command not found`라면 kind를 설치한다.

``` bash
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.30.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind
```

Cluster 생성:

``` bash
kind create cluster --name cloud-file-service
```

생성이 끝나면 kind가 kubeconfig의 context를 자동으로 설정한다. 확인:

``` bash
kubectl config current-context
kubectl cluster-info
kubectl get nodes
```

이미 클러스터가 있다는 오류가 나오면 삭제하지 말고 먼저 확인한다.

``` bash
kind get clusters
kubectl config get-contexts
```

기존 클러스터의 context가 목록에 있으면 다음처럼 선택한다.

``` bash
kubectl config use-context kind-cloud-file-service
```

확인:

``` bash
kubectl get nodes
```

삭제는 테스트가 끝난 뒤에만:

``` bash
kind delete cluster --name cloud-file-service
```

------------------------------------------------------------------------

# 7. Namespace

파일:

``` text
k8s/namespace.yaml
```

> 이미 저장소에 있으면 내용만 비교하고 넘어간다.

``` yaml
apiVersion: v1
kind: Namespace
metadata:
  name: cloud-file-service
```

적용:

``` bash
kubectl apply -f k8s/namespace.yaml
```

확인:

``` bash
kubectl get namespace cloud-file-service
```

------------------------------------------------------------------------

# 8. 왜 Namespace를 사용하는가?

구조:

``` text
Kubernetes Cluster
|
+-- kube-system
|
+-- default
|
+-- cloud-file-service
      |
      +-- Pod
      +-- Service
      +-- ConfigMap
      +-- Secret
```

프로젝트 리소스를 한 공간에서 관리하기 쉽다.

------------------------------------------------------------------------

# 9. Day 6 Backend의 실제 설정부터 확인

먼저 현재 설정 파일을 찾는다.

``` bash
find backend/src/main/resources -maxdepth 2 -type f -print
```

예상 결과:

``` text
backend/src/main/resources/application.properties
```

(예전 상태의 저장소라면 `application.yml`도 함께 보일 수 있다. 아래 참고)

Backend가 실제로 읽는 환경변수를 찾는다.

``` bash
grep -Rn \
  "spring.datasource\|AWS_\|S3\|BUCKET\|DB_" \
  backend/src/main \
  2>/dev/null
```

현재 저장소 기준으로 실제 사용되는 값은 `application.properties`의 다음
환경변수다.

``` text
DB_URL        (또는 SPRING_DATASOURCE_URL)       → spring.datasource.url
DB_USERNAME   (또는 SPRING_DATASOURCE_USERNAME)  → spring.datasource.username
DB_PASSWORD   (또는 SPRING_DATASOURCE_PASSWORD)  → spring.datasource.password
AWS_REGION                                       → aws.region
S3_BUCKET                                        → aws.s3.bucket
```

> `application.yml`이 남아 있고 그 안에 `AWS_S3_BUCKET`, `cloud.aws.*`가
> 보이더라도 Backend 코드(`S3Config`, `S3StorageService`)는 `aws.region`,
> `aws.s3.bucket`만 읽는다. 따라서 Kubernetes에는 `AWS_S3_BUCKET`이 아니라
> **`S3_BUCKET`**을 넣는다. (사용하지 않는 `application.yml`은 삭제해도 된다.)

**환경변수 이름을 추측하지 않는다.**

Day 5에서 사용했던 실제 환경변수와 현재 Backend 코드를 기준으로
Kubernetes 설정을 만든다.

------------------------------------------------------------------------

# 10. ConfigMap

파일:

``` text
k8s/configmap.yaml
```

> 이미 저장소에 있으면 내용만 비교하고 넘어간다. (`S3_BUCKET` 값이 아래
> 명령의 출력과 같은지만 확인한다.)

실제 S3 버킷 이름 확인:

``` bash
terraform -chdir=infra/terraform output -raw s3_bucket_name
```

기본 예:

``` yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cloud-file-service-config
  namespace: cloud-file-service
data:
  AWS_REGION: "ap-northeast-2"
  S3_BUCKET: "실제-S3-버킷-이름"   # 예: cloud-file-service-dev-files-xxxxxxxx
```

현재 Backend는 `application.properties`에서 `AWS_REGION`, `S3_BUCKET`,
`DB_URL`, `DB_USERNAME`, `DB_PASSWORD`를 읽는다. 현재 저장소에는
`application-prod.properties`가 없으므로 `SPRING_PROFILES_ACTIVE: prod`를
추가하지 않는다.

실제 프로젝트에서 다른 이름을 사용한다면 그 이름으로 바꾼다.

적용:

``` bash
kubectl apply -f k8s/configmap.yaml
```

확인:

``` bash
kubectl get configmap \
  -n cloud-file-service
```

------------------------------------------------------------------------

# 11. ConfigMap과 Secret 구분

ConfigMap:

``` text
일반 설정
지역
프로필
기능 옵션
```

Secret:

``` text
DB Password
Token
Credential
API Secret
```

잘못된 예:

``` yaml
data:
  DB_PASSWORD: "mypassword"
```

민감정보는 ConfigMap에 넣지 않는다.

------------------------------------------------------------------------

# 12. Secret 예제

파일:

``` text
k8s/secret.example.yaml
```

``` yaml
apiVersion: v1
kind: Secret
metadata:
  name: cloud-file-service-secret
  namespace: cloud-file-service
type: Opaque
stringData:
  DB_USERNAME: "CHANGE_ME"
  DB_PASSWORD: "CHANGE_ME"
  DB_URL: "jdbc:postgresql://CHANGE_ME:5432/cloud_file"
```

이 파일은 **예제**다.

> 이미 저장소에 있으면 내용만 비교한다. 단, DB 이름이 `cloudfiles`로 되어
> 있다면 `cloud_file`로 고친다. Day 3.5의 docker compose PostgreSQL
> (`POSTGRES_DB: cloud_file`)과 Day 5의 RDS(`db_name = "cloud_file"`)는 모두
> `cloud_file`을 사용한다. DB 이름이 다르면 Pod가 `database "cloudfiles" does
> not exist` 오류로 `CrashLoopBackOff`가 된다.

실제 비밀번호를 적은 파일은 Git에 올리지 않는다.

------------------------------------------------------------------------

# 13. 실제 Secret 생성

> 이 절은 **kind 경로**다. EKS용 Secret은
> [48-1](#48-1-선택-eks에-배포하기)에서 RDS 값으로 따로 만든다. Secret은
> 클러스터마다 따로 존재하므로 kind와 EKS에 서로 다른 값을 넣어도 된다.

먼저 context가 kind인지 확인한다.

``` bash
kubectl config current-context
# kind-cloud-file-service
```

## 13-1. kind Pod에서 접속할 PostgreSQL 주소 확인

kind 노드는 `kind`라는 Docker 네트워크에서 실행되고, docker compose의
PostgreSQL(`cloud-file-postgres`)은 호스트의 `5432` 포트로 publish되어 있다.
kind Pod는 **`kind` 네트워크의 Gateway IP**(= 호스트)를 통해 이 포트에 접속한다.

프로젝트 루트에서:

``` bash
docker compose up -d postgres

PG_IP=$(docker network inspect kind \
  -f '{{range .IPAM.Config}}{{.Gateway}} {{end}}' \
  | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
echo "$PG_IP"
```

`172.18.0.1`, `172.20.0.1`처럼 **끝자리가 `.1`인 IPv4**가 출력되어야 한다.

> `docker network connect kind cloud-file-postgres`로 PostgreSQL 컨테이너를
> kind 네트워크에 직접 붙이고 그 컨테이너 IP(`172.x.0.3` 등)를 쓰는 방법은
> Codespaces(Docker 29)에서 IPv4 연결이 `Connect timed out`으로 실패하는 경우가
> 있어 사용하지 않는다. Gateway IP는 kind 네트워크가 유지되는 한 바뀌지 않는다.

연결 확인(선택):

``` bash
docker exec cloud-file-service-control-plane \
  bash -c "timeout 3 bash -c '</dev/tcp/$PG_IP/5432' && echo ok || echo fail"
```

`ok`가 나와야 한다. `fail`이면 `docker compose ps`로 postgres가 `healthy`인지,
`docker-compose.yml`에 `ports: - "5432:5432"`가 있는지 확인한다.

## 13-2. Secret 만들기

로컬 PostgreSQL 계정은 `docker-compose.yml`의 값(`cloud_user` /
`cloud_password` / DB `cloud_file`)을 사용한다.

S3 업로드까지 kind에서 테스트하려면 Pod에도 AWS 자격 증명이 필요하다.
kind Pod에는 ECS Task Role이나 EKS Pod Identity 같은 IAM Role이 없기 때문이다.
Codespace에서 `aws configure`로 설정한 Access Key를 **kind용 Secret에만**
넣는다.

``` bash
kubectl create secret generic cloud-file-service-secret \
  --namespace cloud-file-service \
  --from-literal=DB_URL="jdbc:postgresql://${PG_IP}:5432/cloud_file" \
  --from-literal=DB_USERNAME='cloud_user' \
  --from-literal=DB_PASSWORD='cloud_password' \
  --from-literal=AWS_ACCESS_KEY_ID="$(aws configure get aws_access_key_id)" \
  --from-literal=AWS_SECRET_ACCESS_KEY="$(aws configure get aws_secret_access_key)" \
  --dry-run=client -o yaml | kubectl apply -f -
```

`--dry-run=client -o yaml | kubectl apply -f -`를 사용하면 Secret이 이미 있어도
오류 없이 새 값으로 갱신된다.

> `aws configure get`이 빈 값을 출력하면 AWS CLI 자격 증명이 설정되지 않은
> 것이다. 이 경우에도 Health Check와 DB 연결은 동작하지만 파일 업로드/다운로드는
> S3 권한 오류로 실패한다.

파일로 관리하고 싶다면 `k8s/secret.example.yaml`을 복사해 `k8s/secret.yaml`을
만들고 값을 입력한 뒤 적용해도 된다. 이때도 `DB_URL`은 위의
`jdbc:postgresql://<PG_IP>:5432/cloud_file` 형식이어야 한다.

``` bash
cp k8s/secret.example.yaml k8s/secret.yaml
# k8s/secret.yaml의 DB_USERNAME, DB_PASSWORD, DB_URL 수정
kubectl apply -f k8s/secret.yaml
```

> kind에서는 `DB_URL`에 RDS endpoint를 넣지 않는다. RDS는 private subnet에
> 있어 Codespace/kind에서 접근할 수 없으므로 Pod가 DB 연결 timeout으로
> `CrashLoopBackOff`가 된다.

확인:

``` bash
kubectl get secret \
  -n cloud-file-service
kubectl get secret cloud-file-service-secret \
  -n cloud-file-service \
  -o jsonpath='{.data.DB_URL}' | base64 -d; echo
```

`.gitignore`에 `k8s/secret.yaml`이 있는지 확인한다.

``` bash
grep -n "secret.yaml" .gitignore
```

현재 저장소에는 `/k8s/secret.yaml`이 이미 등록되어 있다. 없다면 다음을
추가한다.

``` gitignore
/k8s/secret.yaml
*.secret.yaml
```

------------------------------------------------------------------------

# 14. Spring Boot Actuator 추가

Kubernetes Health Check를 위해 Actuator를 사용한다.

먼저:

``` bash
ls backend
```

`build.gradle`이면:

``` text
backend/build.gradle
```

현재 `backend/build.gradle`에는 아래 의존성이 이미 있다.

``` gradle
implementation 'org.springframework.boot:spring-boot-starter-actuator'
```

따라서 중복 추가하지 않는다.

`build.gradle.kts`라면:

``` kotlin
implementation("org.springframework.boot:spring-boot-starter-actuator")
```

------------------------------------------------------------------------

# 15. Actuator 설정

`application.properties`라면:

``` text
backend/src/main/resources/application.properties
```

현재 저장소의 `application.properties`에는 다음 설정이 이미 있다.

``` properties
management.endpoints.web.exposure.include=health,info
management.endpoint.health.probes.enabled=true
```

따라서 이 설정을 다시 추가하지 않는다.

``` bash
cd backend
./gradlew test
./gradlew bootRun
```

`application.yml`을 사용하는 경우에는 YAML 문법으로 동일한 설정을
적용한다.

------------------------------------------------------------------------

# 16. Health API 테스트

Backend:

``` bash
cd backend
./gradlew bootRun
```

다른 터미널:

``` bash
curl -i http://localhost:8080/actuator/health
```

예:

``` json
{
  "status": "UP"
}
```

> `bootRun`은 PostgreSQL에 연결되어야 시작되므로 먼저
> `docker compose up -d postgres`가 실행되어 있어야 한다.
> 확인이 끝나면 `bootRun` 터미널에서 `Ctrl+C`로 종료한다. 뒤의
> `kubectl port-forward ... 8080:8080`과 포트 8080이 충돌하기 때문이다.

------------------------------------------------------------------------

# 17. 왜 Health Check가 필요한가?

Container가 살아 있어도 Spring Boot가 정상적으로 요청을 처리하지 못할 수
있다.

그래서 Kubernetes가:

``` text
/actuator/health
```

를 확인하게 한다.

``` text
Kubernetes
   |
   v
Spring Boot
   |
   v
/actuator/health
```

------------------------------------------------------------------------

# 18. Deployment

파일:

``` text
k8s/deployment.yaml
```

아래 Deployment는 **kind용**이다. ECR이 아니라 18-1에서 만들어 kind에
넣은 로컬 이미지 `cloud-file-service:latest`를 사용한다. EKS용은 ECR 이미지를
사용하는 별도 파일 `k8s/deployment-eks.yaml`([48-1](#48-1-선택-eks에-배포하기))이다.

> 이미 저장소에 있으면 내용만 비교하고 넘어간다.

``` yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloud-file-service
  namespace: cloud-file-service
spec:
  replicas: 2

  selector:
    matchLabels:
      app: cloud-file-service

  template:
    metadata:
      labels:
        app: cloud-file-service

    spec:
      containers:
        - name: backend
          image: cloud-file-service:latest
          imagePullPolicy: IfNotPresent

          ports:
            - containerPort: 8080

          envFrom:
            - configMapRef:
                name: cloud-file-service-config

            - secretRef:
                name: cloud-file-service-secret

          readinessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 10

          livenessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 20

          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"

            limits:
              cpu: "1000m"
              memory: "1Gi"
```

## 18-1. Codespaces kind에서 사용할 로컬 이미지

kind는 ECR에 자동으로 로그인하지 않으므로 ECR의 사설 이미지를 그대로
사용하면 `ImagePullBackOff`가 발생한다. 현재 루트 `Dockerfile`은 Backend를
빌드하므로 Codespaces에서 다음처럼 이미지를 만들고 kind에 전달한다.

``` bash
docker build -t cloud-file-service:latest .
kind load docker-image cloud-file-service:latest \
  --name cloud-file-service
```

kind 노드 안에 이미지가 들어갔는지 확인:

``` bash
docker exec cloud-file-service-control-plane \
  crictl images | grep cloud-file-service
```

현재 `k8s/deployment.yaml`은 위의 로컬 이미지와
`imagePullPolicy: IfNotPresent`를 사용하도록 구성되어 있다.

> 코드를 수정한 뒤 **같은 `latest` 태그로 다시 build/load 해도 이미 실행 중인
> Pod는 바뀌지 않는다.** 새 버전은 38번처럼 새 태그(`v2` 등)로 build →
> `kind load` → `kubectl set image` 순서로 배포한다.

ECR 이미지와 `github.sha` 태그는 GitHub Actions가 푸시한 뒤 EKS 또는
ECR 접근 권한이 있는 Kubernetes에서 사용하는 흐름이다. kind에서 ECR
이미지를 사용하려면 별도의 ECR `imagePullSecret`이 필요하므로 이 문서의 kind
경로에서는 ECR 이미지를 사용하지 않는다.

------------------------------------------------------------------------

# 19. ECR 주소 확인

프로젝트 루트에서 실행한다.

``` bash
terraform -chdir=infra/terraform output
```

가능하면:

``` bash
terraform -chdir=infra/terraform output -raw ecr_repository_url
```

실제 Output 이름이 다르면:

``` bash
terraform output
```

로 찾는다.

실제 값은 다음처럼 변수에 저장해 재사용한다.

``` bash
ECR_REPOSITORY_URL=$(terraform -chdir=infra/terraform output -raw ecr_repository_url)
RDS_ENDPOINT=$(terraform -chdir=infra/terraform output -raw rds_endpoint)
S3_BUCKET=$(terraform -chdir=infra/terraform output -raw s3_bucket_name)
printf '%s\n' "$ECR_REPOSITORY_URL" "$RDS_ENDPOINT" "$S3_BUCKET"
```

ECR 로그인과 이미지 push:

``` bash
AWS_REGION=ap-northeast-2
IMAGE_TAG=$(git rev-parse --short HEAD)

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin \
  "$(printf '%s' "$ECR_REPOSITORY_URL" | cut -d/ -f1)"

docker build -t "$ECR_REPOSITORY_URL:$IMAGE_TAG" .
docker push "$ECR_REPOSITORY_URL:$IMAGE_TAG"
```

EKS의 `k8s/deployment-eks.yaml`은 `:latest` 태그를 사용하므로 같은 이미지에
`latest` 태그도 붙여 push한다.

``` bash
docker tag "$ECR_REPOSITORY_URL:$IMAGE_TAG" "$ECR_REPOSITORY_URL:latest"
docker push "$ECR_REPOSITORY_URL:latest"
```

push 확인:

``` bash
aws ecr describe-images \
  --repository-name cloud-file-service-dev \
  --region ap-northeast-2 \
  --query 'imageDetails[].imageTags' \
  --output table
```

> **`k8s/deployment.yaml`(kind용)의 `image`는 ECR 주소로 바꾸지 않는다.**
> kind는 ECR에 로그인하지 않으므로 `ImagePullBackOff`가 된다. ECR 이미지는
> EKS용 `k8s/deployment-eks.yaml`에서만 사용한다. 운영에서는 `latest`보다
> commit tag(`$IMAGE_TAG`)를 사용하는 편이 롤백과 원인 확인에 유리하므로,
> EKS에서도 새 버전은 38번처럼 `kubectl set image`로 commit tag를 지정한다.

------------------------------------------------------------------------

# 20. Dockerfile 위치 확인

프로젝트 루트:

``` bash
find . -maxdepth 3 -name Dockerfile -print
```

현재 저장소에서는:

``` text
./Dockerfile
./frontend/Dockerfile
```

루트 `./Dockerfile`이 Backend 이미지이고, `frontend/Dockerfile`은 Frontend
이미지다. Backend CI/CD의 Docker build context는 프로젝트 루트(`.`)로
사용한다.

------------------------------------------------------------------------

# 21. Deployment 적용

kind 경로 기준이다. 먼저 context를 확인한다.

``` bash
kubectl config current-context
# kind-cloud-file-service 이어야 한다
```

Secret은 13번에서 이미 만들었으므로 다시 적용하지 않는다. (13번에서
`k8s/secret.yaml` 파일 방식을 선택했다면 그 파일만 적용하면 된다.)

``` bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl rollout status deployment/cloud-file-service \
  -n cloud-file-service \
  --timeout=180s
```

`deployment "cloud-file-service" successfully rolled out`이 나오면 성공이다.
timeout이 나면 22~24번과 57~60번을 보고 원인을 찾는다.

> kind에 `k8s/deployment-eks.yaml`을 적용하지 않는다. EKS용 파일은
> ServiceAccount와 ECR 이미지를 사용하므로 kind에서는 실패한다.

확인:

``` bash
kubectl get deployment \
  -n cloud-file-service
```

Pod:

``` bash
kubectl get pods \
  -n cloud-file-service
```

실시간:

``` bash
kubectl get pods \
  -n cloud-file-service \
  -w
```

------------------------------------------------------------------------

# 22. 정상 Pod

예:

``` text
READY   STATUS    RESTARTS
1/1     Running   0
1/1     Running   0
```

문제 예:

``` text
CrashLoopBackOff
ImagePullBackOff
Pending
0/1
```

`ImagePullBackOff`이면:

- kind: `kind load docker-image`를 했는지, Deployment의 `image`가
  `cloud-file-service:latest`(ECR 주소가 아님)인지 확인한다.
- EKS: 이미지가 ECR에 push되었는지, 태그가 맞는지 확인한다.
  ([48-1의 문제 해결](#48-1-선택-eks에-배포하기))

`CrashLoopBackOff`이면 Pod 로그에서 DB 연결 오류를 확인한다.

- kind: `DB_URL`이 `jdbc:postgresql://<PG_IP>:5432/cloud_file`인지,
  `cloud-file-postgres`가 실행 중이고 `kind` 네트워크에 연결되어 있는지 확인한다.
- EKS: RDS endpoint, RDS 보안 그룹 5432 허용, DB 사용자명/비밀번호를
  순서대로 확인한다.

`Running`이어도 `READY`가 `1/1`이 아니면 정상 배포가 아니다.

------------------------------------------------------------------------

# 23. Pod 로그

``` bash
kubectl logs \
  -n cloud-file-service \
  deployment/cloud-file-service
```

특정 Pod:

``` bash
kubectl get pods \
  -n cloud-file-service
```

후:

``` bash
kubectl logs \
  -n cloud-file-service \
  POD_NAME
```

------------------------------------------------------------------------

# 24. Pod 상세 정보

``` bash
kubectl describe pod \
  -n cloud-file-service \
  POD_NAME
```

특히 마지막의:

``` text
Events:
```

를 확인한다.

------------------------------------------------------------------------

# 25. Service

파일:

``` text
k8s/service.yaml
```

현재 저장소에는 아직 이 파일이 없으므로 새로 만든다. `selector`의
`app: cloud-file-service`는 `k8s/deployment.yaml`의 Pod label과 같아야 한다.

``` yaml
apiVersion: v1
kind: Service
metadata:
  name: cloud-file-service
  namespace: cloud-file-service
spec:
  selector:
    app: cloud-file-service

  ports:
    - protocol: TCP
      port: 8080
      targetPort: 8080

  type: ClusterIP
```

적용:

``` bash
kubectl apply -f k8s/service.yaml
```

확인:

``` bash
kubectl get service \
  -n cloud-file-service
```

------------------------------------------------------------------------

# 26. Service가 필요한 이유

Pod IP는 교체될 수 있다.

``` text
Pod A
IP 10.x.x.1

Pod 삭제

Pod B
IP 10.x.x.9
```

Service는:

``` text
cloud-file-service:8080
```

같은 안정적인 접근점을 제공한다.

``` text
Service
  |
  +--> Pod A
  |
  +--> Pod B
```

------------------------------------------------------------------------

# 27. 로컬에서 Service 테스트

> 16번의 `./gradlew bootRun`이 아직 실행 중이면 먼저 `Ctrl+C`로 종료한다.
> 둘 다 8080 포트를 사용한다. port-forward는 실행된 터미널을 계속 점유하므로
> 이 터미널은 그대로 두고 다른 터미널에서 테스트한다.

``` bash
kubectl port-forward \
  -n cloud-file-service \
  service/cloud-file-service \
  8080:8080
```

다른 터미널:

``` bash
curl -i http://localhost:8080/actuator/health
```

정상:

``` json
{"status":"UP"}
```

`/actuator/health`가 `groups`를 포함한 더 긴 JSON을 반환해도 `"status":"UP"`이면
정상이다.

port-forward가 8080으로 열려 있으면 Day 6 Frontend(`npm run dev`)는 bootRun
때와 같은 `localhost:8080` 주소로 kind의 Backend를 사용한다. 이 상태에서
Frontend로 폴더 생성/업로드/다운로드를 확인할 수 있다.

> `kubectl port-forward service/...`는 실제로는 Service 뒤의 **Pod 하나**에
> 연결된다. 그 Pod가 삭제·교체되면(44·45·38번 실습) port-forward가
> `lost connection to pod` 등으로 끊긴다. 그때는 `Ctrl+C` 후 같은 명령을 다시
> 실행한다.

------------------------------------------------------------------------

# 28. Kubernetes에서 파일을 저장하지 않는다

잘못:

``` text
Pod
 |
 +-- /app/files
```

Pod가 삭제되면 해당 Container 파일에 의존하는 설계가 문제가 된다.

현재 프로젝트:

``` text
Spring Boot
 |
 +--> RDS
 |     Metadata
 |
 +--> S3
       Actual File
```

따라서:

``` text
Pod 삭제
 ↓
새 Pod
 ↓
RDS/S3 데이터 유지
```

가 가능하다.

------------------------------------------------------------------------

# 29. GitHub Actions CI

폴더:

``` text
.github/workflows/
```

파일:

``` text
.github/workflows/backend-ci.yml
```

현재 저장소에는 `.github/workflows/` 폴더만 있고 Workflow 파일은 아직 없다.
3번에서 폴더를 만들었으므로 아래 파일을 새로 만든다.

> **PostgreSQL service가 필요한 이유:** `BackendApplicationTests`는
> `@SpringBootTest`로 Spring 전체를 띄우고, JPA가 시작할 때
> `jdbc:postgresql://localhost:5432/cloud_file`(`cloud_user`/`cloud_password`)에
> 연결한다. GitHub Actions Runner에는 DB가 없으므로 `services:`로 PostgreSQL
> 컨테이너를 함께 띄우지 않으면 `./gradlew test`가 `Connection refused`로
> 실패한다. 아래 값은 `docker-compose.yml`과 `application.properties` 기본값과
> 같다.

``` yaml
name: Backend CI

on:
  push:
    branches:
      - main

  pull_request:
    branches:
      - main

jobs:
  test:

    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: cloud_file
          POSTGRES_USER: cloud_user
          POSTGRES_PASSWORD: cloud_password
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U cloud_user -d cloud_file"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    defaults:
      run:
        working-directory: backend

    steps:

      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "25"
          cache: gradle

      - name: Grant execute permission
        run: chmod +x gradlew

      - name: Test
        run: ./gradlew test

      - name: Build
        run: ./gradlew build
```

------------------------------------------------------------------------

# 30. Java 버전은 반드시 실제 프로젝트와 맞춘다

현재:

``` bash
java -version
```

확인.

Gradle:

``` bash
grep -Rni \
  "sourceCompatibility\|toolchain\|JavaLanguageVersion" \
  backend
```

현재 `backend/build.gradle`은 다음과 같다.

``` gradle
languageVersion = JavaLanguageVersion.of(25)
```

그리고 루트 `Dockerfile`도 `eclipse-temurin:25-jdk`/`25-jre`를 사용한다.
따라서 Workflow에서도:

``` yaml
java-version: "25"
```

로 맞춘다.

**인터넷 예제의 17/21을 무조건 그대로 사용하지 않는다.** toolchain과 다르면
Gradle이 `Cannot find a Java installation ... languageVersion=25` 오류를 낸다.

------------------------------------------------------------------------

# 31. CI 실행

``` bash
git add .github/workflows/backend-ci.yml
git commit -m "ci: add backend test workflow"
git push
```

GitHub:

``` text
Actions
→ Backend CI
```

에서 확인한다.

------------------------------------------------------------------------

# 32. CI가 실패하면

Codespace에서 먼저 (테스트에 PostgreSQL이 필요하므로 DB부터 띄운다):

``` bash
docker compose up -d postgres
cd backend
./gradlew test
```

자주 나오는 실패:

``` text
Permission denied: ./gradlew     → chmod +x 단계 확인
Cannot find a Java installation  → java-version "25" 확인
Connection to localhost:5432 refused → services: postgres 블록 확인
```

실행한다.

GitHub Actions의 실패 Step과 로컬 결과를 비교한다.

------------------------------------------------------------------------

# 33. Docker/ECR Workflow

파일:

``` text
.github/workflows/backend-deploy.yml
```

기본 형태:

``` yaml
name: Backend Docker Build

on:
  push:
    branches:
      - main

permissions:
  contents: read

env:
  AWS_REGION: ap-northeast-2
  ECR_REPOSITORY: cloud-file-service-dev   # Terraform: ${project_name}-${environment}

jobs:

  docker:

    runs-on: ubuntu-latest

    steps:

      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-region: ${{ env.AWS_REGION }}
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build Docker image
        run: |
          docker build \
            -t ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ github.sha }} \
            -t ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:latest \
            -f Dockerfile \
            .

      - name: Push Docker image
        run: |
          docker push \
            ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ github.sha }}
          docker push \
            ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:latest
```

> `Dockerfile`, Build Context, ECR Repository 이름은 **현재 프로젝트의
> 실제 구조에 맞게 수정**한다.

현재 프로젝트에서는 루트 `Dockerfile`, 루트 build context(`.`),
Terraform output `ecr_repository_url`에 해당하는 ECR repository를 사용한다.
ECR repository 이름은 `ecr_repository_url`의 `/` 뒤 부분이다.

``` bash
terraform -chdir=infra/terraform output -raw ecr_repository_url
# 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/cloud-file-service-dev
#                                                  └── 이 부분이 ECR_REPOSITORY
```

`cloud-file-service`(뒤에 `-dev` 없음)로 적으면 `name unknown: The repository
with name 'cloud-file-service' does not exist` 오류로 push가 실패한다.

`github.sha` 태그는 추적/롤백용이고, `latest` 태그는 EKS의
`k8s/deployment-eks.yaml`이 처음 배포할 때 사용한다.
이 Workflow는 ECR push까지 수행하지만 Codespaces의 kind에 자동 배포하지
않는다. kind 배포는 18-1의 로컬 이미지 절차를 사용한다.

------------------------------------------------------------------------

# 34. GitHub Secrets

GitHub Repository:

``` text
Settings
→ Secrets and variables
→ Actions
```

필요할 수 있는 값:

``` text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

`New repository secret`으로 위 이름 그대로 등록한다. 이 Access Key의 IAM
사용자는 ECR 로그인/푸시 권한(예: `AmazonEC2ContainerRegistryPowerUser`)이
있어야 한다. Secret을 등록하지 않고 `backend-deploy.yml`을 push하면
`Configure AWS credentials` 단계에서 실패한다.

Workflow 코드에 직접:

``` yaml
AWS_ACCESS_KEY_ID: "AKIA..."
```

처럼 적지 않는다.

------------------------------------------------------------------------

# 35. 더 안전한 GitHub OIDC

최종적으로는:

``` text
GitHub Actions
      |
      | OIDC
      v
AWS IAM Role
      |
      v
ECR
```

구조를 사용하는 것이 좋다.

Workflow:

``` yaml
permissions:
  id-token: write
  contents: read
```

AWS 인증:

``` yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
    aws-region: ${{ env.AWS_REGION }}
```

OIDC는 선택 확장으로 먼저 CI/CD가 성공한 뒤 적용한다.

------------------------------------------------------------------------

# 36. 왜 `github.sha`를 Image Tag로 사용하는가?

예:

``` text
cloud-file-service:9d4e1c...
```

이 Tag는 Git Commit과 연결할 수 있다.

따라서:

``` text
어떤 코드
→ 어떤 Docker Image
→ 어떤 배포
```

인지 추적하기 쉽다.

------------------------------------------------------------------------

# 37. ECR 확인

``` bash
aws ecr describe-images \
  --repository-name cloud-file-service-dev \
  --region ap-northeast-2
```

Repository 이름은 실제 Terraform/AWS 설정에 맞춘다. (현재 저장소:
`cloud-file-service-dev`)

------------------------------------------------------------------------

# 38. Kubernetes에 새 Image 배포

`backend=`의 `backend`는 Deployment 안의 **container 이름**
(`containers[].name: backend`)이다.

## kind (필수 실습)

kind는 ECR에서 이미지를 받을 수 없으므로 새 버전도 로컬 이미지로 만든다.
코드를 조금 수정했다고 가정하고 새 태그 `v2`로 build → kind load → set image
순서로 진행한다. (코드 수정 없이 같은 이미지에 태그만 새로 붙여도 Rollout
실습은 된다.)

``` bash
kubectl config current-context   # kind-cloud-file-service 확인

docker build -t cloud-file-service:v2 .
kind load docker-image cloud-file-service:v2 \
  --name cloud-file-service

kubectl set image \
  deployment/cloud-file-service \
  backend=cloud-file-service:v2 \
  -n cloud-file-service
```

> kind에서 `backend="$ECR_REPOSITORY_URL:$IMAGE_TAG"`처럼 ECR 이미지를
> 지정하면 `ImagePullBackOff`가 된다. 그렇게 되었다면 41번의
> `kubectl rollout undo`로 되돌린다.

## EKS (48-1을 진행한 경우)

EKS는 ECR 이미지를 받을 수 있으므로 19번 또는 GitHub Actions가 push한
commit tag를 지정한다.

``` bash
kubectl config current-context   # ...:cluster/cloud-file-service-dev 확인

ECR_REPOSITORY_URL=$(terraform -chdir=infra/terraform output -raw ecr_repository_url)
IMAGE_TAG=$(git rev-parse --short HEAD)   # GitHub Actions가 push한 이미지는 git rev-parse HEAD (전체 SHA)

kubectl set image \
  deployment/cloud-file-service \
  backend="$ECR_REPOSITORY_URL:$IMAGE_TAG" \
  -n cloud-file-service
```

`IMAGE_TAG`는 ECR에 실제로 존재하는 태그여야 한다. 19번에서 수동 push했다면
짧은 SHA(`git rev-parse --short HEAD`), GitHub Actions가 push했다면 전체 SHA
(`git rev-parse HEAD`)다. 37번의 `aws ecr describe-images`로 확인한다.

확인:

``` bash
kubectl rollout status \
  deployment/cloud-file-service \
  -n cloud-file-service
```

------------------------------------------------------------------------

# 39. Rollout

Deployment의 Image가 바뀌면 Kubernetes가 새 Pod를 배포한다.

개념:

``` text
v1 Pod A
v1 Pod B
      |
      v
v2 Pod 생성
      |
      v
v1 Pod 교체
```

------------------------------------------------------------------------

# 40. Rollout History

``` bash
kubectl rollout history \
  deployment/cloud-file-service \
  -n cloud-file-service
```

------------------------------------------------------------------------

# 41. Rollback

문제가 있는 Version이면:

``` bash
kubectl rollout undo \
  deployment/cloud-file-service \
  -n cloud-file-service
```

확인:

``` bash
kubectl rollout status \
  deployment/cloud-file-service \
  -n cloud-file-service
```

Day 7에서는 반드시 한 번 직접 연습한다.

------------------------------------------------------------------------

# 42. 장애 실습 --- 잘못된 Image

실습용으로만 실행:

``` bash
kubectl set image \
  deployment/cloud-file-service \
  backend=example.invalid/cloud-file-service:not-found \
  -n cloud-file-service
```

확인:

``` bash
kubectl get pods \
  -n cloud-file-service
```

`ImagePullBackOff` 등이 나타날 수 있다.

상세:

``` bash
kubectl describe pod \
  -n cloud-file-service \
  POD_NAME
```

`Events`를 읽는다.

------------------------------------------------------------------------

# 43. 장애 실습 후 Rollback

``` bash
kubectl rollout undo \
  deployment/cloud-file-service \
  -n cloud-file-service
```

그리고:

``` bash
kubectl rollout status \
  deployment/cloud-file-service \
  -n cloud-file-service
```

정상 Pod가 돌아오는지 확인한다.

------------------------------------------------------------------------

# 44. 장애 실습 --- Pod 삭제

현재 Pod:

``` bash
kubectl get pods \
  -n cloud-file-service
```

하나 삭제:

``` bash
kubectl delete pod \
  -n cloud-file-service \
  POD_NAME
```

다시:

``` bash
kubectl get pods \
  -n cloud-file-service
```

새 Pod가 생성되는지 확인한다.

이것이 Deployment의 desired state 개념이다.

------------------------------------------------------------------------

# 45. Pod 교체 후 파일 유지 테스트

먼저 Frontend에서 파일 업로드:

``` text
test.txt
```

확인:

``` text
목록에 표시
```

Pod 삭제:

``` bash
kubectl delete pod \
  -n cloud-file-service \
  POD_NAME
```

새 Pod가 Running:

``` bash
kubectl get pods \
  -n cloud-file-service
```

port-forward 터미널이 끊겼다면 `Ctrl+C` 후 27번의 port-forward 명령을 다시
실행한다.

Frontend 새로고침:

``` text
F5
```

파일이 유지되어야 한다.

> kind 경로에서 Metadata는 로컬 PostgreSQL(`cloud-file-postgres`), 실제 파일은
> S3에 저장된다. EKS 경로에서는 RDS + S3이다. 어느 쪽이든 Pod 밖에 저장되므로
> Pod가 바뀌어도 유지된다.

이유:

``` text
Metadata → RDS
Actual File → S3
```

이기 때문이다.

------------------------------------------------------------------------

# 46. HPA --- 선택 기능

파일:

``` text
k8s/hpa.yaml
```

``` yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cloud-file-service
  namespace: cloud-file-service
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cloud-file-service

  minReplicas: 2
  maxReplicas: 5

  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

적용:

``` bash
kubectl apply -f k8s/hpa.yaml
```

확인:

``` bash
kubectl get hpa \
  -n cloud-file-service
```

`kubectl top pods`가 동작하지 않는다면 Metrics Server가 없는 환경일 수
있다. kind와 EKS 모두 기본으로 Metrics Server가 설치되어 있지 않으므로
`kubectl get hpa`의 TARGETS가 `<unknown>/70%`로 보이는 것은 정상이다.
(Metrics Server 설치는 선택 확장이다.)

------------------------------------------------------------------------

# 47. Ingress --- 선택 기능

파일:

``` text
k8s/ingress.yaml
```

``` yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cloud-file-service
  namespace: cloud-file-service
spec:
  rules:
    - host: cloud-file.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: cloud-file-service
                port:
                  number: 8080
```

> Ingress Controller가 있어야 실제 외부 요청을 처리한다. YAML만 만든다고
> 자동으로 인터넷에서 접근되는 것은 아니다.

------------------------------------------------------------------------

# 48. AWS 최종 구조

현재 Day 4/5:

``` text
Internet
   |
   v
ECS
   |
   +--> RDS
   +--> S3
```

Kubernetes를 AWS에 올리는 확장:

``` text
Internet
   |
   v
ALB
   |
   v
Ingress
   |
   v
Service
   |
   +--> Pod A
   +--> Pod B
   |
   +--> RDS
   +--> S3
```

AWS Kubernetes 서비스는 EKS를 사용할 수 있다.

하지만 Day 7에서는 **Codespace의 kind로 Kubernetes 개념과 Manifest를
먼저 실습하고 EKS는 확장 단계로 두어도 된다.**

kind 경로(7~45번)를 모두 성공했다면 아래 48-1에서 같은 Backend를 실제 AWS
EKS에 올려볼 수 있다.

------------------------------------------------------------------------

## 48-1. 선택: EKS에 배포하기

> **비용 경고 (반드시 읽기)**
>
> EKS는 켜져 있는 동안 계속 요금이 나온다. (ap-northeast-2 기준 대략)
>
> ``` text
> EKS Control Plane        약 $0.10 / 시간
> EC2 t3.medium x 2 (Node) 약 $0.05 x 2 / 시간
> EBS, Public IPv4 등      소액 추가
> ------------------------------------------
> 합계                     약 $0.2~0.25 / 시간 (하루 켜두면 약 $5~6)
> ```
>
> 실습이 끝나면 **같은 날 반드시 [48-1-10. EKS 삭제](#48-1-10-eks-삭제-반드시-실행)를
> 실행한다.** 비용이 부담되면 이 절은 건너뛰어도 Day 7 필수 목표는 달성된다.

### 48-1-0. 무엇을 만드는가

``` text
Terraform (infra/terraform/eks.tf)
  ├── EKS Cluster: cloud-file-service-dev
  ├── Cluster IAM Role  (AmazonEKSClusterPolicy)
  ├── Node IAM Role     (WorkerNode + CNI + ECR ReadOnly)
  ├── Managed Node Group: t3.medium x 2  → public subnet
  ├── Addon: eks-pod-identity-agent
  ├── Pod IAM Role (기존 ECS Task의 S3 정책 재사용)
  └── Pod Identity Association
        namespace=cloud-file-service, serviceaccount=cloud-file-service

security_groups.tf
  └── RDS SG: 5432 ← EKS Cluster Security Group 허용

Kubernetes
  ├── k8s/serviceaccount.yaml   (Pod Identity가 연결될 ServiceAccount)
  └── k8s/deployment-eks.yaml   (ECR 이미지 + serviceAccountName)
```

왜 이렇게 구성하는가:

- **Node를 public subnet에 두는 이유:** 현재 Terraform에는 NAT Gateway가 없고
  private subnet에는 인터넷으로 나가는 route table이 없다. private subnet의
  Node는 ECR에서 이미지를 받을 수도, EKS에 등록될 수도 없다. NAT Gateway는
  시간당 추가 비용이 들므로 학습용으로는 public subnet(`map_public_ip_on_launch
  = true`)을 사용한다.
- **ECR 권한:** Node IAM Role의 `AmazonEC2ContainerRegistryReadOnly`로 ECR
  이미지를 받는다. kind처럼 `imagePullSecret`이 필요 없다.
- **RDS 접근:** Managed Node Group의 Node에는 EKS가 자동으로 만든 **Cluster
  Security Group**이 붙는다. RDS SG에 이 SG의 5432 접근을 허용한다.
- **S3 권한:** ECS에서는 Task Role을 사용했다. EKS에서는 **EKS Pod Identity**로
  `cloud-file-service` ServiceAccount를 쓰는 Pod에 IAM Role을 연결한다. 따라서
  EKS Secret에는 AWS Access Key를 넣지 않는다.

### 48-1-1. 사전 확인

``` bash
# 1) kind 경로가 끝났는지 (7~45번)
# 2) AWS 계정 확인 - 이 IAM 사용자가 EKS 관리자가 된다
aws sts get-caller-identity

# 3) Day 5 Terraform 상태 확인
terraform -chdir=infra/terraform output

# 4) ECR에 latest 태그 이미지가 있는지 (없으면 19번 또는 33번으로 push)
aws ecr describe-images \
  --repository-name cloud-file-service-dev \
  --region ap-northeast-2 \
  --query 'imageDetails[].imageTags' \
  --output table
```

`latest`가 목록에 없으면 EKS에서 `ImagePullBackOff`가 나므로 먼저 push한다.

> `terraform apply`를 실행한 IAM 사용자와 나중에 `kubectl`을 사용할 IAM 사용자가
> **같아야** 한다. `bootstrap_cluster_creator_admin_permissions = true`는 클러스터를
> 만든 사용자에게만 관리자 권한을 준다.

### 48-1-2. `infra/terraform/eks.tf` 작성

> 이미 저장소에 있으면 내용만 비교하고 넘어간다.

`local.name_prefix`(= `cloud-file-service-dev`), `local.common_tags`,
`aws_subnet.public`, `aws_subnet.private`, `data.aws_iam_policy_document.task_s3`는
Day 5에서 만든 `locals.tf`, `vpc.tf`, `iam.tf`에 이미 있다.

``` hcl
# ---------- Cluster IAM ----------
data "aws_iam_policy_document" "eks_cluster_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eks_cluster" {
  name               = "${local.name_prefix}-eks-cluster-role"
  assume_role_policy = data.aws_iam_policy_document.eks_cluster_assume.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "eks_cluster" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

# ---------- Cluster ----------
resource "aws_eks_cluster" "main" {
  name     = local.name_prefix
  role_arn = aws_iam_role.eks_cluster.arn

  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true # terraform 실행한 IAM 사용자에게 kubectl 관리자 권한
  }

  vpc_config {
    subnet_ids              = concat(aws_subnet.public[*].id, aws_subnet.private[*].id)
    endpoint_public_access  = true
    endpoint_private_access = true
  }

  depends_on = [aws_iam_role_policy_attachment.eks_cluster]
  tags       = local.common_tags
}

# ---------- Node IAM (ECR ReadOnly 포함) ----------
data "aws_iam_policy_document" "eks_node_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eks_node" {
  name               = "${local.name_prefix}-eks-node-role"
  assume_role_policy = data.aws_iam_policy_document.eks_node_assume.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "eks_node" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
  ])
  role       = aws_iam_role.eks_node.name
  policy_arn = each.value
}

# ---------- Node Group (public subnet → NAT 없이 ECR 접근) ----------
resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${local.name_prefix}-ng"
  node_role_arn   = aws_iam_role.eks_node.arn
  subnet_ids      = aws_subnet.public[*].id

  instance_types = ["t3.medium"]

  scaling_config {
    desired_size = 2
    min_size     = 1
    max_size     = 2
  }

  depends_on = [aws_iam_role_policy_attachment.eks_node]
  tags       = local.common_tags
}

# ---------- Pod → S3 권한 (EKS Pod Identity) ----------
resource "aws_eks_addon" "pod_identity" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "eks-pod-identity-agent"
}

data "aws_iam_policy_document" "eks_pod_assume" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eks_pod" {
  name               = "${local.name_prefix}-eks-pod-role"
  assume_role_policy = data.aws_iam_policy_document.eks_pod_assume.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "eks_pod_s3" {
  name   = "${local.name_prefix}-eks-pod-s3"
  role   = aws_iam_role.eks_pod.id
  policy = data.aws_iam_policy_document.task_s3.json # iam.tf의 기존 S3 정책 재사용
}

resource "aws_eks_pod_identity_association" "backend" {
  cluster_name    = aws_eks_cluster.main.name
  namespace       = "cloud-file-service"
  service_account = "cloud-file-service"
  role_arn        = aws_iam_role.eks_pod.arn
}
```

각 블록의 의미:

``` text
aws_eks_cluster.main              → Kubernetes API 서버(Control Plane). AWS가 관리
access_config                     → IAM 사용자 ↔ kubectl 권한 연결 방식(API = Access Entry)
aws_eks_node_group.main           → Pod가 실제로 실행될 EC2 2대
aws_eks_addon.pod_identity        → Pod에 IAM 자격 증명을 전달하는 에이전트
aws_eks_pod_identity_association  → "이 namespace/serviceaccount의 Pod = 이 IAM Role"
```

> `namespace = "cloud-file-service"`와 `service_account = "cloud-file-service"`는
> 7번의 Namespace, 48-1-6의 ServiceAccount 이름과 **정확히 같아야** 한다.

### 48-1-3. RDS 보안 그룹과 Output 수정

> 이미 저장소에 있으면 내용만 비교하고 넘어간다.

`infra/terraform/security_groups.tf`의 `aws_security_group.rds`에 두 번째
`ingress` 블록을 추가한다. (기존 ECS용 ingress는 그대로 둔다.)

``` hcl
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "Security group for PostgreSQL"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from ECS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  # ↓ Day 7 EKS용으로 추가
  ingress {
    description     = "PostgreSQL from EKS nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_eks_cluster.main.vpc_config[0].cluster_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-rds-sg"
    }
  )
}
```

`infra/terraform/output.tf` 끝에 추가:

``` hcl
output "eks_cluster_name" {
  value = aws_eks_cluster.main.name
}

output "eks_cluster_security_group_id" {
  value = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
}
```

### 48-1-4. Terraform plan / apply

새 provider를 추가하지 않았으므로 `terraform init`을 다시 할 필요는 없다.
(해도 문제는 없다.) `db_password`는 Day 5와 같은 방식(`terraform.tfvars`)으로
전달된다.

``` bash
terraform -chdir=infra/terraform fmt
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform plan
```

plan 마지막 줄을 반드시 읽는다. 대략 다음과 같아야 한다.

``` text
Plan: 12 to add, 1 to change, 0 to destroy.
```

- `1 to change`는 `aws_security_group.rds`에 ingress가 추가되는 in-place 변경이다.
- **`to destroy`가 0이 아니면 apply하지 않는다.** 특히 `aws_db_instance.postgres`,
  `aws_s3_bucket`, `aws_ecr_repository`가 destroy/replace 목록에 있으면 중단하고
  diff를 다시 확인한다.

문제가 없으면 적용한다. **EKS 생성에는 보통 15~20분이 걸린다.**

``` bash
terraform -chdir=infra/terraform apply
# Enter a value: yes
```

완료 후:

``` bash
terraform -chdir=infra/terraform output -raw eks_cluster_name
# cloud-file-service-dev
```

### 48-1-5. kubeconfig 전환과 context 확인

``` bash
aws eks update-kubeconfig \
  --region ap-northeast-2 \
  --name cloud-file-service-dev
```

이 명령은 `~/.kube/config`에 EKS context를 추가하고 **현재 context를 EKS로
바꾼다.**

``` bash
kubectl config get-contexts
kubectl config current-context
# arn:aws:eks:ap-northeast-2:<ACCOUNT_ID>:cluster/cloud-file-service-dev

kubectl get nodes
```

Node 2개가 `Ready`여야 한다.

``` text
NAME                                             STATUS   ROLES    AGE   VERSION
ip-10-20-1-xx.ap-northeast-2.compute.internal    Ready    <none>   3m    v1.xx
ip-10-20-2-xx.ap-northeast-2.compute.internal    Ready    <none>   3m    v1.xx
```

`kubectl get nodes`가 정상적으로 Node를 반환하기 전에는 Secret이나
Deployment를 적용하지 않는다.

kind로 돌아가고 싶을 때:

``` bash
kubectl config use-context kind-cloud-file-service
```

다시 EKS로:

``` bash
kubectl config use-context \
  "$(kubectl config get-contexts -o name | grep cluster/cloud-file-service-dev)"
```

### 48-1-6. ServiceAccount

파일:

``` text
k8s/serviceaccount.yaml
```

> 이미 저장소에 있으면 내용만 비교하고 넘어간다.

``` yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cloud-file-service
  namespace: cloud-file-service
```

Pod Identity Association은 이 ServiceAccount를 사용하는 Pod에만 IAM Role을
연결한다. 그래서 EKS Deployment에는 `serviceAccountName`이 필요하다.

### 48-1-7. EKS용 Deployment

파일:

``` text
k8s/deployment-eks.yaml
```

> 이미 저장소에 있으면 내용만 비교하고 넘어간다. (저장소 파일에는 실제
> AWS 계정 ID가 들어간 ECR 주소가 적혀 있다.)

kind용 `k8s/deployment.yaml`과 다른 점은 3가지뿐이다.

``` text
serviceAccountName: cloud-file-service   ← Pod Identity(S3 권한)
image: <ECR 주소>:latest                 ← 로컬 이미지 대신 ECR
imagePullPolicy: Always                  ← latest 태그를 항상 새로 확인
```

``` yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloud-file-service
  namespace: cloud-file-service
spec:
  replicas: 2

  selector:
    matchLabels:
      app: cloud-file-service

  template:
    metadata:
      labels:
        app: cloud-file-service

    spec:
      serviceAccountName: cloud-file-service

      containers:
        - name: backend
          image: <ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com/cloud-file-service-dev:latest
          imagePullPolicy: Always

          ports:
            - containerPort: 8080

          envFrom:
            - configMapRef:
                name: cloud-file-service-config

            - secretRef:
                name: cloud-file-service-secret

          readinessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 10

          livenessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 20

          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"

            limits:
              cpu: "1000m"
              memory: "1Gi"
```

`<ACCOUNT_ID>` 부분을 실제 ECR 주소로 바꾼다. 직접 입력해도 되고 아래처럼
Terraform output으로 채워도 된다.

``` bash
ECR_REPOSITORY_URL=$(terraform -chdir=infra/terraform output -raw ecr_repository_url)
echo "$ECR_REPOSITORY_URL"

sed -i "s#image: .*/cloud-file-service-dev:latest#image: ${ECR_REPOSITORY_URL}:latest#" \
  k8s/deployment-eks.yaml

grep "image:" k8s/deployment-eks.yaml
```

### 48-1-8. EKS에 배포

먼저 context가 EKS인지 **반드시** 확인한다.

``` bash
kubectl config current-context
# ...:cluster/cloud-file-service-dev
```

Namespace, ServiceAccount, ConfigMap:

``` bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/serviceaccount.yaml
kubectl apply -f k8s/configmap.yaml
```

Secret (EKS용 - RDS 값 사용, AWS Access Key는 넣지 않음):

``` bash
RDS_ENDPOINT=$(terraform -chdir=infra/terraform output -raw rds_endpoint)

# Day 5 terraform.tfvars의 db_username (없으면 기본값 cloud_user)
DB_USERNAME=$(echo 'var.db_username' | terraform -chdir=infra/terraform console | tr -d '"')

# Day 5에서 Secrets Manager에 저장한 DB 비밀번호
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id cloud-file-service-dev/db-password \
  --region ap-northeast-2 \
  --query SecretString --output text)

echo "$RDS_ENDPOINT / $DB_USERNAME"   # 비밀번호는 출력하지 않는다

kubectl create secret generic cloud-file-service-secret \
  --namespace cloud-file-service \
  --from-literal=DB_URL="jdbc:postgresql://${RDS_ENDPOINT}:5432/cloud_file" \
  --from-literal=DB_USERNAME="$DB_USERNAME" \
  --from-literal=DB_PASSWORD="$DB_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -
```

> EKS Secret에 `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`를 넣지 않는다.
> 환경변수 자격 증명이 있으면 AWS SDK가 Pod Identity보다 그것을 먼저 사용한다.

Deployment와 Service:

``` bash
kubectl apply -f k8s/deployment-eks.yaml
kubectl apply -f k8s/service.yaml

kubectl rollout status deployment/cloud-file-service \
  -n cloud-file-service \
  --timeout=300s
```

확인:

``` bash
kubectl get pods -n cloud-file-service -o wide
kubectl logs -n cloud-file-service deployment/cloud-file-service | tail -n 30
```

Pod Identity가 주입되었는지 확인 (`AWS_CONTAINER_CREDENTIALS_FULL_URI`가 보이면 정상):

``` bash
kubectl exec -n cloud-file-service deployment/cloud-file-service -- \
  env | grep AWS_CONTAINER
```

Health Check와 파일 기능 확인은 kind와 같다. (bootRun과 kind port-forward는
종료한 상태에서)

``` bash
kubectl port-forward \
  -n cloud-file-service \
  service/cloud-file-service \
  8080:8080
```

다른 터미널:

``` bash
curl -i http://localhost:8080/actuator/health
```

Frontend(`npm run dev`)에서 업로드/다운로드가 되면 EKS Pod → RDS, EKS Pod →
S3(Pod Identity)가 모두 동작하는 것이다. 38~45번의 Rollout/Rollback/Pod 삭제
실습도 EKS context에서 그대로 해볼 수 있다. (38번의 EKS 부분 참고)

> Service 타입을 `LoadBalancer`로 바꾸지 않는다. AWS Load Balancer가 추가로
> 생성되어 비용이 늘고, Terraform이 모르는 리소스라 나중에 삭제가 꼬일 수 있다.

### 48-1-9. EKS 문제 해결

**`ImagePullBackOff` / `ErrImagePull`**

``` bash
kubectl describe pod -n cloud-file-service POD_NAME   # 마지막 Events 확인
```

``` text
Events 메시지                                   원인 / 해결
---------------------------------------------------------------------------
...:latest: not found                           ECR에 latest 태그 없음 → 19번에서 latest push
<ACCOUNT_ID>... 또는 이상한 주소                 48-1-7의 image 치환 누락
403 Forbidden / no basic auth credentials       Node Role에 AmazonEC2ContainerRegistryReadOnly 확인
i/o timeout (ECR 주소)                          Node가 public subnet이 아님 / 인터넷 경로 없음
```

``` bash
aws ecr describe-images --repository-name cloud-file-service-dev \
  --region ap-northeast-2 --query 'imageDetails[].imageTags' --output table
aws iam list-attached-role-policies --role-name cloud-file-service-dev-eks-node-role
```

**`Pending`**

``` bash
kubectl get nodes
kubectl describe pod -n cloud-file-service POD_NAME
```

Node가 `Ready`가 아니거나 0개면 AWS 콘솔 → EKS → `cloud-file-service-dev` →
Compute에서 Node Group 상태(Health issues)를 확인한다.

**`CrashLoopBackOff` (DB 연결)**

``` bash
kubectl logs -n cloud-file-service POD_NAME --previous | grep -iE "psql|postgres|hikari|jdbc|Connection"
```

``` text
로그                                            원인 / 해결
---------------------------------------------------------------------------
Connection timed out / SocketTimeout             RDS SG에 EKS Cluster SG 5432 허용 누락 → 48-1-3, apply 확인
UnknownHostException                             DB_URL의 RDS endpoint 오타
password authentication failed                   DB_USERNAME / DB_PASSWORD 확인 (48-1-8)
database "cloudfiles" does not exist             DB 이름은 cloud_file
```

RDS SG에 EKS SG가 허용되어 있는지 확인:

``` bash
terraform -chdir=infra/terraform output -raw eks_cluster_security_group_id; echo
aws ec2 describe-security-groups \
  --group-ids "$(terraform -chdir=infra/terraform output -raw rds_security_group_id)" \
  --region ap-northeast-2 \
  --query 'SecurityGroups[0].IpPermissions[].UserIdGroupPairs[].GroupId'
```

두 번째 명령 결과에 첫 번째 SG ID가 있어야 한다.

Secret 값을 고친 뒤에는 Pod를 재시작해야 반영된다.

``` bash
kubectl rollout restart deployment/cloud-file-service -n cloud-file-service
```

**S3 `AccessDenied` / `Unable to load credentials`**

- `k8s/deployment-eks.yaml`에 `serviceAccountName: cloud-file-service`가 있는지
- `k8s/serviceaccount.yaml`을 적용했는지
- EKS Secret에 AWS Access Key가 들어가 있지 않은지
- Association 확인:

``` bash
aws eks list-pod-identity-associations \
  --cluster-name cloud-file-service-dev \
  --region ap-northeast-2
```

위를 고친 뒤 `kubectl rollout restart`로 Pod를 새로 만든다. (Pod Identity는
Pod가 생성될 때 주입된다.)

**`error: You must be logged in to the server (Unauthorized)`**

`aws sts get-caller-identity`의 사용자가 `terraform apply`를 실행한 사용자와
다르다. 같은 자격 증명으로 다시 `aws eks update-kubeconfig`를 실행한다.

### 48-1-10. EKS 삭제 (반드시 실행)

1) (선택) Kubernetes 리소스 삭제 - context가 EKS인지 확인 후:

``` bash
kubectl config current-context
kubectl delete namespace cloud-file-service
```

2) Terraform에서 EKS만 제거한다. RDS SG가 EKS SG를 참조하므로 **3개 파일을
함께** 되돌려야 한다.

``` bash
# (a) eks.tf를 비활성화 (Terraform은 *.tf 파일만 읽는다)
mv infra/terraform/eks.tf infra/terraform/eks.tf.disabled
```

(b) `infra/terraform/security_groups.tf`에서 `"PostgreSQL from EKS nodes"`
`ingress` 블록 전체를 삭제한다.

(c) `infra/terraform/output.tf`에서 `eks_cluster_name`,
`eks_cluster_security_group_id` output 2개를 삭제한다.

``` bash
terraform -chdir=infra/terraform plan
```

plan 결과가 대략 다음과 같아야 한다.

``` text
Plan: 0 to add, 1 to change, 12 to destroy.
```

destroy 목록에 `aws_eks_*`, `aws_iam_role.eks_*` 등 EKS 관련 리소스만 있고
**`aws_db_instance.postgres`, `aws_s3_bucket.*`, `aws_ecr_repository.backend`,
`aws_security_group.rds`가 destroy 목록에 없는지** 확인한 뒤 적용한다.

``` bash
terraform -chdir=infra/terraform apply
# Enter a value: yes
```

EKS 삭제에도 10분 이상 걸릴 수 있다.

> **`terraform destroy -target=aws_eks_cluster.main`을 사용하지 않는다.**
> `-target` destroy는 대상에 의존하는 리소스까지 함께 삭제한다. RDS 보안 그룹이
> EKS Cluster SG를 참조하므로 RDS SG와 RDS 인스턴스까지 삭제 대상이 될 수 있다.

3) kubeconfig에서 EKS context를 정리하고 kind로 돌아온다.

``` bash
kubectl config delete-context \
  "$(kubectl config get-contexts -o name | grep cluster/cloud-file-service-dev)"
kubectl config use-context kind-cloud-file-service
kubectl config current-context
```

4) 삭제 확인:

``` bash
aws eks list-clusters --region ap-northeast-2
aws ec2 describe-instances --region ap-northeast-2 \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].InstanceId'
```

`clusters`가 비어 있고 EKS Node EC2가 없으면 비용이 더 나오지 않는다.

다시 EKS를 만들 때는 `eks.tf.disabled`를 `eks.tf`로 되돌리고 48-1-3의 변경을
다시 넣은 뒤 48-1-4부터 진행한다.

------------------------------------------------------------------------

# 49. Monitoring

기본 Monitoring은 별도 제품을 많이 설치하는 것이 아니라 먼저 상태를 읽는
것이다.

``` bash
kubectl get pods -n cloud-file-service
```

``` bash
kubectl logs \
  -n cloud-file-service \
  deployment/cloud-file-service
```

``` bash
kubectl describe pod \
  -n cloud-file-service \
  POD_NAME
```

``` bash
kubectl get events \
  -n cloud-file-service \
  --sort-by=.lastTimestamp
```

3번에서 만든 `monitoring/` 폴더에는 위 명령을 정리한 `monitoring/README.md`를
만든다. (현재 저장소에는 아직 없다.) 예:

```` markdown
# Monitoring

## 상태 확인

```bash
kubectl config current-context
kubectl get pods -n cloud-file-service -o wide
kubectl get events -n cloud-file-service --sort-by=.lastTimestamp
```

## 로그

```bash
kubectl logs -n cloud-file-service deployment/cloud-file-service
kubectl logs -n cloud-file-service POD_NAME --previous
```

## Health

```bash
kubectl port-forward -n cloud-file-service service/cloud-file-service 8080:8080
curl -i http://localhost:8080/actuator/health
```

## ECS (Day 4/5)

CloudWatch Logs에서 ECS Task 로그를 확인한다.
````

------------------------------------------------------------------------

# 50. Monitoring 기본 항목

``` text
Application
 ├── Health
 ├── Logs
 ├── Error
 └── Restart

Infrastructure
 ├── CPU
 ├── Memory
 ├── Pod count
 └── Service status
```

Prometheus/Grafana/OpenTelemetry는 선택 확장으로 둔다.

------------------------------------------------------------------------

# 51. Prometheus/Grafana --- 선택

운영형 구조:

``` text
Application
   |
   v
Prometheus
   |
   v
Grafana
```

Prometheus:

``` text
Metrics 수집
```

Grafana:

``` text
Dashboard
```

예:

``` text
CPU
Memory
Request
Error
Latency
Pod Count
```

------------------------------------------------------------------------

# 52. OpenTelemetry --- 선택

``` text
Application
   |
   +--> Metrics
   +--> Logs
   +--> Traces
```

분산된 요청이:

``` text
Browser
 ↓
Backend
 ↓
RDS / S3
```

중 어디에서 지연되었는지 추적하는 방향으로 확장할 수 있다.

------------------------------------------------------------------------

# 53. Argo CD / GitOps --- 선택

확장 구조:

``` text
GitHub
   |
   v
Git Repository
   |
   v
Argo CD
   |
   v
Kubernetes
```

Day 7 필수 범위에서는 GitHub Actions CI/CD를 먼저 완성한다.

------------------------------------------------------------------------

# 54. 중요한 로컬 CI/CD 구분

Codespaces의 kind:

``` text
Codespace
 ↓
kind
 ↓
Kubernetes
```

GitHub Actions Runner:

``` text
GitHub
 ↓
별도의 Runner
```

따라서 GitHub Actions에서 로컬 Codespace의 kind Cluster에 바로:

``` bash
kubectl apply
```

할 수 있다고 생각하면 안 된다.

또한 현재 Codespaces의 kind는 Codespace가 중지된 뒤 유지된다고 보장할 수
없다. 재접속 때마다 1번의 상태 확인 후, context 또는 클러스터가 없으면
6번의 생성 절차를 다시 실행한다.

원격 자동 배포를 하려면:

``` text
EKS 등 원격 Cluster
+
인증
+
Network
```

가 필요하다.

------------------------------------------------------------------------

# 55. Day 7에서는 CI와 CD를 단계적으로 완료

권장:

``` text
CI
GitHub Actions
 ↓
Test
 ↓
Build
 ↓
Docker Build
 ↓
ECR Push
```

그리고 CD:

``` text
수동
 ↓
kubectl set image
 ↓
rollout
 ↓
rollback
```

까지 먼저 완성한다.

그 다음:

``` text
EKS
+
OIDC
+
Argo CD
```

로 자동화한다.

------------------------------------------------------------------------

# 56. 장애 진단 순서

문제가 발생하면 다음 순서:

``` text
Browser
 ↓
Network
 ↓
Ingress
 ↓
Service
 ↓
Pod
 ↓
Spring Boot
 ↓
RDS / S3
```

Kubernetes에서는:

``` bash
kubectl get pods
kubectl describe pod
kubectl logs
kubectl get events
```

AWS에서는:

``` text
CloudWatch
IAM
Security Group
ECR
RDS
S3
```

를 확인한다.

------------------------------------------------------------------------

# 57. CrashLoopBackOff

``` bash
kubectl logs \
  -n cloud-file-service \
  POD_NAME
```

이전 Container:

``` bash
kubectl logs \
  -n cloud-file-service \
  POD_NAME \
  --previous
```

상세:

``` bash
kubectl describe pod \
  -n cloud-file-service \
  POD_NAME
```

------------------------------------------------------------------------

# 58. ImagePullBackOff

확인:

``` text
Image 이름
Tag
ECR Repository
Registry 접근
Image 존재 여부
```

kind:

``` bash
kubectl get deployment cloud-file-service -n cloud-file-service \
  -o jsonpath='{.spec.template.spec.containers[0].image}'; echo
docker exec cloud-file-service-control-plane crictl images | grep cloud-file-service
```

image가 ECR 주소이면 kind에서는 받을 수 없다. `kind load docker-image`로 넣은
로컬 태그를 사용한다. (18-1, 38번)

EKS (AWS):

``` bash
aws ecr describe-images \
  --repository-name cloud-file-service-dev \
  --region ap-northeast-2
```

자세한 원인표는 [48-1-9](#48-1-9-eks-문제-해결)를 본다.

------------------------------------------------------------------------

# 59. 0/1 Ready

`Running`인데:

``` text
0/1
```

이면 Readiness Probe를 확인한다.

``` bash
kubectl describe pod \
  -n cloud-file-service \
  POD_NAME
```

그리고:

``` text
/actuator/health
```

가 정상인지 확인한다.

------------------------------------------------------------------------

# 60. RDS 오류

Pod 로그에서:

``` text
Connection refused
Timeout
Authentication failed
```

등을 확인한다.

다음 항목을 점검:

``` text
DB URL
DB Username
DB Password
Security Group
Network
Port 5432
```

- kind: RDS가 아니라 로컬 PostgreSQL을 사용한다. `docker ps`로
  `cloud-file-postgres`가 실행 중인지, 13-1의 `PG_IP`가 Secret의 `DB_URL`과
  같은지 확인한다.
- EKS: RDS SG에 EKS Cluster SG가 허용되어 있는지 확인한다.
  ([48-1-9](#48-1-9-eks-문제-해결))
- DB 이름은 kind/EKS 모두 `cloud_file`이다.

------------------------------------------------------------------------

# 61. S3 오류

확인:

``` text
AWS Region
Bucket Name
IAM
Network
Credential
```

중요:

``` text
ECS Task Role
```

과 Kubernetes/EKS의 AWS 권한 모델은 자동으로 동일하지 않다.

EKS에서는:

``` text
IRSA
또는
EKS Pod Identity
```

등의 별도 설계를 사용할 수 있다. 이 문서의 48-1은 **EKS Pod Identity**를
사용한다.

``` text
ECS   → Task Role (Day 4/5)
kind  → Secret의 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (13-2, 학습용)
EKS   → Pod Identity (ServiceAccount cloud-file-service ↔ IAM Role)
```

------------------------------------------------------------------------

# 62. Terraform과 Kubernetes의 역할

Day 5:

``` text
Terraform
→ AWS Infrastructure
```

예:

``` text
VPC
IAM
RDS
S3
ECR
ECS
CloudWatch
```

Day 7:

``` text
Kubernetes YAML
→ Kubernetes Workload
```

예:

``` text
Deployment
Service
ConfigMap
Secret
HPA
Ingress
```

둘을 같은 것으로 생각하지 않는다.

------------------------------------------------------------------------

# 63. Frontend는 기본적으로 유지

Day 6의:

``` text
frontend/
```

를 다시 만들지 않는다.

기존:

``` text
React
→ Vite
→ Docker
→ Nginx
```

구조를 유지한다.

Day 7에서는 Backend Kubernetes를 먼저 완성한다.

Frontend Kubernetes는 선택 확장이다.

------------------------------------------------------------------------

# 64. Frontend API 주소 주의

Day 6:

``` env
VITE_API_BASE_URL
```

을 사용했다.

Kubernetes Backend를 외부에서 사용하려면:

``` text
Frontend
 ↓
Ingress / ALB
 ↓
Backend Service
```

와 연결되는 실제 주소가 필요하다.

예:

``` env
VITE_API_BASE_URL=https://api.example.com
```

단, 실제 Domain/Ingress/ALB가 구성되어 있어야 한다.

------------------------------------------------------------------------

# 65. README 수정

파일:

``` text
README.md
```

추가:

``` markdown
## Architecture

### Application

- React + Vite
- Spring Boot
- PostgreSQL
- S3

### Infrastructure

- AWS
- Docker
- ECR
- ECS Fargate
- Terraform
- CloudWatch

### Kubernetes

- Deployment
- Service
- ConfigMap
- Secret
- Health Check
- HPA (optional)

### CI/CD

- GitHub Actions
- Gradle Test
- Docker Build
- ECR Push

### Storage

- RDS: File/Folder Metadata
- S3: Actual File Objects
```

------------------------------------------------------------------------

# 66. README 장애 대응

``` markdown
## Troubleshooting

### Pod

kubectl get pods -n cloud-file-service

### Logs

kubectl logs -n cloud-file-service POD_NAME

### Events

kubectl get events \
  -n cloud-file-service \
  --sort-by=.lastTimestamp

### Rollback

kubectl rollout undo \
  deployment/cloud-file-service \
  -n cloud-file-service
```

------------------------------------------------------------------------

# 67. 보안 검사

Frontend:

``` bash
grep -RniE \
  "AKIA|AWS_SECRET_ACCESS_KEY|DB_PASSWORD|password=" \
  frontend \
  --exclude-dir=node_modules \
  --exclude-dir=dist
```

Backend:

``` bash
grep -RniE \
  "AKIA|AWS_SECRET_ACCESS_KEY|DB_PASSWORD|password=" \
  backend \
  --exclude-dir=build
```

Terraform State:

``` bash
find infra/terraform \
  -maxdepth 2 \
  -name "*.tfstate*" \
  -print
```

Git에 들어가면 안 되는 것:

``` text
.env.local
실제 Secret
terraform.tfstate
AWS Credential
node_modules
dist
```

------------------------------------------------------------------------

# 68. 최종 Git 상태

``` bash
git status
```

추가할 수 있는 것:

``` text
k8s/
.github/workflows/
monitoring/
README.md
backend/
.gitignore
```

실제 Secret은 추가하지 않는다.

------------------------------------------------------------------------

# 69. Day 7 실제 테스트 순서

## STEP 1 --- CI

``` text
코드 수정
 ↓
git add
 ↓
git commit
 ↓
git push
 ↓
GitHub Actions
 ↓
Test
 ↓
Build
```

## STEP 2 --- Docker/ECR

``` text
Docker Build
 ↓
ECR Push
```

## STEP 3 --- Kubernetes

``` text
kubectl apply
 ↓
Deployment
 ↓
Pod
 ↓
Service
```

## STEP 4 --- Health

``` bash
kubectl port-forward \
  -n cloud-file-service \
  service/cloud-file-service \
  8080:8080
```

``` bash
curl -i \
  http://localhost:8080/actuator/health
```

## STEP 5 --- File

``` text
Folder 생성
 ↓
File Upload
 ↓
Download
 ↓
Delete
```

## STEP 6 --- Persistence

``` text
Pod 삭제
 ↓
새 Pod
 ↓
F5
 ↓
파일 유지
```

## STEP 7 --- Rollback

``` text
v1
 ↓
v2
 ↓
문제
 ↓
rollback
 ↓
v1
```

------------------------------------------------------------------------

# 70. 최종 Kubernetes 명령 모음

전체:

``` bash
kubectl get all \
  -n cloud-file-service
```

Pod:

``` bash
kubectl get pods \
  -o wide \
  -n cloud-file-service
```

Deployment:

``` bash
kubectl get deployment \
  -n cloud-file-service
```

Service:

``` bash
kubectl get service \
  -n cloud-file-service
```

ConfigMap:

``` bash
kubectl get configmap \
  -n cloud-file-service
```

Secret:

``` bash
kubectl get secret \
  -n cloud-file-service
```

Logs:

``` bash
kubectl logs \
  -n cloud-file-service \
  deployment/cloud-file-service
```

Events:

``` bash
kubectl get events \
  -n cloud-file-service \
  --sort-by=.lastTimestamp
```

Rollout:

``` bash
kubectl rollout status \
  deployment/cloud-file-service \
  -n cloud-file-service
```

Rollback:

``` bash
kubectl rollout undo \
  deployment/cloud-file-service \
  -n cloud-file-service
```

------------------------------------------------------------------------

# 71. Day 7 최종 Architecture

``` text
                                  USER
                                    |
                                    v
                                 Browser
                                    |
                                    v
                            React / Vite
                                    |
                                    v
                            ALB / Ingress
                                    |
                                    v
                         Kubernetes Service
                                    |
                         +----------+----------+
                         |                     |
                         v                     v
                      Pod A                  Pod B
                         |                     |
                         +----------+----------+
                                    |
                              Spring Boot
                                    |
                         +----------+----------+
                         |                     |
                         v                     v
                        RDS                   S3
                     Metadata            Actual Files
```

CI/CD:

``` text
GitHub
   |
   v
GitHub Actions
   |
   +--> Test
   +--> Gradle Build
   +--> Docker Build
   +--> ECR Push
   |
   v
Kubernetes Deployment
```

Monitoring:

``` text
Kubernetes
   |
   +--> Health
   +--> Logs
   +--> Events
   +--> Metrics
```

------------------------------------------------------------------------

# 72. Day 3.5 → Day 4 → Day 5 → Day 6 → Day 7

``` text
Day 3.5
PostgreSQL + S3
실제 파일 저장
        |
        v
Day 4
Docker + ECR + ECS Fargate
        |
        v
Day 5
Terraform / IaC
VPC / IAM / S3 / RDS / ECR / ECS / CloudWatch
        |
        v
Day 6
React + Vite
Google Drive Style UI
        |
        v
Day 7
Kubernetes
CI/CD
Health Check
Monitoring
Rollback
        |
        v
최종 Cloud / DevOps 프로젝트
```

------------------------------------------------------------------------

# 73. Day 7에서 반드시 이해해야 하는 것

## 1. 사용자가 파일을 업로드하면?

``` text
Browser
 ↓
React
 ↓
Spring Boot
 ↓
S3
```

Metadata:

``` text
Spring Boot
 ↓
RDS
```

## 2. Backend Pod가 죽으면?

``` text
Kubernetes
 ↓
새 Pod
```

파일:

``` text
S3
```

Metadata:

``` text
RDS
```

이므로 Container 자체에 파일을 저장하지 않는다.

## 3. 새 버전은 어떻게 배포?

``` text
GitHub
 ↓
GitHub Actions
 ↓
Test
 ↓
Build
 ↓
Docker
 ↓
ECR
 ↓
Kubernetes
```

## 4. 문제가 생기면?

``` bash
kubectl rollout undo ...
```

## 5. 어디가 문제인지 어떻게 확인?

``` text
Health
Logs
Events
Metrics
CloudWatch
```

------------------------------------------------------------------------

# 74. Day 7에서 꼭 답할 수 있어야 하는 질문

1.  Docker Image와 Container의 차이는?
2.  Pod란 무엇인가?
3.  Deployment가 필요한 이유는?
4.  Service가 필요한 이유는?
5.  Pod IP를 직접 사용하면 안 되는 이유는?
6.  ConfigMap과 Secret의 차이는?
7.  Readiness Probe란?
8.  Liveness Probe란?
9.  `/actuator/health`를 사용하는 이유는?
10. CI와 CD의 차이는?
11. GitHub Actions가 하는 일은?
12. ECR은 왜 필요한가?
13. `github.sha`를 Image Tag로 사용하는 이유는?
14. Rollout이란?
15. Rollback이란?
16. HPA란?
17. Pod가 바뀌어도 파일이 유지되는 이유는?
18. RDS와 S3의 역할은?
19. ECS와 Kubernetes의 관계는?
20. Terraform과 Kubernetes YAML의 차이는?
21. AWS Credential을 GitHub Workflow 코드에 직접 넣으면 안 되는 이유는?
22. OIDC란?
23. `CrashLoopBackOff`가 나오면 어디부터 확인하는가?
24. `ImagePullBackOff`가 나오면 무엇을 확인하는가?
25. `kubectl describe pod`의 Events를 보는 이유는?
26. CloudWatch와 Kubernetes 로그의 역할 차이는?
27. Monitoring이 필요한 이유는?
28. 왜 Pod에 실제 파일을 저장하면 안 되는가?
29. 왜 Frontend와 Backend를 분리하는가?
30. 왜 AWS Secret을 Frontend에 넣으면 안 되는가?

------------------------------------------------------------------------

# 75. 해커톤 최종 Demo 순서

``` text
1. Architecture 설명
        ↓
2. React 화면
        ↓
3. 새 폴더 생성
        ↓
4. 파일 업로드
        ↓
5. 다운로드
        ↓
6. RDS / S3 역할 설명
        ↓
7. GitHub Actions 확인
        ↓
8. ECR Image 확인
        ↓
9. Kubernetes Pod 확인
        ↓
10. Health Check
        ↓
11. Pod 하나 삭제
        ↓
12. 새 Pod 생성
        ↓
13. Frontend 새로고침
        ↓
14. 파일 유지 확인
        ↓
15. Rollout / Rollback 설명
        ↓
16. Logs / Events 설명
```

------------------------------------------------------------------------

# 76. Day 7 최종 체크리스트

## Day 6

``` text
[ ] React
[ ] Folder
[ ] Upload
[ ] Download
[ ] Delete
[ ] RDS
[ ] S3
```

## Kubernetes

``` text
[ ] Namespace
[ ] ConfigMap
[ ] Secret
[ ] Deployment
[ ] Service
[ ] Pod Running
[ ] Health Check
```

## CI/CD

``` text
[ ] GitHub Actions
[ ] Gradle Test
[ ] Gradle Build
[ ] Docker Build
[ ] ECR Push
[ ] Commit SHA Tag
```

## Deployment

``` text
[ ] Image 변경
[ ] Rollout
[ ] Rollout Status
[ ] Rollback
```

## Monitoring

``` text
[ ] Pod
[ ] Logs
[ ] Describe
[ ] Events
[ ] Health
```

## Persistence

``` text
[ ] Pod 삭제
[ ] 새 Pod 생성
[ ] 파일 유지
```

## Security

``` text
[ ] AWS Credential 없음
[ ] DB Password 없음
[ ] Secret Git Commit 없음
[ ] .env.local 제외
[ ] Terraform State 제외
```

------------------------------------------------------------------------

# 77. Day 7에서 새로 만들거나 수정하는 파일

## 새로 생성

``` text
k8s/namespace.yaml          (저장소에 이미 있음 → 비교만)
k8s/configmap.yaml          (저장소에 이미 있음 → 비교만)
k8s/secret.example.yaml     (저장소에 이미 있음 → DB 이름 cloud_file 확인)
k8s/deployment.yaml         (저장소에 이미 있음 → 비교만, kind용)
k8s/service.yaml            (25번)

.github/workflows/backend-ci.yml      (29번)
.github/workflows/backend-deploy.yml  (33번)

monitoring/README.md        (49번)
```

로컬에서만 만들고 커밋하지 않는 것:

``` text
k8s/secret.yaml
```

## 선택 생성

``` text
k8s/ingress.yaml
k8s/hpa.yaml

# EKS (48-1) - 저장소에 이미 있으면 비교만
infra/terraform/eks.tf
k8s/serviceaccount.yaml
k8s/deployment-eks.yaml
infra/terraform/security_groups.tf   (RDS SG ingress 추가)
infra/terraform/output.tf            (eks output 추가)
```

## 수정 가능

``` text
backend/build.gradle
또는
backend/build.gradle.kts

backend/src/main/resources/application.properties
또는
application.yml

README.md
.gitignore
```

## 유지

``` text
frontend/
infra/terraform/
기존 Spring Boot Domain/Service/Controller
S3 Storage
RDS
ECS
```

------------------------------------------------------------------------

# 78. Day 7 한 문장

> **Day 3.5의 실제 파일 저장 구조와 Day 4의 Docker/ECR/ECS, Day 5의
> Terraform, Day 6의 React Frontend를 유지하면서 Kubernetes, GitHub
> Actions CI/CD, Health Check, Monitoring, Rollback을 추가하여 실제
> Cloud/DevOps 프로젝트의 전체 흐름을 경험한다.**

------------------------------------------------------------------------

# 79. Day 7 종료

최종적으로:

``` text
[✓] Day 3.5 실제 파일 저장 구조
[✓] RDS Metadata
[✓] S3 Actual File
[✓] Docker
[✓] ECR
[✓] ECS
[✓] Terraform
[✓] React Frontend
[✓] Kubernetes Namespace
[✓] Deployment
[✓] Service
[✓] ConfigMap
[✓] Secret 구조
[✓] Actuator Health
[✓] Readiness Probe
[✓] Liveness Probe
[✓] GitHub Actions CI
[✓] Docker/ECR 자동화
[✓] Rollout
[✓] Rollback
[✓] Kubernetes Logs
[✓] Kubernetes Events
[✓] Pod 교체 후 데이터 유지
[✓] 보안 점검
[✓] 최종 Architecture
```

핵심 흐름:

``` text
사용자
 ↓
React
 ↓
Spring Boot
 ↓
RDS + S3

그리고

GitHub
 ↓
GitHub Actions
 ↓
Test
 ↓
Docker
 ↓
ECR
 ↓
Kubernetes
 ↓
Deployment
 ↓
Pod
 ↓
Service

그리고

Health
Logs
Events
Metrics
Rollback
```

**여기까지 완료하면 Day 7의 핵심 목표가 끝난다.**
