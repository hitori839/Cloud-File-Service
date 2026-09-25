package com.example.backend.dto;

import java.util.List;

public record DriveItems(
        List<FolderResponse> folders,
        List<FileResponse> files
) {

    public static DriveItems empty() {
        return new DriveItems(List.of(), List.of());
    }
}
