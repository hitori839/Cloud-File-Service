package com.example.backend.repository;

import com.example.backend.entity.FileEntity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FileRepository
        extends JpaRepository<FileEntity, Long> {

    Optional<FileEntity> findByIdAndOwner_Id(Long id, Long ownerId);

    List<FileEntity> findByOwner_IdAndFolderIsNullAndTrashedFalseOrderByNameAsc(
            Long ownerId
    );

    List<FileEntity> findByOwner_IdAndFolder_IdAndTrashedFalseOrderByNameAsc(
            Long ownerId,
            Long folderId
    );

    List<FileEntity> findByOwner_IdAndFolder_IdIn(
            Long ownerId,
            Collection<Long> folderIds
    );

    List<FileEntity> findTop100ByOwner_IdAndTrashedFalseAndNameContainingIgnoreCaseOrderByNameAsc(
            Long ownerId,
            String keyword
    );

    List<FileEntity> findTop50ByOwner_IdAndTrashedFalseOrderByUpdatedAtDesc(
            Long ownerId
    );

    List<FileEntity> findByOwner_IdAndStarredTrueAndTrashedFalseOrderByNameAsc(
            Long ownerId
    );

    List<FileEntity> findByOwner_IdAndTrashedTrueAndTrashRootTrueOrderByTrashedAtDesc(
            Long ownerId
    );

    List<FileEntity> findByOwner_IdAndTrashedTrue(Long ownerId);

    List<FileEntity> findByOwner_Id(Long ownerId);

    @Query("select coalesce(sum(f.size), 0) from FileEntity f where f.owner.id = :ownerId")
    long sumSizeByOwnerId(@Param("ownerId") Long ownerId);

    @Query("select f.owner.id, coalesce(sum(f.size), 0), count(f) "
            + "from FileEntity f where f.owner is not null group by f.owner.id")
    List<Object[]> summarizeByOwner();

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from FileEntity f where f.id in :ids")
    void deleteAllByIdIn(@Param("ids") Collection<Long> ids);
}
