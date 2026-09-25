package com.example.backend.dto;

public record StorageResponse(
        long used,
        long limit
) {
}
