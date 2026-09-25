package com.example.backend.service;

/** 다운로드/미리보기 응답용 파일 내용 + 메타데이터 */
public record StoredFile(
        String name,
        String contentType,
        byte[] data
) {
}
