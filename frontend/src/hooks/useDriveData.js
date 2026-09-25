import { useCallback } from "react";
import * as driveApi from "../api/driveApi";
import { listFiles } from "../api/fileApi";
import { getFolderPath, listFolders } from "../api/folderApi";
import useResource from "./useResource";

const EMPTY = { folders: [], files: [] };

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(result) {
  return {
    folders: asArray(result?.folders),
    files: asArray(result?.files),
  };
}

async function loadView(view, folderId, q) {
  switch (view) {
    case "drive":
    case "folder": {
      const [folders, files, path] = await Promise.all([
        listFolders(folderId),
        listFiles(folderId),
        folderId === null ? Promise.resolve([]) : getFolderPath(folderId),
      ]);
      return { folders: asArray(folders), files: asArray(files), path: asArray(path) };
    }
    case "recent":
      return { folders: [], files: asArray(await driveApi.getRecent()) };
    case "starred":
      return normalize(await driveApi.getStarred());
    case "search":
      return q.trim() ? normalize(await driveApi.searchDrive(q.trim())) : EMPTY;
    case "trash":
      return normalize(await driveApi.getTrash());
    default:
      return EMPTY;
  }
}

/** 현재 라우트(드라이브/폴더/최근/중요/검색/휴지통)의 항목을 불러온다. */
export default function useDriveData(route, version) {
  const view = route.name;
  const folderId = route.folderId ?? null;
  const q = route.q ?? "";
  const key = `${view}|${folderId}|${q}`;
  const loader = useCallback(() => loadView(view, folderId, q), [view, folderId, q]);
  return useResource(key, loader, version);
}
