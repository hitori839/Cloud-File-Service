# Cloud File Service — Day 4
## GitHub Codespaces + Docker + AWS ECR + ECS Fargate 실전 배포

> 목표: Day 3의 Spring Boot + Docker + S3 파일 서비스를 AWS ECR에 올리고 ECS Fargate에서 실제 실행한다.
>
> 대상: 클라우드/DevOps 초보자
>
> 개발환경: GitHub Codespaces + VS Code
>
> 핵심: 개념을 이해한 뒤 직접 명령어를 실행하고, 장애가 나면 스스로 원인을 찾는 것.

---

# 0. Day 4에서 만드는 것

Day 1~3에서는 애플리케이션을 만들었다.

Day 4에서는 **실제로 AWS에서 실행**한다.

최종 구조:

```text
                         Internet
                            |
                            v
                    +---------------+
                    |   AWS VPC     |
                    |               |
                    | Public Subnet |
                    |       |       |
                    |       v       |
                    |  +---------+  |
                    |  |   ECS   |  |
                    |  | Fargate |  |
                    |  |  Task   |  |
                    |  | Docker  |  |
                    |  | Spring  |  |
                    |  +----+----+  |
                    +-------|-------+
                            |
                            | IAM Task Role
                            v
                       +---------+
                       |   S3    |
                       |  Files  |
                       +---------+

Codespaces
    |
    | docker build
    v
Docker Image
    |
    | docker push
    v
ECR
    |
    | image pull
    v
ECS/Fargate
```

---

# 1. Day 4 최종 목표

Day 4가 끝났을 때 다음을 할 수 있어야 한다.

- [ ] AWS CLI 인증 확인
- [ ] ECR Repository 생성
- [ ] Docker Image Build
- [ ] Docker Image를 ECR에 Push
- [ ] ECS Cluster 생성
- [ ] ECS Task Definition 작성
- [ ] ECS Service 생성
- [ ] Fargate Task 실행
- [ ] Security Group 설정
- [ ] Public IP로 API 접근
- [ ] CloudWatch Logs 확인
- [ ] ECS Task Role을 이용한 S3 접근
- [ ] Upload/Download/Delete 테스트
- [ ] Task를 종료해도 S3 파일이 남는 것 확인
- [ ] ECS Service가 새 Task를 만드는 것 확인

---

# 2. Day 1~3과 Day 4의 차이

## Day 1

프로젝트 구조와 기본 개발환경:

```text
Codespaces
  |
  v
Spring Boot
  |
  v
Docker
```

## Day 2

파일 서비스 기능:

```text
Client
  |
  v
Spring Boot
  |
  +-- Upload
  +-- Download
  +-- Delete
```

## Day 3

S3 연결:

```text
Spring Boot
  |
  v
AWS S3
```

## Day 4

AWS에서 Container 실행:

```text
Codespaces
  |
  | docker build
  v
Docker Image
  |
  | docker push
  v
ECR
  |
  | pull
  v
ECS Fargate
  |
  v
Spring Boot
  |
  v
S3
```

---

# 3. ECR이란?

ECR은 Amazon Elastic Container Registry다.

쉽게 말하면:

> AWS의 Docker Image 저장소

다.

Docker Hub와 비교하면:

```text
Docker Hub
  |
  +-- Docker Image 저장

ECR
  |
  +-- Docker Image 저장
```

우리가 Codespaces에서 만든 Image를 ECS가 가져갈 수 있도록 ECR에 저장한다.

---

# 4. ECS란?

ECS는 Amazon Elastic Container Service다.

쉽게 말하면:

> AWS에서 Docker Container를 실행하고 관리하는 서비스

다.

Docker만 사용하면:

```bash
docker run image
```

로 Container 하나를 실행할 수 있다.

하지만 실제 서비스에서는:

- 여러 Container 실행
- 장애난 Container 교체
- 원하는 개수 유지
- 네트워크 연결
- IAM 권한
- 로그
- 배포

등이 필요하다.

ECS가 이런 Container 운영을 관리한다.

---

# 5. Fargate란?

Fargate는 ECS에서 Container를 실행할 때 서버를 직접 관리하는 부담을 줄여주는 실행 방식이다.

EC2 기반으로 직접 운영하면:

```text
EC2
 |
 +-- OS
 +-- Docker
 +-- Patch
 +-- CPU
 +-- Memory
 +-- Container
```

Fargate를 사용하면:

```text
ECS
 |
 +-- Fargate
      |
      +-- Container
```

가 된다.

이번 프로젝트의 첫 AWS 배포는 Fargate로 진행한다.

---

# 6. ECS의 네 가지 핵심

처음에는 다음 네 개가 가장 헷갈린다.

```text
Cluster
Task Definition
Task
Service
```

## Cluster

Container를 실행하는 논리적인 공간.

```text
ECS Cluster
  |
  +-- Service
```

## Task Definition

Container를 어떻게 실행할지 적어놓은 설정.

```text
Image
CPU
Memory
Port
Environment
IAM Role
Logs
```

## Task

Task Definition을 실제 실행한 것.

```text
Task Definition
       |
       v
      Task
       |
       v
   Container
```

## Service

원하는 수의 Task를 계속 유지/관리한다.

```text
Service
 |
 +-- Task 1
 +-- Task 2
```

Task 하나가 죽으면 Service가 새 Task를 만들 수 있다.

---

# 7. 전체 관계

```text
ECS Cluster
    |
    v
ECS Service
    |
    v
Task Definition
    |
    v
Task
    |
    v
Container
    |
    v
Spring Boot
```

단, Task Definition은 실제 실행 중인 Container가 아니라 **실행 방법을 정의한 설정**이라는 것을 기억한다.

---

# 8. Docker Image와 Container

Image:

> 애플리케이션을 실행하기 위한 패키지

Container:

> Image를 실제 실행한 프로세스

예:

```text
cloud-file-service:1.0
```

이라는 Image가 있으면:

```bash
docker run cloud-file-service:1.0
```

으로 Container를 실행한다.

ECR에는 Image를 저장하고 ECS/Fargate에서는 Container가 실행된다.

---

# 9. IAM

IAM은 AWS 권한을 관리한다.

우리 애플리케이션이 S3에 접근하려면 권한이 필요하다.

잘못된 방법:

```java
String accessKey = "...";
String secretKey = "...";
```

올바른 방향:

```text
ECS Task
   |
   v
IAM Task Role
   |
   v
S3 Permission
```

---

# 10. Execution Role과 Task Role

이 둘을 반드시 구분한다.

## Execution Role

ECS가 Task를 시작하는 과정에서 사용하는 권한.

대표적으로:

```text
ECR Image Pull
CloudWatch Logs 전송
```

## Task Role

Container 안의 애플리케이션이 AWS 서비스를 사용할 때 사용하는 권한.

우리 프로젝트:

```text
Spring Boot
   |
   v
S3
```

이므로 S3 권한은 Task Role에 준다.

구조:

```text
                 ECS Task
                    |
          +---------+---------+
          |                   |
          v                   v
 Execution Role          Task Role
          |                   |
          v                   v
     ECR / Logs              S3
```

---

# 11. 보안 원칙

절대로 다음을 Git에 올리지 않는다.

