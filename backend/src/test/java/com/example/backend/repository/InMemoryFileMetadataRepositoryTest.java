package com.example.backend.repository;

import com.example.backend.domain.FileMetadata;
import com.example.backend.domain.FileStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class InMemoryFileMetadataRepositoryTest {

    @Test
    void saveAndFindById() {

        InMemoryFileMetadataRepository repository =
                new InMemoryFileMetadataRepository();

        FileMetadata file =
                new FileMetadata(
                        null,
                        "hello.txt",
                        "text/plain",
                        13,
                        null,
                        FileStatus.REGISTERED,
                        Instant.now()
                );

        FileMetadata saved =
                repository.save(file);

        assertThat(saved.id()).isNotNull();

        var result =
                repository.findById(saved.id());

        assertThat(result).isPresent();
        assertThat(result.get().fileName())
                .isEqualTo("hello.txt");
    }
}