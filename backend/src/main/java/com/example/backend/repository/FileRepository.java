package com.example.backend.repository;

import com.example.backend.entity.FileEntity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FileRepository
        extends JpaRepository<FileEntity, Long> {

    List<FileEntity> findByFolder_Id(Long folderId);

    List<FileEntity> findByFolderIsNull();
}