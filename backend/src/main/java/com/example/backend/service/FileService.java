package com.example.backend.service;

import com.example.backend.dto.FileResponse;
import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.entity.UserEntity;
import com.example.backend.exception.QuotaExceededException;
import com.example.backend.exception.ResourceNotFoundException;
import com.example.backend.repository.FileRepository;
import com.example.backend.storage.S3StorageService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class FileService {

    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";
    private static final String NOT_FOUND = "파일을 찾을 수 없습니다.";

    private final FileRepository fileRepository;
    private final FolderService folderService;
    private final UserService userService;
    private final StorageQuota storageQuota;
    private final S3StorageService storageService;

    public FileService(
            FileRepository fileRepository,
            FolderService folderService,
            UserService userService,
            StorageQuota storageQuota,
            S3StorageService storageService
    ) {
        this.fileRepository = fileRepository;
        this.folderService = folderService;
        this.userService = userService;
        this.storageQuota = storageQuota;
        this.storageService = storageService;
    }

    public FileResponse upload(
            Long userId,
            MultipartFile multipartFile,
            Long folderId
    ) throws IOException {

        if (multipartFile == null ||
                multipartFile.isEmpty()) {

            throw new IllegalArgumentException(
                    "파일이 비어 있습니다."
            );
        }

        UserEntity owner = userService.getUser(userId);

        FolderEntity folder = null;

        if (folderId != null) {
            folder = folderService.findActiveFolder(
                    userId,
                    folderId,
                    "업로드 대상 폴더를 찾을 수 없습니다."
            );
        }

        long used = storageQuota.used(userId);

        if (used + multipartFile.getSize() > storageQuota.limit()) {
            throw new QuotaExceededException(
                    "저장 공간이 부족합니다."
            );
        }

        String originalName =
                sanitizeFileName(multipartFile.getOriginalFilename());

        String contentType =
                multipartFile.getContentType() == null
                        || multipartFile.getContentType().isBlank()
                        ? DEFAULT_CONTENT_TYPE
                        : multipartFile.getContentType();

        String s3Key =
                "users/" + userId + "/files/"
                        + UUID.randomUUID();

        storageService.upload(
                s3Key,
                multipartFile
        );

        FileEntity file =
                new FileEntity(
                        originalName,
                        originalName,
                        s3Key,
                        multipartFile.getSize(),
                        contentType,
                        folder,
                        owner
                );

        fileRepository.save(file);

        return FileResponse.from(file);
    }

    @Transactional(readOnly = true)
    public List<FileResponse> getFiles(
            Long userId,
            Long folderId
    ) {

        List<FileEntity> files;

        if (folderId == null) {
            files = fileRepository
                    .findByOwner_IdAndFolderIsNullAndTrashedFalseOrderByNameAsc(userId);
        } else {
            folderService.findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");
            files = fileRepository
                    .findByOwner_IdAndFolder_IdAndTrashedFalseOrderByNameAsc(
                            userId,
                            folderId
                    );
        }

        return files.stream()
                .map(FileResponse::from)
                .toList();
    }

    /** 다운로드/미리보기용. 휴지통에 있는 파일도 본인 소유면 열람 가능하다. */
    @Transactional(readOnly = true)
    public StoredFile load(Long userId, Long fileId) {

        FileEntity file = findOwnedFile(userId, fileId);

        byte[] data = storageService.download(file.getS3Key());

        String contentType =
                file.getContentType() == null
                        ? DEFAULT_CONTENT_TYPE
                        : file.getContentType();

        return new StoredFile(
                file.getName(),
                contentType,
                data
        );
    }

    public FileResponse rename(
            Long userId,
            Long fileId,
            String name
    ) {

        if (name == null || name.isBlank()) {

            throw new IllegalArgumentException(
                    "파일 이름을 입력해야 합니다."
            );
        }

        String trimmed = name.trim();

        if (trimmed.length() > FolderService.MAX_NAME_LENGTH) {
            throw new IllegalArgumentException(
                    "이름은 255자 이하여야 합니다."
            );
        }

        FileEntity file = findActiveFile(userId, fileId);

        file.setName(trimmed);

        return FileResponse.from(file);
    }

    public FileResponse move(
            Long userId,
            Long fileId,
            Long folderId
    ) {

        FileEntity file = findActiveFile(userId, fileId);

        FolderEntity folder = null;

        if (folderId != null) {
            folder = folderService.findActiveFolder(
                    userId,
                    folderId,
                    "이동할 폴더를 찾을 수 없습니다."
            );
        }

        file.setFolder(folder);

        return FileResponse.from(file);
    }

    public FileResponse setStarred(
            Long userId,
            Long fileId,
            boolean starred
    ) {

        FileEntity file = findActiveFile(userId, fileId);

        file.setStarred(starred);

        return FileResponse.from(file);
    }

    /** 휴지통으로 이동 (S3 객체는 유지) */
    public void delete(Long userId, Long fileId) {

        FileEntity file = findActiveFile(userId, fileId);

        file.moveToTrash(FolderService.trashTimestamp(), true);
    }

    FileEntity findOwnedFile(Long userId, Long fileId) {

        return fileRepository
                .findByIdAndOwner_Id(fileId, userId)
                .orElseThrow(() -> new ResourceNotFoundException(NOT_FOUND));
    }

    FileEntity findActiveFile(Long userId, Long fileId) {

        FileEntity file = findOwnedFile(userId, fileId);

        if (file.isTrashed()) {
            throw new ResourceNotFoundException(NOT_FOUND);
        }

        return file;
    }

    private static String sanitizeFileName(String raw) {

        if (raw == null || raw.isBlank()) {
            return "unknown";
        }

        // 일부 브라우저는 전체 경로를 보내므로 마지막 경로 요소만 사용
        String name = raw.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).trim();

        if (name.isEmpty()) {
            return "unknown";
        }

        if (name.length() > FolderService.MAX_NAME_LENGTH) {
            name = name.substring(0, FolderService.MAX_NAME_LENGTH);
        }

        return name;
    }
}
