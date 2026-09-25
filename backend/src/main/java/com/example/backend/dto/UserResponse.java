package com.example.backend.dto;

import com.example.backend.entity.Role;
import com.example.backend.entity.UserEntity;

import java.time.LocalDateTime;

public record UserResponse(
        Long id,
        String email,
        String name,
        Role role,
        long storageUsed,
        long storageLimit,
        LocalDateTime createdAt
) {

    public static UserResponse of(
            UserEntity user,
            long storageUsed,
            long storageLimit
    ) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getName(),
                user.getRole(),
                storageUsed,
                storageLimit,
                user.getCreatedAt()
        );
    }
}
