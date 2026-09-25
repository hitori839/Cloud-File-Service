import { buildQuery, request } from "./client";

export function searchDrive(q) {
  return request(`/api/drive/search${buildQuery({ q })}`);
}

export function getRecent() {
  return request("/api/drive/recent");
}

export function getStarred() {
  return request("/api/drive/starred");
}

export function getTrash() {
  return request("/api/drive/trash");
}

export function restoreFile(id) {
  return request(`/api/drive/trash/files/${id}/restore`, { method: "POST" });
}

export function restoreFolder(id) {
  return request(`/api/drive/trash/folders/${id}/restore`, { method: "POST" });
}

export function deleteFileForever(id) {
  return request(`/api/drive/trash/files/${id}`, { method: "DELETE" });
}

export function deleteFolderForever(id) {
  return request(`/api/drive/trash/folders/${id}`, { method: "DELETE" });
}

export function emptyTrash() {
  return request("/api/drive/trash", { method: "DELETE" });
}

export function getStorage() {
  return request("/api/drive/storage");
}
