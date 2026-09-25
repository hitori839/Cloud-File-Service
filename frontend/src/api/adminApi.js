import { request } from "./client";

export function listUsers() {
  return request("/api/admin/users");
}

export function deleteUser(id) {
  return request(`/api/admin/users/${id}`, { method: "DELETE" });
}
