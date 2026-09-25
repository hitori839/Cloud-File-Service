import { request } from "./client";

export function signup({ email, password, name }) {
  return request("/api/auth/signup", {
    method: "POST",
    json: { email, password, name },
    auth: false,
  });
}

export function login({ email, password }) {
  return request("/api/auth/login", {
    method: "POST",
    json: { email, password },
    auth: false,
  });
}

export function getMe() {
  return request("/api/auth/me");
}
