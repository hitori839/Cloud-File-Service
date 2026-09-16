package com.example.backend.dto;

import com.example.backend.entity.FileEntity;

import java.time.LocalDateTime;

public record FileResponse(
        Long id,
        String name,
        String originalName,
        Long size,
        String contentType,
        Long folderId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    public static FileResponse from(FileEntity file) {

        Long folderId =
                file.getFolder() == null
                        ? null
                        : file.getFolder().getId();

        return new FileResponse(
                file.getId(),
                file.getName(),
                file.getOriginalName(),
                file.getSize(),
                file.getContentType(),
                folderId,
                file.getCreatedAt(),
                file.getUpdatedAt()
        );
    }
}