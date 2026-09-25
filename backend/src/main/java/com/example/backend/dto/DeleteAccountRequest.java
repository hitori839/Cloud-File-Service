package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record DeleteAccountRequest(

        @NotBlank(message = "비밀번호를 입력해야 합니다.")
        String password
) {
}
