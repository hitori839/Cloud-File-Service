package com.example.backend.service;

import com.example.backend.dto.AdminUserResponse;
import com.example.backend.exception.ResourceNotFoundException;
import com.example.backend.repository.FileRepository;
import com.example.backend.repository.UserRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Transactional
public class AdminService {

    private final UserRepository userRepository;
    private final FileRepository fileRepository;
    private final UserService userService;

    public AdminService(
            UserRepository userRepository,
            FileRepository fileRepository,
            UserService userService
    ) {
        this.userRepository = userRepository;
        this.fileRepository = fileRepository;
        this.userService = userService;
    }

    @Transactional(readOnly = true)
    public List<AdminUserResponse> getUsers() {

        Map<Long, long[]> summary = new HashMap<>();

        for (Object[] row : fileRepository.summarizeByOwner()) {
            summary.put(
                    ((Number) row[0]).longValue(),
                    new long[]{((Number) row[1]).longValue(), ((Number) row[2]).longValue()}
            );
        }

        return userRepository.findAllByOrderByCreatedAtAsc()
                .stream()
                .map(user -> {
                    long[] stats = summary.getOrDefault(user.getId(), new long[]{0, 0});
                    return new AdminUserResponse(
                            user.getId(),
                            user.getEmail(),
                            user.getName(),
                            user.getRole(),
                            stats[0],
                            stats[1],
                            user.getCreatedAt()
                    );
                })
                .toList();
    }

    public void deleteUser(Long adminId, Long targetUserId) {

        if (adminId.equals(targetUserId)) {
            throw new IllegalArgumentException("자기 자신은 삭제할 수 없습니다.");
        }

        if (!userRepository.existsById(targetUserId)) {
            throw new ResourceNotFoundException("사용자를 찾을 수 없습니다.");
        }

        userService.deleteUserAndData(targetUserId);
    }
}
