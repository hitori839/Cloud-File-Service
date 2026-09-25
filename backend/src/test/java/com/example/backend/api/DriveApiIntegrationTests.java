package com.example.backend.api;

import com.example.backend.storage.S3StorageService;
import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 로컬 PostgreSQL(application.properties 설정)에 붙어서 실행되는 API 통합 테스트.
 * S3 는 Mock 으로 대체한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class DriveApiIntegrationTests {

    private static final String ADMIN_EMAIL =
            "admin-" + UUID.randomUUID() + "@test.local";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.admin-emails", () -> ADMIN_EMAIL);
        registry.add("app.storage.limit-bytes", () -> "1000");
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private S3StorageService storageService;

    // 테스트가 만든 계정은 끝나고 탈퇴시켜 로컬 DB 를 더럽히지 않는다.
    private final List<String> createdTokens = new ArrayList<>();

    @AfterEach
    void cleanUpUsers() throws Exception {

        for (String token : createdTokens) {
            mockMvc.perform(delete("/api/users/me")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json("{'password':'password123'}"))
                    .header(HttpHeaders.AUTHORIZATION, bearer(token)));
        }
    }

    @Test
    void signupLoginAndMe() throws Exception {

        String email = randomEmail();

        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'  %s ','password':'password123','name':'테스터'}"
                                .formatted(email.toUpperCase()))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.user.email").value(email))
                .andExpect(jsonPath("$.user.role").value("USER"))
                .andExpect(jsonPath("$.user.storageUsed").value(0))
                .andExpect(jsonPath("$.user.storageLimit").value(1000));

        // 중복 가입 → 409
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'%s','password':'password123','name':'x'}".formatted(email))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("이미 가입된 이메일입니다."));

        // 짧은 비밀번호 → 400
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'%s','password':'short','name':'x'}".formatted(randomEmail()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isString());

        // 잘못된 비밀번호 → 401
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'%s','password':'wrong-password'}".formatted(email))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("이메일 또는 비밀번호가 올바르지 않습니다."));

        MvcResult login = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'%s','password':'password123'}".formatted(email))))
                .andExpect(status().isOk())
                .andReturn();

        String token = JsonPath.read(login.getResponse().getContentAsString(), "$.token");
        createdTokens.add(token);

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.name").value("테스터"));
    }

    @Test
    void requestsWithoutValidTokenGet401Json() throws Exception {

        mockMvc.perform(get("/api/files"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE + "-basic"))
                .andExpect(jsonPath("$.message").value("로그인이 필요합니다."));

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("로그인이 필요합니다."));

        mockMvc.perform(get("/health"))
                .andExpect(status().isOk());
    }

    @Test
    void adminEndpointsRequireAdminRole() throws Exception {

        String user = signup(randomEmail());

        mockMvc.perform(get("/api/admin/users").header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("권한이 없습니다."));

        String admin = signup(ADMIN_EMAIL);

        mockMvc.perform(get("/api/admin/users").header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].email", hasItem(ADMIN_EMAIL)));

        long adminId = meId(admin);

        mockMvc.perform(delete("/api/admin/users/" + adminId).header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isBadRequest());

        long userId = meId(user);

        mockMvc.perform(delete("/api/admin/users/" + userId).header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isNoContent());

        // 삭제된 사용자의 토큰 → 401
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void userCannotAccessAnotherUsersFolderOrFile() throws Exception {

        String alice = signup(randomEmail());
        String bob = signup(randomEmail());

        long folderId = createFolder(alice, "앨리스 폴더", null);
        long fileId = upload(alice, "보고서 2026.txt", "hello".getBytes(), folderId);

        when(storageService.download(anyString())).thenReturn("hello".getBytes());

        // 앨리스는 볼 수 있다
        mockMvc.perform(get("/api/files").param("folderId", String.valueOf(folderId))
                        .header(HttpHeaders.AUTHORIZATION, bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].starred").value(false))
                .andExpect(jsonPath("$[0].trashed").value(false));

        mockMvc.perform(get("/api/files/" + fileId + "/download").header(HttpHeaders.AUTHORIZATION, bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("attachment")))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        containsString("filename*=UTF-8''%EB%B3%B4%EA%B3%A0%EC%84%9C%202026.txt")));

        mockMvc.perform(get("/api/files/" + fileId + "/preview").header(HttpHeaders.AUTHORIZATION, bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("text/plain")))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("inline")));

        // 밥은 존재 자체를 알 수 없다 (404)
        mockMvc.perform(get("/api/folders/" + folderId).header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value(containsString("찾을 수 없습니다")));

        mockMvc.perform(get("/api/files").param("folderId", String.valueOf(folderId))
                        .header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/files/" + fileId + "/download").header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/files/" + fileId).header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/folders").header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));

        mockMvc.perform(get("/api/drive/search").param("q", "보고서").header(HttpHeaders.AUTHORIZATION, bearer(bob)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.files", hasSize(0)));

        mockMvc.perform(get("/api/drive/search").param("q", "보고서").header(HttpHeaders.AUTHORIZATION, bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.files", hasSize(1)))
                .andExpect(jsonPath("$.folders", hasSize(0)));
    }

    @Test
    void trashAndRestoreFolderTree() throws Exception {

        String token = signup(randomEmail());

        long parent = createFolder(token, "parent", null);
        long child = createFolder(token, "child", parent);
        long separately = createFolder(token, "separately", parent);
        long fileInChild = upload(token, "a.txt", "abc".getBytes(), child);

        // 하위 폴더를 먼저 따로 삭제
        mockMvc.perform(delete("/api/folders/" + separately).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());

        // 상위 폴더 삭제 → 하위 전체가 휴지통으로
        mockMvc.perform(delete("/api/folders/" + parent).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/folders/" + child).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/drive/trash").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.folders", hasSize(2)))
                .andExpect(jsonPath("$.folders[0].id").value(parent))
                .andExpect(jsonPath("$.folders[0].trashed").value(true))
                .andExpect(jsonPath("$.folders[0].trashedAt").isString())
                .andExpect(jsonPath("$.files", hasSize(0)));

        // 휴지통에 있어도 용량에는 포함
        mockMvc.perform(get("/api/drive/storage").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.used").value(3))
                .andExpect(jsonPath("$.limit").value(1000));

        mockMvc.perform(post("/api/drive/trash/folders/" + parent + "/restore")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trashed").value(false));

        mockMvc.perform(get("/api/folders").param("parentFolderId", String.valueOf(parent))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(child));

        mockMvc.perform(get("/api/files").param("folderId", String.valueOf(child))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$[0].id").value(fileInChild));

        mockMvc.perform(get("/api/folders/" + child + "/path").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$[0].id").value(parent))
                .andExpect(jsonPath("$[1].id").value(child));

        // 따로 삭제했던 폴더는 휴지통에 남아 있다
        mockMvc.perform(get("/api/drive/trash").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.folders", hasSize(1)))
                .andExpect(jsonPath("$.folders[0].id").value(separately));

        // 자기 하위로 이동 불가
        mockMvc.perform(patch("/api/folders/" + parent + "/move").param("parentFolderId", String.valueOf(child))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("폴더를 자기 자신이나 하위 폴더로 이동할 수 없습니다."));

        // 파일 삭제 후 영구 삭제 → S3 삭제 호출
        mockMvc.perform(delete("/api/files/" + fileInChild).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());

        mockMvc.perform(delete("/api/drive/trash").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());

        verify(storageService).deleteAll(argThat((Collection<String> keys) ->
                keys.size() == 1 && keys.iterator().next().startsWith("users/")));

        mockMvc.perform(get("/api/drive/trash").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.folders", hasSize(0)))
                .andExpect(jsonPath("$.files", hasSize(0)));

        mockMvc.perform(get("/api/drive/storage").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.used").value(0));
    }

    @Test
    void starRecentAndQuota() throws Exception {

        String token = signup(randomEmail());

        long fileId = upload(token, "star.txt", "12345".getBytes(), null);

        mockMvc.perform(patch("/api/files/" + fileId + "/star").param("starred", "true")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.starred").value(true));

        mockMvc.perform(get("/api/drive/starred").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.files[0].id").value(fileId));

        mockMvc.perform(get("/api/drive/recent").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$[0].id").value(fileId));

        // 제한(1000바이트) 초과 → 413
        mockMvc.perform(multipart("/api/files")
                        .file(new MockMultipartFile("file", "big.bin", "application/octet-stream", new byte[996]))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isContentTooLarge())
                .andExpect(jsonPath("$.message").value("저장 공간이 부족합니다."));

        mockMvc.perform(get("/api/drive/search").param("q", " ")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.files", hasSize(0)))
                .andExpect(jsonPath("$.folders", hasSize(0)));

        mockMvc.perform(delete("/api/users/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'password':'wrong-password'}"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest());

        mockMvc.perform(delete("/api/users/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'password':'password123'}"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message", not(containsString("Exception"))));
    }

    // ---- helpers ----

    private String signup(String email) throws Exception {

        MvcResult result = mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'email':'%s','password':'password123','name':'user'}".formatted(email))))
                .andExpect(status().isCreated())
                .andReturn();

        String token = JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.token");
        createdTokens.add(token);

        return token;
    }

    private long meId(String token) throws Exception {

        MvcResult result = mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn();

        return ((Number) JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.id"))
                .longValue();
    }

    private long createFolder(String token, String name, Long parentId) throws Exception {

        String body = "{\"name\":\"" + name + "\",\"parentFolderId\":" + parentId + "}";

        MvcResult result = mockMvc.perform(post("/api/folders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isCreated())
                .andReturn();

        return ((Number) JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.id"))
                .longValue();
    }

    private long upload(String token, String name, byte[] content, Long folderId) throws Exception {

        var request = multipart("/api/files")
                .file(new MockMultipartFile("file", name, "text/plain", content))
                .header(HttpHeaders.AUTHORIZATION, bearer(token));

        if (folderId != null) {
            request.param("folderId", String.valueOf(folderId));
        }

        MvcResult result = mockMvc.perform(request)
                .andExpect(status().isCreated())
                .andReturn();

        String json = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat((String) JsonPath.read(json, "$.name")).isEqualTo(name);

        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private static String randomEmail() {
        return "user-" + UUID.randomUUID() + "@test.local";
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    private static String json(String singleQuoted) {
        return singleQuoted.replace('\'', '"');
    }
}
