import { useMemo, useSyncExternalStore } from "react";

/**
 * 아주 작은 해시 라우터.
 *   #/drive, #/folders/12, #/recent, #/starred, #/trash,
 *   #/search?q=..., #/account, #/admin, #/login, #/signup
 */
export function parseHash(hash) {
  const raw = (hash || "").replace(/^#/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  const params = new URLSearchParams(queryPart);
  const [head, second] = segments;

  switch (head) {
    case undefined:
    case "drive":
      return { name: "drive", folderId: null };
    case "folders": {
      const id = Number(second);
      return Number.isInteger(id) && id > 0
        ? { name: "folder", folderId: id }
        : { name: "drive", folderId: null };
    }
    case "recent":
    case "starred":
    case "trash":
    case "account":
    case "admin":
    case "login":
    case "signup":
      return { name: head, folderId: null };
    case "search":
      return { name: "search", folderId: null, q: params.get("q") || "" };
    default:
      return { name: "notfound", folderId: null };
  }
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path.startsWith("/") ? path : `/${path}`}`;
  if (window.location.hash === target) return;
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${target}`;
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target;
  }
}

export function folderPath(folderId) {
  return folderId === null || folderId === undefined ? "/drive" : `/folders/${folderId}`;
}

export function searchPath(q) {
  return `/search?${new URLSearchParams({ q }).toString()}`;
}

function subscribe(callback) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function getSnapshot() {
  return window.location.hash;
}

export default function useHashRoute() {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => "");
  return useMemo(() => parseHash(hash), [hash]);
}
