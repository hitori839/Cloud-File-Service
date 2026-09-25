import { buildQuery, request } from "./client";

export function listFolders(parentFolderId = null) {
  return request(`/api/folders${buildQuery({ parentFolderId })}`);
}

export function getFolder(id) {
  return request(`/api/folders/${id}`);
}

export function getFolderPath(id) {
  return request(`/api/folders/${id}/path`);
}

export function getFolderTree() {
  return request("/api/folders/tree");
}

export function createFolder(name, parentFolderId = null) {
  return request("/api/folders", {
    method: "POST",
    json: { name, parentFolderId },
  });
}

export function renameFolder(id, name) {
  return request(`/api/folders/${id}`, { method: "PATCH", json: { name } });
}

export function moveFolder(id, parentFolderId = null) {
  return request(`/api/folders/${id}/move${buildQuery({ parentFolderId })}`, {
    method: "PATCH",
  });
}

export function starFolder(id, starred) {
  return request(`/api/folders/${id}/star${buildQuery({ starred })}`, {
    method: "PATCH",
  });
}

/** 휴지통으로 이동 (하위 항목 포함) */
export function trashFolder(id) {
  return request(`/api/folders/${id}`, { method: "DELETE" });
}
