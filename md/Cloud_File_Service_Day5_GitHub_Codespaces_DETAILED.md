# Cloud File Service --- Day 5

## Day 4 완료 상태에서 Terraform / IaC로 AWS 인프라 코드화하기

### GitHub Codespaces 초보자용 상세 실습서

> **출발점:** Day 3.5의 실제 파일 시스템 + S3 + PostgreSQL 구조를
> 유지하고, Day 4에서 Docker → ECR → ECS Fargate까지 배포한 상태.
>
> Day 3.5의 `FileEntity`, `FolderEntity`, `FileService`,
> `FolderService`, `FileController`, `FolderController`,
> `S3StorageService`는 그대로 유지한다. Day 5의 중심은 애플리케이션 기능
> 추가가 아니라 **AWS 인프라를 Terraform으로 코드화하는 것**이다.

> **현재 구현 기준:** Terraform 파일은 이미 `infra/terraform/`에 존재한다. 이 문서는 파일을 무조건 새로 만드는 튜토리얼이 아니라 현재 파일을 검토하고 `terraform init`, `validate`, `plan` 순서로 확인하는 문서다. Terraform state에는 secret이 포함될 수 있으므로 state와 실제 변수값을 문서나 Git에 기록하지 않는다.

> **개인정보 보호:** AWS 계정 ID, ARN, DB endpoint, 실제 비밀번호, 개인 식별 정보는 사용하지 않는다. 모든 값은 `YOUR_AWS_ACCOUNT_ID`, `YOUR_DB_PASSWORD`, `example-bucket` 같은 placeholder로 유지한다.

------------------------------------------------------------------------

# 0. Day 5 최종 목표

Day 4:

``` text
GitHub Codespaces
       |
     Docker
       |
      ECR
       |
  ECS Fargate
       |
  Spring Boot
    /         RDS      S3
```

Day 5:

``` text
                Terraform
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
       VPC         IAM          S3
        |           |           |
        +-----------+-----------+
                    |
          +---------+---------+
          |                   |
          v                   v
         RDS                 ECR
          |                   |
          +---------+---------+
                    |
                    v
             ECS Fargate
                    |
              Spring Boot
```

핵심은 **AWS Console에서 클릭해서 만든 인프라를 코드로 재현할 수 있게
만드는 것**이다.

------------------------------------------------------------------------

# 1. Day 3.5와 Day 4의 상태를 먼저 확인

Day 3.5의 기본 구조는:

``` text
Spring Boot
    |
    +---- PostgreSQL
    |       └── File / Folder Metadata
    |
    +---- S3
            └── Actual File
```

이다.

Day 4에서는:

``` text
Docker
  ↓
ECR
  ↓
ECS Fargate
```

로 실행 환경을 AWS에 올렸다.

Day 5에서는 이것을:

``` text
Terraform
  ↓
VPC
  ↓
Security Group
  ↓
S3
  ↓
ECR
  ↓
IAM
  ↓
RDS
  ↓
ECS
```

로 코드화한다.

Day 3.5의 파일 시스템 API를 다시 만들지 않는다.

------------------------------------------------------------------------

# 2. Day 5에서 주로 수정/생성하는 위치

프로젝트 루트에서:

``` text
cloud-file-service/
├── backend/                 ← 기존 코드 유지
├── Dockerfile               ← Day 4 유지
├── docker-compose.yml       ← Day 4 유지
├── infra/
│   ├── ecs-task-definition.json  ← Day 4 기록
│   └── terraform/           ← ★ Day 5 핵심
│       ├── versions.tf
│       ├── providers.tf
│       ├── variables.tf
│       ├── locals.tf
│       ├── outputs.tf
│       ├── vpc.tf
│       ├── security_groups.tf
│       ├── s3.tf
│       ├── ecr.tf
│       ├── logs.tf
│       ├── iam.tf
│       ├── secrets.tf
│       ├── rds.tf
│       ├── ecs.tf
│       └── terraform.tfvars.example
└── .gitignore
```

------------------------------------------------------------------------

# 3. 가장 먼저 Git Commit

프로젝트 루트:

``` bash
git status
```

문제가 없다면:

``` bash
git add .
git commit -m "prepare day5 terraform"
git push
```

Day 5 작업 전에 Day 4 상태를 저장해 둔다.

------------------------------------------------------------------------

# 4. AWS 현재 상태 확인

Day 4에서 사용한 Region:

``` bash
export AWS_REGION=ap-northeast-2
```

AWS 인증:

``` bash
aws sts get-caller-identity
```

정상적으로 계정 정보가 나와야 한다.

------------------------------------------------------------------------

# 5. Terraform 설치 확인

``` bash
terraform version
```

Provider 확인:

``` bash
terraform providers
```

Terraform이 없다면 Codespaces의 `.devcontainer` 설정을 먼저 확인한다.

``` bash
ls -la .devcontainer
```

------------------------------------------------------------------------

# 6. Terraform 폴더 생성

프로젝트 루트:

``` bash
mkdir -p infra/terraform
```

이후 모든 Terraform 파일은:

``` text
infra/terraform/
```

에 만든다.

------------------------------------------------------------------------

# 7. Terraform 핵심 개념

Terraform:

``` text
Infrastructure as Code
```

즉:

``` text
"이 AWS 환경이 이렇게 존재해야 한다"
```

를 코드로 선언한다.

Docker는:

``` text
Application → Container
```

Terraform은:

``` text
Infrastructure → AWS Resources
```

를 담당한다.

------------------------------------------------------------------------

# 8. Terraform과 AWS의 관계

``` text
Terraform Code
      |
      v
AWS Provider
      |
      v
AWS API
      |
      v
VPC / S3 / ECS / RDS / IAM ...
```

Terraform이 AWS Console을 대신 클릭하는 것이 아니라 AWS API를 통해
리소스를 관리한다고 이해하면 된다.

------------------------------------------------------------------------

# 9. `versions.tf` 생성

파일:

``` text
infra/terraform/versions.tf
```

``` hcl
terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}
```

버전을 고정하는 이유는 팀원마다 다른 Provider 버전을 사용해서 발생하는
차이를 줄이기 위해서다.

