const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export const TOKEN_KEY = "cfs_token";

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* ---------- token ---------- */

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage unavailable (private mode 등) — 세션 동안만 유지되지 않음
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/* ---------- 401 handling ---------- */

const unauthorizedListeners = new Set();

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export function handleUnauthorized() {
  clearToken();
  unauthorizedListeners.forEach((listener) => listener());
}

/* ---------- helpers ---------- */

const STATUS_MESSAGES = {
  400: "요청이 올바르지 않습니다.",
  401: "로그인이 필요합니다.",
  403: "권한이 없습니다.",
  404: "항목을 찾을 수 없습니다.",
  409: "요청이 현재 상태와 충돌합니다.",
  413: "저장 공간이 부족하거나 파일이 너무 큽니다.",
  500: "서버 오류가 발생했습니다.",
};

export function messageForStatus(status) {
  return STATUS_MESSAGES[status] || `요청에 실패했습니다. (HTTP ${status})`;
}

export function parseErrorText(text, status) {
  if (text) {
    try {
      const data = JSON.parse(text);
      if (data && typeof data.message === "string" && data.message) {
        return data.message;
      }
    } catch {
      // JSON이 아닌 응답
    }
  }
  return messageForStatus(status);
}

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export function buildQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

/**
 * 모든 API 호출의 진입점.
 * options: { method, json, body, headers, auth = true, raw = false, signal }
 *  - json: JSON body (Content-Type 자동 설정)
 *  - auth: false면 Authorization 헤더를 붙이지 않고 401이어도 로그아웃하지 않음
 *  - raw: true면 Response 객체를 그대로 반환
 */
export async function request(path, options = {}) {
  const { method = "GET", json, body, headers = {}, auth = true, raw = false, signal } = options;

  const finalHeaders = { ...headers };
  let finalBody = body;

  if (json !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(json);
  }

  const token = auth ? getToken() : null;
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: finalHeaders,
      body: finalBody,
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.", 0);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const message = parseErrorText(text, response.status);

    if (response.status === 401 && auth) {
      handleUnauthorized();
    }

    throw new ApiError(message, response.status);
  }

  if (raw) return response;

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text || null;
}

/** 인증된 요청으로 바이너리를 받아 Blob으로 반환 */
export async function requestBlob(path, options = {}) {
  const response = await request(path, { ...options, raw: true });
  return response.blob();
}
