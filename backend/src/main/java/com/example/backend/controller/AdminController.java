package com.example.backend.controller;

import com.example.backend.dto.AdminUserResponse;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.AdminService;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** /api/admin/** 는 SecurityConfig 에서 ROLE_ADMIN 만 허용 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/users")
    public ResponseEntity<List<AdminUserResponse>> getUsers() {

        return ResponseEntity.ok(
                adminService.getUsers()
        );
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Void> deleteUser(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long userId
    ) {

        adminService.deleteUser(CurrentUser.id(jwt), userId);

        return ResponseEntity.noContent().build();
    }
}
