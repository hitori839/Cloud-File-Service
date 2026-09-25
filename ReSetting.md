# Cloud File Service --- 다시 시작하기 (ReSetting)

AWS 리소스를 모두 지우고 Codespace까지 삭제한 뒤, **새 Codespace에서 서비스를 다시 띄우는 순서**다.
각 단계의 자세한 설명은 `md/`의 Day 문서를 참고한다.

| 순서 | 할 일 | 필요한 경우 |
|---|---|---|
| 1 | 새 Codespace 만들기, 도구 확인 | 항상 |
| 2 | 백업 zip 복원 | 항상 |
| 3 | AWS 자격 증명 (새 Access Key) | S3 업로드, AWS 배포를 할 때 |
| 4 | Terraform으로 AWS 인프라 생성 | S3 업로드, AWS 배포를 할 때 |
| 5 | 로컬 실행 (bootRun + Vite) | 개발할 때 |
| 6 | kind(Kubernetes) 배포 | Day 7 실습을 할 때 |
| 7 | ECS 배포 | AWS에서 서비스할 때 |
| 8 | 다 쓴 뒤 정리 | 비용을 멈출 때 |

> ⚠️ **4번(Terraform)을 실행하면 RDS와 ECS Fargate 비용이 발생한다.** 다 쓴 뒤에는 8번으로 반드시 정리한다.

------------------------------------------------------------------------

## 1. 새 Codespace 만들기, 도구 확인

GitHub 저장소 → **Code → Codespaces → Create codespace on main**

```bash
java -version        # 25.x 이어야 한다 (backend, CI 모두 Java 25)
node -v              # 22 이상
docker info > /dev/null && echo docker-ok
aws --version
terraform -version
kubectl version --client
kind version
```

없는 도구만 설치한다.

```bash
# AWS CLI (Day 3)
cd /tmp
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip -q awscliv2.zip && sudo ./aws/install
cd /workspaces/Cloud-File-Service

# Terraform (Day 5)
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update && sudo apt-get install -y terraform

# kind (Day 7)
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.30.0/kind-linux-amd64
chmod +x ./kind && sudo mv ./kind /usr/local/bin/kind
```

> AWS CLI는 `/tmp`에서 설치해 `aws/`, `awscliv2.zip`이 프로젝트 폴더에 생기지 않게 한다.

------------------------------------------------------------------------

## 2. 백업 zip 복원

PC에 받아 둔 `local-backup.zip`을 VS Code 탐색기의 프로젝트 루트에 끌어다 놓고 푼다.

```bash
cd /workspaces/Cloud-File-Service
unzip -o local-backup.zip -x 'infra/terraform/terraform.tfstate*'
echo "local-backup.zip" >> .git/info/exclude     # 실수로 커밋되지 않게
git status --short                               # 복원한 파일이 목록에 나오면 안 된다 (.gitignore 대상)
```

| 파일 | 용도 |
|---|---|
| `infra/terraform/terraform.tfvars` | `db_password`, `admin_emails` 등 Terraform 변수 |
| `frontend/.env.local` | `VITE_API_TARGET=http://localhost:8080` |
| `k8s/secret.yaml` | kind용 Secret (6번에서 값 갱신 필요) |
| `keys.txt`, `test.txt`, `backend/.vscode/` | 개인 메모, 테스트 파일, 에디터 설정 |

> **`terraform.tfstate`는 복원하지 않는다.** 이미 삭제된 리소스를 기록한 옛 상태라서 새로 만들 때 혼란만 준다.
> 예외: 정리할 때 `terraform destroy`를 **못 하고** Codespace를 지웠다면 tfstate도 복원한 뒤 `terraform init && terraform destroy`로 먼저 정리한다.

zip이 없다면 예시 파일로 새로 만든다.

```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars   # db_password 입력
cp frontend/.env.example frontend/.env.local
```

------------------------------------------------------------------------

## 3. AWS 자격 증명 (새 Access Key)

정리할 때 옛 Access Key를 삭제했으므로 새로 만든다.

1. AWS 콘솔 → **IAM → 사용자 → admin → 보안 자격 증명 → 액세스 키 만들기** (CLI 용도)
2. Codespace에서 등록:

   ```bash
   aws configure
   # Access Key ID / Secret Access Key 입력
   # Default region: ap-northeast-2
   # Output format: json

   aws sts get-caller-identity    # Account 358545165495, user/admin 이 나오면 성공
   ```