------------------------------------------------------------------------

# 10. `providers.tf`

파일:

``` text
infra/terraform/providers.tf
```

``` hcl
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}
```

AWS Access Key를 여기에 직접 작성하지 않는다.

Day 4에서:

``` bash
aws sts get-caller-identity
```

가 동작했다면 같은 인증 환경을 Terraform이 사용할 수 있도록 구성한다.

------------------------------------------------------------------------

# 11. Variables

파일:

``` text
infra/terraform/variables.tf
```

``` hcl
variable "aws_region" {
  type        = string
  description = "AWS Region"
  default     = "ap-northeast-2"
}

variable "project_name" {
  type        = string
  description = "Project name"
  default     = "cloud-file-service"
}

variable "environment" {
  type        = string
  description = "Environment"
  default     = "dev"
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR"
  default     = "10.20.0.0/16"
}

variable "availability_zones" {
  type = list(string)

  default = [
    "ap-northeast-2a",
    "ap-northeast-2b"
  ]
}

variable "public_subnet_cidrs" {
  type = list(string)

  default = [
    "10.20.1.0/24",
    "10.20.2.0/24"
  ]
}

variable "private_subnet_cidrs" {
  type = list(string)

  default = [
    "10.20.11.0/24",
    "10.20.12.0/24"
  ]
}

variable "container_port" {
  type    = number
  default = 8080
}

variable "ecs_cpu" {
  type    = number
  default = 512
}

variable "ecs_memory" {
  type    = number
  default = 1024
}

variable "ecs_desired_count" {
  type    = number
  default = 1
}

variable "db_username" {
  type    = string
  default = "cloud_user"
}

variable "db_password" {
  type      = string
  sensitive = true
}
```

------------------------------------------------------------------------

# 12. Variable이 필요한 이유

하드코딩:

``` hcl
region = "ap-northeast-2"
```

대신:

``` hcl
region = var.aws_region
```

으로 작성한다.

그러면:

``` text
dev
stage
prod
```

환경을 나누기 쉽다.

------------------------------------------------------------------------

# 13. Locals

파일:

``` text
infra/terraform/locals.tf
```

``` hcl
locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
```

예:

``` text
cloud-file-service-dev
```

라는 이름을 여러 AWS Resource에서 사용할 수 있다.

------------------------------------------------------------------------

# 14. VPC

파일:

``` text
infra/terraform/vpc.tf
```

``` hcl
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-vpc"
    }
  )
}
```

VPC는 AWS 안의 프로젝트 전용 가상 네트워크다.

------------------------------------------------------------------------

# 15. Internet Gateway

`vpc.tf`에 추가:

``` hcl
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-igw"
    }
  )
}
```

------------------------------------------------------------------------

# 16. Public Subnet

`vpc.tf`에 추가:

``` hcl
resource "aws_subnet" "public" {
  count = length(var.public_subnet_cidrs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-public-${count.index + 1}"
      Tier = "public"
    }
  )
}
```

------------------------------------------------------------------------

# 17. Private Subnet

`vpc.tf`에 추가:

``` hcl
resource "aws_subnet" "private" {
  count = length(var.private_subnet_cidrs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-private-${count.index + 1}"
      Tier = "private"
    }
  )
}
```

------------------------------------------------------------------------

# 18. Public Route Table

``` hcl
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-public-rt"
    }
  )
}
```

------------------------------------------------------------------------

# 19. Route Association

``` hcl
resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
```

------------------------------------------------------------------------

# 20. 현재 VPC 구조

``` text
VPC 10.20.0.0/16
│
├── Public A 10.20.1.0/24
├── Public B 10.20.2.0/24
│
├── Private A 10.20.11.0/24
└── Private B 10.20.12.0/24
```

Day 4에서는 Default VPC를 사용했다면, Day 5부터는 프로젝트 전용 VPC를
코드로 관리하는 것이다.

------------------------------------------------------------------------

# 21. Security Group

파일:

``` text
infra/terraform/security_groups.tf
```

``` hcl
resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-ecs-sg"
  description = "Security group for ECS"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Spring Boot HTTP"
    from_port   = var.container_port
    to_port     = var.container_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-ecs-sg"
    }
  )
}
```

Day 4와 마찬가지로 초기 테스트에서는 8080을 열 수 있다. 운영형
구조에서는 ALB를 앞에 두고 ECS SG를 ALB SG에서만 접근하도록 바꾼다.

------------------------------------------------------------------------

# 22. RDS Security Group

같은 파일에 추가:

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

핵심:

``` text
ECS SG → RDS SG : 5432
```

만 허용한다.

------------------------------------------------------------------------

# 23. S3

파일:

``` text
infra/terraform/s3.tf
```

``` hcl
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "files" {
  bucket = "${local.name_prefix}-files-${random_id.bucket_suffix.hex}"

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-files"
    }
  )
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket = aws_s3_bucket.files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "files" {
  bucket = aws_s3_bucket.files.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
```

------------------------------------------------------------------------

# 24. S3의 역할

Day 3.5:

``` text
PostgreSQL
→ 파일 메타데이터

S3
→ 실제 파일
```

Day 5에도 동일하다.

Terraform은 S3 Bucket 자체를 코드로 관리한다.

------------------------------------------------------------------------

# 25. ECR

파일:

``` text
infra/terraform/ecr.tf
```

``` hcl
resource "aws_ecr_repository" "backend" {
  name                 = local.name_prefix
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-ecr"
    }
  )
}
```

Terraform이 Repository를 만들고 Docker Image Push는 Docker CLI 또는
나중에 GitHub Actions가 담당한다.

------------------------------------------------------------------------

# 26. CloudWatch Logs

파일:

``` text
infra/terraform/logs.tf
```

``` hcl
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = 14

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-logs"
    }
  )
}
```

------------------------------------------------------------------------

# 27. IAM

파일:

``` text
infra/terraform/iam.tf
```

Task가 Role을 사용할 수 있도록 Trust Policy:

``` hcl
data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}
```

------------------------------------------------------------------------

# 28. ECS Task Role

``` hcl
resource "aws_iam_role" "task" {
  name               = "${local.name_prefix}-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = local.common_tags
}
```