```text
AWS Access Key
AWS Secret Access Key
.env
.aws/credentials
DB Password
JWT Secret
Private Key
```

`.gitignore` 예:

```gitignore
.env
.env.*
!.env.example
.aws/
*.pem
build/
.gradle/
node_modules/
```

---

# 12. GitHub Codespaces 준비

Terminal에서:

```bash
pwd
```

프로젝트 루트인지 확인한다.

```bash
ls -la
```

예상 구조:

```text
backend/
frontend/
Dockerfile
docker-compose.yml
.gitignore
README.md
```

프로젝트 구조는 실제 Day 1~3 프로젝트에 맞춰 사용한다.

---

# 13. Git 상태 확인

```bash
git status
```

변경사항 확인:

```bash
git diff
```

필요하면 먼저 Commit:

```bash
git add .
git commit -m "prepare day4 ecs deployment"
```

---

# 14. AWS CLI 확인

```bash
aws --version
```

AWS CLI가 설치되어 있어야 한다.

인증 확인:

```bash
aws sts get-caller-identity
```

정상 예:

```json
{
  "UserId": "...",
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:..."
}
```

---

# 15. 기본 환경변수

서울 Region:

```bash
export AWS_REGION=ap-northeast-2
```

Account ID:

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity   --query Account   --output text)
```

프로젝트 변수:

```bash
export APP_NAME=cloud-file-service
export ECR_REPOSITORY=cloud-file-service
export ECS_CLUSTER=cloud-file-service-cluster
export ECS_SERVICE=cloud-file-service
export ECS_TASK_FAMILY=cloud-file-service
export LOG_GROUP=/ecs/cloud-file-service
```

확인:

```bash
echo "$AWS_REGION"
echo "$AWS_ACCOUNT_ID"
echo "$APP_NAME"
```

---

# 16. ECR URI

```bash
export ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}"
```

확인:

```bash
echo "$ECR_URI"
```

예:

```text
123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/cloud-file-service
```

---

# 17. ECR Repository 생성

```bash
aws ecr create-repository   --repository-name "$ECR_REPOSITORY"   --region "$AWS_REGION"
```

이미 존재한다면 오류가 나올 수 있다.

확인:

```bash
aws ecr describe-repositories   --repository-names "$ECR_REPOSITORY"   --region "$AWS_REGION"
```

---

# 18. Docker Image Build

프로젝트 루트:

```bash
docker build   -t "${APP_NAME}:latest"   .
```

확인:

```bash
docker images
```

---

# 19. 로컬 Docker 테스트

AWS에 올리기 전에 반드시 테스트한다.

```bash
docker run --rm \
  --add-host host.docker.internal:host-gateway \
  -p 8080:8080 \
  -e SPRING_DATASOURCE_URL=jdbc:postgresql://host.docker.internal:5432/cloud_file \
  -e SPRING_DATASOURCE_USERNAME=cloud_user \
  -e SPRING_DATASOURCE_PASSWORD=cloud_password \
  -e AWS_REGION="$AWS_REGION" \
  -e S3_BUCKET="$S3_BUCKET" \
  "${APP_NAME}:latest"
```

다른 Terminal:

```bash
curl --connect-timeout 5 --max-time 15 http://localhost:8080/health
```

Health API가 있다면:

```bash
curl --connect-timeout 5 --max-time 15 http://localhost:8080/health
```

이 명령은 GitHub Codespaces에서 로컬 PostgreSQL Container가 호스트의 `5432`로 공개되어 있다는 전제다. ECS/Fargate에서는 `host.docker.internal`이나 `localhost`를 사용하지 말고 실제 PostgreSQL endpoint를 주입한다.

---

# 20. 왜 로컬 테스트를 먼저 하는가?

AWS에서 문제가 발생했을 때:

```text
Application 문제
```

인지:

```text
AWS Infrastructure 문제
```

인지 분리해야 하기 때문이다.

로컬 Docker가 정상인데 ECS에서만 실패한다면 AWS 설정부터 조사할 수 있다.

---

# 21. ECR 로그인

```bash
aws ecr get-login-password   --region "$AWS_REGION" | docker login   --username AWS   --password-stdin   "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
```

성공:

```text
Login Succeeded
```

---

# 22. Docker Image Tag

현재:

```text
cloud-file-service:latest
```

를 ECR 주소로 Tag한다.

```bash
docker tag   "${APP_NAME}:latest"   "${ECR_URI}:latest"
```

확인:

```bash
docker images
```

---

# 23. ECR Push

```bash
docker push "${ECR_URI}:latest"
```

확인:

```bash
aws ecr describe-images   --repository-name "$ECR_REPOSITORY"   --region "$AWS_REGION"
```

---

# 24. 버전 Tag 권장

운영 환경에서는 `latest`만 사용하는 것보다 버전 Tag가 좋다.

Git Commit SHA:

```bash
export IMAGE_TAG=$(git rev-parse --short HEAD)
```

예:

```text
9f83a21
```

Tag:

```bash
docker tag   "${APP_NAME}:latest"   "${ECR_URI}:${IMAGE_TAG}"
```

Push:

```bash
docker push "${ECR_URI}:${IMAGE_TAG}"
```

이후 CI/CD에서는 Git SHA를 Image Tag로 사용하는 전략을 고려한다.

---

# 25. ECS Cluster 생성

```bash
aws ecs create-cluster   --cluster-name "$ECS_CLUSTER"   --region "$AWS_REGION"
```

확인:

```bash
aws ecs describe-clusters   --clusters "$ECS_CLUSTER"   --region "$AWS_REGION"
```

---

# 26. CloudWatch Log Group

```bash
aws logs create-log-group   --log-group-name "$LOG_GROUP"   --region "$AWS_REGION"
```

확인:

```bash
aws logs describe-log-groups   --log-group-name-prefix "$LOG_GROUP"   --region "$AWS_REGION"
```

---

# 27. CloudWatch Logs가 필요한 이유

로컬에서는:

```bash
docker logs container
```

를 사용한다.

AWS에서는 Container가 다른 곳에서 실행되므로 중앙 로그가 필요하다.

구조:

```text
Fargate Container
      |
      | stdout/stderr
      v
CloudWatch Logs
```

그래서 장애가 발생해도 AWS Console이나 CLI에서 로그를 확인할 수 있다.

---

# 28. IAM Execution Role

AWS Console:

```text
IAM
→ Roles
→ Create role
→ AWS service
→ Elastic Container Service
→ ECS Task
```

Role 이름:

```text
ecsTaskExecutionRole
```

대표적인 정책:

```text
AmazonECSTaskExecutionRolePolicy
```

---

# 29. Execution Role ARN

```bash
export EXECUTION_ROLE_ARN=$(aws iam get-role   --role-name ecsTaskExecutionRole   --query 'Role.Arn'   --output text)
```

확인:

```bash
echo "$EXECUTION_ROLE_ARN"
```

---

# 30. Task Role Trust Policy

파일 생성:

```text
infra/task-role-trust-policy.json
```

내용:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

---

# 31. Task Role 생성

```bash
aws iam create-role   --role-name cloud-file-service-task-role   --assume-role-policy-document file://infra/task-role-trust-policy.json
```

이미 있다면:

```bash
aws iam get-role   --role-name cloud-file-service-task-role
```

---

# 32. S3 Task Policy

`infra/s3-task-policy.json`

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

`YOUR_BUCKET_NAME`을 실제 Bucket 이름으로 변경한다.

---

# 33. 왜 Bucket ARN과 Object ARN이 다른가?

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

을 사용한다.

---

# 34. Task Role에 Policy 적용

```bash
aws iam put-role-policy   --role-name cloud-file-service-task-role   --policy-name CloudFileServiceS3Access   --policy-document file://infra/s3-task-policy.json
```

확인:

```bash
aws iam list-role-policies   --role-name cloud-file-service-task-role
```

---

# 35. Task Role ARN

```bash
export TASK_ROLE_ARN=$(aws iam get-role   --role-name cloud-file-service-task-role   --query 'Role.Arn'   --output text)
```

확인:

```bash
echo "$TASK_ROLE_ARN"
```

---

# 36. VPC란?

VPC는 AWS 안에서 사용하는 가상 네트워크다.

```text
AWS
└── VPC
    ├── Subnet
    ├── Route Table
    ├── Internet Gateway
    └── Security Group
