# Cloud File Service --- Day 6

## Day 5 완료 상태에서 Google Drive 스타일 Frontend 만들기

### GitHub Codespaces + VS Code 초보자용 실전 가이드

> **출발점:** Day 3.5의 실제 파일 시스템(PostgreSQL/RDS = Metadata, S3 =
> 실제 파일), Day 4의 Docker/ECR/ECS Fargate, Day 5의
> Terraform(VPC/Subnet/SG/S3/ECR/IAM/RDS/ECS/CloudWatch)을 그대로
> 유지한다.
>
> Day 5 문서에는 Frontend 프레임워크가 특정되어 있지 않으므로 Day
> 6에서는 **Vite + React**를 구현 선택으로 사용한다. 기존 Backend API
> 경로는 임의로 확정하지 않고 실제 Controller를 먼저 확인한다.

> **현재 구현 기준:** frontend는 이미 `frontend/`에 구현되어 있으며 Vite 개발 서버, React 컴포넌트, `MoveModal`을 포함한 파일 이동 기능이 존재한다. API 경로와 응답 필드는 현재 backend Controller와 루트 `README.md`를 기준으로 한다. 새 Vite 프로젝트 생성 절차는 학습 기록으로만 참고한다.

> **개인정보 보호:** frontend 문서에는 AWS credential, DB 비밀번호, 사용자 이메일, 개인 파일명 또는 계정 식별자를 넣지 않는다. `VITE_API_TARGET` 같은 설정 이름만 설명하고 실제 secret은 브라우저에 전달하지 않는다.

------------------------------------------------------------------------

# 0. Day 6 최종 목표

브라우저에서 다음이 가능하도록 만든다.

``` text
┌─────────────────────────────────────────────────────────┐
│ ☁ Cloud File Service                         ↻  ⚙       │
├──────────────┬──────────────────────────────────────────┤
│ 📁 내 드라이브 │ 내 드라이브 / 문서                       │
│ ⭐ 즐겨찾기   │                                          │
│ 🗑 휴지통     │ [+ 새 폴더] [파일 업로드]                 │
│              │                                          │
│              │ 📁 문서                                  │
│              │ 📁 사진                                  │
│              │ 📄 README.md                             │
│              │ 📄 report.pdf                            │
└──────────────┴──────────────────────────────────────────┘
```

필수:

``` text
[ ] Frontend 실행
[ ] Backend API 연결
[ ] 폴더 목록
[ ] 폴더 생성
[ ] 폴더 열기
[ ] Breadcrumb
[ ] 파일 목록
[ ] 파일 업로드
[ ] 파일 다운로드
[ ] 파일 삭제
[ ] Loading
[ ] Error
[ ] Production Build
[ ] Frontend Docker Build
```

가능하면:

``` text
[ ] 이름 변경
[ ] 이동
[ ] 검색
[ ] Drag & Drop
```

------------------------------------------------------------------------

# 1. Day 5 → Day 6 구조

Day 5:

``` text
Terraform
   |
   +-- VPC
   +-- IAM
   +-- S3
   +-- RDS
   +-- ECR
   +-- ECS
   +-- CloudWatch
```

Day 6:

``` text
Browser
   |
   v
React Frontend
   |
   | HTTP
   v
Spring Boot / ECS
   |
   +--------+--------+
   v                 v
 RDS                S3
Metadata          Actual Files
```

Frontend는 DB나 S3에 직접 접근하지 않는다.

------------------------------------------------------------------------

# 2. 기존 Backend를 다시 만들지 않는다

다음은 그대로 유지한다.

``` text
FileEntity
FolderEntity
FileService
FolderService
FileController
FolderController
S3StorageService
```

또한 Day 5의:

``` text
infra/terraform/
```

도 유지한다.

Day 6의 주된 변경은:

``` text
frontend/
```

이다.

Backend는 **CORS가 없을 때만 최소 수정**한다.

------------------------------------------------------------------------

# 3. Day 5 상태 저장

프로젝트 루트:

``` bash
git status
```

문제가 없다면:

``` bash
git add .
git commit -m "checkpoint before day6 frontend"
git push
```

------------------------------------------------------------------------

# 4. Backend Controller의 실제 API부터 확인

프로젝트 루트:

``` bash
grep -Rni "@RequestMapping" backend/src/main/java
```

``` bash
grep -Rni "@GetMapping" backend/src/main/java
```

``` bash
grep -Rni "@PostMapping" backend/src/main/java
```

``` bash
grep -Rni "@PutMapping" backend/src/main/java
```

``` bash
grep -Rni "@PatchMapping" backend/src/main/java
```

``` bash
grep -Rni "@DeleteMapping" backend/src/main/java
```

파일 Controller:

``` bash
grep -Rni "class FileController" backend/src/main/java
```

폴더 Controller:

``` bash
grep -Rni "class FolderController" backend/src/main/java
```

------------------------------------------------------------------------

# 5. API 표 작성

터미널 결과를 보고 실제 값을 적어 둔다.

``` text
기능                 실제 경로             Method
---------------------------------------------------
파일 목록             __________             GET
파일 업로드           __________             POST
파일 다운로드         __________             GET
파일 삭제             __________             DELETE
파일 이름 변경        __________             PUT/PATCH
파일 이동             __________             PUT/PATCH
폴더 목록             __________             GET
폴더 생성             __________             POST
폴더 이름 변경        __________             PUT/PATCH
폴더 이동             __________             PUT/PATCH
폴더 삭제             __________             DELETE
```

> Day 4 문서에서 `/api/files`는 예시로 사용된 적이 있으므로 현재
> 프로젝트의 실제 Controller Mapping을 우선한다.

현재 저장소(`FileController`, `FolderController`) 기준으로 채우면 다음과 같다.

``` text
기능                 실제 경로                                   Method
-----------------------------------------------------------------------------
파일 목록             /api/files?folderId={id} (root는 생략)       GET
파일 업로드           /api/files (multipart: file, folderId 선택)  POST
파일 다운로드         /api/files/{id}/download                     GET
파일 삭제             /api/files/{id}                              DELETE
파일 이름 변경        /api/files/{id}/rename?name={name}           PATCH
파일 이동             /api/files/{id}/move?folderId={id}           PATCH  (root는 folderId 생략)
폴더 목록             /api/folders?parentFolderId={id}             GET    (root는 생략)
폴더 생성             /api/folders  JSON {name, parentFolderId}    POST
폴더 이름 변경        /api/folders/{id}  JSON {name}               PATCH
폴더 이동             (없음)                                        -
폴더 삭제             /api/folders/{id}                            DELETE
```

> 파일은 `folderId`, 폴더는 `parentFolderId`를 사용한다. 이름이 다르므로
> 헷갈리지 않는다. 폴더 이동 API는 현재 Backend에 없으므로 Frontend도
> 파일 이동만 구현한다.

------------------------------------------------------------------------

# 6. Backend 응답 JSON 확인

GET API를 실제로 호출한다. (Backend가 실행 중이어야 한다. 실행 방법은
35절 참고. Codespace 터미널의 `curl`은 Codespace 내부에서 실행되므로
`localhost:8080`이 그대로 동작한다.)

예:

``` bash
curl -i http://localhost:8080/실제-파일-목록-경로
```

응답이:

``` json
[
  {
    "id": 1,
    "name": "README.md",
    "size": 1024
  }
]
```

라면 Frontend도 `id`, `name`, `size`를 사용한다.

Backend가:

``` json
{
  "fileName": "README.md"
}
```

라면 Frontend도 `file.fileName`을 사용한다.

**JSON 필드 이름을 추측하지 않는다.**

현재 저장소의 실제 응답 필드(`dto/FileResponse.java`, `dto/FolderResponse.java`):

``` bash
curl -i http://localhost:8080/api/files
curl -i http://localhost:8080/api/folders
```

``` text
파일: id, name, originalName, size, contentType, folderId, createdAt, updatedAt
폴더: id, name, parentFolderId, createdAt, updatedAt
```

따라서 이 문서의 Frontend 코드는 `file.name`, `file.size`,
`file.contentType`, `folder.name`을 사용한다.

------------------------------------------------------------------------

# 7. Frontend 생성

프로젝트 루트:

``` bash
mkdir frontend
cd frontend
```

> 이미 `frontend/`가 있는 저장소(현재 저장소)라면 이 절은 건너뛰고
> `cd frontend && npm install`만 실행한다.

Vite React 생성:

``` bash
npm create vite@latest . -- --template react
```