------------------------------------------------------------------------

# 29. Task Role의 S3 권한

``` hcl
data "aws_iam_policy_document" "task_s3" {
  statement {
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject"
    ]

    resources = [
      "${aws_s3_bucket.files.arn}/*"
    ]
  }

  statement {
    effect = "Allow"

    actions = [
      "s3:ListBucket"
    ]

    resources = [
      aws_s3_bucket.files.arn
    ]
  }
}

resource "aws_iam_role_policy" "task_s3" {
  name   = "${local.name_prefix}-task-s3"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_s3.json
}
```

------------------------------------------------------------------------

# 30. Execution Role

``` hcl
resource "aws_iam_role" "execution" {
  name               = "${local.name_prefix}-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
```

다시 구분:

``` text
Execution Role
→ ECR Pull / CloudWatch Logs 등 Task 실행에 필요한 권한

Task Role
→ Spring Boot가 S3 등을 호출할 때 사용하는 권한
```

------------------------------------------------------------------------

# 31. Secrets Manager

파일:

``` text
infra/terraform/secrets.tf
```

``` hcl
resource "aws_secretsmanager_secret" "db_password" {
  name = "${local.name_prefix}/db-password"

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-db-password"
    }
  )
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = var.db_password
}
```

주의:

`secret_string`을 Terraform으로 관리하면 Secret 값이 Terraform State에
들어갈 수 있다. 학습용으로는 구조를 이해할 수 있지만, 운영 환경에서는
Secret과 Terraform State 보호 방식을 별도로 설계해야 한다.

------------------------------------------------------------------------

# 32. Task Role에 Secret 권한

`iam.tf`에 추가:

``` hcl
data "aws_iam_policy_document" "task_secrets" {
  statement {
    effect = "Allow"

    actions = [
      "secretsmanager:GetSecretValue"
    ]

    resources = [
      aws_secretsmanager_secret.db_password.arn
    ]
  }
}

resource "aws_iam_role_policy" "task_secrets" {
  name   = "${local.name_prefix}-task-secrets"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_secrets.json
}
```

------------------------------------------------------------------------

# 33. RDS

파일:

``` text
infra/terraform/rds.tf
```

먼저 Subnet Group:

``` hcl
resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name_prefix}-postgres"
  subnet_ids = aws_subnet.private[*].id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-postgres-subnet-group"
    }
  )
}
```

------------------------------------------------------------------------

# 34. RDS Instance

``` hcl
resource "aws_db_instance" "postgres" {
  identifier = "${local.name_prefix}-postgres"

  engine         = "postgres"
  engine_version = "16"

  instance_class = "db.t4g.micro"

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = "cloud_file"
  username = var.db_username
  password = var.db_password

  port = 5432

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  publicly_accessible = false

  backup_retention_period = 1

  deletion_protection = false
  skip_final_snapshot = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-postgres"
    }
  )
}
```

> RDS 인스턴스 클래스와 PostgreSQL 버전은 실제 AWS Region에서 지원되는지
> `terraform plan`/AWS 문서로 확인한다.

------------------------------------------------------------------------

# 35. RDS가 Private인 이유

``` text
Internet
   |
   X
   |
  RDS
```

가 아니라:

``` text
ECS
 |
 | 5432
 v
RDS
```

구조를 만든다.

데이터베이스를 인터넷에 직접 노출하지 않는다.

------------------------------------------------------------------------

# 36. ECS Cluster

파일:

``` text
infra/terraform/ecs.tf
```

``` hcl
resource "aws_ecs_cluster" "main" {
  name = local.name_prefix

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-cluster"
    }
  )
}
```

------------------------------------------------------------------------

# 37. ECS Task Definition

``` hcl
resource "aws_ecs_task_definition" "backend" {
  family                   = local.name_prefix
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]

  cpu    = tostring(var.ecs_cpu)
  memory = tostring(var.ecs_memory)

  execution_role_arn = aws_iam_role.execution.arn
  task_role_arn      = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = local.name_prefix
      image     = "${aws_ecr_repository.backend.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "S3_BUCKET"
          value = aws_s3_bucket.files.bucket
        },
        {
          name  = "DB_URL"
          value = "jdbc:postgresql://${aws_db_instance.postgres.address}:5432/cloud_file"
        },
        {
          name  = "DB_USERNAME"
          value = var.db_username
        }
      ]

      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = aws_secretsmanager_secret.db_password.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"

        options = {
          awslogs-group         = aws_cloudwatch_log_group.backend.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  tags = local.common_tags
}
```

------------------------------------------------------------------------

# 38. Spring Boot 설정과 이름을 맞춰라

Day 4에서 `application.properties`가:

``` properties
spring.datasource.url=${DB_URL:jdbc:postgresql://localhost:5432/cloud_file}
spring.datasource.username=${DB_USERNAME:cloud_user}
spring.datasource.password=${DB_PASSWORD:cloud_password}
```

라면 위 ECS 설정과 그대로 연결된다.

즉:

``` text
ECS
 ├── DB_URL
 ├── DB_USERNAME
 └── DB_PASSWORD
       ↓
Spring Boot
       ↓
PostgreSQL
```

이다.

------------------------------------------------------------------------

# 39. S3 Bucket 이름도 자동 연결된다

Terraform:

``` hcl
value = aws_s3_bucket.files.bucket
```

이므로 사람이 Bucket 이름을 복사해서 넣을 필요가 줄어든다.

``` text
Terraform S3
    ↓
Bucket Name
    ↓
ECS Environment
    ↓
Spring Boot
```

------------------------------------------------------------------------

# 40. ECS Service

`ecs.tf`에 추가:

``` hcl
resource "aws_ecs_service" "backend" {
  name            = local.name_prefix
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn

  desired_count = var.ecs_desired_count

  launch_type = "FARGATE"

  network_configuration {
    subnets = aws_subnet.public[*].id

    security_groups = [
      aws_security_group.ecs.id
    ]

    assign_public_ip = true
  }

  tags = local.common_tags
}
```

Day 4의 Public IP 테스트 구조를 Terraform으로 옮긴 것이다.

