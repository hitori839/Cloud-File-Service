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
