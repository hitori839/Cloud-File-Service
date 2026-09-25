package com.example.backend.service;

import com.example.backend.entity.FolderEntity;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 한 사용자의 전체 폴더 목록으로 부모→자식 관계를 만들어
 * 하위 트리(자기 자신 포함)를 계산하는 헬퍼.
 */
final class FolderTree {

    private final Map<Long, List<FolderEntity>> children = new HashMap<>();

    FolderTree(Collection<FolderEntity> allFoldersOfOwner) {

        for (FolderEntity folder : allFoldersOfOwner) {

            if (folder.getParent() != null) {
                children
                        .computeIfAbsent(folder.getParent().getId(), k -> new ArrayList<>())
                        .add(folder);
            }
        }
    }

    /** root 를 포함한 모든 하위 폴더 (BFS 순서) */
    List<FolderEntity> subtree(FolderEntity root) {

        Set<Long> visited = new LinkedHashSet<>();
        List<FolderEntity> result = new ArrayList<>();
        Deque<FolderEntity> queue = new ArrayDeque<>();
        queue.add(root);

        while (!queue.isEmpty()) {

            FolderEntity current = queue.poll();

            if (!visited.add(current.getId())) {
                continue;
            }

            result.add(current);
            queue.addAll(children.getOrDefault(current.getId(), List.of()));
        }

        return result;
    }
}
