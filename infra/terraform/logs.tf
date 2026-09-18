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