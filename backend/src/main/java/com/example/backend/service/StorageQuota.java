package com.example.backend.service;

import com.example.backend.repository.FileRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 사용자별 저장 용량 정책.
 * used = 휴지통을 포함한 사용자의 모든 파일 크기 합계.
 */
@Component
public class StorageQuota {

    private final FileRepository fileRepository;
    private final long limitBytes;

    public StorageQuota(
            FileRepository fileRepository,
            @Value("${app.storage.limit-bytes}") long limitBytes
    ) {
        this.fileRepository = fileRepository;
        this.limitBytes = limitBytes;
    }

    public long limit() {
        return limitBytes;
    }

    public long used(Long userId) {
        return fileRepository.sumSizeByOwnerId(userId);
    }
}
