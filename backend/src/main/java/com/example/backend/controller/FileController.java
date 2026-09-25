package com.example.backend.controller;

import com.example.backend.dto.FileResponse;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.FileService;
import com.example.backend.service.StoredFile;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
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
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false)
            Long folderId
    ) throws IOException {

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(fileService.upload(
                        CurrentUser.id(jwt),
                        file,
                        folderId
                ));
    }

    @GetMapping
    public ResponseEntity<List<FileResponse>> getFiles(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false)
            Long folderId
    ) {

        return ResponseEntity.ok(
                fileService.getFiles(CurrentUser.id(jwt), folderId)
        );
    }

    @GetMapping("/{fileId}/download")
    public ResponseEntity<ByteArrayResource> download(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId
    ) {

        StoredFile file =
                fileService.load(CurrentUser.id(jwt), fileId);

        return fileResponse(
                file,
                ContentDisposition.attachment()
        );
    }

    @GetMapping("/{fileId}/preview")
    public ResponseEntity<ByteArrayResource> preview(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId
    ) {

        StoredFile file =
                fileService.load(CurrentUser.id(jwt), fileId);

        return fileResponse(
                file,
                ContentDisposition.inline()
        );
    }

    @PatchMapping("/{fileId}/rename")
    public ResponseEntity<FileResponse> rename(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId,
            @RequestParam String name
    ) {

        return ResponseEntity.ok(
                fileService.rename(
                        CurrentUser.id(jwt),
                        fileId,
                        name
                )
        );
    }

    @PatchMapping("/{fileId}/move")
    public ResponseEntity<FileResponse> move(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId,
            @RequestParam(required = false)
            Long folderId
    ) {

        return ResponseEntity.ok(
                fileService.move(
                        CurrentUser.id(jwt),
                        fileId,
                        folderId
                )
        );
    }

    @PatchMapping("/{fileId}/star")
    public ResponseEntity<FileResponse> star(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId,
            @RequestParam boolean starred
    ) {

        return ResponseEntity.ok(
                fileService.setStarred(
                        CurrentUser.id(jwt),
                        fileId,
                        starred
                )
        );
    }

    /** 휴지통으로 이동 */
    @DeleteMapping("/{fileId}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long fileId
    ) {

        fileService.delete(CurrentUser.id(jwt), fileId);

        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<ByteArrayResource> fileResponse(
            StoredFile file,
            ContentDisposition.Builder disposition
    ) {

        // RFC 5987 (filename*=UTF-8''...) 로 한글 파일명 지원
        ContentDisposition contentDisposition = disposition
                .filename(file.name(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .contentType(parseContentType(file.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentLength(file.data().length)
                .body(new ByteArrayResource(file.data()));
    }

    private static MediaType parseContentType(String contentType) {

        try {
            return MediaType.parseMediaType(contentType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
