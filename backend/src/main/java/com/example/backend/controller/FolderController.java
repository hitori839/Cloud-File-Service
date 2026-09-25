package com.example.backend.controller;


import com.example.backend.dto.CreateFolderRequest;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.RenameRequest;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.FolderService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/folders")
public class FolderController {

    private final FolderService folderService;

    public FolderController(FolderService folderService) {
        this.folderService = folderService;
    }

    @PostMapping
    public ResponseEntity<FolderResponse> createFolder(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody CreateFolderRequest request
    ) {

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(folderService.createFolder(CurrentUser.id(jwt), request));
    }

    @GetMapping
    public ResponseEntity<List<FolderResponse>> getFolders(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false)
            Long parentFolderId
    ) {

        return ResponseEntity.ok(
                folderService.getFolders(
                        CurrentUser.id(jwt),
                        parentFolderId
                )
        );
    }

    @GetMapping("/tree")
    public ResponseEntity<List<FolderResponse>> getTree(
            @AuthenticationPrincipal Jwt jwt
    ) {

        return ResponseEntity.ok(
                folderService.getTree(CurrentUser.id(jwt))
        );
    }

    @GetMapping("/{folderId}")
    public ResponseEntity<FolderResponse> getFolder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId
    ) {

        return ResponseEntity.ok(
                folderService.getFolder(CurrentUser.id(jwt), folderId)
        );
    }

    @GetMapping("/{folderId}/path")
    public ResponseEntity<List<FolderResponse>> getPath(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId
    ) {

        return ResponseEntity.ok(
                folderService.getPath(CurrentUser.id(jwt), folderId)
        );
    }

    @PatchMapping("/{folderId}")
    public ResponseEntity<FolderResponse> renameFolder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId,
            @RequestBody RenameRequest request
    ) {

        return ResponseEntity.ok(
                folderService.renameFolder(
                        CurrentUser.id(jwt),
                        folderId,
                        request
                )
        );
    }

    @PatchMapping("/{folderId}/move")
    public ResponseEntity<FolderResponse> moveFolder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId,
            @RequestParam(required = false)
            Long parentFolderId
    ) {

        return ResponseEntity.ok(
                folderService.moveFolder(
                        CurrentUser.id(jwt),
                        folderId,
                        parentFolderId
                )
        );
    }

    @PatchMapping("/{folderId}/star")
    public ResponseEntity<FolderResponse> star(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId,
            @RequestParam boolean starred
    ) {

        return ResponseEntity.ok(
                folderService.setStarred(
                        CurrentUser.id(jwt),
                        folderId,
                        starred
                )
        );
    }

    @DeleteMapping("/{folderId}")
    public ResponseEntity<Void> deleteFolder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long folderId
    ) {

        folderService.deleteFolder(CurrentUser.id(jwt), folderId);

        return ResponseEntity.noContent().build();
    }
}
