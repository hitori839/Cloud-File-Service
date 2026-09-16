package com.example.backend.controller;

import com.example.backend.dto.FileResponse;
import com.example.backend.service.FileService;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileService fileService;

    public FileController(FileService fileService) {
        this.fileService = fileService;
    }

    @PostMapping
    public ResponseEntity<FileResponse> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false)
            Long folderId
    ) throws IOException {

        return ResponseEntity.ok(
                fileService.upload(
                        file,
                        folderId
                )
        );
    }

    @GetMapping
    public ResponseEntity<List<FileResponse>> getFiles(
            @RequestParam(required = false)
            Long folderId
    ) {

        return ResponseEntity.ok(
                fileService.getFiles(folderId)
        );
    }

    @GetMapping("/{fileId}/download")
    public ResponseEntity<ByteArrayResource> download(
            @PathVariable Long fileId
    ) {

        byte[] data =
                fileService.download(fileId);

        ByteArrayResource resource =
                new ByteArrayResource(data);

        String contentType =
                fileService.getContentType(fileId);

        String fileName =
                fileService.getFileName(fileId);

        return ResponseEntity.ok()
                .contentType(
                        MediaType.parseMediaType(
                                contentType
                        )
                )
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\""
                                + fileName
                                + "\""
                )
                .contentLength(data.length)
                .body(resource);
    }

    @PatchMapping("/{fileId}/rename")
    public ResponseEntity<FileResponse> rename(
            @PathVariable Long fileId,
            @RequestParam String name
    ) {

        return ResponseEntity.ok(
                fileService.rename(
                        fileId,
                        name
                )
        );
    }

    @PatchMapping("/{fileId}/move")
    public ResponseEntity<FileResponse> move(
            @PathVariable Long fileId,
            @RequestParam(required = false)
            Long folderId
    ) {

        return ResponseEntity.ok(
                fileService.move(
                        fileId,
                        folderId
                )
        );
    }

    @DeleteMapping("/{fileId}")
    public ResponseEntity<Void> delete(
            @PathVariable Long fileId
    ) {

        fileService.delete(fileId);

        return ResponseEntity.noContent().build();
    }
}