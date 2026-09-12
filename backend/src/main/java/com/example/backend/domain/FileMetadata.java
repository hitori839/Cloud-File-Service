package com.example.backend.domain;

import java.time.Instant;

public record FileMetadata (
    Long id,
    String fileName,
    String contentType,
    long size,
    String objectKey,
    FileStatus status,
    Instant createdAt
) {
}