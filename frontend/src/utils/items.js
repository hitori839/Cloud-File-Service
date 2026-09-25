import { dateValue } from "./format";

export const itemKey = (item) => `${item.kind}-${item.id}`;

/** { folders, files } → [{ kind, ...folder }, { kind, ...file }] */
export function toItems(data) {
  if (!data) return [];
  return [
    ...(data.folders || []).map((folder) => ({ ...folder, kind: "folder" })),
    ...(data.files || []).map((file) => ({ ...file, kind: "file" })),
  ];
}

const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

function dateField(item, view) {
  return view === "trash" ? item.trashedAt || item.updatedAt : item.updatedAt || item.createdAt;
}

/** 폴더 먼저, 그 다음 sort 기준 (이름/날짜/크기) */
export function sortItems(items, sort, view) {
  const dir = sort.dir === "desc" ? -1 : 1;
  const compare = (a, b) => {
    let result = 0;
    if (sort.key === "date") result = dateValue(dateField(a, view)) - dateValue(dateField(b, view));
    else if (sort.key === "size") result = (a.size ?? 0) - (b.size ?? 0);
    if (result === 0) result = collator.compare(a.name || "", b.name || "");
    return result * dir;
  };
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    // 폴더는 크기가 없으므로 크기 정렬 시 이름순
    if (a.kind === "folder" && sort.key === "size") return collator.compare(a.name, b.name);
    return compare(a, b);
  });
}