```

---

# 37. Default VPC 확인

실습을 단순하게 하기 위해 Default VPC를 사용할 수 있다.

```bash
export VPC_ID=$(aws ec2 describe-vpcs   --filters Name=isDefault,Values=true   --region "$AWS_REGION"   --query 'Vpcs[0].VpcId'   --output text)
```

확인:

```bash
echo "$VPC_ID"
```

---

# 38. Subnet 확인

```bash
aws ec2 describe-subnets   --filters "Name=vpc-id,Values=$VPC_ID"   --region "$AWS_REGION"   --query 'Subnets[].{ID:SubnetId,AZ:AvailabilityZone,PublicIP:MapPublicIpOnLaunch}'   --output table
```

실습용으로 적절한 Subnet을 선택한다.

```bash
export SUBNET_ID=subnet-xxxxxxxx
```

실제 ID로 변경한다.

---

# 39. Public Subnet을 사용하는 이유

첫 ECS 배포를 단순하게 하기 위해 Task에 Public IP를 할당하고 직접 API를 테스트한다.

```text
Internet
   |
   v
Public IP
   |
   v
Fargate Task
   |
   v
Spring Boot :8080
```

운영 구조에서는 일반적으로:

```text
Internet
   |
   v
ALB
   |
   v
Private ECS Tasks
```

형태로 개선한다.

---

# 40. Security Group

Security Group은 네트워크 방화벽과 비슷하다.

실습:

```text
Inbound
TCP 8080
Source 0.0.0.0/0
```

을 허용한다.

---

# 41. Security Group 생성

```bash
aws ec2 create-security-group   --group-name cloud-file-service-sg   --description "Security group for Cloud File Service"   --vpc-id "$VPC_ID"   --region "$AWS_REGION"
```

---

# 42. Security Group ID

```bash
export SG_ID=$(aws ec2 describe-security-groups   --filters     Name=group-name,Values=cloud-file-service-sg     Name=vpc-id,Values="$VPC_ID"   --region "$AWS_REGION"   --query 'SecurityGroups[0].GroupId'   --output text)
```

확인:

```bash
echo "$SG_ID"
```

---

# 43. 8080 포트 허용

```bash
aws ec2 authorize-security-group-ingress   --group-id "$SG_ID"   --protocol tcp   --port 8080   --cidr 0.0.0.0/0   --region "$AWS_REGION"
```

주의:

`0.0.0.0/0`은 모든 IPv4 주소를 의미한다.

학습용으로는 편하지만 운영 환경에서는 그대로 사용하지 않는 것이 좋다.

---

# 44. 운영 환경에서는 어떻게 개선하는가?

현재:

```text
Internet
   |
   v
Fargate Public IP
```

운영:

```text
Internet
   |
   v
ALB
   |
   v
ECS Private Subnet
```

Security Group도:

```text
ALB SG
  |
  +-- 80/443

ECS SG
  |
  +-- ALB SG에서 오는 트래픽만 허용
```

처럼 제한하는 것이 좋다.

---

# 45. Task Definition

Task Definition은 Container 실행 설명서다.

다음 파일을 만든다.

```text
infra/ecs-task-definition.json
```

기본 형태:

```json
{
  "family": "cloud-file-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": [
    "FARGATE"
  ],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "EXECUTION_ROLE_ARN",
  "taskRoleArn": "TASK_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "cloud-file-service",
      "image": "ECR_IMAGE_URI",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ]
    }
  ]
}
```

---

# 46. Task Definition 항목

## family

```json
"family": "cloud-file-service"
```

Task Definition 그룹의 이름.

## networkMode

```json
"networkMode": "awsvpc"
```

Fargate에서 사용하는 네트워크 모드.

## requiresCompatibilities

```json
"requiresCompatibilities": ["FARGATE"]
```

Fargate에서 실행한다는 뜻.

## cpu

```json
"cpu": "512"
```

CPU 리소스.

## memory

```json
"memory": "1024"
```

Memory 리소스.

---

# 47. Container Definition

```json
"containerDefinitions": [
  {
    "name": "cloud-file-service",
    "image": "ECR_IMAGE_URI"
  }
]
```

여기에 실제 실행할 Docker Image를 지정한다.

---

# 48. Port Mapping

Spring Boot가 8080이라면:

```json
"portMappings": [
  {
    "containerPort": 8080,
    "protocol": "tcp"
  }
]
```

Spring Boot:

```text
server.port=8080
```

ECS:

```text
containerPort=8080
```

가 맞아야 한다.

---

# 49. Environment Variables

예:

```json
"environment": [
  {
    "name": "AWS_REGION",
    "value": "ap-northeast-2"
  },
  {
    "name": "S3_BUCKET",
    "value": "YOUR_BUCKET_NAME"
  },
  {
    "name": "SPRING_DATASOURCE_URL",
    "value": "jdbc:postgresql://YOUR_DB_ENDPOINT:5432/cloud_file"
  },
  {
    "name": "SPRING_DATASOURCE_USERNAME",
    "value": "YOUR_DB_USERNAME"
  },
  {
    "name": "SPRING_DATASOURCE_PASSWORD",
    "value": "YOUR_DB_PASSWORD"
  }
]
```

`SPRING_DATASOURCE_URL`은 ECS에서 반드시 실제 PostgreSQL endpoint를 사용해야 한다.

- Docker Compose: `jdbc:postgresql://postgres:5432/cloud_file`
- ECS/Fargate: `jdbc:postgresql://YOUR_DB_ENDPOINT:5432/cloud_file`
- ECS에서 `localhost:5432`를 사용하면 컨테이너 자기 자신을 가리키므로 Spring Boot가 시작되지 않는다.

DB endpoint, 사용자 이름, 비밀번호가 준비되지 않았다면 Task Definition을 등록하거나 ECS Service를 생성하지 않는다.

Secret은 Secrets Manager 또는 SSM Parameter Store를 사용하는 방향으로 발전한다.

---

# 50. CloudWatch 로그 설정

Container Definition:

```json
"logConfiguration": {
  "logDriver": "awslogs",
  "options": {
    "awslogs-group": "/ecs/cloud-file-service",
    "awslogs-region": "ap-northeast-2",
    "awslogs-stream-prefix": "ecs"
  }
}
```

