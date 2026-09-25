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
variable "admin_emails" {
  type        = string
  description = "관리자 권한을 받을 이메일 목록 (쉼표로 구분). 이 이메일로 가입하면 ADMIN이 된다."
  default     = ""
}

variable "enable_eks" {
  type        = bool
  description = "true이면 EKS Cluster/Node Group을 만든다 (Day 7 48-1, 비용 발생)."
  default     = false
}