------------------------------------------------------------------------

# 41. 왜 아직 Public Subnet인가?

Day 4의 동작을 그대로 Terraform으로 재현하기 위해서다.

``` text
Internet
   ↓
Public IP
   ↓
ECS Fargate
   ↓
Spring Boot
```

최종 운영형 구조는:

``` text
Internet
   ↓
ALB
   ↓
Private ECS
   ↓
RDS
```

로 발전시킨다.

------------------------------------------------------------------------

# 42. Outputs

파일:

``` text
infra/terraform/outputs.tf
```

``` hcl
output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "s3_bucket_name" {
  value = aws_s3_bucket.files.bucket
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.backend.name
}

output "rds_endpoint" {
  value = aws_db_instance.postgres.address
}

output "ecs_security_group_id" {
  value = aws_security_group.ecs.id
}

output "rds_security_group_id" {
  value = aws_security_group.rds.id
}
```

------------------------------------------------------------------------

# 43. tfvars 예제

파일:

``` text
infra/terraform/terraform.tfvars.example
```

``` hcl
aws_region   = "ap-northeast-2"
project_name = "cloud-file-service"
environment  = "dev"

db_username = "cloud_user"
db_password = "CHANGE_ME"

ecs_desired_count = 1
```

실제 Password를 이 파일에 넣지 않는다.

------------------------------------------------------------------------

# 44. 실제 `terraform.tfvars`

로컬에서:

``` text
infra/terraform/terraform.tfvars
```

를 만들고:

``` hcl
aws_region   = "ap-northeast-2"
project_name = "cloud-file-service"
environment  = "dev"

db_username = "cloud_user"
db_password = "YOUR_DB_PASSWORD"

ecs_desired_count = 1
```

를 넣는다.

**Git Commit하지 않는다.**

------------------------------------------------------------------------

# 45. `.gitignore` 수정

프로젝트 루트 `.gitignore`에 추가:

``` gitignore
# Terraform
infra/terraform/.terraform/
infra/terraform/*.tfstate
infra/terraform/*.tfstate.*
infra/terraform/crash.log
infra/terraform/*.tfvars
!infra/terraform/terraform.tfvars.example

# Secrets
.env
.env.*
!.env.example

# Java
.gradle/
**/build/
```

------------------------------------------------------------------------

# 46. Terraform State란?

Terraform은:

``` text
내가 AWS에 무엇을 만들었는가?
```

를 추적해야 한다.

그래서:

``` text
terraform.tfstate
```

를 사용한다.

이 파일에는 리소스 정보와 민감한 값이 포함될 가능성이 있다.

따라서 Git에 올리지 않는다.

------------------------------------------------------------------------

# 47. Terraform 초기화

``` bash
cd infra/terraform
terraform init
```

정상:

``` text
Terraform has been successfully initialized!
```

------------------------------------------------------------------------

# 48. Format

``` bash
terraform fmt -recursive
```

------------------------------------------------------------------------

# 49. Validate

``` bash
terraform validate
```

정상:

``` text
Success! The configuration is valid.
```

오류가 있으면 Apply하지 않는다.

------------------------------------------------------------------------

# 50. Provider 확인

``` bash
terraform providers
```

AWS Provider와 Random Provider가 표시되어야 한다.

------------------------------------------------------------------------

# 51. Plan

``` bash
terraform plan
```

Terraform이:

``` text
생성
변경
삭제
```

할 Resource를 보여준다.

------------------------------------------------------------------------

# 52. Plan 읽는 법

``` text
+
```

생성.

``` text
~
```

변경.

``` text
-
```

삭제.

``` text
-/+
```

기존 삭제 후 새로 생성될 수 있음.

특히:

``` text
-
-/+
```

가 보이면 반드시 이유를 확인한다.

------------------------------------------------------------------------

# 53. Day 4 Resource와 충돌할 수 있다

Day 4에서 이미:

``` text
ECR
ECS
S3
IAM
Security Group
RDS
CloudWatch
```

를 만들었다면 Terraform이 새로 만들려고 할 수 있다.

예:

``` text
AlreadyExists
```

가 발생할 수 있다.

------------------------------------------------------------------------

# 54. 기존 Resource를 함부로 삭제하지 않는다

특히:

``` text
S3
RDS
```

에 데이터가 있다면:

``` bash
terraform destroy
```

하지 않는다.

먼저:

``` bash
terraform plan
```

에서 삭제 예정 리소스를 확인한다.

------------------------------------------------------------------------

# 55. Import

이미 AWS에 존재하는 Resource를 Terraform State에 연결하려면:

``` bash
terraform import ...
```

을 사용한다.

예:

``` bash
terraform import   aws_ecr_repository.backend   실제-ECR-Repository-이름
```

S3:

``` bash
terraform import   aws_s3_bucket.files   실제-S3-Bucket-이름
```

VPC:

``` bash
terraform import   aws_vpc.main   vpc-xxxxxxxx
```

Import 후:

``` bash
terraform plan
```

으로 코드와 실제 설정의 차이를 확인한다.

------------------------------------------------------------------------

# 56. Import가 자동으로 코드를 완성하는 것은 아니다

중요:

``` text
AWS Resource
   ↓
terraform import
   ↓
Terraform State
```

까지만 연결한다.

Terraform 코드 자체가 완성되는 것은 아니다.

그래서:

``` text
코드
+
State
+
실제 AWS
```

를 맞춰야 한다.

------------------------------------------------------------------------

# 57. Day 5에서는 우선 새 Terraform 환경을 기준으로 이해한다

기존 Day 4 Resource가 중요하지 않거나 실습용이라면 삭제 후 Terraform으로
재생성할 수도 있다.

그러나:

``` text
실제 파일이 있는 S3
실제 데이터가 있는 RDS
```

는 삭제하지 않는다.

------------------------------------------------------------------------

# 58. Apply

Plan을 충분히 확인한 뒤:

``` bash
terraform apply
```

실행.

학습 중에는 승인 메시지가 나오면 내용을 확인한 후:

``` text
yes
```

입력한다.

------------------------------------------------------------------------

# 59. Apply 후 Output

