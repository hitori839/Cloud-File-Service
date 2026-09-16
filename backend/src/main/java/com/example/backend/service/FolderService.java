package com.example.backend.service;

import com.example.backend.dto.CreateFolderRequest;
import com.example.backend.dto.FolderResponse;
import com.example.backend.dto.RenameRequest;
import com.example.backend.entity.FileEntity;
import com.example.backend.entity.FolderEntity;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.FolderRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional
public class FolderService {

    private final FolderRepository folderRepository;
    private final FileRepository fileRepository;

    public FolderService(
            FolderRepository folderRepository,
            FileRepository fileRepository
    ) {
        this.folderRepository = folderRepository;
        this.fileRepository = fileRepository;
    }

    public FolderResponse createFolder(
            CreateFolderRequest request
    ) {

        if (request.name() == null ||
                request.name().isBlank()) {

            throw new IllegalArgumentException(
                    "폴더 이름을 입력해야 합니다."
            );
        }

        FolderEntity parent = null;

        if (request.parentFolderId() != null) {

            parent = folderRepository
                    .findById(request.parentFolderId())
                    .orElseThrow(() ->
                            new IllegalArgumentException(
                                    "부모 폴더를 찾을 수 없습니다."
                            ));
        }

        FolderEntity folder =
                new FolderEntity(
                        request.name().trim(),
                        parent
                );

        folderRepository.save(folder);

        return FolderResponse.from(folder);
    }

    @Transactional(readOnly = true)
    public List<FolderResponse> getFolders(
            Long parentFolderId
    ) {

        List<FolderEntity> folders;

        if (parentFolderId == null) {
            folders = folderRepository.findByParentIsNull();
        } else {
            folders =
                    folderRepository.findByParent_Id(
                            parentFolderId
                    );
        }

        return folders.stream()
                .map(FolderResponse::from)
                .toList();
    }

    public FolderResponse renameFolder(
            Long folderId,
            RenameRequest request
    ) {

        if (request.name() == null ||
                request.name().isBlank()) {

            throw new IllegalArgumentException(
                    "폴더 이름을 입력해야 합니다."
            );
        }

        FolderEntity folder =
                folderRepository.findById(folderId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "폴더를 찾을 수 없습니다."
                                ));

        folder.setName(request.name().trim());

        return FolderResponse.from(folder);
    }

    public void deleteFolder(Long folderId) {

        FolderEntity folder =
                folderRepository.findById(folderId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "폴더를 찾을 수 없습니다."
                                ));

        List<FileEntity> files =
                fileRepository.findByFolder_Id(folderId);

        List<FolderEntity> children =
                folderRepository.findByParent_Id(folderId);

        if (!files.isEmpty() || !children.isEmpty()) {

            throw new IllegalStateException(
                    "파일 또는 하위 폴더가 있는 폴더는 삭제할 수 없습니다."
            );
        }

        folderRepository.delete(folder);
    }
}