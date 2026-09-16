package com.example.backend.dto;

public record CreateFolderRequest(
        String name,
        Long parentFolderId
) {
}