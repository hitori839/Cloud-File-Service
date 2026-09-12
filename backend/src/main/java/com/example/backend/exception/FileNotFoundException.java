package com.example.backend.exception;

public class FileNotFoundException
        extends RuntimeException {

    public FileNotFoundException(Long id) {
        super("File not found: " + id);
    }
}