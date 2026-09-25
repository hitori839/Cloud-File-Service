package com.example.backend.entity;

import jakarta.persistence.*;

import org.hibernate.annotations.ColumnDefault;

import java.time.LocalDateTime;

@Entity
@Table(name = "files")
public class FileEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String originalName;

    @Column(nullable = false, unique = true, length = 500)
    private String s3Key;

    @Column(nullable = false)
    private Long size;

    @Column(length = 200)
    private String contentType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id")
    private FolderEntity folder;

    // 기존 데이터와의 호환을 위해 DB 컬럼은 nullable 로 둔다.
    // owner 가 null 인 기존 행은 어떤 사용자에게도 보이지 않는다.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private UserEntity owner;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean starred = false;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean trashed = false;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean trashRoot = false;

    private LocalDateTime trashedAt;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected FileEntity() {
    }

    public FileEntity(
            String name,
            String originalName,
            String s3Key,
            Long size,
            String contentType,
            FolderEntity folder,
            UserEntity owner
    ) {
        this.name = name;
        this.originalName = originalName;
        this.s3Key = s3Key;
        this.size = size;
        this.contentType = contentType;
        this.folder = folder;
        this.owner = owner;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public void moveToTrash(LocalDateTime trashedAt, boolean root) {
        this.trashed = true;
        this.trashRoot = root;
        this.trashedAt = trashedAt;
    }

    public void restore() {
        this.trashed = false;
        this.trashRoot = false;
        this.trashedAt = null;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
        this.updatedAt = LocalDateTime.now();
    }

    public String getOriginalName() {
        return originalName;
    }

    public String getS3Key() {
        return s3Key;
    }

    public Long getSize() {
        return size;
    }

    public String getContentType() {
        return contentType;
    }

    public FolderEntity getFolder() {
        return folder;
    }

    public void setFolder(FolderEntity folder) {
        this.folder = folder;
        this.updatedAt = LocalDateTime.now();
    }

    public UserEntity getOwner() {
        return owner;
    }

    public boolean isStarred() {
        return starred;
    }

    public void setStarred(boolean starred) {
        this.starred = starred;
    }

    public boolean isTrashed() {
        return trashed;
    }

    public boolean isTrashRoot() {
        return trashRoot;
    }

    public LocalDateTime getTrashedAt() {
        return trashedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
