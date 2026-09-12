package com.example.backend.dto;

import com.example.backend.domain.FileMetadata;
import com.example.backend.domain.FileStatus;

import java.time.Instant;

public record FileResponse(
        Long id,
        String fileName,
        String contentType,
        long size,
        String objectKey,
        FileStatus status,
        Instant createdAt
) {

    public static FileResponse from(
            FileMetadata metadata
    ) {
        return new FileResponse(
                metadata.id(),
                metadata.fileName(),
                metadata.contentType(),
                metadata.size(),
                metadata.objectKey(),
                metadata.status(),
                metadata.createdAt()
        );
    }
}