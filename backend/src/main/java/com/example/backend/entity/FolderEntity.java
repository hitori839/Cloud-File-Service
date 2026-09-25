package com.example.backend.entity;

import jakarta.persistence.*;

import org.hibernate.annotations.ColumnDefault;

import java.time.LocalDateTime;

@Entity
@Table(name = "folders")
public class FolderEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private FolderEntity parent;

    // 기존 데이터와의 호환을 위해 DB 컬럼은 nullable 로 둔다.
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

    protected FolderEntity() {
    }

    public FolderEntity(
            String name,
            FolderEntity parent,
            UserEntity owner
    ) {
        this.name = name;
        this.parent = parent;
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

    public FolderEntity getParent() {
        return parent;
    }

    public void setParent(FolderEntity parent) {
        this.parent = parent;
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