3. GitHub 저장소 → **Settings → Secrets and variables → Actions**에
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`를 다시 등록한다.
   `Backend Docker Build` 워크플로가 이 값으로 ECR에 이미지를 push한다.

> 키는 코드나 문서, `keys.txt` 같은 파일에 적지 않는다.

------------------------------------------------------------------------

## 4. Terraform으로 AWS 인프라 생성

```bash
cd /workspaces/Cloud-File-Service/infra/terraform
terraform init
terraform plan
terraform apply          # yes 입력, RDS 때문에 10분 정도 걸린다
terraform output
```

만들어지는 것: VPC, 서브넷, 보안그룹, RDS PostgreSQL, S3 버킷, ECR, ECS 클러스터와 서비스, Secrets Manager(DB 비밀번호, JWT 키), IAM 역할, CloudWatch 로그 그룹.

### 꼭 확인할 것: S3 버킷 이름이 바뀐다

버킷 이름 끝의 무작위 문자열(`random_id`)이 새로 만들어진다. 새 이름을 확인해서 사용하는 곳을 고친다.

```bash
terraform output -raw s3_bucket_name; echo
# 예: cloud-file-service-dev-files-xxxxxxxx
```

- `k8s/configmap.yaml`의 `S3_BUCKET` 값 → 새 이름으로 바꾸고 커밋
- 로컬 실행(5번)의 `export S3_BUCKET=...`

### 자주 나는 오류

| 오류 | 원인 / 해결 |
|---|---|
| `You can't create this secret because a secret with this name is already scheduled for deletion` | 옛 `db-password` 시크릿이 30일 보관 중이다. `aws secretsmanager delete-secret --secret-id cloud-file-service-dev/db-password --force-delete-without-recovery` 실행 후 다시 apply |
| ECS 서비스의 Task가 계속 실패 | ECR이 비어 있어서 이미지가 없다. 7번에서 이미지를 push하면 해결된다 |
| `No valid credential sources found` | 3번 `aws configure`를 안 했다 |

> EKS까지 실습하려면 `terraform.tfvars`에 `enable_eks = true`를 넣고 apply한다 (Day 7 §48-1). 비용이 크므로 끝나면 `false`로 되돌려 apply한다.

### (선택) S3만 만들고 싶을 때

로컬 개발에서 파일 업로드만 필요하면 RDS와 ECS 없이 S3 버킷만 만들 수 있다.

```bash
terraform apply \
  -target=aws_s3_bucket.files \
  -target=aws_s3_bucket_public_access_block.files \
  -target=aws_s3_bucket_versioning.files \
  -target=aws_s3_bucket_server_side_encryption_configuration.files
```

------------------------------------------------------------------------

## 5. 로컬 실행 (bootRun + Vite)

```bash
cd /workspaces/Cloud-File-Service
docker compose up -d postgres
```

터미널 1 --- Backend

```bash
export AWS_REGION=ap-northeast-2
export S3_BUCKET=$(terraform -chdir=infra/terraform output -raw s3_bucket_name)
export ADMIN_EMAILS=you@example.com     # 관리자로 쓸 이메일 (선택)
cd backend
./gradlew bootRun                       # http://localhost:8080
```

터미널 2 --- Frontend

```bash
cd frontend
cat .env.local                          # VITE_API_TARGET=http://localhost:8080
npm install
npm run dev -- --host 0.0.0.0           # Ports 탭에서 5173 열기
```

브라우저에서 **회원가입** → 로그인 → 폴더 만들기, 파일 업로드로 확인한다.
로컬 DB는 새로 만들어졌으므로 이전 계정과 파일은 없다.

------------------------------------------------------------------------

## 6. kind(Kubernetes) 배포

5번의 bootRun이 켜져 있으면 끈다(8080 충돌).

```bash
cd /workspaces/Cloud-File-Service

# ① kind Pod의 외부 통신 허용 (Codespace를 켤 때마다 필요)
sudo iptables-legacy -C FORWARD -i br-+ -j ACCEPT 2>/dev/null \
  || sudo iptables-legacy -I FORWARD 1 -i br-+ -j ACCEPT
sudo iptables-legacy -C FORWARD -o br-+ -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null \
  || sudo iptables-legacy -I FORWARD 2 -o br-+ -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

# ② 클러스터 생성
kind create cluster --name cloud-file-service
kubectl config current-context          # kind-cloud-file-service

# ③ PostgreSQL 주소 (kind 네트워크 Gateway IP)
docker compose up -d postgres
PG_IP=$(docker network inspect kind \
  -f '{{range .IPAM.Config}}{{.Gateway}} {{end}}' \
  | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
echo "$PG_IP"                           # 172.x.0.1

# ④ Namespace, ConfigMap (S3_BUCKET이 새 버킷 이름인지 먼저 확인)
grep S3_BUCKET k8s/configmap.yaml
kubectl apply -f k8s/namespace.yaml -f k8s/configmap.yaml

# ⑤ Secret (새 Access Key와 새 JWT 키)
kubectl create secret generic cloud-file-service-secret \
  --namespace cloud-file-service \
  --from-literal=DB_URL="jdbc:postgresql://${PG_IP}:5432/cloud_file" \
  --from-literal=DB_USERNAME='cloud_user' \
  --from-literal=DB_PASSWORD='cloud_password' \
  --from-literal=AWS_ACCESS_KEY_ID="$(aws configure get aws_access_key_id)" \
  --from-literal=AWS_SECRET_ACCESS_KEY="$(aws configure get aws_secret_access_key)" \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --dry-run=client -o yaml | kubectl apply -f -

# ⑥ 이미지 build → kind에 올리기 → 배포
docker build -t cloud-file-service:latest .
kind load docker-image cloud-file-service:latest --name cloud-file-service
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml
kubectl rollout status deployment/cloud-file-service -n cloud-file-service --timeout=240s
```