---

# 51. 완성된 Task Definition 예시

```json
{
  "family": "cloud-file-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": [
    "FARGATE"
  ],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "EXECUTION_ROLE_ARN",
  "taskRoleArn": "TASK_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "cloud-file-service",
      "image": "ECR_IMAGE_URI:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "AWS_REGION",
          "value": "ap-northeast-2"
        },
        {
          "name": "S3_BUCKET",
          "value": "YOUR_BUCKET_NAME"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/cloud-file-service",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

---

# 52. 실제 값으로 파일 생성하기

환경변수를 사용하면 편하다.

```bash
export S3_BUCKET=YOUR_BUCKET_NAME
export DB_ENDPOINT=YOUR_DB_ENDPOINT
export DB_USERNAME=YOUR_DB_USERNAME
export DB_PASSWORD=YOUR_DB_PASSWORD

if [[ "$DB_ENDPOINT" == "YOUR_DB_ENDPOINT" || -z "$DB_ENDPOINT" ]]; then
  echo "실제 PostgreSQL endpoint를 먼저 설정하세요. ECS에서는 localhost:5432를 사용할 수 없습니다."
  return 1 2>/dev/null || exit 1
fi
```

그리고:

```bash
cat > infra/ecs-task-definition.json <<EOF
{
  "family": "${ECS_TASK_FAMILY}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "${APP_NAME}",
      "image": "${ECR_URI}:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "AWS_REGION",
          "value": "${AWS_REGION}"
        },
        {
          "name": "S3_BUCKET",
          "value": "${S3_BUCKET}"
        },
        {
          "name": "SPRING_DATASOURCE_URL",
          "value": "jdbc:postgresql://${DB_ENDPOINT}:5432/cloud_file"
        },
        {
          "name": "SPRING_DATASOURCE_USERNAME",
          "value": "${DB_USERNAME}"
        },
        {
          "name": "SPRING_DATASOURCE_PASSWORD",
          "value": "${DB_PASSWORD}"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF
```

---

# 53. JSON 문법 검사

```bash
python -m json.tool infra/ecs-task-definition.json
```

정상 JSON이면 출력된다.

오류가 나오면 AWS에 등록하기 전에 JSON부터 수정한다.

---

# 54. Task Definition 등록

실제 DB endpoint를 설정한 뒤에만 등록한다. `<RDS_ENDPOINT>` 같은 placeholder가 JSON에 남아 있으면 Task가 실행되어도 Spring Boot가 DB 연결에 실패하고 `Essential container in task exited`가 발생한다.

```bash
aws ecs register-task-definition   --cli-input-json file://infra/ecs-task-definition.json   --region "$AWS_REGION"
```

예:

```text
cloud-file-service:1
```

---

# 55. Revision이란?

Task Definition을 수정하면 새로운 Revision이 생긴다.

```text
cloud-file-service:1
cloud-file-service:2
cloud-file-service:3
```

예:

```text
1 → Image v1
2 → Image v2
3 → Image v3
```

배포 버전 추적에 사용한다.

---

# 56. ECS Service 생성

```bash
aws ecs create-service   --cluster "$ECS_CLUSTER"   --service-name "$ECS_SERVICE"   --task-definition "$ECS_TASK_FAMILY"   --desired-count 1   --launch-type FARGATE   --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SG_ID],assignPublicIp=ENABLED}"   --region "$AWS_REGION"
```

---

# 57. 명령어 해석

```text
--cluster
→ 어느 Cluster인가?

--service-name
→ Service 이름

--task-definition
→ 어떤 실행 설정인가?

--desired-count 1
→ Task 1개를 유지

--launch-type FARGATE
→ Fargate 사용

subnets
→ 어느 Subnet에 배치?

securityGroups
→ 어떤 방화벽?

