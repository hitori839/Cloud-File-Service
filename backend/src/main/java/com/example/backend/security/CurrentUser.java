package com.example.backend.security;

import com.example.backend.exception.UnauthorizedException;

import org.springframework.security.oauth2.jwt.Jwt;

/**
 * 컨트롤러에서 {@code @AuthenticationPrincipal Jwt jwt} 로 받은 토큰에서
 * 현재 사용자 id(subject)를 꺼내는 헬퍼.
 */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static Long id(Jwt jwt) {

        if (jwt == null || jwt.getSubject() == null) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }

        try {
            return Long.valueOf(jwt.getSubject());
        } catch (NumberFormatException e) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }
    }
}
