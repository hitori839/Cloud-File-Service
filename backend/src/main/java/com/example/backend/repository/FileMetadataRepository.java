package com.example.backend.repository;

import com.example.backend.domain.FileMetadata;

import java.util.List;
import java.util.Optional;

public interface FileMetadataRepository {

    FileMetadata save(FileMetadata file);

    Optional<FileMetadata> findById(Long id);

    List<FileMetadata> findAll();

    boolean deleteById(Long id);
}