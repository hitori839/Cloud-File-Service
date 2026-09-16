package com.example.backend.repository;

import com.example.backend.entity.FolderEntity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FolderRepository
        extends JpaRepository<FolderEntity, Long> {

    List<FolderEntity> findByParent_Id(Long parentId);

    List<FolderEntity> findByParentIsNull();
}