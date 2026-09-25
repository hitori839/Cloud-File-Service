package com.example.backend.dto;

import com.example.backend.entity.Role;

import java.time.LocalDateTime;

public record AdminUserResponse(
        Long id,
        String email,
        String name,
        Role role,
        long storageUsed,
        long fileCount,
        LocalDateTime createdAt
) {
}
