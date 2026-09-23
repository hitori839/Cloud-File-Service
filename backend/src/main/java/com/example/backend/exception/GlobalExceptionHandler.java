package com.example.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(
            FileNotFoundException.class
    )
    public ResponseEntity<Map<String, String>>
    handleFileNotFound(
            FileNotFoundException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(
                        Map.of(
                                "message",
                                exception.getMessage()
                        )
                );
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>>
    handleBadRequest(
            IllegalArgumentException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(
                        Map.of(
                                "message",
                                exception.getMessage()
                        )
                );
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>>
    handleConflict(
            IllegalStateException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(
                        Map.of(
                                "message",
                                exception.getMessage()
                        )
                );
    }
}