assignPublicIp=ENABLED
→ Public IP 할당
```

---

# 58. Service 상태 확인

```bash
aws ecs describe-services   --cluster "$ECS_CLUSTER"   --services "$ECS_SERVICE"   --region "$AWS_REGION"
```

중요:

```text
desiredCount
runningCount
pendingCount
events
```

정상 예:

```text
desiredCount = 1
runningCount = 1
```

---

# 59. Task 목록

```bash
aws ecs list-tasks   --cluster "$ECS_CLUSTER"   --service-name "$ECS_SERVICE"   --region "$AWS_REGION"
```

---

# 60. Task ARN 저장

```bash
export TASK_ARN=$(aws ecs list-tasks   --cluster "$ECS_CLUSTER"   --service-name "$ECS_SERVICE"   --region "$AWS_REGION"   --query 'taskArns[0]'   --output text)
```

`describe-tasks`는 Task ARN이 아니라 Task ID를 받는다. 반드시 ID로 변환해야 한다.

```bash
echo "$TASK_ARN"
export TASK_ID="${TASK_ARN##*/}"
echo "$TASK_ID"
```

중요:
- 실제 AWS에서 `--tasks` 값은 32/36자리 Task ID만 넣는다.
- `TASK_ARN`을 그대로 넣으면 `InvalidParameterException`가 발생한다.

---

# 61. Task 상태 확인

```bash
aws ecs describe-tasks   --cluster "$ECS_CLUSTER"   --tasks "$TASK_ID"   --region "$AWS_REGION"   --query 'tasks[0].{desired:desiredStatus,last:lastStatus,reason:stoppedReason}'
```

정상 예:

```text
desired = RUNNING
last = RUNNING
```

---

# 62. Task가 STOPPED라면

```bash
aws ecs describe-tasks   --cluster "$ECS_CLUSTER"   --tasks "$TASK_ID"   --region "$AWS_REGION"   --query 'tasks[0].{stopCode:stopCode,reason:stoppedReason}'
```

Container 종료 이유 확인:

```bash
aws ecs describe-tasks   --cluster "$ECS_CLUSTER"   --tasks "$TASK_ID"   --region "$AWS_REGION"   --query 'tasks[0].containers[].{name:name,status:lastStatus,exitCode:exitCode,reason:reason}'
```

실제 자주 발생하는 원인:
- Spring Boot 시작 실패
- DB 연결 실패 (`localhost:5432` 접근)
- 실행 환경 변수 누락
- `securityGroups=[]` 상태에서 외부 접속 차단

---

# 63. Service Events 확인

```bash
aws ecs describe-services   --cluster "$ECS_CLUSTER"   --services "$ECS_SERVICE"   --region "$AWS_REGION"   --query 'services[0].events[:15]'
```

ECS가 Task를 실행하지 못하는 경우 매우 유용하다.

---

# 64. Network Configuration 먼저 확인

이 단계는 절대 건너뛰지 않는다. 67번에서 막히는 가장 큰 이유는 `securityGroups`가 비어 있는 상태이기 때문이다.

```bash
aws ecs describe-services   --cluster "$ECS_CLUSTER"   --services "$ECS_SERVICE"   --region "$AWS_REGION"   --query 'services[0].networkConfiguration'   --output json
```

필수 조건:
- `subnets`가 존재한다.
- `securityGroups`가 비어 있지 않아야 한다.
- `assignPublicIp`는 `ENABLED`여야 한다.

정상 예:

```json
{
  "awsvpcConfiguration": {
    "subnets": ["subnet-..."],
    "securityGroups": ["sg-..."],
    "assignPublicIp": "ENABLED"
  }
}
```

만약 `securityGroups: []` 이면, 다음을 먼저 수행한다.

```bash
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --region "$AWS_REGION"
```

이 단계가 끝난 뒤에만 다음으로 진행한다.

---

# 65. CloudWatch 로그 확인

```bash
aws logs tail   "$LOG_GROUP"   --follow   --region "$AWS_REGION"
```

Spring Boot가 정상 실행되면 startup 로그를 확인할 수 있다.

중요:
- `Essential container in task exited`가 나오면 로그를 먼저 확인해야 한다.
- DB 연결 실패 로그는 `Connection to localhost:5432 refused`, `Application run failed` 등으로 나타난다.

---

# 66. Task의 Network Interface 확인

Task가 RUNNING이어도 Public IP가 비어 있으면 외부 접속이 안 된다.

```bash
aws ecs describe-tasks   --cluster "$ECS_CLUSTER"   --tasks "$TASK_ID"   --region "$AWS_REGION"   --query 'tasks[0].attachments[].details'
```

`networkInterfaceId`를 찾는다.

예:

```text
eni-0123456789abcdef
```

---

# 67. Public IP 조회

`securityGroups`와 `assignPublicIp`가 정상이어야 이 단계가 의미가 있다.

Task가 재시작되거나 Service가 새 Task를 만들면 Public IP는 바뀐다. 이전에 저장한 IP를 재사용하지 말고 현재 RUNNING Task의 ENI에서 매번 다시 조회한다.

```bash
export ENI_ID=eni-xxxxxxxxxxxxxxxx
export PUBLIC_IP=$(aws ec2 describe-network-interfaces   --network-interface-ids "$ENI_ID"   --region "$AWS_REGION"   --query 'NetworkInterfaces[0].Association.PublicIp'   --output text)
```

확인:

```bash
echo "$PUBLIC_IP"
```

중요:
- `PUBLIC_IP`가 비어 있으면 보통 다음 중 하나다.
  - `securityGroups=[]`
  - public subnet이 아님
  - Internet Gateway 연결이 없음
  - task가 아직 RUNNING 상태가 아님

---

# 68. API 테스트

```bash
curl --connect-timeout 5 --max-time 15 "http://${PUBLIC_IP}:8080/health"
```

Health API:

```bash
curl "http://${PUBLIC_IP}:8080/actuator/health"
```

브라우저:

```text
http://PUBLIC_IP:8080
```

---

# 69. 접근이 안 될 때

## Connection timed out

우선:

```text
Public IP
Security Group
Subnet
Route Table
Internet Gateway
```

를 확인한다.

단, Task가 `RUNNING`이 아니면 Public IP가 있어도 응답하지 않는다. `runningCount=1`과 컨테이너 `lastStatus=RUNNING`을 먼저 확인하고, Task가 교체된 경우 현재 ENI에서 Public IP를 다시 조회한다.

이전 실수: `assignPublicIp=ENABLED`는 켜져 있어도 `securityGroups=[]` 상태로 두면 외부 연결이 막힌다.

## Connection refused

우선:

```text
Spring Boot 실행
server.port
Container Port
```

를 확인한다.

특히 Fargate 컨테이너 내부에서는 `localhost:5432`가 아니라 실제 DB endpoint를 사용해야 한다.

```text
잘못된 예: jdbc:postgresql://localhost:5432/cloud_file
올바른 예: jdbc:postgresql://<RDS_ENDPOINT>:5432/cloud_file
```

> 정리: Day 4에서 67번이 막히는 주된 원인은 67번 자체가 아니라, 그 전에 `networkConfiguration`와 `securityGroups`를 확인하지 않은 상태에서 넘어간 데 있다. 이 문서는 이제 64번에서 먼저 `networkConfiguration`을 확인하고, `securityGroups`를 정비한 뒤 67번으로 넘어가도록 순서를 수정했다.

---

# 70. Spring Boot 포트

`application.properties`:

```properties
server.port=8080
```

외부 접근을 고려하면:

```properties
server.address=0.0.0.0
```

도 확인한다.

---

# 71. Health Check

Spring Boot Actuator를 사용한다면:

```gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-actuator'
}
```

설정:

```properties
management.endpoints.web.exposure.include=health,info
```

테스트:

```bash
curl "http://${PUBLIC_IP}:8080/actuator/health"
```

---

# 72. Container RUNNING과 Application 정상은 다르다

다음은 서로 다른 상태다.

```text
Container RUNNING
```

과:

```text
Spring Boot 정상
```

예를 들어 Java 프로세스가 살아 있어도 애플리케이션이 제대로 요청을 처리하지 못할 수 있다.

따라서:

```text
ECS 상태
+
CloudWatch Logs
+
Health Endpoint
```

를 함께 확인한다.

---

# 73. S3 Upload 테스트

Day 3에서 만든 실제 Upload API를 사용한다.

예:

```bash
echo "Hello Cloud File Service" > test.txt
```

Upload:

```bash
curl -X POST   -F "file=@test.txt"   "http://${PUBLIC_IP}:8080/api/files"
```

> `/api/files`는 예시다.
> 실제 Day 3 프로젝트의 Controller 경로로 변경한다.

---

# 74. S3에서 확인

```bash
aws s3 ls s3://"$S3_BUCKET"/ --recursive
```

Object가 보이면 성공이다.

흐름:

```text
Client
  |
  v
ECS
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

---

# 75. Download 테스트

예:

```bash
curl   "http://${PUBLIC_IP}:8080/api/files/OBJECT_KEY"   -o downloaded.txt
```

실제 API 경로와 Object Key에 맞게 수정한다.

확인:

```bash
cat downloaded.txt
```

---

# 76. 파일 내용 비교

```bash
diff test.txt downloaded.txt
```

출력이 없다면 내용이 동일하다.

---

# 77. Delete 테스트

```bash
curl -X DELETE   "http://${PUBLIC_IP}:8080/api/files/OBJECT_KEY"
```

확인:

```bash
aws s3 ls s3://"$S3_BUCKET"/ --recursive
```

---

# 78. 매우 중요한 실험 — Task 재생성

파일을 하나 업로드한다.

```bash
echo "persistent data" > persistent.txt
```

Upload한다.

```bash
curl -X POST   -F "file=@persistent.txt"   "http://${PUBLIC_IP}:8080/api/files"
```

S3 확인:

```bash
aws s3 ls s3://"$S3_BUCKET"/ --recursive
```

---

# 79. 현재 Task 종료

```bash
aws ecs stop-task   --cluster "$ECS_CLUSTER"   --task "$TASK_ARN"   --reason "Day4 stateless container test"   --region "$AWS_REGION"
```

---

# 80. Service가 새 Task를 만드는지 확인

```bash
aws ecs describe-services   --cluster "$ECS_CLUSTER"   --services "$ECS_SERVICE"   --region "$AWS_REGION"   --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}'
```

잠시 기다린다.

정상:

```text
desired = 1
running = 1
```

---

# 81. 왜 새 Task가 생기는가?

Service의 desired count가 1이기 때문이다.