> 질문이 나오면 Framework `React`, Variant `JavaScript`를 선택한다.
> 현재 저장소는 React 19 + Vite 8 템플릿으로 생성되었다. 추가 npm 패키지는
> 필요 없다(`fetch`, React Hook만 사용).

설치:

``` bash
npm install
```

Node 확인:

``` bash
node --version
npm --version
```

------------------------------------------------------------------------

# 8. 첫 실행

``` bash
npm run dev -- --host 0.0.0.0
```

보통:

``` text
http://localhost:5173
```

Codespaces에서는 VS Code Ports에서 5173을 확인한다.

------------------------------------------------------------------------

# 9. 최종 Frontend 구조

``` text
frontend/
├── src/
│   ├── api/
│   │   ├── client.js
│   │   ├── fileApi.js
│   │   └── folderApi.js
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── Sidebar.jsx
│   │   ├── Breadcrumb.jsx
│   │   ├── Toolbar.jsx
│   │   ├── FileRow.jsx
│   │   ├── FolderRow.jsx
│   │   ├── Loading.jsx
│   │   ├── ErrorMessage.jsx
│   │   ├── CreateFolderModal.jsx
│   │   ├── RenameModal.jsx
│   │   └── MoveModal.jsx
│   ├── hooks/
│   │   └── useDrive.js
│   ├── utils/
│   │   └── format.js
│   ├── App.jsx
│   ├── App.css
│   ├── index.css
│   └── main.jsx
├── .env.example
├── .env.local
├── .gitignore
├── .dockerignore
├── Dockerfile
├── package.json
└── vite.config.js
```

> `.env.local`은 Git에 올리지 않는 개인 설정 파일이다(11절).
> 업로드는 별도 `UploadArea` 없이 `Toolbar`의 파일 선택 버튼으로 처리한다.

폴더를 먼저 만든다(`frontend/`에서):

``` bash
mkdir -p src/api src/components src/hooks src/utils
```

------------------------------------------------------------------------

# 10. 환경변수

파일 생성:

``` text
frontend/.env.example
```

``` env
VITE_API_BASE_URL=
VITE_API_TARGET=http://localhost:8080
```

실제 개발 파일(`cp .env.example .env.local`로 만든다):

``` text
frontend/.env.local
```

**Codespaces에서는 Vite Proxy 방식(34절)을 사용한다.** 현재 Backend에는
CORS 설정이 없고, Codespaces 브라우저의 `localhost:8080`은 내 PC를
가리키므로 `VITE_API_BASE_URL=http://localhost:8080`으로 두면 목록 요청이
`Failed to fetch`/CORS 오류로 실패한다. 현재 저장소의 `.env.local`도 다음
형태다.

로컬 Backend라면:

``` env
VITE_API_BASE_URL=
VITE_API_TARGET=http://localhost:8080
```

ECS를 직접 테스트한다면 임시로:

``` env
VITE_API_BASE_URL=
VITE_API_TARGET=http://PUBLIC_IP:8080
```

- `VITE_API_BASE_URL=` (빈 값) → 브라우저는 `/api/...` 상대 경로로 요청한다.
- `VITE_API_TARGET` → Vite 개발 서버가 `/api` 요청을 전달할 Backend 주소
  (`vite.config.js`에서만 사용, 브라우저 번들에는 들어가지 않는다).

> ECS Task Public IP는 교체될 수 있으므로 영구적인 Frontend 주소로
> 사용하지 않는다. `.env.local`을 바꾼 뒤에는 `npm run dev`를 다시
> 시작해야 반영된다.

------------------------------------------------------------------------

# 11. `.gitignore`

`frontend/.gitignore`를 확인하고 추가:

``` gitignore
node_modules/
dist/
.env
.env.local
```

> Vite 템플릿의 `.gitignore`에는 이미 `node_modules`, `dist`, `*.local`이
> 있으므로 위 내용은 명시적으로 한 번 더 적는 것이다(현재 저장소와 동일).

`.env.example`은 Commit한다.

------------------------------------------------------------------------

# 12. API Client

파일:

``` text
frontend/src/api/client.js
```

``` javascript
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "";

export async function request(path, options = {}) {
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    options
  );

  if (!response.ok) {
    let message = `HTTP ${response.status}`;

    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // JSON이 아닌 응답이면 기본 메시지를 사용한다.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType =
    response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response;
}

export { API_BASE_URL };
```

------------------------------------------------------------------------

# 13. File API

파일:

``` text
frontend/src/api/fileApi.js
```

현재 저장소 기준 최종 형태(다운로드/이름 변경/이동 포함):

``` javascript
import { request } from "./client";

export function getFiles(folderId) {
  const query = new URLSearchParams();

  if (folderId !== null && folderId !== undefined) {
    query.set("folderId", folderId);
  }

  const suffix = query.toString()
    ? `?${query.toString()}`
    : "";

  return request(`/api/files${suffix}`);
}

export function uploadFile(file, folderId) {
  const formData = new FormData();

  formData.append("file", file);

  if (folderId !== null && folderId !== undefined) {
    formData.append("folderId", folderId);
  }

  return request("/api/files", {
    method: "POST",
    body: formData,
  });
}

export function deleteFile(id) {
  return request(`/api/files/${id}`, {
    method: "DELETE",
  });
}

export function downloadFile(id) {
  return request(`/api/files/${id}/download`);
}

export function renameFile(id, name) {
  const query = new URLSearchParams({ name });

  return request(`/api/files/${id}/rename?${query.toString()}`, {
    method: "PATCH",
  });
}

export function moveFile(id, folderId) {
  const query = new URLSearchParams();

  if (folderId !== null && folderId !== undefined) {
    query.set("folderId", folderId);
  }

  const suffix = query.toString()
    ? `?${query.toString()}`
    : "";

  return request(`/api/files/${id}/move${suffix}`, {
    method: "PATCH",
  });
}
```

> **반드시 실제 Controller에 맞춰 수정:** `/api/files`, `folderId`,
> `id`가 실제 프로젝트와 다르면 여기만 먼저 수정한다.
>
> - 업로드 시 `Content-Type`을 직접 지정하지 않는다. `FormData`를 넣으면
>   브라우저가 `multipart/form-data; boundary=...`를 자동으로 붙인다.
> - `renameFile`은 JSON Body가 아니라 **Query Parameter** `name`을 사용한다
>   (`@RequestParam String name`).
> - `downloadFile`은 JSON이 아닌 응답이므로 `request()`가 `Response` 객체를
>   그대로 돌려준다(43절에서 `blob()`으로 변환).

------------------------------------------------------------------------

# 14. Folder API

파일:

``` text
frontend/src/api/folderApi.js
```

``` javascript
import { request } from "./client";

export function getFolders(parentFolderId) {
  const query = new URLSearchParams();

  if (
    parentFolderId !== null &&
    parentFolderId !== undefined
  ) {
    query.set("parentFolderId", parentFolderId);
  }

  const suffix = query.toString()
    ? `?${query.toString()}`
    : "";

  return request(`/api/folders${suffix}`);
}

export function createFolder(name, parentId) {
  return request("/api/folders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      parentFolderId: parentId,
    }),
  });
}

export function renameFolder(id, name) {
  return request(`/api/folders/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
}

export function deleteFolder(id) {
  return request(`/api/folders/${id}`, {
    method: "DELETE",
  });
}
```

실제 `FolderController`의 DTO와 Mapping에 맞춘다.

> `CreateFolderRequest`의 필드는 `name`, `parentFolderId`이다. `parentId`로
> 보내면 Backend가 무시하여 **하위 폴더가 항상 root에 생성**된다. 목록 조회도
> `?parentFolderId=`를 사용해야 한다(`?folderId=`로 보내면 항상 root 폴더
> 목록이 나온다).

------------------------------------------------------------------------

# 15. 왜 API 파일을 분리하는가?

화면 코드 안에:

``` javascript
fetch(...)
fetch(...)
fetch(...)
```

를 계속 쓰지 않는다.

구조:

``` text
App
 |
 +-- fileApi.js
 |
 +-- folderApi.js
 |
 v
Backend
```

API 변경이 생겨도 API 파일에서 수정하기 쉽다.

------------------------------------------------------------------------

# 16. Header

파일:

``` text
frontend/src/components/Header.jsx
```

``` jsx
function Header({ onRefresh }) {
  return (
    <header className="header">
      <div className="brand">
        <span>☁</span>
        <strong>Cloud File Service</strong>
      </div>

      <div className="header-actions">
        <button onClick={onRefresh}>↻</button>
        <button>⚙</button>
      </div>
    </header>
  );
}

