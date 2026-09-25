package com.example.backend.service;

import com.example.backend.dto.AuthResponse;
import com.example.backend.dto.ChangePasswordRequest;
import com.example.backend.dto.DeleteAccountRequest;
import com.example.backend.dto.LoginRequest;
import com.example.backend.dto.SignupRequest;
import com.example.backend.dto.UpdateProfileRequest;
import com.example.backend.dto.UserResponse;
import com.example.backend.entity.Role;
import com.example.backend.entity.UserEntity;
import com.example.backend.exception.ConflictException;
import com.example.backend.exception.UnauthorizedException;
import com.example.backend.repository.UserRepository;
import com.example.backend.security.JwtTokenService;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional
public class UserService {

    private static final String LOGIN_REQUIRED = "로그인이 필요합니다.";
    private static final String BAD_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않습니다.";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenService tokenService;
    private final StorageQuota storageQuota;
    private final UserDataCleaner dataCleaner;
    private final Set<String> adminEmails;

    public UserService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtTokenService tokenService,
            StorageQuota storageQuota,
            UserDataCleaner dataCleaner,
            @Value("${app.admin-emails:}") String adminEmails
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.storageQuota = storageQuota;
        this.dataCleaner = dataCleaner;
        this.adminEmails = Arrays.stream(adminEmails.split(","))
                .map(UserService::normalizeEmail)
                .filter(email -> !email.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public AuthResponse signup(SignupRequest request) {

        String email = normalizeEmail(request.email());
        validatePasswordBytes(request.password());

        if (userRepository.existsByEmail(email)) {
            throw new ConflictException("이미 가입된 이메일입니다.");
        }

        Role role = adminEmails.contains(email) ? Role.ADMIN : Role.USER;

        UserEntity user = new UserEntity(
                email,
                passwordEncoder.encode(request.password()),
                request.name().trim(),
                role
        );

        userRepository.saveAndFlush(user);

        return new AuthResponse(
                tokenService.issue(user),
                toResponse(user)
        );
    }

    public AuthResponse login(LoginRequest request) {

        UserEntity user = userRepository
                .findByEmail(normalizeEmail(request.email()))
                .orElseThrow(() -> new UnauthorizedException(BAD_CREDENTIALS));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new UnauthorizedException(BAD_CREDENTIALS);
        }

        // 가입 이후 ADMIN_EMAILS 에 추가된 계정은 로그인 시 승격 (강등은 하지 않음)
        if (user.getRole() != Role.ADMIN && adminEmails.contains(user.getEmail())) {
            user.setRole(Role.ADMIN);
        }

        return new AuthResponse(
                tokenService.issue(user),
                toResponse(user)
        );
    }

    @Transactional(readOnly = true)
    public UserResponse me(Long userId) {
        return toResponse(getUser(userId));
    }

    public UserResponse updateProfile(Long userId, UpdateProfileRequest request) {

        UserEntity user = getUser(userId);
        user.setName(request.name().trim());

        return toResponse(user);
    }

    public void changePassword(Long userId, ChangePasswordRequest request) {

        UserEntity user = getUser(userId);

        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new IllegalArgumentException("현재 비밀번호가 올바르지 않습니다.");
        }

        validatePasswordBytes(request.newPassword());

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
    }

    public void deleteAccount(Long userId, DeleteAccountRequest request) {

        UserEntity user = getUser(userId);

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new IllegalArgumentException("비밀번호가 올바르지 않습니다.");
        }

        deleteUserAndData(userId);
    }

    /** 사용자의 S3 객체, 파일, 폴더, 사용자 행을 모두 삭제한다. */
    public void deleteUserAndData(Long userId) {

        dataCleaner.purgeAllOf(userId);
        userRepository.deleteById(userId);
    }

    /** 토큰의 사용자가 DB 에 없으면 (탈퇴/삭제됨) 401 */
    @Transactional(readOnly = true)
    public UserEntity getUser(Long userId) {

        return userRepository
                .findById(userId)
                .orElseThrow(() -> new UnauthorizedException(LOGIN_REQUIRED));
    }

    private UserResponse toResponse(UserEntity user) {

        return UserResponse.of(
                user,
                storageQuota.used(user.getId()),
                storageQuota.limit()
        );
    }

    private static void validatePasswordBytes(String password) {

        // BCrypt 는 72바이트까지만 지원
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalArgumentException("비밀번호가 너무 깁니다.");
        }
    }

    static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
