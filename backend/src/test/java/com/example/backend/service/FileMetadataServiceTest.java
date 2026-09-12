package com.example.backend.service;

import com.example.backend.dto.CreateFileRequest;
import com.example.backend.exception.FileNotFoundException;
import com.example.backend.repository.InMemoryFileMetadataRepository;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileMetadataServiceTest {

    @Test
    void createFile() {

        var repository =
                new InMemoryFileMetadataRepository();

        var service =
                new FileMetadataService(repository);

        var request =
                new CreateFileRequest(
                        "hello.txt",
                        "text/plain",
                        13
                );

        var result =
                service.create(request);

        assertThat(result.id()).isNotNull();
        assertThat(result.fileName())
                .isEqualTo("hello.txt");
        assertThat(result.objectKey())
                .startsWith("files/");
    }

    @Test
    void missingFileThrowsException() {

        var repository =
                new InMemoryFileMetadataRepository();

        var service =
                new FileMetadataService(repository);

        assertThatThrownBy(
                () -> service.findById(999L)
        )
        .isInstanceOf(FileNotFoundException.class);
    }
}