export default Header;
```

------------------------------------------------------------------------

# 17. Sidebar

파일:

``` text
frontend/src/components/Sidebar.jsx
```

``` jsx
function Sidebar({
  currentSection,
  onSectionChange,
}) {
  return (
    <aside className="sidebar">
      <button
        className={
          currentSection === "drive"
            ? "side-item active"
            : "side-item"
        }
        onClick={() => onSectionChange("drive")}
      >
        📁 내 드라이브
      </button>

      <button
        className={
          currentSection === "starred"
            ? "side-item active"
            : "side-item"
        }
        onClick={() => onSectionChange("starred")}
      >
        ⭐ 즐겨찾기
      </button>

      <button
        className={
          currentSection === "trash"
            ? "side-item active"
            : "side-item"
        }
        onClick={() => onSectionChange("trash")}
      >
        🗑 휴지통
      </button>
    </aside>
  );
}

export default Sidebar;
```

> 즐겨찾기/휴지통 Backend 기능이 없다면 이 단계에서는 UI만 준비된
> 상태다.

------------------------------------------------------------------------

# 18. Breadcrumb

파일:

``` text
frontend/src/components/Breadcrumb.jsx
```

``` jsx
function Breadcrumb({
  folders,
  onFolderClick,
}) {
  return (
    <div className="breadcrumb">
      <button
        onClick={() => onFolderClick(null)}
      >
        내 드라이브
      </button>

      {folders.map((folder) => (
        <span key={folder.id}>
          {" / "}
          <button
            onClick={() =>
              onFolderClick(folder.id)
            }
          >
            {folder.name}
          </button>
        </span>
      ))}
    </div>
  );
}

