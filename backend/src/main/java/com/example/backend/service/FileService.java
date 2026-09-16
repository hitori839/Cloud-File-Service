package com.example.backend.service;

import com.example.backend.dto.FileResponse;
import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.FolderRepository;
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

    private final FileRepository fileRepository;
    private final FolderRepository folderRepository;
    private final S3StorageService storageService;

    public FileService(
            FileRepository fileRepository,
            FolderRepository folderRepository,
            S3StorageService storageService
    ) {
        this.fileRepository = fileRepository;
        this.folderRepository = folderRepository;
        this.storageService = storageService;
    }

    public FileResponse upload(
            MultipartFile multipartFile,
            Long folderId
    ) throws IOException {

        if (multipartFile == null ||
                multipartFile.isEmpty()) {

            throw new IllegalArgumentException(
                    "파일이 비어 있습니다."
            );
        }

        FolderEntity folder = null;

        if (folderId != null) {

            folder = folderRepository
                    .findById(folderId)
                    .orElseThrow(() ->
                            new IllegalArgumentException(
                                    "업로드 대상 폴더를 찾을 수 없습니다."
                            ));
        }

        String originalName =
                multipartFile.getOriginalFilename();

        if (originalName == null ||
                originalName.isBlank()) {

            originalName = "unknown";
        }

        String s3Key =
                "users/anonymous/files/"
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
                        multipartFile.getContentType(),
                        folder
                );

        fileRepository.save(file);

        return FileResponse.from(file);
    }

    @Transactional(readOnly = true)
    public List<FileResponse> getFiles(
            Long folderId
    ) {

        List<FileEntity> files;

        if (folderId == null) {
            files =
                    fileRepository.findByFolderIsNull();
        } else {
            files =
                    fileRepository.findByFolder_Id(
                            folderId
                    );
        }

        return files.stream()
                .map(FileResponse::from)
                .toList();
    }

    public byte[] download(Long fileId) {

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        return storageService.download(
                file.getS3Key()
        );
    }

    public String getContentType(Long fileId) {

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        if (file.getContentType() == null) {
            return "application/octet-stream";
        }

        return file.getContentType();
    }

    public String getFileName(Long fileId) {

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        return file.getName();
    }

    public void delete(Long fileId) {

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        storageService.delete(
                file.getS3Key()
        );

        fileRepository.delete(file);
    }

    public FileResponse rename(
            Long fileId,
            String name
    ) {

        if (name == null || name.isBlank()) {

            throw new IllegalArgumentException(
                    "파일 이름을 입력해야 합니다."
            );
        }

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        file.setName(name.trim());

        return FileResponse.from(file);
    }

    public FileResponse move(
            Long fileId,
            Long folderId
    ) {

        FileEntity file =
                fileRepository.findById(fileId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "파일을 찾을 수 없습니다."
                                ));

        FolderEntity folder = null;

        if (folderId != null) {

            folder =
                    folderRepository.findById(folderId)
                            .orElseThrow(() ->
                                    new IllegalArgumentException(
                                            "이동할 폴더를 찾을 수 없습니다."
                                    ));
        }

        file.setFolder(folder);

        return FileResponse.from(file);
    }
}