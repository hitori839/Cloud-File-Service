package com.example.backend.controller;

import java.io.IOException;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.example.backend.storage.S3StorageService;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final S3StorageService storageService;

    public FileController(S3StorageService storageService) {
        this.storageService = storageService;
    }

    @PostMapping
    public ResponseEntity<String> upload(
            @RequestParam("file") MultipartFile file
    ) throws IOException {

        String originalName = file.getOriginalFilename();

        if (originalName == null || originalName.isBlank()) {
            originalName = "unknown";
        }

        String key = UUID.randomUUID() + "-" + originalName;

        storageService.upload(key, file);

        return ResponseEntity.ok(key);
    }

    @GetMapping("/{key}")
    public ResponseEntity<byte[]> download(
            @PathVariable String key
    ) {

        if (!storageService.exists(key)) {
            return ResponseEntity.notFound().build();
        }

        byte[] data = storageService.download(key);

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(data);
    }

    @DeleteMapping("/{key}")
    public ResponseEntity<Void> delete(
            @PathVariable String key
    ) {

        storageService.delete(key);

        return ResponseEntity.noContent().build();
    }
}