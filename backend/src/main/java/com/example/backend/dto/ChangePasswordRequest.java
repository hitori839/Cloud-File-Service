package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(

        @NotBlank(message = "현재 비밀번호를 입력해야 합니다.")
        String currentPassword,

        @NotNull(message = "새 비밀번호를 입력해야 합니다.")
        @Size(min = 8, max = 72, message = "비밀번호는 8자 이상 72자 이하여야 합니다.")
        String newPassword
) {
}
