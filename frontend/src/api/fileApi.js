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