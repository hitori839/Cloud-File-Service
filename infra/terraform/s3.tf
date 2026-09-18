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