package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(

        @NotBlank(message = "이름을 입력해야 합니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name
) {
}
