package com.example.backend.repository;

import com.example.backend.domain.FileMetadata;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Repository
public class InMemoryFileMetadataRepository
        implements FileMetadataRepository {

    private final ConcurrentHashMap<Long, FileMetadata> store =
            new ConcurrentHashMap<>();

    private final AtomicLong sequence =
            new AtomicLong(0);

    @Override
    public FileMetadata save(FileMetadata file) {

        Long id = file.id();

        if (id == null) {
            id = sequence.incrementAndGet();

            file = new FileMetadata(
                    id,
                    file.fileName(),
                    file.contentType(),
                    file.size(),
                    file.objectKey(),
                    file.status(),
                    file.createdAt()
            );
        }

        store.put(id, file);

        return file;
    }

    @Override
    public Optional<FileMetadata> findById(Long id) {
        return Optional.ofNullable(
                store.get(id)
        );
    }

    @Override
    public List<FileMetadata> findAll() {
        return new ArrayList<>(store.values())
                .stream()
                .sorted(
                        Comparator.comparing(
                                FileMetadata::id
                        )
                )
                .toList();
    }

    @Override
    public boolean deleteById(Long id) {
        return store.remove(id) != null;
    }
}