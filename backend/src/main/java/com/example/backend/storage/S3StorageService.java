package com.example.backend.storage;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsResponse;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class S3StorageService {

    private static final Logger log =
            LoggerFactory.getLogger(S3StorageService.class);

    // S3 DeleteObjects 한 번에 최대 1000개
    private static final int DELETE_BATCH_SIZE = 1000;

    private final S3Client s3Client;
    private final String bucket;

    public S3StorageService(
            S3Client s3Client,
            @Value("${aws.s3.bucket}") String bucket
    ) {
        this.s3Client = s3Client;
        this.bucket = bucket;
    }

    public String upload(String key, MultipartFile file) throws IOException {

        // fromInputStream 은 SDK 재시도 시 mark/reset 오류가 날 수 있어
        // 재시도 가능한 byte[] 기반 RequestBody 를 사용한다. (최대 50MB)
        byte[] bytes = file.getBytes();

        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(
                        file.getContentType() != null
                                ? file.getContentType()
                                : "application/octet-stream"
                )
                .contentLength((long) bytes.length)
                .build();

        s3Client.putObject(
                request,
                RequestBody.fromBytes(bytes)
        );

        return key;
    }

    public byte[] download(String key) {

        GetObjectRequest request = GetObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .build();

        ResponseBytes<GetObjectResponse> response =
                s3Client.getObjectAsBytes(request);

        return response.asByteArray();
    }

    public void delete(String key) {

        DeleteObjectRequest request = DeleteObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .build();

        s3Client.deleteObject(request);
    }

    /**
     * 여러 객체를 삭제한다. 존재하지 않는 객체나 S3 오류는 로그만 남기고 무시한다.
     * (DB 정리가 S3 오류 때문에 실패하지 않도록)
     */
    public void deleteAll(Collection<String> keys) {

        if (keys == null || keys.isEmpty()) {
            return;
        }

        List<String> keyList = new ArrayList<>(keys);

        for (int start = 0; start < keyList.size(); start += DELETE_BATCH_SIZE) {

            List<ObjectIdentifier> objects = keyList
                    .subList(start, Math.min(start + DELETE_BATCH_SIZE, keyList.size()))
                    .stream()
                    .map(key -> ObjectIdentifier.builder().key(key).build())
                    .toList();

            try {
                DeleteObjectsResponse response = s3Client.deleteObjects(
                        DeleteObjectsRequest.builder()
                                .bucket(bucket)
                                .delete(Delete.builder()
                                        .objects(objects)
                                        .quiet(true)
                                        .build())
                                .build()
                );

                if (response != null && response.hasErrors()) {
                    response.errors().forEach(error -> log.warn(
                            "S3 객체 삭제 실패 key={} code={} message={}",
                            error.key(), error.code(), error.message()));
                }
            } catch (RuntimeException e) {
                log.warn("S3 객체 일괄 삭제 실패 ({}개): {}", objects.size(), e.getMessage());
            }
        }
    }

    public boolean exists(String key) {

        try {

            HeadObjectRequest request = HeadObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .build();

            s3Client.headObject(request);

            return true;

        } catch (Exception e) {

            return false;
        }
    }
}
