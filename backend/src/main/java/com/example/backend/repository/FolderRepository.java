package com.example.backend.repository;

import com.example.backend.entity.FolderEntity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FolderRepository
        extends JpaRepository<FolderEntity, Long> {

    Optional<FolderEntity> findByIdAndOwner_Id(Long id, Long ownerId);

    List<FolderEntity> findByOwner_IdAndParentIsNullAndTrashedFalseOrderByNameAsc(
            Long ownerId
    );

    List<FolderEntity> findByOwner_IdAndParent_IdAndTrashedFalseOrderByNameAsc(
            Long ownerId,
            Long parentId
    );

    List<FolderEntity> findByOwner_IdAndTrashedFalseOrderByNameAsc(Long ownerId);

    List<FolderEntity> findTop100ByOwner_IdAndTrashedFalseAndNameContainingIgnoreCaseOrderByNameAsc(
            Long ownerId,
            String keyword
    );

    List<FolderEntity> findByOwner_IdAndStarredTrueAndTrashedFalseOrderByNameAsc(
            Long ownerId
    );

    List<FolderEntity> findByOwner_IdAndTrashedTrueAndTrashRootTrueOrderByTrashedAtDesc(
            Long ownerId
    );

    List<FolderEntity> findByOwner_IdAndTrashedTrue(Long ownerId);

    List<FolderEntity> findByOwner_Id(Long ownerId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update FolderEntity f set f.parent = null where f.id in :ids")
    void detachParents(@Param("ids") Collection<Long> ids);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from FolderEntity f where f.id in :ids")
    void deleteAllByIdIn(@Param("ids") Collection<Long> ids);
}