> 백업한 `k8s/secret.yaml`에는 **옛 Access Key**와 옛 `DB_URL`이 들어 있다. 파일 방식을 쓰려면 새 값으로 고친 뒤 `kubectl apply -f k8s/secret.yaml`을 실행한다.

port-forward (터미널 1) 후 Frontend (터미널 2):

```bash
while true; do
  kubectl port-forward -n cloud-file-service service/cloud-file-service 8080:8080
  sleep 2
done
```

```bash
curl -s http://localhost:8080/actuator/health; echo    # {"status":"UP"...}
cd frontend && npm run dev -- --host 0.0.0.0
```

(선택) HPA를 쓰려면 metrics-server를 설치한 뒤 `kubectl apply -f k8s/hpa.yaml`을 실행한다 (Day 7).

------------------------------------------------------------------------

## 7. ECS 배포

4번에서 ECS 서비스는 만들어졌지만 ECR이 비어 있어 Task가 뜨지 못한다. 이미지를 올리면 된다.

**방법 A --- GitHub Actions**: 3번에서 GitHub Secrets를 등록했다면 `main`에 push하면 `Backend Docker Build`가 ECR에 `latest`를 올린다. Actions 탭에서 성공을 확인한 뒤 아래 "강제 재배포"만 실행한다.

**방법 B --- 수동 push**

```bash
cd /workspaces/Cloud-File-Service
ECR_REPOSITORY_URL=$(terraform -chdir=infra/terraform output -raw ecr_repository_url)
aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin "${ECR_REPOSITORY_URL%%/*}"

docker build -t "$ECR_REPOSITORY_URL:latest" .
docker push "$ECR_REPOSITORY_URL:latest"
```

강제 재배포:

```bash
CLUSTER=$(terraform -chdir=infra/terraform output -raw ecs_cluster_name)
SERVICE=$(terraform -chdir=infra/terraform output -raw ecs_service_name)

aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --force-new-deployment > /dev/null
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
```

Task 공인 IP 확인 → health 체크:

```bash
TASK=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" --query 'taskArns[0]' --output text)
ENI=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK" \
  --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text)
IP=$(aws ec2 describe-network-interfaces --network-interface-ids "$ENI" \
  --query 'NetworkInterfaces[0].Association.PublicIp' --output text)
echo "$IP"

curl -s http://$IP:8080/actuator/health; echo    # {"status":"UP"...}
curl -s http://$IP:8080/api/files; echo          # 401 JSON 이어야 한다
```

> Task가 재시작되면 공인 IP가 바뀐다. ECS 쪽 계정과 파일은 RDS와 S3에 저장되므로 kind나 로컬과는 별개다.

------------------------------------------------------------------------

## 8. 다 쓴 뒤 정리 (비용 멈추기)

**Codespace를 지우기 전에** 한다. tfstate가 Codespace 안에만 있기 때문이다.

```bash
cd /workspaces/Cloud-File-Service/infra/terraform

# ① S3 버킷의 모든 버전 비우기 (버전 관리가 켜져 있어 그냥은 안 지워진다)
B=$(terraform output -raw s3_bucket_name)
aws s3api delete-objects --bucket $B --delete "$(aws s3api list-object-versions --bucket $B \
  --query '{Objects: [Versions,DeleteMarkers][][].{Key:Key,VersionId:VersionId}}' --output json)"

# ② ECR 이미지 삭제
aws ecr batch-delete-image --repository-name cloud-file-service-dev \
  --image-ids "$(aws ecr list-images --repository-name cloud-file-service-dev --query imageIds --output json)"

# ③ 전체 삭제
terraform destroy

# ④ db-password 시크릿 즉시 삭제 (다음에 같은 이름으로 다시 만들 수 있게)
aws secretsmanager delete-secret --secret-id cloud-file-service-dev/db-password --force-delete-without-recovery
```

확인 (모두 비어 있어야 한다):

```bash
aws rds describe-db-instances --query 'DBInstances[].DBInstanceIdentifier'
aws ecs list-clusters
aws s3 ls
aws ecr describe-repositories --query 'repositories[].repositoryName'
```

그다음:

1. 커밋하지 않은 코드 `git push`
2. git에 안 올라가는 파일(`terraform.tfvars`, `frontend/.env.local`, `k8s/secret.yaml` 등)을 zip으로 묶어 PC에 다운로드
3. IAM → admin → 액세스 키 삭제, GitHub Actions Secrets 삭제
4. github.com/codespaces 에서 Codespace 삭제
5. 며칠 뒤 AWS Billing에서 요금이 더 나오지 않는지 확인

> AWS 키를 지운 상태에서 `main`에 push하면 `Backend Docker Build` 워크플로가 실패한다. 테스트만 하는 `Backend CI`는 AWS 없이 정상 동작한다.