```text
원하는 상태:
Task 1개 실행
```

기존 Task:

```text
STOPPED
```

그러면:

```text
ECS Service
   |
   v
현재 실행 Task = 0
   |
   v
원하는 Task = 1
   |
   v
새 Task 생성
```

---

# 82. S3 파일은 어떻게 되었는가?

다시:

```bash
aws s3 ls s3://"$S3_BUCKET"/ --recursive
```

파일이 남아 있어야 한다.

이것이 오늘 가장 중요한 실험 중 하나다.

---

# 83. Stateless란?

Container 자체에 중요한 영속 데이터를 두지 않는 구조다.

잘못된 구조:

```text
Fargate Task
└── /uploads
    └── test.txt
```

Task가 없어지면 파일도 보존된다고 기대할 수 없다.

올바른 구조:

```text
Fargate Task
      |
      v
     S3
      |
      +-- test.txt
```

Task가 교체되어도 S3 Object는 유지된다.

---

# 84. Scale Out

Service를 2개로 늘려본다.

```bash
aws ecs update-service   --cluster "$ECS_CLUSTER"   --service "$ECS_SERVICE"   --desired-count 2   --region "$AWS_REGION"
```

확인:

```bash
aws ecs describe-services   --cluster "$ECS_CLUSTER"   --services "$ECS_SERVICE"   --region "$AWS_REGION"   --query 'services[0].{desired:desiredCount,running:runningCount}'
```

---

# 85. Scale Out 구조

```text
ECS Service
 |
 +-- Task 1
 |     |
 |     +-- Spring Boot
 |
 +-- Task 2
       |
       +-- Spring Boot
          |
          +------ S3
          |
          +------ S3
```

실제로는 두 Task가 동일한 S3 Bucket을 사용할 수 있다.

---

# 86. 왜 S3가 Scale Out에 적합한가?

Task가 1개:

```text
Task 1 → S3
```

Task가 2개:

```text
Task 1 ─┐
        ├──→ S3
Task 2 ─┘
```

Task가 10개:

```text
Task 1 ─┐
Task 2  │
Task 3  │
...     ├──→ S3
Task 10 ┘
```

파일 저장소가 Container 외부에 있기 때문이다.

---

# 87. ECR Image Pull 실패

오류:

```text
CannotPullContainerError
```

확인 순서:

```text
1. ECR Repository
2. Image Tag
3. Image URI
4. Region
5. Execution Role
6. Network
```

Image:

```bash
aws ecr describe-images   --repository-name "$ECR_REPOSITORY"   --region "$AWS_REGION"
```

---

# 88. S3 AccessDenied

오류:

```text
AccessDenied
```

확인:

```text
1. Task Role
2. IAM Policy
3. Bucket 이름
4. Object ARN
5. Action
6. Bucket Policy
```

필요 권한 예:

```text
s3:GetObject
s3:PutObject
s3:DeleteObject
s3:ListBucket
```

---

# 89. Task Role과 Execution Role 혼동

잘못된 생각:

```text
S3 권한
→ Execution Role
```

애플리케이션의 S3 접근:

```text
S3 권한
→ Task Role
```

Execution Role은 Container 시작 과정에서 필요한 권한에 초점을 둔다.

---

# 90. CloudWatch 로그가 없는 경우

확인:

```text
Log Group 존재?
awslogs 설정?
Execution Role?
Task Definition 최신 Revision?
Task가 해당 Revision으로 실행?
```

명령:

```bash
aws logs describe-log-groups   --log-group-name-prefix "$LOG_GROUP"   --region "$AWS_REGION"
```

---

# 91. Task가 계속 STOPPED인 경우

순서:

```text
1. Service Events
2. Task Stop Reason
3. Container Exit Code
4. CloudWatch Logs
5. ECR
6. Execution Role
7. Network
8. Application
```

Service Events:

```bash
aws ecs describe-services   --cluster "$ECS_CLUSTER"   --services "$ECS_SERVICE"   --region "$AWS_REGION"   --query 'services[0].events[:20]'
```

---

# 92. Connection timed out

외부에서:

```text
connection timed out
```

이면:

```text
Public IP
Security Group
Subnet
Route Table
Internet Gateway
```

부터 확인한다.

---

# 93. Connection refused

```text
connection refused
```

이면 대상에 도달했지만 포트에서 요청을 받지 않는 상황을 의심한다.

확인:

```text
Spring Boot startup
server.port
server.address
Container port
Task Definition portMappings
```

---

# 94. 404 오류

```text
404 Not Found
```

이면 AWS 네트워크보다 Application API 경로를 먼저 확인한다.

예:

```text
/api/files
```

와:

```text
/api/file
```

은 다르다.

Day 3 Controller의 실제 mapping을 확인한다.

---

# 95. 500 오류

```text
500 Internal Server Error
```

이면 CloudWatch Logs를 확인한다.

```bash
aws logs tail   "$LOG_GROUP"   --follow   --region "$AWS_REGION"
```

S3 AccessDenied라면 Task Role을 확인한다.

---

# 96. Task Definition을 수정했다면

다시 등록해야 한다.

```bash
aws ecs register-task-definition   --cli-input-json file://infra/ecs-task-definition.json   --region "$AWS_REGION"
```

새 Revision:

```text
cloud-file-service:2
```

등이 만들어진다.

---

# 97. Service를 새 Revision으로 업데이트

```bash
aws ecs update-service   --cluster "$ECS_CLUSTER"   --service "$ECS_SERVICE"   --task-definition "$ECS_TASK_FAMILY"   --region "$AWS_REGION"
```

Service가 새 Revision으로 Task를 배포한다.

---

# 98. Deployment 흐름

```text
Developer
   |
   v
Git Commit
   |
   v
Docker Build
   |
   v
ECR Push
   |
   v
Task Definition Revision
   |
   v
ECS Service
   |
   v
Fargate Task
```

이 구조가 이후 CI/CD의 기반이 된다.

---

# 99. 왜 Task Definition을 Git으로 관리하는가?

Console에서 클릭만 하면 재현하기 어렵다.

코드로 관리하면:

```text
Git History
Code Review
Rollback
Automation
CI/CD
```

가 쉬워진다.

따라서:

```text
infra/ecs-task-definition.json
```

을 프로젝트에 보관한다.

단, Secret은 넣지 않는다.

---

# 100. 운영 환경으로 발전시키기

현재:

```text
Internet
   |
   v
Fargate Public IP
```

운영:

```text
Internet
   |
   v
Route 53
   |
   v
ALB
   |
   v
Private ECS Tasks
   |
   +-- S3
   +-- RDS
   +-- CloudWatch
```

추후 ALB를 추가한다.

---

# 101. ALB란?

ALB:

```text
Application Load Balancer
```

다.

사용자가 Task의 IP를 직접 호출하지 않고 ALB가 요청을 받아 Task로 전달한다.

```text
Client
  |
  v
ALB
  |
  +-- Task 1
  |
  +-- Task 2
```

이렇게 하면 Task가 교체되어 IP가 바뀌어도 사용자에게는 ALB 주소만 제공할 수 있다.

---

# 102. 오늘 ALB를 바로 하지 않는 이유

처음부터:

```text
VPC
Subnet
ALB
Listener
Target Group
ECS
Private Subnet
NAT Gateway
HTTPS
DNS
```

