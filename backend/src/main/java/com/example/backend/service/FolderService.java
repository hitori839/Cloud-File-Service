package com.example.backend.service;

import com.example.backend.dto.CreateFolderRequest;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.RenameRequest;
import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.entity.UserEntity;
import com.example.backend.exception.ResourceNotFoundException;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.FolderRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@Service
@Transactional
public class FolderService {

    static final int MAX_NAME_LENGTH = 255;

    private final FolderRepository folderRepository;
    private final FileRepository fileRepository;
    private final UserService userService;

    public FolderService(
            FolderRepository folderRepository,
            FileRepository fileRepository,
            UserService userService
    ) {
        this.folderRepository = folderRepository;
        this.fileRepository = fileRepository;
        this.userService = userService;
    }

    public FolderResponse createFolder(
            Long userId,
            CreateFolderRequest request
    ) {

        String name = validateName(request.name());

        UserEntity owner = userService.getUser(userId);

        FolderEntity parent = null;

        if (request.parentFolderId() != null) {
            parent = findActiveFolder(
                    userId,
                    request.parentFolderId(),
                    "부모 폴더를 찾을 수 없습니다."
            );
        }

        FolderEntity folder =
                new FolderEntity(
                        name,
                        parent,
                        owner
                );

        folderRepository.save(folder);

        return FolderResponse.from(folder);
    }

    @Transactional(readOnly = true)
    public List<FolderResponse> getFolders(
            Long userId,
            Long parentFolderId
    ) {

        List<FolderEntity> folders;

        if (parentFolderId == null) {
            folders = folderRepository
                    .findByOwner_IdAndParentIsNullAndTrashedFalseOrderByNameAsc(userId);
        } else {
            findActiveFolder(userId, parentFolderId, "폴더를 찾을 수 없습니다.");
            folders = folderRepository
                    .findByOwner_IdAndParent_IdAndTrashedFalseOrderByNameAsc(
                            userId,
                            parentFolderId
                    );
        }

        return folders.stream()
                .map(FolderResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public FolderResponse getFolder(Long userId, Long folderId) {

        return FolderResponse.from(
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.")
        );
    }

    /** 루트 → … → 자기 자신 순서의 경로 (브레드크럼용) */
    @Transactional(readOnly = true)
    public List<FolderResponse> getPath(Long userId, Long folderId) {

        FolderEntity folder =
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");

        List<FolderResponse> path = new ArrayList<>();
        List<Long> visited = new ArrayList<>();

        FolderEntity current = folder;

        while (current != null && !visited.contains(current.getId())) {
            visited.add(current.getId());
            path.addFirst(FolderResponse.from(current));
            current = current.getParent();
        }

        return path;
    }

    @Transactional(readOnly = true)
    public List<FolderResponse> getTree(Long userId) {

        return folderRepository
                .findByOwner_IdAndTrashedFalseOrderByNameAsc(userId)
                .stream()
                .map(FolderResponse::from)
                .toList();
    }

    public FolderResponse renameFolder(
            Long userId,
            Long folderId,
            RenameRequest request
    ) {

        String name = validateName(request == null ? null : request.name());

        FolderEntity folder =
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");

        folder.setName(name);

        return FolderResponse.from(folder);
    }

    public FolderResponse moveFolder(
            Long userId,
            Long folderId,
            Long parentFolderId
    ) {

        FolderEntity folder =
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");

        FolderEntity newParent = null;

        if (parentFolderId != null) {

            newParent = findActiveFolder(
                    userId,
                    parentFolderId,
                    "이동할 폴더를 찾을 수 없습니다."
            );

            // 대상 폴더에서 루트까지 거슬러 올라가며 자기 자신이 나오면 순환
            FolderEntity cursor = newParent;
            List<Long> visited = new ArrayList<>();

            while (cursor != null && !visited.contains(cursor.getId())) {

                if (cursor.getId().equals(folder.getId())) {
                    throw new IllegalArgumentException(
                            "폴더를 자기 자신이나 하위 폴더로 이동할 수 없습니다."
                    );
                }

                visited.add(cursor.getId());
                cursor = cursor.getParent();
            }
        }

        folder.setParent(newParent);

        return FolderResponse.from(folder);
    }

    public FolderResponse setStarred(
            Long userId,
            Long folderId,
            boolean starred
    ) {

        FolderEntity folder =
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");

        folder.setStarred(starred);

        return FolderResponse.from(folder);
    }

    /**
     * 폴더와 모든 하위 항목을 휴지통으로 이동한다.
     * 직접 삭제한 폴더만 trashRoot=true, 하위 항목은 같은 trashedAt 으로 표시된다.
     * 이미 따로 휴지통에 있던 하위 항목은 건드리지 않는다.
     */
    public void deleteFolder(Long userId, Long folderId) {

        FolderEntity folder =
                findActiveFolder(userId, folderId, "폴더를 찾을 수 없습니다.");

        LocalDateTime now = trashTimestamp();

        List<FolderEntity> subtree = subtree(userId, folder);

        for (FolderEntity item : subtree) {

            if (item == folder) {
                item.moveToTrash(now, true);
            } else if (!item.isTrashed()) {
                item.moveToTrash(now, false);
            }
        }

        for (FileEntity file : filesIn(userId, subtree)) {

            if (!file.isTrashed()) {
                file.moveToTrash(now, false);
            }
        }
    }

    // ---- 다른 서비스에서 사용하는 헬퍼 ----

    FolderEntity findOwnedFolder(Long userId, Long folderId, String message) {

        return folderRepository
                .findByIdAndOwner_Id(folderId, userId)
                .orElseThrow(() -> new ResourceNotFoundException(message));
    }

    FolderEntity findActiveFolder(Long userId, Long folderId, String message) {

        FolderEntity folder = findOwnedFolder(userId, folderId, message);

        if (folder.isTrashed()) {
            throw new ResourceNotFoundException(message);
        }

        return folder;
    }

    List<FolderEntity> subtree(Long userId, FolderEntity root) {

        return new FolderTree(folderRepository.findByOwner_Id(userId))
                .subtree(root);
    }

    List<FileEntity> filesIn(Long userId, List<FolderEntity> folders) {

        if (folders.isEmpty()) {
            return List.of();
        }

        return fileRepository.findByOwner_IdAndFolder_IdIn(
                userId,
                folders.stream().map(FolderEntity::getId).toList()
        );
    }

    static LocalDateTime trashTimestamp() {
        // PostgreSQL timestamp 정밀도(마이크로초)에 맞춰 같은 배치 비교가 정확하도록 자른다.
        return LocalDateTime.now().truncatedTo(ChronoUnit.MICROS);
    }

    static String validateName(String raw) {

        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException(
                    "폴더 이름을 입력해야 합니다."
            );
        }

        String name = raw.trim();

        if (name.length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException(
                    "이름은 255자 이하여야 합니다."
            );
        }

        return name;
    }
}
