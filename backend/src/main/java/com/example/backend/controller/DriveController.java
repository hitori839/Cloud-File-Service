package com.example.backend.controller;

import com.example.backend.dto.DriveItems;
import com.example.backend.dto.FileResponse;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.StorageResponse;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.DriveService;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/drive")
public class DriveController {

    private final DriveService driveService;

    public DriveController(DriveService driveService) {
        this.driveService = driveService;
    }

    @GetMapping("/search")
    public ResponseEntity<DriveItems> search(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String q
    ) {

        return ResponseEntity.ok(
                driveService.search(CurrentUser.id(jwt), q)
        );
    }

    @GetMapping("/recent")
    public ResponseEntity<List<FileResponse>> recent(
            @AuthenticationPrincipal Jwt jwt
    ) {

        return ResponseEntity.ok(
                driveService.recent(CurrentUser.id(jwt))
        );
    }

    @GetMapping("/starred")
    public ResponseEntity<DriveItems> starred(
            @AuthenticationPrincipal Jwt jwt
    ) {

        return ResponseEntity.ok(
                driveService.starred(CurrentUser.id(jwt))
        );
    }

    @GetMapping("/storage")
    public ResponseEntity<StorageResponse> storage(
            @AuthenticationPrincipal Jwt jwt
    ) {

        return ResponseEntity.ok(
                driveService.storage(CurrentUser.id(jwt))
        );
    }

    @GetMapping("/trash")
    public ResponseEntity<DriveItems> trash(
            @AuthenticationPrincipal Jwt jwt
    ) {

        return ResponseEntity.ok(
                driveService.trash(CurrentUser.id(jwt))
        );
    }

    @PostMapping("/trash/files/{fileId}/restore")
    public ResponseEntity<FileResponse> restoreFile(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId
    ) {

        return ResponseEntity.ok(
                driveService.restoreFile(CurrentUser.id(jwt), fileId)
        );
    }

    @PostMapping("/trash/folders/{folderId}/restore")
    public ResponseEntity<FolderResponse> restoreFolder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId
    ) {

        return ResponseEntity.ok(
                driveService.restoreFolder(CurrentUser.id(jwt), folderId)
        );
    }

    @DeleteMapping("/trash/files/{fileId}")
    public ResponseEntity<Void> deleteFilePermanently(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId
    ) {

        driveService.deleteFilePermanently(CurrentUser.id(jwt), fileId);

        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/trash/folders/{folderId}")
    public ResponseEntity<Void> deleteFolderPermanently(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId
    ) {

        driveService.deleteFolderPermanently(CurrentUser.id(jwt), folderId);

        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/trash")
    public ResponseEntity<Void> emptyTrash(
            @AuthenticationPrincipal Jwt jwt
    ) {

        driveService.emptyTrash(CurrentUser.id(jwt));

        return ResponseEntity.noContent().build();
    }
}