``` bash
terraform output
```

확인.

S3:

``` bash
terraform output -raw s3_bucket_name
```

ECR:

``` bash
terraform output -raw ecr_repository_url
```

RDS:

``` bash
terraform output -raw rds_endpoint
```

------------------------------------------------------------------------

# 60. ECR에 Day 5 Image Push

프로젝트 루트로 이동:

``` bash
cd ../..
pwd
```

`Dockerfile`이 있는 위치인지 확인한다.

Build:

``` bash
docker build   -t cloud-file-service:day5   .
```

------------------------------------------------------------------------

# 61. ECR URI

``` bash
cd infra/terraform
export ECR_URI=$(terraform output -raw ecr_repository_url)
```

확인:

``` bash
echo "$ECR_URI"
```

------------------------------------------------------------------------

# 62. ECR 로그인

``` bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=ap-northeast-2
```

``` bash
aws ecr get-login-password   --region "$AWS_REGION"   | docker login   --username AWS   --password-stdin   "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
```

------------------------------------------------------------------------

# 63. Tag

``` bash
docker tag   cloud-file-service:day5   "${ECR_URI}:day5"
```

------------------------------------------------------------------------

# 64. Push

``` bash
docker push "${ECR_URI}:day5"
```

확인:

``` bash
aws ecr describe-images   --repository-name "cloud-file-service-dev"   --region "$AWS_REGION"
```

Repository 이름이 실제 Output과 다르면 Output을 기준으로 사용한다.

------------------------------------------------------------------------

# 65. 중요한 점 --- `latest`

Terraform ECS Task Definition에서:

``` hcl
image = "${aws_ecr_repository.backend.repository_url}:latest"
```

를 사용했다면 ECR에도:

``` text
latest
```

Tag가 필요하다.

Day 5에서는 다음처럼 Push할 수도 있다.

``` bash
docker tag   cloud-file-service:day5   "${ECR_URI}:latest"

docker push "${ECR_URI}:latest"
```

------------------------------------------------------------------------

# 66. Git SHA Tag도 알아두기

``` bash
export IMAGE_TAG=$(git rev-parse --short HEAD)
```

예:

``` text
a81c92f
```

Tag:

``` bash
docker tag   cloud-file-service:day5   "${ECR_URI}:${IMAGE_TAG}"
```

Push:

``` bash
docker push "${ECR_URI}:${IMAGE_TAG}"
```

Day 7 CI/CD에서는 Git SHA 기반 Tag를 자동화한다.

------------------------------------------------------------------------

# 67. ECS Task가 실행되지 않는 경우

순서:

``` text
1. ECS Service
2. Task 상태
3. Stop Reason
4. CloudWatch Logs
5. ECR Image
6. Execution Role
7. Task Role
8. Security Group
9. RDS
10. S3
```

Day 4에서 익힌 장애 대응 순서를 그대로 사용한다.

------------------------------------------------------------------------

# 68. ECS 상태 확인

``` bash
export ECS_CLUSTER=$(terraform output -raw ecs_cluster_name)
export ECS_SERVICE=$(terraform output -raw ecs_service_name)
```

``` bash
aws ecs describe-services   --cluster "$ECS_CLUSTER"   --services "$ECS_SERVICE"   --region "$AWS_REGION"   --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}'
```

정상:

``` text
desired = 1
running = 1
```

------------------------------------------------------------------------

# 69. Task 목록

``` bash
aws ecs list-tasks   --cluster "$ECS_CLUSTER"   --service-name "$ECS_SERVICE"   --region "$AWS_REGION"
```

------------------------------------------------------------------------

# 70. Task ID

``` bash
export TASK_ARN=$(aws ecs list-tasks   --cluster "$ECS_CLUSTER"   --service-name "$ECS_SERVICE"   --region "$AWS_REGION"   --query 'taskArns[0]'   --output text)
```

``` bash
export TASK_ID="${TASK_ARN##*/}"
```

확인:

``` bash
echo "$TASK_ID"
```

`describe-tasks --tasks`에는 ARN 전체가 아니라 Task ID를 넣는 것이
안전하다.

------------------------------------------------------------------------

# 71. CloudWatch Logs

``` bash
aws logs tail   "/ecs/cloud-file-service-dev"   --follow   --region "$AWS_REGION"
```

실제 Log Group 이름은:

``` bash
terraform output
```

또는 `logs.tf`의 값을 기준으로 한다.

------------------------------------------------------------------------

# 72. RDS Endpoint

``` bash
export DB_ENDPOINT=$(terraform output -raw rds_endpoint)
```

확인:

``` bash
echo "$DB_ENDPOINT"
```

ECS에서:

``` text
jdbc:postgresql://DB_ENDPOINT:5432/cloud_file
```

를 사용한다.

절대 ECS에서:

``` text
localhost:5432
```

를 사용하지 않는다.

------------------------------------------------------------------------

# 73. Health API

Day 4에서 만든:

``` text
/health
```

또는:

``` text
/actuator/health
```

를 사용한다.

Container가 RUNNING인지와 Application이 정상인지 둘 다 확인한다.

------------------------------------------------------------------------

# 74. Terraform으로 Scale Out

`terraform.tfvars`:

``` hcl
ecs_desired_count = 2
```

실행:

``` bash
terraform plan
```

Plan에서:

``` text
ECS desired count
1 → 2
```

변경이 예상되는지 확인한다.

그 다음:

``` bash
terraform apply
```

------------------------------------------------------------------------

# 75. Scale Out 확인

``` bash
aws ecs describe-services   --cluster "$ECS_CLUSTER"   --services "$ECS_SERVICE"   --region "$AWS_REGION"   --query 'services[0].{desired:desiredCount,running:runningCount}'
```

예:

``` text
desired = 2
running = 2
```

------------------------------------------------------------------------

# 76. 왜 이 실험이 중요한가?

Terraform으로:

``` hcl
ecs_desired_count = 2
```

라는 **원하는 상태**를 선언했다.

Terraform:

``` text
Code
 ↓
AWS
```

상태를 맞춘다.

------------------------------------------------------------------------

# 77. 다시 1개로 원복

``` hcl
ecs_desired_count = 1
```