를 한 번에 만들면 장애 원인을 찾기 어렵다.

따라서:

```text
Day 4
→ Fargate 기본 배포

Day 5
→ Terraform/IaC

이후
→ ALB/Private Subnet/HTTPS
```

순으로 발전시키는 것이 학습하기 좋다.

---

# 103. Docker Image 버전 관리

개발 편의:

```text
latest
```

버전 추적:

```text
v1.0.0
```

또는:

```text
Git SHA
```

예:

```text
cloud-file-service:9f83a21
```

해커톤 발표에서도:

> "배포 Image를 Git Commit SHA 기준으로 추적할 수 있도록 설계했습니다."

라고 설명할 수 있다.

---

# 104. Health Check의 중요성

Container가 살아있다고 Application이 정상인 것은 아니다.

```text
Container RUNNING
       ≠
Application 정상
```

Health Endpoint:

```text
/actuator/health
```

등을 사용하면 Application 상태를 확인하기 쉽다.

---

# 105. 파일 서비스의 실제 Demo

해커톤에서는 다음 Demo가 좋다.

```text
1. 웹 페이지 접속
        ↓
2. 파일 선택
        ↓
3. Upload
        ↓
4. ECS API
        ↓
5. S3 저장
        ↓
6. 파일 목록
        ↓
7. Download
        ↓
8. ECS Task 재시작
        ↓
9. 파일이 그대로 존재
```

이 Demo는 "단순 인프라 구축"이 아니라 **실제로 동작하는 클라우드 서비스**라는 점을 보여준다.

---

# 106. 해커톤 발표용 설명

다음 문장을 준비해둔다.

> "Spring Boot 애플리케이션을 Docker Image로 패키징한 후 Amazon ECR에 저장하고 ECS Fargate에서 실행했습니다."

> "ECS Service가 원하는 Task 수를 유지하도록 구성했습니다."

> "Container의 AWS 접근 권한은 Access Key를 하드코딩하지 않고 IAM Task Role을 통해 부여했습니다."

> "파일은 Container 로컬 저장소가 아니라 S3에 저장하여 Container가 교체되어도 파일이 유지되도록 설계했습니다."

> "Container 로그는 CloudWatch Logs로 수집했습니다."

---

# 107. 예상 질문

## Q1. Docker와 ECS의 차이는?

A:

> Docker는 Container를 만들고 실행하기 위한 기술이고 ECS는 AWS 환경에서 Container를 관리하기 위한 서비스입니다.

## Q2. ECR은?

A:

> Docker Image를 저장하는 AWS Container Registry입니다.

## Q3. Fargate는?

A:

> ECS에서 Container를 실행하면서 서버 인프라 관리 부담을 줄여주는 실행 방식입니다.

## Q4. Task Definition은?

A:

> Container의 Image, CPU, Memory, Port, Environment, Role, Logs 등의 실행 설정을 정의합니다.

## Q5. Task는?

A:

> Task Definition을 실제 실행한 단위입니다.

## Q6. Service는?

A:

> 원하는 수의 Task가 실행되도록 관리합니다.

## Q7. 왜 S3를 사용하나요?

A:

> Container가 교체되어도 파일을 유지해야 하기 때문입니다.

## Q8. 왜 Access Key를 코드에 넣지 않나요?

A:

> Secret 노출 위험을 줄이고 ECS Task Role을 통해 최소 권한을 적용하기 위해서입니다.

---

# 108. Day 4 장애 대응 순서

문제가 생겼을 때 이 순서로 확인한다.

```text
1. ECS Service
        ↓
2. Task 상태
        ↓
3. Stop Reason
        ↓
4. Container Exit Code
        ↓
5. CloudWatch Logs
        ↓
6. ECR Image
        ↓
7. Execution Role
        ↓
8. Task Role
        ↓
9. Security Group
        ↓
10. Subnet / Route
        ↓
11. Spring Boot 설정
```

---

# 109. 문제를 무조건 코드부터 수정하지 않는다

예:

```text
API가 안 된다.
```

바로 Controller를 수정하지 않는다.

먼저:

```text
Task RUNNING?
```

확인.

그 다음:

```text
Public IP?
```

확인.

그 다음:

```text
Security Group 8080?
```

확인.

그 다음:

```text
CloudWatch Logs?
```

확인.

이런 방식으로 문제의 범위를 좁힌다.

---

# 110. Day 4 전체 실습 순서

```text
STEP 1
AWS CLI 확인

STEP 2
AWS Account/Region 확인

STEP 3
ECR Repository 생성

STEP 4
Docker Image Build

STEP 5
Local Docker Test

STEP 6
ECR Login

STEP 7
Docker Tag

STEP 8
ECR Push

STEP 9
ECS Cluster

STEP 10
CloudWatch Log Group

STEP 11
Execution Role

STEP 12
Task Role

STEP 13
S3 Policy

STEP 14
VPC/Subnet 확인

STEP 15
Security Group

STEP 16
Task Definition

STEP 17
Task Definition 등록

STEP 18
ECS Service

STEP 19
Fargate Task 확인

STEP 20
Public IP 확인

STEP 21
API 테스트

STEP 22
S3 Upload

STEP 23
Download

STEP 24
Delete

STEP 25
Task 종료

STEP 26
새 Task 생성

STEP 27
S3 파일 유지 확인
```

---

# 111. Day 4 체크리스트

## Docker

- [ ] Docker Build 성공
- [ ] Local Container 실행
- [ ] Local API 성공

## ECR

- [ ] Repository 생성
- [ ] ECR Login 성공
- [ ] Image Push 성공
- [ ] Image 확인

## ECS

- [ ] Cluster 생성
- [ ] Task Definition 등록
- [ ] Service 생성
- [ ] Task RUNNING

## IAM

- [ ] Execution Role
- [ ] Task Role
- [ ] ECR 권한
- [ ] CloudWatch 권한
- [ ] S3 권한

## Network

- [ ] VPC
- [ ] Subnet
- [ ] Security Group
- [ ] TCP 8080
- [ ] Public IP

## Application

- [ ] Spring Boot 실행
- [ ] Health API
- [ ] Upload
- [ ] Download
- [ ] Delete

## S3

- [ ] Object 생성
- [ ] Object 다운로드
- [ ] Object 삭제
- [ ] Task 재생성 후 Object 유지

## Logs

- [ ] Log Group
- [ ] Log Stream
- [ ] Spring Boot Log
- [ ] Error 확인

---

# 112. Day 4에서 반드시 직접 해볼 실험 10개

### 실험 1

```bash
docker build -t cloud-file-service:latest .
```

### 실험 2

```bash
docker run --rm -p 8080:8080 cloud-file-service:latest
```

### 실험 3

ECR Push.

### 실험 4

ECS Task가 RUNNING인지 확인.

### 실험 5

Public IP로 API 호출.

### 실험 6

파일 Upload.

### 실험 7

S3에서 Object 확인.

### 실험 8

Download.

### 실험 9

Task 종료.

### 실험 10

새 Task에서 S3 파일이 유지되는지 확인.

---

# 113. Day 4에서 가장 중요한 설계 원칙

