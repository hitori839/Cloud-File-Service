package com.example.backend.service;

import com.example.backend.domain.FileMetadata;
import com.example.backend.domain.FileStatus;
import com.example.backend.dto.CreateFileRequest;
import com.example.backend.exception.FileNotFoundException;
import com.example.backend.repository.FileMetadataRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
public class FileMetadataService {

    private final FileMetadataRepository repository;

    public FileMetadataService(
            FileMetadataRepository repository
    ) {
        this.repository = repository;
    }

    public FileMetadata create(
            CreateFileRequest request
    ) {
        FileMetadata metadata =
                new FileMetadata(
                        null,
                        request.fileName(),
                        request.contentType(),
                        request.size(),
                        null,
                        FileStatus.REGISTERED,
                        Instant.now()
                );

        FileMetadata saved =
                repository.save(metadata);

        String objectKey =
                "files/"
                + saved.id()
                + "-"
                + saved.fileName();

        FileMetadata updated =
                new FileMetadata(
                        saved.id(),
                        saved.fileName(),
                        saved.contentType(),
                        saved.size(),
                        objectKey,
                        saved.status(),
                        saved.createdAt()
                );

        return repository.save(updated);
    }

    public List<FileMetadata> findAll() {
        return repository.findAll();
    }

    public FileMetadata findById(Long id) {
        return repository.findById(id)
                .orElseThrow(
                        () -> new FileNotFoundException(id)
                );
    }

    public void delete(Long id) {
        FileMetadata file = findById(id);

        FileMetadata deleted =
                new FileMetadata(
                        file.id(),
                        file.fileName(),
                        file.contentType(),
                        file.size(),
                        file.objectKey(),
                        FileStatus.DELETED,
                        file.createdAt()
                );

        repository.save(deleted);
    }
}