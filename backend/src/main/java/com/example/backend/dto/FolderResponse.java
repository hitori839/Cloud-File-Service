package com.example.backend.dto;

import com.example.backend.entity.FolderEntity;

import java.time.LocalDateTime;

public record FolderResponse(
        Long id,
        String name,
        Long parentFolderId,
        boolean starred,
        boolean trashed,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime trashedAt
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
                folder.isStarred(),
                folder.isTrashed(),
                folder.getCreatedAt(),
                folder.getUpdatedAt(),
                folder.getTrashedAt()
        );
    }
}
