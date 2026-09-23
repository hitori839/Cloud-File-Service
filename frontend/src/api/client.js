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