그리고:

``` bash
terraform plan
terraform apply
```

다시 Task 1개로 돌아오는지 확인한다.

------------------------------------------------------------------------

# 78. Stateless 테스트

파일 업로드:

``` text
사용자
 ↓
ECS
 ↓
Spring Boot
 ↓
S3
```

그 다음 Task를 종료한다.

``` bash
aws ecs stop-task   --cluster "$ECS_CLUSTER"   --task "$TASK_ARN"   --reason "Day5 stateless test"   --region "$AWS_REGION"
```

Service가 새 Task를 만든다.

S3 파일:

``` text
그대로 존재
```

해야 한다.

------------------------------------------------------------------------

# 79. 이 실험의 의미

Container:

``` text
교체 가능
```

S3:

``` text
영속 데이터
```

RDS:

``` text
영속 Metadata
```

이 구조가 되어야 Cloud-Native 애플리케이션으로 확장하기 쉽다.

------------------------------------------------------------------------

# 80. Terraform State 확인

``` bash
terraform state list
```

예:

``` text
aws_vpc.main
aws_subnet.public[0]
aws_subnet.public[1]
aws_subnet.private[0]
aws_subnet.private[1]
aws_s3_bucket.files
aws_ecr_repository.backend
aws_ecs_cluster.main
aws_ecs_service.backend
aws_db_instance.postgres
```

------------------------------------------------------------------------

# 81. 특정 Resource 확인

``` bash
terraform state show aws_vpc.main
```

또는:

``` bash
terraform state show aws_s3_bucket.files
```

------------------------------------------------------------------------

# 82. 두 번째 Plan

Apply 후:

``` bash
terraform plan
```

을 다시 실행한다.

변경사항이 없다면:

``` text
No changes
```

와 비슷한 결과가 나오는 것이 이상적이다.

------------------------------------------------------------------------

# 83. 이것이 Terraform의 핵심

``` text
Terraform Code
      ↓
Desired State
      ↓
Actual AWS
```

가 일치하면:

``` text
No changes
```

가 된다.

------------------------------------------------------------------------

# 84. AWS Console에서 리소스 확인

Terraform Apply 후 AWS Console에서:

``` text
VPC
S3
ECR
IAM
CloudWatch
RDS
ECS
```

를 확인한다.

각 Resource에:

``` text
Project
Environment
ManagedBy
```

Tag가 있는지도 확인한다.

------------------------------------------------------------------------

# 85. Day 4 JSON과 Terraform ECS의 관계

Day 4:

``` text
infra/ecs-task-definition.json
```

을 사용했다.

Day 5:

``` text
infra/terraform/ecs.tf
```

의:

``` hcl
aws_ecs_task_definition
```

을 사용한다.

따라서 Day 5부터 실제 IaC 기준은:

``` text
infra/terraform/
```

으로 옮겨간다.

Day 4 JSON은 학습 기록/비교용으로 남겨도 된다.

------------------------------------------------------------------------

# 86. 애플리케이션 코드는 왜 거의 안 바꾸는가?

Day 3.5에서:

``` text
FileController
      ↓
FileService
      ↓
S3StorageService
      ↓
S3
```

가 이미 동작한다.

Day 5는:

``` text
Terraform
      ↓
AWS Infrastructure
      ↓
ECS
      ↓
Spring Boot
```

를 관리한다.

즉 계층이 다르다.

------------------------------------------------------------------------

# 87. 최종 구조

``` text
                         GitHub
                           |
                           v
                    Terraform Code
                           |
                           v
                 +---------+---------+
                 |                   |
                 v                   v
                VPC                 IAM
                 |                   |
          +------+-------+           |
          |              |           |
          v              v           v
       Public         Private      S3
       Subnet         Subnet        |
          |              |          |
          v              v          |
         ECS             RDS <-------+
          |
       Fargate
          |
      Spring Boot
          |
      +---+---+
      |       |
      v       v
     RDS      S3
```

------------------------------------------------------------------------

# 88. Day 5에서 반드시 이해해야 할 것

## Terraform

인프라를 코드로 관리한다.

## Provider

Terraform과 AWS API를 연결한다.

## Resource

AWS에서 만들고 관리할 실제 리소스다.

## Variable

외부에서 입력할 값을 정의한다.

## Local

반복해서 사용하는 값을 계산/정의한다.

## Output

Terraform이 만든 리소스 정보를 출력한다.

## State

Terraform이 관리하는 실제 리소스 상태를 추적한다.

## Plan

변경 예정 내용을 미리 확인한다.

## Apply

계획을 실제 AWS에 반영한다.

## Import

기존 AWS Resource를 Terraform State에 연결한다.

------------------------------------------------------------------------

# 89. VPC 핵심

``` text
VPC
├── Subnet
├── Route Table
├── Internet Gateway
└── Security Group
```

VPC는 프로젝트 네트워크의 가장 큰 경계다.

------------------------------------------------------------------------

# 90. Security Group 핵심

``` text
ECS
 ↓ 5432
RDS
```

를 허용하되 인터넷에서 RDS로 직접 접근하는 것은 허용하지 않는다.

------------------------------------------------------------------------

# 91. IAM 핵심

``` text
Execution Role
→ ECS 실행에 필요한 권한

Task Role
→ Application이 AWS API를 호출할 때 필요한 권한
```

S3 권한은 Task Role에 준다.

------------------------------------------------------------------------

# 92. S3 핵심

``` text
S3
→ 실제 파일
```

Bucket을 Public으로 열지 않는다.

Versioning과 Server-side Encryption을 사용한다.

------------------------------------------------------------------------

# 93. RDS 핵심

``` text
RDS
→ PostgreSQL
→ File Metadata
→ Folder Metadata
```

Public Internet에 직접 노출하지 않는다.

------------------------------------------------------------------------

# 94. ECR 핵심

``` text
Docker Image
      ↓
ECR
      ↓
ECS
```

Terraform은 Repository를 만들고 Docker/GitHub Actions가 Image를
Push한다.

------------------------------------------------------------------------

# 95. ECS 핵심

