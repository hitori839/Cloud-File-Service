package com.example.backend.dto;

import com.example.backend.entity.FolderEntity;

import java.time.LocalDateTime;

public record FolderResponse(
        Long id,
        String name,
        Long parentFolderId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    public static FolderResponse from(FolderEntity folder) {

        Long parentId =
                folder.getParent() == null
                        ? null
                        : folder.getParent().getId();

        return new FolderResponse(
                folder.getId(),
                folder.getName(),
                parentId,
                folder.getCreatedAt(),
                folder.getUpdatedAt()
        );
    }
}