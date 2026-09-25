import { request } from "./client";

export function updateProfile(name) {
  return request("/api/users/me", { method: "PATCH", json: { name } });
}

export function changePassword(currentPassword, newPassword) {
  return request("/api/users/me/password", {
    method: "PATCH",
    json: { currentPassword, newPassword },
  });
}

export function deleteAccount(password) {
  return request("/api/users/me", { method: "DELETE", json: { password } });
}
