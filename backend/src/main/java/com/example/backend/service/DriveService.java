package com.example.backend.service;

import com.example.backend.dto.DriveItems;
import com.example.backend.dto.FileResponse;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.StorageResponse;
import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.exception.ResourceNotFoundException;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.FolderRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@Transactional
public class DriveService {

    private final FileRepository fileRepository;
    private final FolderRepository folderRepository;
    private final FileService fileService;
    private final FolderService folderService;
    private final StorageQuota storageQuota;
    private final UserDataCleaner dataCleaner;

    public DriveService(
            FileRepository fileRepository,
            FolderRepository folderRepository,
            FileService fileService,
            FolderService folderService,
            StorageQuota storageQuota,
            UserDataCleaner dataCleaner
    ) {
        this.fileRepository = fileRepository;
        this.folderRepository = folderRepository;
        this.fileService = fileService;
        this.folderService = folderService;
        this.storageQuota = storageQuota;
        this.dataCleaner = dataCleaner;
    }

    @Transactional(readOnly = true)
    public DriveItems search(Long userId, String q) {

        if (q == null || q.isBlank()) {
            return DriveItems.empty();
        }

        String keyword = q.trim();

        return new DriveItems(
                folderRepository
                        .findTop100ByOwner_IdAndTrashedFalseAndNameContainingIgnoreCaseOrderByNameAsc(userId, keyword)
                        .stream().map(FolderResponse::from).toList(),
                fileRepository
                        .findTop100ByOwner_IdAndTrashedFalseAndNameContainingIgnoreCaseOrderByNameAsc(userId, keyword)
                        .stream().map(FileResponse::from).toList()
        );
    }

    @Transactional(readOnly = true)
    public List<FileResponse> recent(Long userId) {

        return fileRepository
                .findTop50ByOwner_IdAndTrashedFalseOrderByUpdatedAtDesc(userId)
                .stream().map(FileResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public DriveItems starred(Long userId) {

        return new DriveItems(
                folderRepository
                        .findByOwner_IdAndStarredTrueAndTrashedFalseOrderByNameAsc(userId)
                        .stream().map(FolderResponse::from).toList(),
                fileRepository
                        .findByOwner_IdAndStarredTrueAndTrashedFalseOrderByNameAsc(userId)
                        .stream().map(FileResponse::from).toList()
        );
    }

    /** 휴지통: 사용자가 직접 삭제한 항목(trashRoot)만, 최근 삭제 순 */
    @Transactional(readOnly = true)
    public DriveItems trash(Long userId) {

        return new DriveItems(
                folderRepository
                        .findByOwner_IdAndTrashedTrueAndTrashRootTrueOrderByTrashedAtDesc(userId)
                        .stream().map(FolderResponse::from).toList(),
                fileRepository
                        .findByOwner_IdAndTrashedTrueAndTrashRootTrueOrderByTrashedAtDesc(userId)
                        .stream().map(FileResponse::from).toList()
        );
    }

    public FileResponse restoreFile(Long userId, Long fileId) {

        FileEntity file = findTrashedFile(userId, fileId);

        file.restore();

        // 원래 폴더가 휴지통에 있으면 루트로 복원
        if (file.getFolder() != null && file.getFolder().isTrashed()) {
            file.setFolder(null);
        }

        return FileResponse.from(file);
    }

    /**
     * 폴더와, 그 폴더와 함께(같은 trashedAt 배치로) 휴지통에 들어간 하위 항목을 복원한다.
     * 따로 먼저 삭제된 하위 항목은 휴지통에 남는다.
     */
    public FolderResponse restoreFolder(Long userId, Long folderId) {

        FolderEntity folder = findTrashedFolder(userId, folderId);

        LocalDateTime batch = folder.getTrashedAt();

        List<FolderEntity> subtree = folderService.subtree(userId, folder);

        for (FolderEntity item : subtree) {

            if (item != folder
                    && item.isTrashed()
                    && !item.isTrashRoot()
                    && Objects.equals(batch, item.getTrashedAt())) {
                item.restore();
            }
        }

        for (FileEntity file : folderService.filesIn(userId, subtree)) {

            if (file.isTrashed()
                    && !file.isTrashRoot()
                    && Objects.equals(batch, file.getTrashedAt())) {
                file.restore();
            }
        }

        folder.restore();

        if (folder.getParent() != null && folder.getParent().isTrashed()) {
            folder.setParent(null);
        }

        return FolderResponse.from(folder);
    }

    public void deleteFilePermanently(Long userId, Long fileId) {

        FileEntity file = findTrashedFile(userId, fileId);

        dataCleaner.purge(List.of(file), List.of());
    }

    public void deleteFolderPermanently(Long userId, Long folderId) {

        FolderEntity folder = findTrashedFolder(userId, folderId);

        List<FolderEntity> subtree = folderService.subtree(userId, folder);

        dataCleaner.purge(
                folderService.filesIn(userId, subtree),
                subtree
        );
    }

    /** 휴지통 비우기: 사용자의 휴지통 항목 전체와 그 하위 항목, S3 객체까지 삭제 */
    public void emptyTrash(Long userId) {

        List<FolderEntity> allFolders = folderRepository.findByOwner_Id(userId);
        FolderTree tree = new FolderTree(allFolders);

        Map<Long, FolderEntity> folders = new LinkedHashMap<>();

        allFolders.stream()
                .filter(FolderEntity::isTrashed)
                .sorted(Comparator.comparing(FolderEntity::getId))
                .forEach(root -> tree.subtree(root)
                        .forEach(f -> folders.putIfAbsent(f.getId(), f)));

        Map<Long, FileEntity> files = new LinkedHashMap<>();

        fileRepository.findByOwner_IdAndTrashedTrue(userId)
                .forEach(f -> files.put(f.getId(), f));

        folderService.filesIn(userId, List.copyOf(folders.values()))
                .forEach(f -> files.putIfAbsent(f.getId(), f));

        dataCleaner.purge(files.values(), folders.values());
    }

    @Transactional(readOnly = true)
    public StorageResponse storage(Long userId) {

        return new StorageResponse(
                storageQuota.used(userId),
                storageQuota.limit()
        );
    }

    private FileEntity findTrashedFile(Long userId, Long fileId) {

        FileEntity file = fileService.findOwnedFile(userId, fileId);

        if (!file.isTrashed()) {
            throw new ResourceNotFoundException("휴지통에서 파일을 찾을 수 없습니다.");
        }

        return file;
    }

    private FolderEntity findTrashedFolder(Long userId, Long folderId) {

        FolderEntity folder = folderService.findOwnedFolder(
                userId,
                folderId,
                "휴지통에서 폴더를 찾을 수 없습니다."
        );

        if (!folder.isTrashed()) {
            throw new ResourceNotFoundException("휴지통에서 폴더를 찾을 수 없습니다.");
        }

        return folder;
    }
}
