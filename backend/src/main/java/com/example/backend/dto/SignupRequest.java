package com.example.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SignupRequest(

        @NotBlank(message = "이메일을 입력해야 합니다.")
        @Email(message = "올바른 이메일 형식이 아닙니다.")
        @Size(max = 255, message = "이메일은 255자 이하여야 합니다.")
        String email,

        @NotNull(message = "비밀번호를 입력해야 합니다.")
        @Size(min = 8, max = 72, message = "비밀번호는 8자 이상 72자 이하여야 합니다.")
        String password,

        @NotBlank(message = "이름을 입력해야 합니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name
) {

    public SignupRequest {
        // 검증 전에 앞뒤 공백 제거 (이메일은 서비스에서 소문자로 정규화)
        email = email == null ? null : email.trim();
        name = name == null ? null : name.trim();
    }
}
