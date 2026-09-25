import {
  ApiError,
  apiUrl,
  buildQuery,
  getToken,
  handleUnauthorized,
  parseErrorText,
  request,
  requestBlob,
} from "./client";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function listFiles(folderId = null) {
  return request(`/api/files${buildQuery({ folderId })}`);
}

export function renameFile(id, name) {
  return request(`/api/files/${id}/rename${buildQuery({ name })}`, {
    method: "PATCH",
  });
}

export function moveFile(id, folderId = null) {
  return request(`/api/files/${id}/move${buildQuery({ folderId })}`, {
    method: "PATCH",
  });
}

export function starFile(id, starred) {
  return request(`/api/files/${id}/star${buildQuery({ starred })}`, {
    method: "PATCH",
  });
}

/** 휴지통으로 이동 */
export function trashFile(id) {
  return request(`/api/files/${id}`, { method: "DELETE" });
}

export function fetchDownloadBlob(id) {
  return requestBlob(`/api/files/${id}/download`);
}

export function fetchPreviewBlob(id, signal) {
  return requestBlob(`/api/files/${id}/preview`, { signal });
}

/** 인증된 fetch → Blob → object URL → <a download> 클릭 */
export async function downloadFile(file) {
  const blob = await fetchDownloadBlob(file.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name || file.originalName || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * XHR 업로드 (진행률 + Authorization 헤더).
 * @returns {{ promise: Promise<object>, abort: () => void }}
 */
export function uploadFile(file, folderId, onProgress) {
  const xhr = new XMLHttpRequest();

  const promise = new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    if (folderId !== null && folderId !== undefined) {
      form.append("folderId", String(folderId));
    }

    xhr.open("POST", apiUrl("/api/files"));
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
        } catch {
          resolve(null);
        }
        return;
      }
      if (xhr.status === 401) handleUnauthorized();
      const message =
        xhr.status === 413
          ? parseErrorText(xhr.responseText, 413)
          : parseErrorText(xhr.responseText, xhr.status);
      reject(new ApiError(message, xhr.status));
    };

    xhr.onerror = () =>
      reject(new ApiError("서버에 연결할 수 없습니다.", 0));
    xhr.onabort = () => {
      const error = new ApiError("업로드가 취소되었습니다.", 0);
      error.name = "AbortError";
      reject(error);
    };

    xhr.send(form);
  });

  return { promise, abort: () => xhr.abort() };
}