export default Breadcrumb;
```

------------------------------------------------------------------------

# 19. Toolbar

파일:

``` text
frontend/src/components/Toolbar.jsx
```

``` jsx
function Toolbar({
  onCreateFolder,
  onUpload,
  uploading,
}) {
  return (
    <div className="toolbar">
      <button
        className="primary-button"
        onClick={onCreateFolder}
      >
        + 새 폴더
      </button>

      <label
        className={`secondary-button${
          uploading ? " is-uploading" : ""
        }`}
      >
        {uploading
          ? "업로드 중..."
          : "파일 업로드"}

        <input
          hidden
          type="file"
          disabled={uploading}
          onChange={(event) => {
            const file =
              event.target.files?.[0];

            if (file) {
              onUpload(file);
            }

            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

export default Toolbar;
```

------------------------------------------------------------------------

# 20. FileRow

파일:

``` text
frontend/src/components/FileRow.jsx
```

``` jsx
import {
  formatFileSize,
  formatDate,
} from "../utils/format";

function FileRow({
  file,
  onDownload,
  onRename,
  onMove,
  onDelete,
}) {
  return (
    <div className="file-row">
      <div>📄 {file.name}</div>
      <div>{file.contentType || "-"}</div>
      <div>{formatFileSize(file.size)}</div>
      <div>
        {formatDate(
          file.updatedAt || file.createdAt
        )}
      </div>

      <div className="row-actions">
        <button onClick={() => onDownload(file)}>
          다운로드
        </button>

        <button onClick={() => onRename(file)}>
          이름 변경
        </button>

        <button onClick={() => onMove(file)}>
          이동
        </button>

        <button onClick={() => onDelete(file)}>
          삭제
        </button>
      </div>
    </div>
  );
}

export default FileRow;
```

실제 DTO가 `fileName`이면 `file.name`을 `file.fileName`으로 바꾼다.
(현재 저장소의 `FileResponse`는 `name`이다.)

> `onRename`, `onMove`는 27절 `App.jsx`에서 전달한다. 이 Prop을 넘기지 않은
> 상태에서 버튼을 누르면 `onRename is not a function` 오류가 난다.

------------------------------------------------------------------------

# 21. FolderRow

파일:

``` text
frontend/src/components/FolderRow.jsx
```

``` jsx
function FolderRow({
  folder,
  onOpen,
  onRename,
  onDelete,
}) {
  return (
    <div className="file-row">
      <button
        className="folder-name"
        onClick={() => onOpen(folder)}
      >
        📁 {folder.name}
      </button>

      <div>폴더</div>
      <div>-</div>
      <div>
        {folder.updatedAt ||
          folder.createdAt ||
          "-"}
      </div>

      <div className="row-actions">
        <button
          onClick={() => onRename(folder)}
        >
          이름 변경
        </button>

        <button
          onClick={() => onDelete(folder)}
        >
          삭제
        </button>
      </div>
    </div>
  );
}

export default FolderRow;
```

------------------------------------------------------------------------

# 22. Loading

파일:

``` text
frontend/src/components/Loading.jsx
```

``` jsx
function Loading() {
  return (
    <div className="loading">
      불러오는 중...
    </div>
  );
}

export default Loading;
```

------------------------------------------------------------------------

# 23. ErrorMessage

파일:

``` text
frontend/src/components/ErrorMessage.jsx
```

``` jsx
function ErrorMessage({ message }) {
  if (!message) {
    return null;
  }

  return (
    <div className="error-message">
      {message}
    </div>
  );
}

export default ErrorMessage;
```

------------------------------------------------------------------------

# 24. CreateFolderModal

파일:

``` text
frontend/src/components/CreateFolderModal.jsx
```

``` jsx
import { useState } from "react";

function CreateFolderModal({
  open,
  onClose,
  onCreate,
}) {
  const [name, setName] = useState("");

  if (!open) {
    return null;
  }

  function submit(event) {
    event.preventDefault();

    const value = name.trim();

    if (!value) {
      return;
    }

    onCreate(value);
    setName("");
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>새 폴더</h2>

        <form onSubmit={submit}>
          <input
            autoFocus
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            placeholder="폴더 이름"
          />

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
            >
              취소
            </button>

            <button type="submit">
              만들기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateFolderModal;
```

------------------------------------------------------------------------

# 25. format.js

폴더 생성:

``` bash
mkdir -p src/utils
```

파일:

``` text
frontend/src/utils/format.js
```

``` javascript
export function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) {
    return "-";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) / Math.log(1024)
    ),
    units.length - 1
  );

  const value =
    bytes / Math.pow(1024, index);

  return `${value.toFixed(1)} ${units[index]}`;
}

export function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString(
    "ko-KR"
  );
}
```

------------------------------------------------------------------------

# 26. useDrive Hook

파일:

``` text
frontend/src/hooks/useDrive.js
```

``` jsx
import {
  useCallback,
  useState,
} from "react";

import {
  getFiles,
  uploadFile,
  downloadFile,
  renameFile,
  moveFile,
  deleteFile,
} from "../api/fileApi";

import {
  getFolders,
  createFolder,
  renameFolder,
  deleteFolder,
} from "../api/folderApi";

function useDrive() {
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] =
    useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (folderId = null) => {
      setLoading(true);
      setError("");

      try {
        const [fileResult, folderResult] =
          await Promise.all([
            getFiles(folderId),
            getFolders(folderId),
          ]);

        setFiles(
          Array.isArray(fileResult)
            ? fileResult
            : []
        );

        setFolders(
          Array.isArray(folderResult)
            ? folderResult
            : []
        );
      } catch (err) {
        setError(
          err.message ||
            "목록을 불러오지 못했습니다."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  async function handleUpload(
    file,
    folderId = null
  ) {
    setUploading(true);
    setError("");

    try {
      await uploadFile(file, folderId);
      await load(folderId);
    } catch (err) {
      setError(
        err.message ||
          "파일 업로드에 실패했습니다."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateFolder(
    name,
    parentId = null
  ) {
    setError("");

    try {
      await createFolder(name, parentId);
      await load(parentId);
    } catch (err) {
      setError(
        err.message ||
          "폴더 생성에 실패했습니다."
      );
    }
  }

  async function handleRenameFile(
    fileId,
    name,
    folderId = null
  ) {
    setError("");

    try {
      await renameFile(fileId, name);
      await load(folderId);
    } catch (err) {
      setError(
        err.message ||
          "파일 이름 변경에 실패했습니다."
      );
    }
  }

  async function handleRenameFolder(
    folderId,
    name,
    parentFolderId = null
  ) {
    setError("");

    try {
      await renameFolder(folderId, name);
      await load(parentFolderId);
    } catch (err) {
      setError(
        err.message ||
          "폴더 이름 변경에 실패했습니다."
      );
    }
  }

  async function handleMoveFile(
    fileId,
    folderId,
    currentFolderId = null
  ) {
    setError("");

    try {
      await moveFile(fileId, folderId);
      await load(currentFolderId);
    } catch (err) {
      setError(
        err.message ||
          "파일 이동에 실패했습니다."
      );
    }
  }

  async function handleDownload(file) {
    setError("");

    try {
      const response = await downloadFile(file.id);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err.message ||
          "파일 다운로드에 실패했습니다."
      );
    }
  }

  async function handleDeleteFile(
    file,
    folderId = null
  ) {
    if (
      !window.confirm(
        `"${file.name}"을 삭제할까요?`
      )
    ) {
      return;
    }

    try {
      await deleteFile(file.id);
      await load(folderId);
    } catch (err) {
      setError(
        err.message ||
          "파일 삭제에 실패했습니다."
      );
    }
  }

  async function handleDeleteFolder(
    folder,
    folderId = null
  ) {
    if (
      !window.confirm(
        `"${folder.name}" 폴더를 삭제할까요?`
      )
    ) {
      return;
    }

    try {
      await deleteFolder(folder.id);
      await load(folderId);
    } catch (err) {
      setError(
        err.message ||
          "폴더 삭제에 실패했습니다."
      );
    }
  }

  return {
    files,
    folders,
    loading,
    uploading,
    error,
    load,
    handleUpload,
    handleDownload,
    handleCreateFolder,
    handleRenameFile,
    handleRenameFolder,
    handleMoveFile,
    handleDeleteFile,
    handleDeleteFolder,
  };
}

export default useDrive;
```

> `getFiles(folderId)`는 `?folderId=`, `getFolders(folderId)`는
> `?parentFolderId=`로 변환해서 보낸다(13/14절). Query 문자열을 Hook에서
> 직접 만들지 않는다. **현재 Controller가 지원하는 방식이 기준이다.**

------------------------------------------------------------------------

# 27. App.jsx

파일:

``` text
frontend/src/App.jsx
```

> 이 파일은 `RenameModal`(51절)과 `MoveModal`(53절)을 import한다. 두 파일이
> 없으면 Vite가 `Failed to resolve import` 오류를 낸다. **51절, 53절의 파일을
> 먼저 만든 뒤** 이 파일을 저장한다.

``` jsx
import {
  useEffect,
  useState,
} from "react";

import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Breadcrumb from "./components/Breadcrumb";
import Toolbar from "./components/Toolbar";
import FileRow from "./components/FileRow";
import FolderRow from "./components/FolderRow";
import Loading from "./components/Loading";
import ErrorMessage from "./components/ErrorMessage";
import CreateFolderModal from "./components/CreateFolderModal";
import RenameModal from "./components/RenameModal";
import MoveModal from "./components/MoveModal";

import useDrive from "./hooks/useDrive";

import "./App.css";

function App() {
  const {
    files,
    folders,
    loading,
    uploading,
    error,
    load,
    handleUpload,
    handleDownload,
    handleCreateFolder,
    handleRenameFile,
    handleRenameFolder,
    handleMoveFile,
    handleDeleteFile,
    handleDeleteFolder,
  } = useDrive();

  const [
    currentFolderId,
    setCurrentFolderId,
  ] = useState(null);

  const [folderPath, setFolderPath] =
    useState([]);

  const [section, setSection] =
    useState("drive");

  const [
    folderModalOpen,
    setFolderModalOpen,
  ] = useState(false);

  const [renameTarget, setRenameTarget] =
    useState(null);

  const [moveTarget, setMoveTarget] =
    useState(null);

  useEffect(() => {
    load(currentFolderId);
  }, [currentFolderId, load]);

  async function createFolder(name) {
    await handleCreateFolder(
      name,
      currentFolderId
    );

    setFolderModalOpen(false);
  }

  async function renameItem(item, name) {
    if (renameTarget.type === "file") {
      await handleRenameFile(
        item.id,
        name,
        currentFolderId
      );
    } else {
      await handleRenameFolder(
        item.id,
        name,
        currentFolderId
      );
    }

    setRenameTarget(null);
  }

  async function moveItem(folder) {
    await handleMoveFile(
      moveTarget.id,
      folder ? folder.id : null,
      currentFolderId
    );

    setMoveTarget(null);
  }

  function openFolder(folder) {
    setCurrentFolderId(folder.id);

    setFolderPath((current) => [
      ...current,
      folder,
    ]);
  }

  function goToFolder(folderId) {
    if (folderId === null) {
      setCurrentFolderId(null);
      setFolderPath([]);
      return;
    }

    const index =
      folderPath.findIndex(
        (folder) =>
          folder.id === folderId
      );

    if (index === -1) {
      return;
    }

    setCurrentFolderId(folderId);

    setFolderPath(
      folderPath.slice(0, index + 1)
    );
  }

  return (
    <div className="app">
      <Header
        onRefresh={() =>
          load(currentFolderId)
        }
      />

      <div className="layout">
        <Sidebar
          currentSection={section}
          onSectionChange={setSection}
        />

        <main className="content">
          <Breadcrumb
            folders={folderPath}
            onFolderClick={goToFolder}
          />

          <Toolbar
            onCreateFolder={() =>
              setFolderModalOpen(true)
            }
            onUpload={(file) =>
              handleUpload(
                file,
                currentFolderId
              )
            }
            uploading={uploading}
          />

          <ErrorMessage
            message={error}
          />

          {loading ? (
            <Loading />
          ) : (
            <div className="file-table">
              <div className="file-header file-row">
                <div>이름</div>
                <div>종류</div>
                <div>크기</div>
                <div>수정일</div>
                <div>작업</div>
              </div>

              {folders.map((folder) => (
                <FolderRow
                  key={`folder-${folder.id}`}
                  folder={folder}
                  onOpen={openFolder}
                  onRename={(item) =>
                    setRenameTarget({
                      type: "folder",
                      item,
                    })
                  }
                  onDelete={(item) =>
                    handleDeleteFolder(
                      item,
                      currentFolderId
                    )
                  }
                />
              ))}

              {files.map((file) => (
                <FileRow
                  key={`file-${file.id}`}
                  file={file}
                  onDownload={handleDownload}
                  onRename={(item) =>
                    setRenameTarget({
                      type: "file",
                      item,
                    })
                  }
                  onMove={setMoveTarget}
                  onDelete={(item) =>
                    handleDeleteFile(
                      item,
                      currentFolderId
                    )
                  }
                />
              ))}

              {folders.length === 0 &&
                files.length === 0 && (
                  <div className="empty-state">
                    이 폴더는 비어 있습니다.
                  </div>
                )}
            </div>
          )}
        </main>
      </div>

      <CreateFolderModal
        open={folderModalOpen}
        onClose={() =>
          setFolderModalOpen(false)
        }
        onCreate={createFolder}
      />

      <RenameModal
        key={renameTarget
          ? `${renameTarget.type}-${renameTarget.item.id}`
          : "rename-modal"}
        open={Boolean(renameTarget)}
        item={renameTarget?.item}
        onClose={() => setRenameTarget(null)}
        onRename={renameItem}
      />

      <MoveModal
        open={Boolean(moveTarget)}
        folders={folders}
        onClose={() => setMoveTarget(null)}
        onMove={moveItem}
      />
    </div>
  );
}

export default App;
```

------------------------------------------------------------------------

# 28. App.jsx에서 반드시 이해할 변수

``` text
currentFolderId
→ 현재 열어 본 폴더

folderPath
→ 내 드라이브 / 문서 / 과제

files
→ 현재 목록의 파일

folders
→ 현재 목록의 폴더

loading
→ API 로딩 중

uploading
→ 파일 업로드 중

error
→ API 오류

renameTarget
→ 이름 변경 대상 { type: "file" | "folder", item }

moveTarget
→ 이동할 파일
```

------------------------------------------------------------------------

# 29. CSS

파일:

``` text
frontend/src/App.css
```

``` css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    Inter,
    "Noto Sans KR",
    Arial,
    sans-serif;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

.app {
  min-height: 100vh;
  background: #f8f9fa;
}

.header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-actions button {
  border: 0;
  background: transparent;
  padding: 8px 12px;
  border-radius: 8px;
}

.header-actions button:hover {
  background: #f1f3f5;
}

.layout {
  display: flex;
  min-height: calc(100vh - 64px);
}

.sidebar {
  width: 220px;
  padding: 20px 12px;
  background: white;
  border-right: 1px solid #e5e7eb;
}

.side-item {
  width: 100%;
  margin-bottom: 4px;
  padding: 12px 14px;
  text-align: left;
  border: 0;
  border-radius: 8px;
  background: transparent;
}

.side-item:hover,
.side-item.active {
  background: #eef2ff;
}

.content {
  flex: 1;
  min-width: 0;
  padding: 28px;
}

.breadcrumb {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 20px;
}

.breadcrumb button {
  border: 0;
  background: transparent;
}

.breadcrumb button:hover {
  text-decoration: underline;
}

.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.primary-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  color: #111827;
  background: #ffffff;
}

.secondary-button {
  cursor: pointer;
}

.secondary-button.is-uploading {
  color: #6b7280;
  background: #f3f4f6;
  cursor: wait;
}

.primary-button:hover,
.secondary-button:hover {
  background: #f3f4f6;
}

.file-table {
  overflow: hidden;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}

.file-row {
  display: grid;
  grid-template-columns:
    minmax(220px, 2fr)
    minmax(100px, 1fr)
    minmax(100px, 1fr)
    minmax(160px, 1fr)
    minmax(150px, 1fr);
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid #eef0f2;
}

.file-header {
  font-weight: 700;
  background: #f8f9fa;
}

.folder-name {
  text-align: left;
  border: 0;
  background: transparent;
  font-weight: 600;
}

.row-actions {
  display: flex;
  gap: 6px;
}

.row-actions button {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
}

.loading,
.empty-state {
  padding: 50px;
  text-align: center;
}

.error-message {
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid #fecdd3;
  border-radius: 8px;
  background: #fff1f2;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.modal {
  width: min(420px, calc(100vw - 32px));
  padding: 24px;
  border-radius: 12px;
  background: white;
}

.modal input {
  width: 100%;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

@media (max-width: 800px) {
  .sidebar {
    width: 170px;
  }

  .content {
    padding: 16px;
  }

  .file-row {
    grid-template-columns:
      minmax(150px, 2fr)
      minmax(90px, 1fr)
      minmax(120px, 1fr);
  }

  .file-row > div:nth-child(2),
  .file-row > div:nth-child(3) {
    display: none;
  }
}
```

------------------------------------------------------------------------

# 30. index.css

파일:

``` text
frontend/src/index.css
```

Vite 템플릿이 만든 기존 내용(`#root { width: 1126px; text-align: center; ... }`,
다크 모드 색상 등)을 **모두 지우고** 다음으로 교체한다. 템플릿 내용을 그대로
두면 화면이 가운데 좁은 폭으로 정렬되고, 다크 모드에서 글자색이 흐려진다.

``` css
html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
}
```

------------------------------------------------------------------------

# 31. main.jsx

파일:

``` text
frontend/src/main.jsx
```

``` jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

------------------------------------------------------------------------

# 32. CORS 확인

Frontend:

``` text
http://localhost:5173
```

Backend:

``` text
http://localhost:8080
```

이면 Origin이 다르다.

브라우저:

``` text
F12
→ Console
```

에서:

``` text
CORS policy
```

오류를 확인한다.

> Codespaces 브라우저에서 Frontend 주소는 `localhost:5173`이 아니라
> `https://<codespace이름>-5173.app.github.dev` 형태다. 따라서 Origin은 항상
> Backend와 다르다.
>
> **현재 저장소는 Backend에 CORS 설정을 추가하지 않고 34절의 Vite Proxy를
> 사용한다.** 브라우저는 같은 Origin(5173)의 `/api`로만 요청하므로 CORS
> 오류가 발생하지 않는다. 33절은 Proxy를 쓰지 않는 경우의 대안이다.

------------------------------------------------------------------------

# 33. Backend에 CORS가 없을 때 (선택 --- Proxy를 쓰지 않는 경우)

현재 프로젝트의 Java 최상위 package 아래:

``` text
config/CorsConfig.java
```

를 만든다.

``` java
package com.example.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(
            CorsRegistry registry) {

        registry.addMapping("/**")
                .allowedOrigins(
                        "http://localhost:5173"
                )
                .allowedMethods(
                        "GET",
                        "POST",
                        "PUT",
                        "PATCH",
                        "DELETE",
                        "OPTIONS"
                )
                .allowedHeaders("*");
    }
}
```

위치: `backend/src/main/java/com/example/backend/config/CorsConfig.java`
(`BackendApplication.java`의 package가 `com.example.backend`이다).

> Codespaces 브라우저에서 접속한다면 `allowedOrigins`에
> `https://<codespace이름>-5173.app.github.dev`도 추가해야 한다.
> 또한 Backend 8080 포트를 브라우저에서 직접 열어야 하므로(Ports 탭에서
> Public 설정 필요) 초보자에게는 34절 Proxy 방식을 권장한다.

------------------------------------------------------------------------

# 34. 개발 단계에서 Vite Proxy 사용

파일:

``` text
frontend/vite.config.js
```

현재 저장소 기준(Proxy 대상 주소를 `.env.local`의 `VITE_API_TARGET`에서 읽는다):

``` javascript
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: env.VITE_API_TARGET,
          changeOrigin: true,
        },
      },
    },
  };
});
```

> `VITE_API_TARGET`이 비어 있으면 Proxy 대상이 없어 `/api` 요청이 실패한다.
> 10절처럼 `.env.local`에 반드시 넣는다. 일회성으로는
> `VITE_API_TARGET=http://localhost:8080 npm run dev -- --host 0.0.0.0`처럼
> 실행해도 된다. `host`는 설정 파일 대신 `--host 0.0.0.0` 옵션으로 지정한다.
>
> Proxy는 Codespace 내부(Vite 서버)에서 Backend로 요청하므로
> **Ports 탭에서 5173만 브라우저로 열면 된다.** 8080을 Public으로 열 필요가 없다.

이 방식이면 개발 중:

``` text
Browser
 ↓
localhost:5173
 ↓ /api
Vite
 ↓
localhost:8080
 ↓
Spring Boot
```

구조가 된다.

이때 `.env.local`:

``` env
VITE_API_BASE_URL=
VITE_API_TARGET=http://localhost:8080
```

로 둔다(`VITE_API_BASE_URL`에 주소를 넣으면 Proxy를 거치지 않고 브라우저가
직접 요청하므로 CORS 문제가 다시 생긴다).

------------------------------------------------------------------------

# 35. 가장 먼저 연결할 기능 --- 목록

로컬 PostgreSQL을 먼저 실행(프로젝트 루트):

``` bash
docker compose up -d postgres
```

Backend를 실행:

``` bash
cd backend
export AWS_REGION=ap-northeast-2
export S3_BUCKET=$(cd ../infra/terraform && terraform output -raw s3_bucket_name)
./gradlew bootRun
```

> `bootRun`은 기본값 `jdbc:postgresql://localhost:5432/cloud_file`
> (`cloud_user`/`cloud_password`)로 접속한다. 업로드/다운로드는 실제 S3를
> 사용하므로 Codespace에 AWS 자격 증명(`aws sts get-caller-identity`로 확인)과
> `S3_BUCKET`이 있어야 한다. ECS Backend에 붙일 때는 로컬 Backend 대신
> `.env.local`의 `VITE_API_TARGET`을 ECS Public IP로 바꾼다.

Frontend를 다른 터미널에서(프로젝트 루트 기준):

``` bash
cd frontend
npm run dev -- --host 0.0.0.0
```

VS Code **Ports** 탭에서 5173의 🌐(Open in Browser)를 눌러 열고 파일 목록
요청을 확인한다.

------------------------------------------------------------------------

# 36. 브라우저 Network 확인

``` text
F12
→ Network
→ Fetch/XHR
```

확인:

``` text
Request URL
Request Method
Status Code
Response
```

가 실제 Backend와 일치해야 한다.

------------------------------------------------------------------------

# 37. 404이면

``` text
Frontend path
≠
Backend @RequestMapping
```

이다.

다시:

``` bash
grep -Rni "@RequestMapping" backend/src/main/java
grep -Rni "@GetMapping" backend/src/main/java
```

확인.

------------------------------------------------------------------------

# 38. 405이면

Method가 다르다.

예:

``` text
Frontend: POST
Backend: PUT
```

Controller에 맞춰 변경한다.

------------------------------------------------------------------------

# 39. 400이면

다음을 확인:

``` text
JSON Body
FormData
필드 이름
Content-Type
folderId
```

------------------------------------------------------------------------

# 40. 500이면

Backend 로그를 확인한다.

로컬:

``` bash
./gradlew bootRun
```

ECS:

``` text
CloudWatch
→ /ecs/cloud-file-service-dev
```

Day 5에서 만든 Log Group을 확인한다.

------------------------------------------------------------------------

# 41. 파일 업로드

현재 `fileApi.js`:

``` javascript
const formData = new FormData();

formData.append("file", file);
```

형태를 사용한다.

여기에 현재 Backend가 요구하는 필드를 추가한다.

예:

``` javascript
formData.append(
  "folderId",
  folderId
);
```

Backend가 다른 이름:

``` text
parentFolderId
```

라면 그 이름을 사용한다.

> 현재 `FileController.upload`는 `@RequestParam("file")`,
> `@RequestParam(required = false) Long folderId`이므로 `file`, `folderId`가
> 맞다. 최대 크기는 `application.properties`의 10MB이며, 초과하면 오류가 난다.

------------------------------------------------------------------------

# 42. 업로드 흐름

``` text
Browser
   |
   | multipart/form-data
   v
Spring Boot
   |
   +-------> RDS
   |          Metadata
   |
   +-------> S3
              Actual File
```

------------------------------------------------------------------------

# 43. 다운로드

현재 Backend의 Download Controller를 먼저 확인한다.

예를 들어:

``` text
GET /api/files/{id}/download
```

이고 Binary Response라면(현재 저장소가 이 경우다):

`fileApi.js`(13절):

``` javascript
export function downloadFile(id) {
  return request(`/api/files/${id}/download`);
}
```

`useDrive.js`(26절)의 `handleDownload`:

``` javascript
async function handleDownload(file) {
  setError("");

  try {
    const response = await downloadFile(file.id);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    setError(
      err.message ||
        "파일 다운로드에 실패했습니다."
    );
  }
}
```

실제 경로와 파일명 응답 방식에 맞춘다. `request()`를 거치므로
`VITE_API_BASE_URL`/Proxy 설정이 목록 조회와 동일하게 적용되고, 파일명은
목록 응답의 `file.name`을 사용한다.

------------------------------------------------------------------------

# 44. 다운로드에서 AWS Credential은 필요 없다

잘못:

``` text
React
 ↓
AWS Access Key
 ↓
S3
```

올바름:

``` text
React
 ↓
Backend
 ↓
ECS Task Role
 ↓
S3
```

Day 5 IAM 설계를 그대로 유지한다.

------------------------------------------------------------------------

# 45. 파일 삭제

현재:

``` javascript
export function deleteFile(id) {
  return request(`/api/files/${id}`, {
    method: "DELETE",
  });
}
```

Backend의 실제 DELETE 경로와 맞춘다.

삭제 흐름:

``` text
Browser
 ↓
DELETE
 ↓
Spring Boot
 ↓
RDS Metadata
 +
S3 Object
```

------------------------------------------------------------------------

# 46. 폴더 생성

버튼:

``` text
+ 새 폴더
```

클릭:

``` text
Modal
 ↓
폴더 이름
 ↓
POST
 ↓
Backend
 ↓
RDS
```

실제 Folder DTO의 필드 이름을 확인한다.
(현재: `CreateFolderRequest(name, parentFolderId)` → Body
`{"name": "문서", "parentFolderId": null}`)

------------------------------------------------------------------------

# 47. 현재 폴더

``` text
currentFolderId
```

를 기준으로 한다.

예:

``` text
내 드라이브
   |
   v
문서
```

문서 클릭:

``` text
currentFolderId = 문서.id
```

------------------------------------------------------------------------

# 48. Breadcrumb

``` text
내 드라이브 / 문서 / 과제
```

내 드라이브:

``` text
currentFolderId = null
folderPath = []
```

문서:

``` text
currentFolderId = 문서.id
folderPath = [문서]
```

과제:

``` text
currentFolderId = 과제.id
folderPath = [문서, 과제]
```

------------------------------------------------------------------------

# 49. 폴더 목록 API

Backend가:

``` text
GET /api/folders?parentId=3
```

을 지원한다면:

``` javascript
getFolders("?parentId=3")
```

를 사용한다.

Backend가:

``` text
GET /api/folders/3/children
```

이면 그 경로를 사용한다.

**Frontend가 API를 결정하지 않는다. Backend Controller가 기준이다.**

현재 저장소의 `FolderController`는:

``` text
GET /api/folders?parentFolderId=3
```

이므로 `folderApi.js`의 `getFolders(3)`이 이 Query를 만든다(14절).

------------------------------------------------------------------------

# 50. 이름 변경

Backend에 이름 변경 기능이 있는지:

``` bash
grep -Rni "rename" backend/src/main/java
```

확인한다.

또는 Controller에서:

``` text
PUT/PATCH
```

Mapping을 찾는다.

현재 저장소:

``` text
파일: PATCH /api/files/{id}/rename?name=새이름      (Query Parameter)
폴더: PATCH /api/folders/{id}   Body {"name": "새이름"}  (JSON)
```

두 방식이 다르므로 `renameFile`/`renameFolder`(13/14절)를 따로 둔다.

------------------------------------------------------------------------

# 51. RenameModal

파일:

``` text
frontend/src/components/RenameModal.jsx
```

``` jsx
import { useState } from "react";

function RenameModal({
  open,
  item,
  onClose,
  onRename,
}) {
  const [name, setName] =
    useState("");

  if (!open || !item) {
    return null;
  }

  function submit(event) {
    event.preventDefault();

    const value = name.trim();

    if (!value) {
      return;
    }

    onRename(item, value);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>이름 변경</h2>

        <form onSubmit={submit}>
          <input
            autoFocus
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
          />

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
            >
              취소
            </button>

            <button type="submit">
              변경
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RenameModal;
```

> `useEffect` 안에서 `setName`을 호출하는 방식은 Vite 템플릿의 ESLint
> (`eslint-plugin-react-hooks` v7)가 `npm run lint`에서 경고/오류로 잡는다.
> 대신 `App.jsx`(27절)에서 `<RenameModal key={...} />`로 대상이 바뀔 때마다
> 컴포넌트를 새로 만들어 입력값을 초기화한다.

------------------------------------------------------------------------

# 52. 이동 기능

Backend에 `move`가 있는지:

``` bash
grep -Rni "move" backend/src/main/java
```

확인한다.

있다면:

``` text
파일 선택
 ↓
이동
 ↓
대상 폴더 선택
 ↓
Backend Move API
 ↓
목록 새로고침
```

구조를 만든다.

현재 저장소에는 **파일 이동만** 있다.

``` text
PATCH /api/files/{id}/move?folderId={대상폴더id}
PATCH /api/files/{id}/move               ← folderId 생략 = 내 드라이브(root)
```

폴더 이동 API는 없으므로 `FolderRow`에는 이동 버튼을 두지 않는다.

------------------------------------------------------------------------

# 53. MoveModal

파일:

``` text
frontend/src/components/MoveModal.jsx
```

``` jsx
function MoveModal({
  open,
  folders,
  onClose,
  onMove,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>폴더 선택</h2>

        <button onClick={() => onMove(null)}>
          📁 내 드라이브
        </button>

        {folders.map((folder) => (
          <button
            key={folder.id}
            onClick={() =>
              onMove(folder)
            }
          >
            📁 {folder.name}
          </button>
        ))}

        <button onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}

export default MoveModal;
```

> `App.jsx`는 `folders`(현재 보고 있는 폴더의 하위 폴더 목록)를 넘긴다.
> 따라서 이동 대상은 "내 드라이브(root)" 또는 현재 폴더의 하위 폴더다.
> 다른 위치의 폴더로 옮기려면 전체 폴더 트리 조회가 필요하다(확장 과제).

------------------------------------------------------------------------

# 54. Drag & Drop은 기능 완성 후

처음부터:

``` text
Drag & Drop
Context Menu
Keyboard Shortcut
```

를 만들지 않는다.

먼저 버튼으로:

``` text
Upload
Download
Delete
Rename
Move
```

를 완성한다.

------------------------------------------------------------------------

# 55. 검색

처음에는 현재 목록에서 검색한다.

``` javascript
const filteredFiles =
  files.filter((file) =>
    file.name
      .toLowerCase()
      .includes(
        search.toLowerCase()
      )
  );
```

전체 파일 검색은 나중에 Backend Search API로 확장한다.

> 위 코드는 `const [search, setSearch] = useState("");`와 검색 입력창이
> 있다는 전제의 예시다. 현재 저장소에는 검색 기능이 구현되어 있지 않다(선택 범위).

------------------------------------------------------------------------

# 56. 파일 크기

`format.js`의:

``` javascript
formatFileSize(file.size)
```

를 사용한다.

결과 예:

``` text
1.0 KB
2.5 MB
1.2 GB
```

------------------------------------------------------------------------

# 57. 날짜

``` javascript
formatDate(
  file.updatedAt ||
  file.createdAt
)
```

한국어 지역으로 표시한다.

------------------------------------------------------------------------

# 58. 실제 서비스 데이터 확인

Frontend에서 업로드한 뒤:

``` bash
aws s3 ls   "s3://$(cd infra/terraform && terraform output -raw s3_bucket_name)/"   --recursive
```

S3 Object가 있는지 확인한다.

------------------------------------------------------------------------

# 59. RDS Metadata도 확인

구조가:

``` text
Upload
 ↓
RDS Metadata
+
S3 Object
```

이므로 S3만 확인하지 않는다.

Backend가 정상적으로 Metadata를 생성했는지 확인한다.

------------------------------------------------------------------------

# 60. 새로고침 테스트

Browser:

``` text
F5
```

후에도:

``` text
폴더
파일
```

이 보이면 Frontend State가 아니라 Backend 데이터가 유지되는 것이다.

------------------------------------------------------------------------

# 61. ECS Task 재시작 테스트

Day 5에서 배운 명령:

``` bash
cd infra/terraform

export AWS_REGION=ap-northeast-2
export ECS_CLUSTER=$(terraform output -raw ecs_cluster_name)
export ECS_SERVICE=$(terraform output -raw ecs_service_name)
```

Task:

``` bash
export TASK_ARN=$(aws ecs list-tasks   --cluster "$ECS_CLUSTER"   --service-name "$ECS_SERVICE"   --region "$AWS_REGION"   --query 'taskArns[0]'   --output text)
```

종료:

``` bash
aws ecs stop-task   --cluster "$ECS_CLUSTER"   --task "$TASK_ARN"   --reason "Day6 persistence test"   --region "$AWS_REGION"
```

------------------------------------------------------------------------

# 62. 새 Task 확인

``` bash
aws ecs describe-services   --cluster "$ECS_CLUSTER"   --services "$ECS_SERVICE"   --region "$AWS_REGION"   --query 'services[0].{desired:desiredCount,running:runningCount}'
```

새 Task가 RUNNING이 된 후 Frontend를 새로고침한다.

파일이 그대로 있어야 한다.

------------------------------------------------------------------------

# 63. 이 실험이 중요한 이유

``` text
ECS Task
→ 교체 가능

RDS
→ Metadata 영속성

S3
→ 파일 영속성
```

이라는 Day 3.5 → Day 5 설계가 실제로 검증된다.

------------------------------------------------------------------------

# 64. Frontend Production Build

``` bash
cd frontend
npm run build
```

확인:

``` bash
ls -la dist
```

예:

``` text
index.html
assets/
```

------------------------------------------------------------------------

# 65. Preview

``` bash
npm run preview -- --host 0.0.0.0
```

Production Build가 정상적으로 열리는지 확인한다.

> Preview는 4173 포트를 사용한다(Ports 탭에서 4173을 연다). `vite preview`는
> `server.proxy` 설정을 그대로 사용하므로 `.env.local`의 `VITE_API_TARGET`이
> 있으면 API도 동작한다.

------------------------------------------------------------------------

# 66. Frontend Dockerfile

파일:

``` text
frontend/Dockerfile
```

``` dockerfile
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build


FROM nginx:alpine

COPY --from=build   /app/dist   /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

------------------------------------------------------------------------

# 67. Frontend `.dockerignore`

파일:

``` text
frontend/.dockerignore
```

``` text
node_modules
dist
.git
.env.local
```

------------------------------------------------------------------------

# 68. Docker Build

``` bash
cd frontend
docker build   -t cloud-file-frontend:day6   .
```

------------------------------------------------------------------------

# 69. Docker 실행

``` bash
docker run --rm   -p 8081:80   cloud-file-frontend:day6
```

브라우저:

``` text
http://localhost:8081
```

확인한다. (Codespaces에서는 Ports 탭에서 8081을 연다.)

> 이 컨테이너는 `dist/` 정적 파일만 Nginx로 제공한다. `.env.local`은
> `.dockerignore`로 제외되고 Nginx에는 `/api` Proxy가 없으므로, 화면은 뜨지만
> 목록 요청 `/api/...`은 404/405가 된다. **Day 6에서는 UI 표시와 Docker Build
> 성공까지만 확인**한다. 컨테이너에서 API까지 연결하려면 Nginx에 `/api`
> reverse proxy를 추가하거나, Build 시 `VITE_API_BASE_URL`(ALB 등 고정 주소)과
> Backend CORS를 함께 설정해야 한다(73~77절).

------------------------------------------------------------------------

# 70. Vite 환경변수의 중요한 특징

``` text
VITE_API_BASE_URL
```

은 Build Time에 Frontend JavaScript에 들어간다. (`VITE_API_TARGET`은
`vite.config.js`에서만 쓰이는 개발 서버 설정이라 번들에 들어가지 않는다.)

즉:

``` text
npm run build
 ↓
dist/
 ↓
JavaScript Bundle
```

이므로 Secret을 넣는 용도로 사용하면 안 된다.

------------------------------------------------------------------------

# 71. Frontend에 넣으면 안 되는 것

절대 넣지 않는다:

``` text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
DB_PASSWORD
RDS Password
Terraform State
ECS Task credentials
```

Frontend는 공개되는 코드라고 생각한다.

------------------------------------------------------------------------

# 72. 최종 API 보안 구조

``` text
Browser
   |
   | HTTPS
   v
Frontend
   |
   | API
   v
Spring Boot
   |
   | ECS Task Role
   v
S3
```

DB:

``` text
Spring Boot
   |
   v
RDS
```

Frontend가 RDS/S3 Credential을 직접 갖지 않는다.

------------------------------------------------------------------------

# 73. ECS Public IP의 한계

Day 4/5 학습 구조:

``` text
Frontend
 ↓
ECS Public IP:8080
```

은 테스트에는 사용할 수 있다.

하지만 ECS Task가 교체되면:

``` text
Public IP 변경 가능
```

하다.

따라서 최종적으로는:

``` text
Frontend
 ↓
ALB DNS
 ↓
ECS Service
```

구조로 발전시킨다.

------------------------------------------------------------------------

# 74. ALB 구조

``` text
Internet
   |
   v
ALB
   |
   +---- ECS Task A
   |
   +---- ECS Task B
```

Frontend는:

``` text
ALB 주소
```

만 사용한다.

------------------------------------------------------------------------

# 75. Day 5 Terraform과 ALB

Day 5 문서의 Terraform에는 VPC/ECS/RDS/S3 등이 포함되어 있지만 ALB는
기본 필수 구성으로 완성하지 않았다.

따라서 Day 6에서는:

``` text
기존 Terraform 유지
```

하고 ALB는 확장 단계에서 추가한다.

------------------------------------------------------------------------

# 76. Frontend 배포 선택지

### 선택 A

``` text
React Build
→ S3
→ CloudFront
```

### 선택 B

``` text
React Build
→ Nginx Docker
→ ECR
→ ECS
```

현재 프로젝트에서는 Day 6에서 우선:

``` text
React
→ Build
→ Docker
```

까지 완성한다.

------------------------------------------------------------------------

# 77. S3 + CloudFront를 사용한다면

운영형 구조:

``` text
Browser
 ↓
CloudFront
 ↓
Private S3
```

을 사용한다.

S3를 무조건 Public으로 열지 않는다.

------------------------------------------------------------------------

# 78. Day 6의 필수 범위

``` text
React
+
Vite
+
API Client
+
File UI
+
Folder UI
+
Upload
+
Download
+
Delete
+
Create Folder
+
Breadcrumb
+
Loading/Error
+
Docker Build
```

------------------------------------------------------------------------

# 79. 선택 범위

``` text
Rename
Move
Search
Drag & Drop
Starred
Trash
ALB
CloudFront
Frontend ECS
```

Backend에 기능이 이미 있는 것은 연결하고, 없는 기능은 무리하게
Frontend만 만들어 실제 기능이라고 착각하지 않는다.

------------------------------------------------------------------------

# 80. Git Commit

Frontend 생성:

``` bash
git add frontend
git commit -m "feat: initialize react frontend"
```

API 연결:

``` bash
git add frontend
git add backend   # 33절 CorsConfig를 추가한 경우에만 변경분이 있다
git commit -m "feat: connect frontend to file api"
```

UI 완성:

``` bash
git add frontend
git commit -m "feat: add drive style file management ui"
```

------------------------------------------------------------------------

# 81. 보안 점검

프로젝트 루트:

``` bash
git status
```

확인.

다음이 Git에 들어가면 안 된다:

``` text
frontend/node_modules
frontend/dist
frontend/.env.local
terraform.tfstate
terraform.tfvars
AWS credentials
DB password
```

검색:

``` bash
grep -RniE   "AKIA|AWS_SECRET_ACCESS_KEY|DB_PASSWORD|password="   frontend   --exclude-dir=node_modules   --exclude-dir=dist
```

------------------------------------------------------------------------

# 82. 실제 기능 테스트 순서

## 1. Backend

``` bash
cd backend
./gradlew bootRun
```

## 2. Frontend

``` bash
cd frontend
npm run dev -- --host 0.0.0.0
```

## 3. 폴더

``` text
새 폴더
→ 문서
```

## 4. 폴더 진입

``` text
문서 클릭
```

## 5. 파일

``` text
test.txt 업로드
```

## 6. 목록

``` text
test.txt 표시
```

## 7. 다운로드

``` text
test.txt 다운로드
```

## 8. 삭제

``` text
test.txt 삭제
```

## 9. 새로고침

``` text
F5
```

## 10. ECS 재시작

``` text
Task 종료
→ 새 Task
→ 파일 유지
```

------------------------------------------------------------------------

# 83. 실패 시 진단 순서

``` text
Browser
 ↓
Network
 ↓
Frontend API
 ↓
Backend Controller
 ↓
Service
 ↓
RDS / S3
```

ECS 환경이면 추가:

``` text
ECS
 ↓
CloudWatch
 ↓
IAM
 ↓
Network
```

------------------------------------------------------------------------

# 84. `Failed to fetch`

확인:

``` text
VITE_API_BASE_URL (Proxy 사용 시 빈 값)
VITE_API_TARGET (.env.local 수정 후 npm run dev 재시작)
Backend 실행
Port
CORS
Vite Proxy
```

> Vite Proxy가 Backend에 연결하지 못하면 브라우저에는 500/502가 보이고,
> `npm run dev` 터미널에 `http proxy error ... ECONNREFUSED`가 출력된다.

------------------------------------------------------------------------

# 85. 404

확인:

``` text
@RequestMapping
@GetMapping
@PostMapping
```

Frontend API 경로와 비교한다.

------------------------------------------------------------------------

# 86. 405

HTTP Method 비교:

``` text
GET
POST
PUT
PATCH
DELETE
```

------------------------------------------------------------------------

# 87. 400

Request Body와 필드 비교:

``` text
name
folderId        (파일 업로드/목록/이동)
parentFolderId  (폴더 생성/목록)
file
```

------------------------------------------------------------------------

# 88. 500

Backend 로그 확인.

로컬:

``` bash
./gradlew bootRun
```

ECS:

``` text
CloudWatch
→ /ecs/cloud-file-service-dev
```

------------------------------------------------------------------------

# 89. S3에는 있는데 화면에 없다

Day 3.5 구조에서는:

``` text
S3 = 실제 파일
RDS = Metadata
```

이므로:

``` text
S3 Object 존재
≠
Frontend 목록 정상
```

일 수 있다.

RDS Metadata와 Backend 목록 API를 함께 확인한다.

------------------------------------------------------------------------

# 90. RDS에는 있는데 S3가 없다

반대로:

``` text
Metadata 생성
→ S3 Upload 실패
```

가 발생했을 수 있다.

Backend 로그와 S3 권한을 확인한다.

------------------------------------------------------------------------

# 91. Day 6 완료 기준

## Frontend

``` text
[ ] React 생성
[ ] Vite 실행
[ ] 화면 표시
[ ] Header
[ ] Sidebar
[ ] Breadcrumb
[ ] Toolbar
[ ] FileRow
[ ] FolderRow
[ ] Loading
[ ] Error
```

## 실제 API

``` text
[ ] 목록
[ ] 폴더 생성
[ ] 파일 업로드
[ ] 파일 다운로드
[ ] 파일 삭제
```

## 데이터

``` text
[ ] Metadata → RDS
[ ] Actual File → S3
[ ] 새로고침 후 유지
[ ] ECS Task 교체 후 유지
```

## Build

``` text
[ ] npm run build
[ ] dist 생성
[ ] Docker build
[ ] Nginx Container 실행
```

## 보안

``` text
[ ] AWS Credential 없음
[ ] DB Password 없음
[ ] .env.local 제외
[ ] node_modules 제외
[ ] dist 제외
```

------------------------------------------------------------------------

# 92. Day 6 최종 Architecture

``` text
                         USER
                          |
                          v
                       Browser
                          |
                          v
                  React Frontend
                          |
                       HTTP API
                          |
                          v
                +-------------------+
                |   Spring Boot     |
                |    ECS Fargate    |
                +---------+---------+
                          |
             +------------+------------+
             |                         |
             v                         v
          PostgreSQL                  S3
             |                         |
       File/Folder Metadata       Actual Files
```

------------------------------------------------------------------------

# 93. Day 5와 Day 6 역할 분리

``` text
Terraform
→ AWS Infrastructure

Docker
→ Application Packaging

ECR
→ Image Storage

ECS
→ Container Execution

Spring Boot
→ Business Logic / API

RDS
→ Metadata

S3
→ Actual Files

React
→ User Interface

CloudWatch
→ Logs
```

------------------------------------------------------------------------

# 94. 해커톤 Demo 순서

``` text
1. 웹 페이지 접속
        ↓
2. 내 드라이브 확인
        ↓
3. 새 폴더 생성
        ↓
4. 폴더 진입
        ↓
5. 파일 업로드
        ↓
6. 목록 확인
        ↓
7. 다운로드
        ↓
8. 삭제
        ↓
9. 새로고침
        ↓
10. ECS Task 재생성
        ↓
11. 파일이 유지되는 것 확인
```

이 Demo는:

``` text
Frontend
Backend
RDS
S3
ECS
Terraform
```

이 하나의 시스템으로 연결되어 있음을 보여준다.

------------------------------------------------------------------------

# 95. Day 6에서 꼭 답할 수 있어야 하는 질문

1.  React와 Spring Boot의 역할 차이는?
2.  왜 React가 RDS에 직접 연결하면 안 되는가?
3.  왜 Frontend에 AWS Secret Key를 넣으면 안 되는가?
4.  CORS란 무엇인가?
5.  FormData란 무엇인가?
6.  `useState`는 무엇인가?
7.  `useEffect`는 무엇인가?
8.  `currentFolderId`가 필요한 이유는?
9.  Breadcrumb는 어떻게 동작하는가?
10. RDS에는 무엇을 저장하는가?
11. S3에는 무엇을 저장하는가?
12. ECS Task가 바뀌어도 파일이 유지되는 이유는?
13. ECR은 무엇인가?
14. Terraform은 무엇을 관리하는가?
15. ECS Public IP를 영구 API 주소로 사용하기 어려운 이유는?

------------------------------------------------------------------------

# 96. Day 6 한 문장

> **Day 3.5의 실제 파일 시스템 Backend와 Day 4의 ECS Fargate, Day 5의
> Terraform AWS Infrastructure를 그대로 유지하면서 React + Vite
> Frontend를 추가하고, 사용자가 브라우저에서 실제 폴더와 파일을 관리할
> 수 있도록 연결한다.**

------------------------------------------------------------------------

# 97. Day 3.5 → Day 4 → Day 5 → Day 6

``` text
Day 3.5
PostgreSQL + S3
실제 파일 시스템
        |
        v
Day 4
Docker + ECR + ECS Fargate
        |
        v
Day 5
Terraform / IaC
VPC / IAM / S3 / RDS / ECR / ECS / CloudWatch
        |
        v
Day 6
React + Vite
        |
        v
Browser
        |
        v
Spring Boot API
        |
     +--+--+
     |     |
     v     v
    RDS   S3
```

------------------------------------------------------------------------

# 98. Day 7 예고

Day 7에서는 지금까지 만든 서비스를 자동화한다.

``` text
GitHub
   |
   v
GitHub Actions
   |
   +-- Test
   +-- Gradle Build
   +-- Docker Build
   +-- ECR Push
   |
   v
Deployment
```

그리고:

``` text
Kubernetes
CI/CD
Monitoring
```

을 추가하여 최종 Cloud/DevOps 프로젝트로 정리한다.

------------------------------------------------------------------------

# 99. Day 6 종료

최종:

``` text
[✓] Day 3.5 Backend 유지
[✓] RDS 유지
[✓] S3 유지
[✓] Day 4 ECS 유지
[✓] Day 5 Terraform 유지
[✓] React Frontend 추가
[✓] Browser에서 파일 관리
[✓] 실제 Upload
[✓] 실제 Download
[✓] 실제 Delete
[✓] Folder 생성
[✓] Breadcrumb
[✓] Production Build
[✓] Frontend Docker Build
```

핵심:

``` text
사용자
 ↓
React
 ↓
Spring Boot
 ↓
RDS + S3
```

가 실제로 동작하면 Day 6 완료다.