```text
Docker Image
→ 실행 환경 패키지

ECR
→ Image 저장

ECS
→ Container 관리

Fargate
→ Container 실행

IAM Task Role
→ Application 권한

S3
→ 영속 파일 저장

CloudWatch
→ 로그 저장

ECS Service
→ 원하는 Task 개수 유지
```

---

# 114. 전체 아키텍처 다시 보기

```text
                         USER
                           |
                           v
                     HTTP Request
                           |
                           v
                +---------------------+
                |      AWS VPC        |
                |                     |
                |  Public Subnet      |
                |       |             |
                |       v             |
                |  +-------------+    |
                |  | ECS Service |    |
                |  +------+------+
                |         |
                |         v
                |  +-------------+
                |  | Fargate     |
                |  | Task        |
                |  |             |
                |  | Docker      |
                |  | Spring Boot |
                |  +------+------+
                +---------|--------+
                          |
                          | IAM Task Role
                          v
                     +---------+
                     |   S3    |
                     |  Files  |
                     +---------+

Developer
   |
   | docker build
   v
Docker Image
   |
   | docker push
   v
ECR
   |
   | image pull
   v
Fargate

Fargate
   |
   | logs
   v
CloudWatch
```

---

# 115. Day 4 핵심 한 문장

> **"Spring Boot 파일 서비스를 Docker Image로 패키징하고 ECR에 저장한 다음 ECS Fargate에서 Stateless Container로 실행하며, IAM Task Role을 통해 S3에 파일을 저장하고 CloudWatch Logs로 실행 로그를 관리한다."**

이 문장을 자신의 말로 설명할 수 있다면 Day 4의 핵심을 이해한 것이다.

---

# 116. Day 5 예고 — IaC

Day 4에서는 AWS CLI/Console을 이용해 리소스를 만들었다.

하지만 사람이 매번 클릭하는 것은 재현성이 낮다.

Day 5에서는:

```text
Terraform
```

을 사용한다.

목표:

```text
terraform init
terraform plan
terraform apply
```

로 Infrastructure를 코드로 관리하는 것이다.

예상 구조:

```text
infra/
└── terraform/
    ├── main.tf
    ├── variables.tf
    ├── outputs.tf
    ├── provider.tf
    ├── s3.tf
    ├── ecr.tf
    ├── iam.tf
    ├── ecs.tf
    └── network.tf
```

---

# 117. Day 6 예고 — Kubernetes와 Observability

Day 6에는 해커톤에서 사용하고 싶은 Kubernetes와 관측성을 연결한다.

예:

```text
Kubernetes
   |
   +-- Deployment
   +-- Service
   +-- ConfigMap
   +-- Secret
   +-- Ingress
```

관측성:

```text
OpenTelemetry
      |
      +-- Metrics
      +-- Logs
      +-- Traces
```

그리고:

```text
Prometheus
Grafana
```

등을 연결하는 방향으로 발전시킨다.

---

# 118. Day 7 예고 — CI/CD와 GitOps

최종적으로:

```text
Developer
    |
    v
GitHub
    |
    v
GitHub Actions
    |
    +-- Test
    +-- Build
    +-- Docker Build
    +-- ECR Push
    |
    v
ECS / Kubernetes
```

그리고 Kubernetes 쪽은:

```text
Git
 |
 v
Argo CD
 |
 v
Kubernetes
```

형태의 GitOps 구조로 발전시킨다.

---

# 119. 일주일 프로젝트 최종 목표

최종적으로 다음 그림을 목표로 한다.

```text
                         Internet
                            |
                            v
                         ALB
                            |
                            v
                 +--------------------+
                 | ECS / Kubernetes   |
                 |                    |
                 | Spring Boot        |
                 | Docker             |
                 +---------+----------+
                           |
              +------------+------------+
              |            |            |
              v            v            v
             S3           RDS      Observability
                                      |
                                      +-- OpenTelemetry
                                      +-- Prometheus
                                      +-- Grafana

Developer
    |
    v
GitHub
    |
    v
GitHub Actions
    |
    v
ECR
    |
    v
Deployment
```

---

# 120. Day 4 최종 평가

아래 질문에 자신의 말로 답할 수 있는지 확인한다.

1. Docker Image와 Container의 차이는?
2. ECR은 왜 필요한가?
3. ECS는 무엇을 관리하는가?
4. Fargate는 무엇인가?
5. Cluster와 Service의 차이는?
6. Task Definition과 Task의 차이는?
7. Execution Role과 Task Role의 차이는?
8. S3 권한을 Task Role에 주는 이유는?
9. 왜 Access Key를 Docker Image에 넣으면 안 되는가?
10. 왜 파일을 Container 내부에 저장하면 안 되는가?
11. Security Group은 무엇인가?
12. CloudWatch Logs는 왜 필요한가?
13. Task가 STOPPED이면 무엇부터 확인하는가?
14. ECR Pull 실패 원인은?
15. S3 AccessDenied 원인은?

---

# 121. Day 4 완료 기준

다음 흐름을 실제로 성공시켰다면 Day 4 완료다.

```text
[✓] GitHub Codespaces
      |
[✓] Docker Build
      |
[✓] ECR Push
      |
[✓] ECS Cluster
      |
[✓] Task Definition
      |
[✓] ECS Service
      |
[✓] Fargate Task
      |
[✓] Spring Boot API
      |
[✓] IAM Task Role
      |
[✓] S3 Upload
      |
[✓] S3 Download
      |
[✓] S3 Delete
      |
[✓] CloudWatch Logs
      |
[✓] Task Restart
      |
[✓] S3 File Persistence
```

---

# 122. 마지막 복습

Day 4의 본질은 단순히:

```text
AWS에 서버 올리기
```

가 아니다.

우리가 만든 애플리케이션을:

```text
Code
 ↓
Docker Image
 ↓
ECR
 ↓
ECS Task Definition
 ↓
ECS Service
 ↓
Fargate
 ↓
Spring Boot
 ↓
IAM
 ↓
S3
```

라는 실제 Cloud-Native 실행 구조로 바꾸는 것이다.

그리고 가장 중요한 설계 원칙은:

```text
Container는 언제든 교체될 수 있다.
```

이다.

따라서:

```text
영속 파일
→ S3

권한
→ IAM Role

Image
→ ECR

Container
→ ECS/Fargate

로그
→ CloudWatch
```

로 역할을 분리한다.

---

# 123. 🎯 Day 4 끝

## 핵심 키워드

```text
Docker
ECR
ECS
Fargate
Cluster
Task Definition
Task
Service
IAM
Execution Role
Task Role
VPC
Subnet
Security Group
CloudWatch Logs
S3
Stateless
```

## 핵심 흐름

```text
Docker Build
    ↓
ECR Push
    ↓
ECS Service
    ↓
Fargate Task
    ↓
Spring Boot
    ↓
IAM Task Role
    ↓
S3
```

## 오늘 반드시 직접 확인할 것

```text
1. Docker Image Build
2. ECR Push
3. ECS Fargate Deploy
4. API 호출
5. S3 Upload
6. S3 Download
7. S3 Delete
8. Task 종료
9. 새 Task 생성
10. S3 파일 유지
11. CloudWatch Logs 확인
```

**이 11개를 직접 성공시키는 것이 Day 4의 핵심 실습이다.**
