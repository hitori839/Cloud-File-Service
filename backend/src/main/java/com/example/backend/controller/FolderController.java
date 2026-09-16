package com.example.backend.controller;


import com.example.backend.dto.CreateFolderRequest;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.RenameRequest;
import com.example.backend.service.FolderService;

import org.springframework.http.ResponseEntity;
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
            @RequestBody CreateFolderRequest request
    ) {

        return ResponseEntity.ok(
                folderService.createFolder(request)
        );
    }

    @GetMapping
    public ResponseEntity<List<FolderResponse>> getFolders(
            @RequestParam(required = false)
            Long parentFolderId
    ) {

        return ResponseEntity.ok(
                folderService.getFolders(
                        parentFolderId
                )
        );
    }

    @PatchMapping("/{folderId}")
    public ResponseEntity<FolderResponse> renameFolder(
            @PathVariable Long folderId,
            @RequestBody RenameRequest request
    ) {

        return ResponseEntity.ok(
                folderService.renameFolder(
                        folderId,
                        request
                )
        );
    }

    @DeleteMapping("/{folderId}")
    public ResponseEntity<Void> deleteFolder(
            @PathVariable Long folderId
    ) {

        folderService.deleteFolder(folderId);

        return ResponseEntity.noContent().build();
    }
}