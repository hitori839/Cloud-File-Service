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