``` text
Cluster
  ↓
Service
  ↓
Task Definition
  ↓
Task
  ↓
Container
  ↓
Spring Boot
```

------------------------------------------------------------------------

# 96. Terraform과 Docker 연결

``` text
Terraform
  ├── ECR
  └── ECS

Docker
  └── Image
```

즉 Terraform이 Docker Image 자체를 만드는 것이 아니다.

``` text
Docker Build
→ Image

Terraform
→ Image를 실행할 AWS Infrastructure
```

------------------------------------------------------------------------

# 97. Day 5 장애 대응

## `terraform validate` 실패

확인:

``` text
파일 이름
중괄호
변수 이름
Resource 이름
Provider
```

------------------------------------------------------------------------

# 98. `terraform plan`에서 삭제가 보임

예:

``` text
Plan: 5 to add, 2 to change, 4 to destroy.
```

일단 중단.

특히:

``` text
S3
RDS
```

삭제가 보이면 데이터가 있는지 먼저 확인한다.

------------------------------------------------------------------------

# 99. `AlreadyExists`

Day 4에서 만든 Resource일 가능성이 높다.

``` text
Import
```

또는 기존 리소스를 기준으로 Terraform 구성을 조정한다.

------------------------------------------------------------------------

# 100. ECS `STOPPED`

Day 4와 동일:

``` text
Service Events
 ↓
Stop Reason
 ↓
Container Exit Code
 ↓
CloudWatch Logs
 ↓
ECR
 ↓
IAM
 ↓
Network
 ↓
RDS
 ↓
S3
```

------------------------------------------------------------------------

# 101. ECS에서 DB 연결 실패

잘못:

``` text
localhost:5432
```

올바름:

``` text
RDS_ENDPOINT:5432
```

Spring Boot:

``` properties
spring.datasource.url=${DB_URL}
```

ECS:

``` text
DB_URL=jdbc:postgresql://RDS_ENDPOINT:5432/cloud_file
```

------------------------------------------------------------------------

# 102. S3 `AccessDenied`

확인:

``` text
ECS Task Role
S3 Policy
Bucket ARN
Object ARN
s3:GetObject
s3:PutObject
s3:DeleteObject
s3:ListBucket
```

------------------------------------------------------------------------

# 103. ECR `CannotPullContainerError`

확인:

``` text
ECR Repository
Image Tag
Image URI
Execution Role
AWS Region
Network
```

------------------------------------------------------------------------

# 104. CloudWatch 로그가 없음

확인:

``` text
Log Group
awslogs
Execution Role
Task Definition Revision
실제 실행 중인 Revision
```

------------------------------------------------------------------------

# 105. Day 5 보안 점검

프로젝트 루트:

``` bash
git status
```

확인.

다음이 Git에 포함되면 안 된다.

``` text
terraform.tfstate
terraform.tfvars
.env
AWS credentials
Private Key
실제 DB Password
```

------------------------------------------------------------------------

# 106. Secret 검색

``` bash
grep -RniE   "AKIA|aws_secret|secret_key|password.*="   --exclude-dir=.git   --exclude-dir=.terraform   .
```

실제 Credential이 발견되면 Commit하지 않는다.

------------------------------------------------------------------------

# 107. Terraform Format / Validate / Plan 반복

코드를 수정할 때마다:

``` bash
terraform fmt -recursive
```

``` bash
terraform validate
```

``` bash
terraform plan
```

순서로 확인한다.

------------------------------------------------------------------------

# 108. Day 5 완료 기준

## Terraform

``` text
[ ] terraform init
[ ] terraform fmt
[ ] terraform validate
[ ] terraform plan
[ ] terraform apply
```

## Network

``` text
[ ] VPC
[ ] Public Subnet 2개
[ ] Private Subnet 2개
[ ] Internet Gateway
[ ] Route Table
[ ] ECS Security Group
[ ] RDS Security Group
```

## Storage

``` text
[ ] S3
[ ] Public Access Block
[ ] Versioning
[ ] Encryption
[ ] RDS PostgreSQL
```

## Container

``` text
[ ] ECR
[ ] Docker Image
[ ] ECR Push
[ ] ECS Cluster
[ ] Task Definition
[ ] ECS Service
[ ] Fargate
```

## IAM

``` text
[ ] Execution Role
[ ] Task Role
[ ] S3 Permission
[ ] Secrets Manager Permission
```

## Monitoring

``` text
[ ] CloudWatch Log Group
[ ] ECS Logs
```

## 실제 서비스

``` text
[ ] Health API
[ ] Folder 생성
[ ] File Upload
[ ] File List
[ ] Download
[ ] Rename
[ ] Move
[ ] Delete
```

## Persistence

``` text
[ ] PostgreSQL Metadata
[ ] S3 Actual File
[ ] Task 종료
[ ] 새 Task 생성
[ ] 파일 유지
```

------------------------------------------------------------------------

# 109. Day 5에서 직접 해볼 실험

## 실험 1 --- Terraform Plan

``` bash
terraform plan
```

무엇이 생성되는지 직접 읽는다.

## 실험 2 --- Apply

``` bash
terraform apply
```

AWS Console에서 실제 Resource가 생겼는지 확인한다.

## 실험 3 --- 두 번째 Plan

``` bash
terraform plan
```

변경 없음인지 확인한다.

## 실험 4 --- Scale Out

``` hcl
ecs_desired_count = 2
```

로 변경한다.

``` bash
terraform apply
```

Task가 2개가 되는지 확인한다.

## 실험 5 --- 원복

``` hcl
ecs_desired_count = 1
```

로 변경하고 Apply한다.

## 실험 6 --- 파일 Upload

Day 4의 실제 Upload API를 호출한다.

## 실험 7 --- S3 확인

``` bash
aws s3 ls "s3://$(terraform output -raw s3_bucket_name)/" --recursive
```

## 실험 8 --- Task 종료

``` bash
aws ecs stop-task ...
```

## 실험 9 --- 새 Task 확인

Service의 `runningCount`를 확인한다.

## 실험 10 --- 파일 유지

새 Task가 실행된 뒤 S3의 파일을 다시 확인한다.

------------------------------------------------------------------------

# 110. Day 5에서 꼭 기억할 설계

