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
실제 값은 다음처럼 변수에 저장해 재사용한다.

``` bash
ECR_REPOSITORY_URL=$(terraform -chdir=infra/terraform output -raw ecr_repository_url)
RDS_ENDPOINT=$(terraform -chdir=infra/terraform output -raw rds_endpoint)
S3_BUCKET=$(terraform -chdir=infra/terraform output -raw s3_bucket_name)
printf '%s\n' "$ECR_REPOSITORY_URL" "$RDS_ENDPOINT" "$S3_BUCKET"
```

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
안 된다. kind에서 Backend를 실행할 때는 접근 가능한 RDS endpoint 또는
Kubernetes에서 접근 가능한 PostgreSQL 주소를 `DB_URL`로 사용해야 한다.

RDS를 사용할 경우 Terraform output에서 endpoint를 확인한다.

``` bash
cd infra/terraform
terraform output -raw rds_endpoint
```

로컬 PostgreSQL만 있는 상태라면 먼저 Kubernetes에서 해당 DB로 접근할 수
있는 네트워크 구성을 별도로 만든 뒤 진행한다. 단순히 `localhost`를
`DB_URL`에 넣는 것으로는 kind Pod에서 호스트 DB에 연결되지 않는다.

------------------------------------------------------------------------

## EKS를 사용할 때 반드시 확인할 사항

현재 저장소의 Terraform은 VPC, RDS, S3, ECR, ECS를 만들지만 **EKS Cluster와
EKS Node Group은 만들지 않는다**. 따라서 `kubectl`의 현재 context가 kind인
상태에서 ECR 주소를 Deployment에 넣으면 `ImagePullBackOff`가 발생한다.

EKS 경로에서는 다음 조건을 먼저 만족해야 한다.

1. EKS Cluster와 Node Group이 같은 AWS Region에 존재해야 한다.
2. EKS Node가 ECR에서 이미지를 받을 수 있도록 Node IAM Role에
  `AmazonEC2ContainerRegistryReadOnly` 또는 동등한 권한이 있어야 한다.
3. EKS Node가 ECR과 RDS에 접근할 수 있도록 VPC DNS, NAT Gateway 또는
  VPC Endpoint와 보안 그룹이 구성되어야 한다.
4. RDS 보안 그룹의 5432 인바운드 규칙이 현재 ECS 보안 그룹만 허용하므로,
  EKS Node 보안 그룹도 PostgreSQL 5432에 허용해야 한다.

EKS Cluster가 이미 있다면 kubeconfig를 전환한다.

``` bash
aws eks update-kubeconfig \
  --region ap-northeast-2 \
  --name <EKS_CLUSTER_NAME>

kubectl config current-context
kubectl get nodes
```

`kubectl get nodes`가 정상적으로 노드를 반환하기 전에는 Kubernetes Secret이나
Deployment를 적용하지 않는다. kind context라면 아래 명령으로 되돌릴 수 있다.

