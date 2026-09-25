package com.example.backend.service;

import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.FolderRepository;
import com.example.backend.storage.S3StorageService;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;

/**
 * 파일/폴더 영구 삭제 (DB 행 + S3 객체).
 * 폴더는 self FK(parent_id) 때문에 부모 연결을 먼저 끊은 뒤 일괄 삭제한다.
 */
@Component
@Transactional
public class UserDataCleaner {

    private final FileRepository fileRepository;
    private final FolderRepository folderRepository;
    private final S3StorageService storageService;

    public UserDataCleaner(
            FileRepository fileRepository,
            FolderRepository folderRepository,
            S3StorageService storageService
    ) {
        this.fileRepository = fileRepository;
        this.folderRepository = folderRepository;
        this.storageService = storageService;
    }

    public void purge(
            Collection<FileEntity> files,
            Collection<FolderEntity> folders
    ) {

        List<String> s3Keys = files.stream()
                .map(FileEntity::getS3Key)
                .distinct()
                .toList();

        List<Long> fileIds = files.stream()
                .map(FileEntity::getId)
                .distinct()
                .toList();

        List<Long> folderIds = folders.stream()
                .map(FolderEntity::getId)
                .distinct()
                .toList();

        if (!fileIds.isEmpty()) {
            fileRepository.deleteAllByIdIn(fileIds);
        }

        if (!folderIds.isEmpty()) {
            folderRepository.detachParents(folderIds);
            folderRepository.deleteAllByIdIn(folderIds);
        }

        // S3 오류는 S3StorageService 에서 로그만 남기고 무시한다.
        storageService.deleteAll(s3Keys);
    }

    public void purgeAllOf(Long userId) {

        purge(
                fileRepository.findByOwner_Id(userId),
                folderRepository.findByOwner_Id(userId)
        );
    }
}