``` text
Container
→ 교체 가능

S3
→ 파일 영속성

RDS
→ Metadata 영속성

ECR
→ Image 저장

ECS
→ Container 관리/실행

IAM
→ 권한

CloudWatch
→ 로그

Terraform
→ Infrastructure Code
```

------------------------------------------------------------------------

# 111. Day 5가 해커톤 프로젝트에서 의미하는 것

단순히:

``` text
AWS를 사용했다.
```

가 아니다.

다음 구조를 보여줄 수 있다.

``` text
Application
+
Container
+
Cloud
+
IaC
+
Storage
+
Database
+
IAM
+
Monitoring
```

즉 실제 동작하는 서비스를 Cloud-Native 방식으로 배포하고, 그 인프라를
코드로 재현할 수 있는 구조다.

------------------------------------------------------------------------

# 112. 해커톤 발표용 설명

다음과 같이 설명할 수 있다.

> "Day 4에서 Docker Image를 ECR에 저장하고 ECS Fargate에서 Spring Boot
> 파일 서비스를 실행했습니다."

> "Day 5에서는 해당 AWS 환경을 Terraform으로 코드화하여 VPC, Subnet,
> Security Group, S3, ECR, IAM, RDS, ECS, CloudWatch 등을 재현 가능하게
> 관리했습니다."

> "파일 시스템의 메타데이터는 PostgreSQL/RDS에 저장하고 실제 파일은 S3에
> 저장하여 ECS Task가 교체되어도 파일이 유지되도록 구성했습니다."

> "애플리케이션의 AWS 접근 권한은 Access Key를 코드에 저장하지 않고 ECS
> Task Role을 통해 부여했습니다."

------------------------------------------------------------------------

# 113. Day 5 최종 Architecture

``` text
                         GitHub
                           |
                           v
                  Terraform / IaC
                           |
        +------------------+------------------+
        |                  |                  |
        v                  v                  v
       VPC                IAM                S3
        |                  |                  |
        |                  |              Actual Files
        |
   +----+-------------------------+
   |                              |
   v                              v
Public Subnets              Private Subnets
   |                              |
   v                              v
ECS Fargate                       RDS
   |                              |
   v                              v
Spring Boot                  PostgreSQL
   |                         Metadata
   +------------+---------------+
                |
                v
              S3
```

배포:

``` text
GitHub Codespaces
       |
     Docker
       |
     Image
       |
      ECR
       |
      ECS
       |
    Fargate
```

------------------------------------------------------------------------

# 114. Day 5 → Day 6

Day 6에서는 이 구조를 그대로 유지한다.

추가:

``` text
Frontend
```

구조:

``` text
Browser
   |
Frontend
   |
API
   |
ECS
   |
Spring Boot
  /      RDS       S3
```

Google Drive 느낌의 UI를 만든다.

``` text
📁 문서
📁 사진
📁 프로젝트

📄 report.pdf
📄 README.md
🖼 photo.png
```

------------------------------------------------------------------------

# 115. Day 5 → Day 7

Day 7에는:

``` text
GitHub
   |
GitHub Actions
   |
Gradle
   |
Docker Build
   |
ECR
   |
ECS / Kubernetes
```

자동화를 추가한다.

그리고:

``` text
Terraform
+
Docker
+
ECR
+
ECS
+
Kubernetes
+
GitHub Actions
+
CloudWatch
```

를 하나의 프로젝트로 묶는다.

------------------------------------------------------------------------

# 116. 최종 프로젝트의 역할 분리

``` text
Spring Boot
→ 서비스 로직

PostgreSQL / RDS
→ 파일 시스템 Metadata

S3
→ 실제 파일

Docker
→ 애플리케이션 패키징

ECR
→ Docker Image 저장

ECS Fargate
→ Container 실행

IAM
→ AWS 권한

Terraform
→ Infrastructure as Code

CloudWatch
→ 로그/관찰

Kubernetes
→ 이후 Container Orchestration 확장

GitHub Actions
→ 이후 CI/CD
```

------------------------------------------------------------------------

# 117. Day 5 한 문장

> **Day 3.5에서 만든 실제 Google Drive 스타일 파일 시스템과 Day 4에서
> ECS Fargate에 배포한 Spring Boot 서비스를 그대로 유지하면서, AWS
> 인프라를 Terraform으로 코드화하여 VPC, Subnet, Security Group, S3,
> ECR, IAM, RDS, ECS, CloudWatch를 재현 가능하게 관리한다.**

------------------------------------------------------------------------

# 118. Day 5 완료 후 반드시 확인

``` bash
terraform plan
```

에서 예상하지 못한:

``` text
destroy
```

가 없는지 확인한다.

그리고:

``` bash
terraform output
```

으로 AWS Resource 정보를 확인한다.

마지막:

``` bash
git status
```

에서 Secret이나 State가 추적되고 있지 않은지 확인한다.

------------------------------------------------------------------------

# 119. Git Commit

모든 점검이 끝나면:

``` bash
git add infra/terraform
git add .gitignore
```

``` bash
git commit -m "add terraform infrastructure for cloud file service"
```

``` bash
git push
```

------------------------------------------------------------------------

# 120. END OF DAY 5

Day 5의 핵심은:

``` text
"내가 AWS를 클릭해서 만들 수 있다"
```

에서:

``` text
"내가 만든 AWS 인프라를 코드로 설명하고
필요하면 다시 만들 수 있다"
```

로 넘어가는 것이다.

다음 Day 6에서는 이 인프라와 API 위에 **실제 사용자가 사용할 Google
Drive 스타일 Frontend**를 붙인다.

그리고 Day 7에서는 **Kubernetes + CI/CD + Monitoring**까지 연결한다.

------------------------------------------------------------------------

## 최종 진행 순서

``` text
Day 3
S3
  ↓
Day 3.5
실제 파일 시스템
PostgreSQL + S3
  ↓
Day 4
Docker + ECR + ECS Fargate
  ↓
★ Day 5
Terraform / IaC
  ↓
Day 6
Frontend / Google Drive UI
  ↓
Day 7
Kubernetes + CI/CD + Monitoring
```
