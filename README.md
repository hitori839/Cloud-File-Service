# Cloud File Service

## Current Status

Validated project state for both local development and AWS deployment flow.

- Day 1: Spring Boot REST foundation
- Day 2: Docker + Nginx
- Day 3: AWS S3 storage integration
- Day 4: ECS Fargate deployment and AWS troubleshooting flow

## Deployment Reality

- Local Docker Compose uses PostgreSQL on `postgres:5432`
- ECS/Fargate must use a real DB endpoint instead of `localhost:5432`
- Public access is only valid after `securityGroups` is populated and `assignPublicIp` is enabled
- Public IP retrieval should only happen after the service network configuration is validated

## Features

- Health API
- File upload / metadata persistence
- File metadata list
- File metadata lookup
- Delete state
- Validation
- Exception handling
- S3-backed storage
- ECS deployment workflow

## API

GET /health
POST /api/files
GET /api/files
GET /api/files/{id}
DELETE /api/files/{id}

## Storage

- Local development: Docker Compose + PostgreSQL
- AWS deployment: Amazon S3

## Future

- Terraform
- Kubernetes
- OpenTelemetry
- Grafana
- Argo CD