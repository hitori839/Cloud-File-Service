package com.example.backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log =
            LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(
            FileNotFoundException.class
    )
    public ResponseEntity<Map<String, String>>
    handleFileNotFound(
            FileNotFoundException exception
    ) {
        return message(HttpStatus.NOT_FOUND, exception.getMessage());
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, String>>
    handleNotFound(
            ResourceNotFoundException exception
    ) {
        return message(HttpStatus.NOT_FOUND, exception.getMessage());
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<Map<String, String>>
    handleUnauthorized(
            UnauthorizedException exception
    ) {
        return message(HttpStatus.UNAUTHORIZED, exception.getMessage());
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<Map<String, String>>
    handleConflictException(
            ConflictException exception
    ) {
        return message(HttpStatus.CONFLICT, exception.getMessage());
    }

    @ExceptionHandler(QuotaExceededException.class)
    public ResponseEntity<Map<String, String>>
    handleQuotaExceeded(
            QuotaExceededException exception
    ) {
        return message(HttpStatus.CONTENT_TOO_LARGE, exception.getMessage());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>>
    handleMaxUploadSize(
            MaxUploadSizeExceededException exception
    ) {
        return message(HttpStatus.CONTENT_TOO_LARGE, "파일 크기는 50MB를 초과할 수 없습니다.");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>>
    handleValidation(
            MethodArgumentNotValidException exception
    ) {
        FieldError fieldError = exception.getBindingResult().getFieldError();

        String text = fieldError != null && fieldError.getDefaultMessage() != null
                ? fieldError.getDefaultMessage()
                : "요청 값이 올바르지 않습니다.";

        return message(HttpStatus.BAD_REQUEST, text);
    }

    @ExceptionHandler({
            MissingServletRequestParameterException.class,
            MissingServletRequestPartException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class
    })
    public ResponseEntity<Map<String, String>>
    handleMalformedRequest(
            Exception exception
    ) {
        return message(HttpStatus.BAD_REQUEST, "요청 형식이 올바르지 않습니다.");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>>
    handleBadRequest(
            IllegalArgumentException exception
    ) {
        return message(HttpStatus.BAD_REQUEST, exception.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>>
    handleConflict(
            IllegalStateException exception
    ) {
        return message(HttpStatus.CONFLICT, exception.getMessage());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>>
    handleDataIntegrity(
            DataIntegrityViolationException exception
    ) {
        log.warn("데이터 무결성 오류: {}", exception.getMostSpecificCause().getMessage());
        return message(HttpStatus.CONFLICT, "요청이 기존 데이터와 충돌합니다.");
    }

    @ExceptionHandler(NoSuchKeyException.class)
    public ResponseEntity<Map<String, String>>
    handleNoSuchKey(
            NoSuchKeyException exception
    ) {
        return message(HttpStatus.NOT_FOUND, "저장소에서 파일 데이터를 찾을 수 없습니다.");
    }

    @ExceptionHandler(SdkException.class)
    public ResponseEntity<Map<String, String>>
    handleStorageError(
            SdkException exception
    ) {
        log.error("S3 처리 오류", exception);
        return message(HttpStatus.BAD_GATEWAY, "파일 저장소 처리 중 오류가 발생했습니다.");
    }

    private static ResponseEntity<Map<String, String>> message(
            HttpStatus status,
            String message
    ) {
        return ResponseEntity
                .status(status)
                .body(
                        Map.of(
                                "message",
                                message == null ? status.getReasonPhrase() : message
                        )
                );
    }
}
