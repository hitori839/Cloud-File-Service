package com.example.backend.controller;

import com.example.backend.domain.FileMetadata;
import com.example.backend.dto.CreateFileRequest;
import com.example.backend.dto.FileResponse;
import com.example.backend.service.FileMetadataService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileMetadataService service;

    public FileController(
            FileMetadataService service
    ) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<FileResponse> create(
            @Valid
            @RequestBody
            CreateFileRequest request
    ) {
        FileMetadata metadata =
                service.create(request);

        FileResponse response =
                FileResponse.from(metadata);

        URI location =
                URI.create(
                        "/api/files/" + response.id()
                );

        return ResponseEntity
                .created(location)
                .body(response);
    }

    @GetMapping
    public ResponseEntity<List<FileResponse>>
    findAll() {

        List<FileResponse> response =
                service.findAll()
                        .stream()
                        .map(FileResponse::from)
                        .toList();

        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<FileResponse> findById(
            @PathVariable Long id
    ) {
        FileMetadata metadata =
                service.findById(id);

        return ResponseEntity.ok(
                FileResponse.from(metadata)
        );
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable Long id
    ) {
        service.delete(id);

        return ResponseEntity
                .noContent()
                .build();
    }
}