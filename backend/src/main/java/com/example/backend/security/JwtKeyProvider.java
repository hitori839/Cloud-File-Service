package com.example.backend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

@Component
public class JwtKeyProvider {

    private final SecretKey secretKey;

    public JwtKeyProvider(
            @Value("${app.jwt.secret}") String secret
    ) {
        byte[] bytes =
                secret.getBytes(StandardCharsets.UTF_8);

        if (bytes.length < 32) {
            throw new IllegalStateException(
                    "app.jwt.secret(JWT_SECRET)은 32바이트 이상이어야 합니다."
            );
        }

        this.secretKey =
                new SecretKeySpec(bytes, "HmacSHA256");
    }

    public SecretKey secretKey() {
        return secretKey;
    }
}