``` bash
kubectl config use-context kind-cloud-file-service
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
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.example.yaml
│   ├── secret.yaml       # 로컬에서 생성, Git에 커밋하지 않음
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml      # 선택
│   └── hpa.yaml          # 선택
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

현재 저장소에는 Kubernetes 클러스터 설정이나 `k8s/*.yaml` 파일이 아직
없다. 따라서 `kubectl` 명령만 설치되어 있어도 자동으로 클러스터가 생기지
않는다. Codespaces에서 실습하려면 아래의 kind 클러스터를 먼저 만든다.

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

Terraform output이 다음과 같다고 가정하면:

``` bash
image: 358545165495.dkr.ecr.ap-northeast-2.amazonaws.com/cloud-file-service-dev:<IMAGE_TAG>
  "spring.datasource\|AWS_\|S3\|BUCKET\|DATABASE" \
  backend/src/main \
  2>/dev/null
`<IMAGE_TAG>`에는 방금 push한 실제 commit tag를 넣는다. `latest`보다
commit tag를 사용하는 편이 롤백과 원인 확인에 유리하다.
```

**환경변수 이름을 추측하지 않는다.**

Day 5에서 사용했던 실제 환경변수와 현재 Backend 코드를 기준으로
Kubernetes 설정을 만든다.

------------------------------------------------------------------------

# 10. ConfigMap

파일:

``` text
k8s/configmap.yaml
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
  S3_BUCKET: "실제-S3-버킷-이름"
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

실제 비밀번호를 적은 파일은 Git에 올리지 않는다.

------------------------------------------------------------------------

# 13. 실제 Secret 생성

예:

``` bash
kubectl create secret generic cloud-file-service-secret \
  --namespace cloud-file-service \
  --from-literal=DB_USERNAME='실제사용자명' \
  --from-literal=DB_PASSWORD='실제비밀번호' \
  --from-literal=DB_URL='실제 JDBC URL'
```

파일로 관리할 경우 `k8s/secret.example.yaml`을 복사해 `k8s/secret.yaml`을
만들고 값을 입력한 뒤 적용한다. `secret.yaml`은 `.gitignore`에 등록한다.

``` bash
cp k8s/secret.example.yaml k8s/secret.yaml
# k8s/secret.yaml의 DB_USERNAME, DB_PASSWORD, DB_URL 수정
kubectl apply -f k8s/secret.yaml
```

`DB_URL`은 Kubernetes Pod에서 접근 가능한 주소여야 한다. 로컬 Compose의
PostgreSQL은 호스트의 `localhost`가 아니므로 kind Pod에서 그대로 사용할 수
없다. RDS를 사용한다면 다음 endpoint를 JDBC URL에 넣는다.

``` bash
terraform -chdir=infra/terraform output -raw rds_endpoint
# jdbc:postgresql://<RDS_ENDPOINT>:5432/cloud_file
```

확인:

``` bash
kubectl get secret \
  -n cloud-file-service
```

`.gitignore`에:

``` gitignore
k8s/secret.yaml
*.secret.yaml
```

추가한다.

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

아래 Deployment는 ECR 이미지를 사용하는 원격 Kubernetes/EKS용 예시다.
Codespaces의 kind에서는 18-1의 로컬 이미지 절차를 사용한다.

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

현재 `k8s/deployment.yaml`은 위의 로컬 이미지와
`imagePullPolicy: IfNotPresent`를 사용하도록 구성되어 있다.

ECR 이미지와 `github.sha` 태그는 GitHub Actions가 푸시한 뒤 EKS 또는
ECR 접근 권한이 있는 Kubernetes에서 사용하는 흐름이다. kind에서 ECR
이미지를 사용하려면 별도의 ECR `imagePullSecret`이 필요하다.

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

push한 뒤 `k8s/deployment.yaml`의 `image`를 다음처럼 설정한다.

``` yaml
image: 358545165495.dkr.ecr.ap-northeast-2.amazonaws.com/cloud-file-service-dev:<IMAGE_TAG>
imagePullPolicy: IfNotPresent
```

`<IMAGE_TAG>`에는 방금 push한 실제 commit tag를 넣는다. `latest`보다
commit tag를 사용하는 편이 롤백과 원인 확인에 유리하다.

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

``` bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl rollout status deployment/cloud-file-service \
  -n cloud-file-service \
  --timeout=180s
```

EKS에서는 `k8s/secret.yaml`의 `DB_URL`을 RDS endpoint로 설정하고,
`k8s/configmap.yaml`의 `S3_BUCKET`을 Terraform output의
`s3_bucket_name`으로 설정한다. `secret.yaml`은 Git에 커밋하지 않는다.

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

`ImagePullBackOff`이면 먼저 현재 context가 EKS인지 확인하고, EKS Node의
ECR 읽기 권한과 이미지 tag를 확인한다. `CrashLoopBackOff`이면 Pod 로그에서
RDS endpoint DNS 해석, RDS 보안 그룹 5432 허용, DB 사용자명/비밀번호를
순서대로 확인한다. `Running`이어도 `READY`가 `1/1`이 아니면 정상 배포가
아니다.

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

프로젝트가 Java 25라면:

``` yaml
java-version: "25"
```

등으로 맞춘다.

**예제의 21을 무조건 그대로 사용하지 않는다.**

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

Codespace에서 먼저:

``` bash
cd backend
./gradlew test
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
  ECR_REPOSITORY: cloud-file-service

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
            -f Dockerfile \
            .

      - name: Push Docker image
        run: |
          docker push \
            ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ github.sha }}
```

> `Dockerfile`, Build Context, ECR Repository 이름은 **현재 프로젝트의
> 실제 구조에 맞게 수정**한다.

현재 프로젝트에서는 루트 `Dockerfile`, 루트 build context(`.`),
Terraform output `ecr_repository_url`에 해당하는 ECR repository를 사용한다.
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
  --repository-name cloud-file-service \
  --region ap-northeast-2
```

Repository 이름은 실제 Terraform/AWS 설정에 맞춘다.

------------------------------------------------------------------------

# 38. Kubernetes에 새 Image 배포

``` bash
kubectl set image \
  deployment/cloud-file-service \
  backend=ECR_REPOSITORY:IMAGE_TAG \
  -n cloud-file-service
```

``` bash
kubectl set image \
  deployment/cloud-file-service \
  backend="$ECR_REPOSITORY_URL:$IMAGE_TAG" \
  -n cloud-file-service
```

`ECR_REPOSITORY_URL`과 `IMAGE_TAG`는 Section 19에서 설정한 값을 사용한다.

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

Frontend 새로고침:

``` text
F5
```

파일이 유지되어야 한다.

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
있다.

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

AWS:

``` bash
aws ecr describe-images \
  --repository-name cloud-file-service \
  --region ap-northeast-2
```

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

등의 별도 설계를 사용할 수 있다.

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
k8s/namespace.yaml
k8s/configmap.yaml
k8s/secret.example.yaml
k8s/deployment.yaml
k8s/service.yaml

.github/workflows/backend-ci.yml
.github/workflows/backend-deploy.yml

monitoring/README.md
```

## 선택 생성

``` text
k8s/ingress.yaml
k8s/hpa.yaml
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
