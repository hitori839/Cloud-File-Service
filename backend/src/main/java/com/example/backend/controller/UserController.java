package com.example.backend.controller;

import com.example.backend.dto.ChangePasswordRequest;
import com.example.backend.dto.DeleteAccountRequest;
import com.example.backend.dto.UpdateProfileRequest;
import com.example.backend.dto.UserResponse;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.UserService;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users/me")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PatchMapping
    public ResponseEntity<UserResponse> updateProfile(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdateProfileRequest request
    ) {

        return ResponseEntity.ok(
                userService.updateProfile(CurrentUser.id(jwt), request)
        );
    }

    @PatchMapping("/password")
    public ResponseEntity<Void> changePassword(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ChangePasswordRequest request
    ) {

        userService.changePassword(CurrentUser.id(jwt), request);

        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> deleteAccount(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody DeleteAccountRequest request
    ) {

        userService.deleteAccount(CurrentUser.id(jwt), request);

        return ResponseEntity.noContent().build();
    }
}
