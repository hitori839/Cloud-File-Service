import { useCallback, useMemo, useRef, useState } from "react";
import Breadcrumb from "../components/Breadcrumb";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import ItemList, { ItemListSkeleton } from "../components/ItemList";
import Menu from "../components/Menu";
import MoveDialog from "../components/MoveDialog";
import NewMenuButton from "../components/NewMenuButton";
import PreviewModal from "../components/PreviewModal";
import Spinner from "../components/Spinner";
import useDriveData from "../hooks/useDriveData";
import { folderPath, navigate } from "../hooks/useHashRoute";
import useToast from "../hooks/useToast";
import { errorMessage } from "../utils/format";
import { itemKey, sortItems, toItems } from "../utils/items";

const TITLES = {
  recent: "최근 문서함",
  starred: "중요 문서함",
  trash: "휴지통",
};

const DEFAULT_SORT = {
  recent: { key: "date", dir: "desc" },
  trash: { key: "date", dir: "desc" },
};

const SORT_LABEL = { name: "이름", date: "날짜", size: "크기" };

function emptyStateFor(view, q) {
  switch (view) {
    case "recent":
      return { variant: "recent", title: "최근 문서가 없습니다", description: "파일을 업로드하거나 수정하면 여기에 표시됩니다." };
    case "starred":
      return { variant: "star", title: "중요 문서함이 비어 있습니다", description: "자주 찾는 파일과 폴더에 중요 표시를 해 보세요." };
    case "trash":
      return { variant: "trash", title: "휴지통이 비어 있습니다", description: "삭제한 항목은 영구 삭제하기 전까지 여기에 보관됩니다." };
    case "search":
      return q.trim()
        ? { variant: "search", title: "검색 결과가 없습니다", description: `"${q.trim()}"와(과) 일치하는 파일이나 폴더가 없습니다.` }
        : { variant: "search", title: "검색어를 입력하세요", description: "파일과 폴더 이름으로 검색할 수 있습니다." };
    case "folder":
      return { variant: "folder", title: "빈 폴더입니다", description: "파일을 여기로 끌어다 놓거나 ‘새로 만들기’ 버튼을 사용하세요." };
    default:
      return { variant: "folder", title: "내 드라이브에 오신 것을 환영합니다", description: "파일을 끌어다 놓거나 ‘새로 만들기’로 업로드해 보세요." };
  }
}

function isTouchDevice() {
  return typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches;
}

function hasFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

/**
 * 내 드라이브 / 폴더 / 최근 / 중요 / 검색 / 휴지통 공용 페이지.
 * 라우트가 바뀌면(App에서 key 변경) 새로 마운트된다.
 */
function DrivePage({ route, version, actions, viewMode, onViewModeChange, onUploadFiles, onNewFolder, onPickFiles, onRefresh }) {
  const toast = useToast();
  const view = route.name;
  const q = route.q ?? "";
  const isDrive = view === "drive" || view === "folder";
  const isTrash = view === "trash";

  const { data, error, loading, refreshing } = useDriveData(route, version);
  const [sort, setSort] = useState(DEFAULT_SORT[view] || { key: "name", dir: "asc" });
  const [selectedKey, setSelectedKey] = useState(null);
  const [menu, setMenu] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const items = useMemo(() => sortItems(toItems(data), sort, view), [data, sort, view]);
  const previewable = useMemo(() => items.filter((item) => item.kind === "file"), [items]);

  const open = useCallback(
    (item) => {
      if (isTrash) {
        toast.info("휴지통에 있는 항목은 복원한 뒤에 열 수 있습니다.");
        return;
      }
      if (item.kind === "folder") navigate(folderPath(item.id));
      else setPreviewFile(item);
    },
    [isTrash, toast],
  );

  const select = useCallback(
    (item) => {
      setSelectedKey(itemKey(item));
      if (isTouchDevice()) open(item);
    },
    [open],
  );

  const onMenu = useCallback((item, position) => {
    setSelectedKey(itemKey(item));
    setMenu({ item, position });
  }, []);

  const onDeleteKey = useCallback(
    (item) => {
      if (isTrash) actions.deleteForever(item);
      else actions.trash(item);
    },
    [actions, isTrash],
  );

  function menuItems(item) {
    if (isTrash) {
      return [
        { key: "restore", label: "복원", icon: "restore", onSelect: () => actions.restore(item) },
        { key: "d1", divider: true },
        { key: "forever", label: "영구 삭제", icon: "trash", danger: true, onSelect: () => actions.deleteForever(item) },
      ];
    }
    const parentId = item.kind === "folder" ? item.parentFolderId : item.folderId;
    const locate = !isDrive
      ? [{ key: "locate", label: "위치 열기", icon: "location", onSelect: () => navigate(folderPath(parentId ?? null)) }]
      : [];
    const star = {
      key: "star",
      label: item.starred ? "중요 표시 해제" : "중요 표시",
      icon: item.starred ? "starFilled" : "star",
      onSelect: () => actions.toggleStar(item),
    };
    const common = [
      { key: "rename", label: "이름 바꾸기", icon: "edit", onSelect: () => actions.rename(item) },
      { key: "move", label: "이동", icon: "move", onSelect: () => setMoveTarget(item) },
      star,
      ...locate,
      { key: "d2", divider: true },
    ];
    if (item.kind === "folder") {
      return [
        { key: "open", label: "열기", icon: "open", onSelect: () => open(item) },
        { key: "d1", divider: true },
        ...common,
        { key: "trash", label: "삭제", icon: "trash", danger: true, onSelect: () => actions.trash(item) },
      ];
    }
    return [
      { key: "preview", label: "미리보기", icon: "eye", onSelect: () => open(item) },
      { key: "download", label: "다운로드", icon: "download", onSelect: () => actions.download(item) },
      { key: "d1", divider: true },
      ...common,
      { key: "trash", label: "휴지통으로 이동", icon: "trash", danger: true, onSelect: () => actions.trash(item) },
    ];
  }

  /* ---------- drag & drop upload ---------- */

  const dropHandlers = isDrive
    ? {
        onDragEnter: (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        },
        onDragOver: (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (event) => {
          if (!hasFiles(event)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        },
        onDrop: (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          const files = [];
          let skipped = 0;
          const transferItems = Array.from(event.dataTransfer.items || []);
          if (transferItems.length) {
            transferItems.forEach((entry) => {
              if (entry.kind !== "file") return;
              if (entry.webkitGetAsEntry?.()?.isDirectory) {
                skipped += 1;
                return;
              }
              const file = entry.getAsFile();
              if (file) files.push(file);
            });
          } else {
            files.push(...Array.from(event.dataTransfer.files || []));
          }
          if (skipped) toast.info("폴더 업로드는 지원하지 않습니다. 파일만 업로드합니다.");
          if (files.length) onUploadFiles(files);
        },
      }
    : {};

  /* ---------- header ---------- */

  const path = data?.path || [];
  const folderName = view === "folder" ? path[path.length - 1]?.name : "내 드라이브";
  const notFound = view === "folder" && error?.status === 404;

  let heading;
  if (isDrive) {
    heading =
      view === "folder" && loading ? (
        <div className="breadcrumb">
          <span className="skeleton skeleton-title" />
        </div>
      ) : (
        <Breadcrumb path={path} />
      );
  } else if (view === "search") {
    heading = <h1 className="page-title">{q.trim() ? `‘${q.trim()}’ 검색 결과` : "검색"}</h1>;
  } else {
    heading = <h1 className="page-title">{TITLES[view]}</h1>;
  }

  /* ---------- body ---------- */

  let body;
  if (loading) {
    body = <ItemListSkeleton viewMode={viewMode} />;
  } else if (notFound) {
    body = (
      <EmptyState variant="error" title="폴더를 찾을 수 없습니다" description="삭제되었거나 접근 권한이 없는 폴더입니다.">
        <a className="btn btn-primary" href="#/drive">
          내 드라이브로 이동
        </a>
      </EmptyState>
    );
  } else if (error) {
    body = (
      <EmptyState variant="error" title="목록을 불러오지 못했습니다" description={errorMessage(error)}>
        <button type="button" className="btn btn-primary" onClick={onRefresh}>
          <Icon name="refresh" size={18} />
          다시 시도
        </button>
      </EmptyState>
    );
  } else if (items.length === 0) {
    const empty = emptyStateFor(view, q);
    body = (
      <EmptyState {...empty}>
        {isDrive ? (
          <button type="button" className="btn btn-primary" onClick={onPickFiles}>
            <Icon name="upload" size={18} />
            파일 업로드
          </button>
        ) : null}
      </EmptyState>
    );
  } else {
    body = (
      <ItemList
        items={items}
        viewMode={viewMode}
        view={view}
        selectedKey={selectedKey}
        sort={sort}
        onSortChange={setSort}
        onSelect={select}
        onOpen={open}
        onMenu={onMenu}
        onDeleteKey={onDeleteKey}
      />
    );
  }

  return (
    <div
      className={`drive-page${dragging ? " is-dragging" : ""}`}
      {...dropHandlers}
      onClick={(event) => {
        if (!event.target.closest?.("[data-item-key]")) setSelectedKey(null);
      }}
    >
      <div className="page-head">
        <div className="page-heading">
          {heading}
          {refreshing ? <Spinner size={16} label="새로고침 중" /> : null}
        </div>
        <div className="page-tools">
          {isTrash && items.length > 0 ? (
            <button type="button" className="btn btn-danger-ghost" onClick={() => actions.emptyTrash()}>
              <Icon name="trash" size={18} />
              휴지통 비우기
            </button>
          ) : null}
          <label className="sort-select">
            <span className="sr-only">정렬 기준</span>
            <select value={sort.key} onChange={(event) => setSort((prev) => ({ ...prev, key: event.target.value }))}>
              {Object.entries(SORT_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="icon-button"
            onClick={() => setSort((prev) => ({ ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }))}
            aria-label={sort.dir === "asc" ? "오름차순 (클릭하면 내림차순)" : "내림차순 (클릭하면 오름차순)"}
            title={sort.dir === "asc" ? "오름차순" : "내림차순"}
          >
            <Icon name={sort.dir === "asc" ? "arrowUp" : "arrowDown"} size={18} />
          </button>
          <div className="segmented" role="group" aria-label="보기 방식">
            <button
              type="button"
              className={viewMode === "list" ? "active" : ""}
              aria-pressed={viewMode === "list"}
              aria-label="목록 보기"
              onClick={() => onViewModeChange("list")}
            >
              <Icon name="list" size={18} />
            </button>
            <button
              type="button"
              className={viewMode === "grid" ? "active" : ""}
              aria-pressed={viewMode === "grid"}
              aria-label="바둑판 보기"
              onClick={() => onViewModeChange("grid")}
            >
              <Icon name="grid" size={18} />
            </button>
          </div>
        </div>
      </div>

      {isTrash && items.length > 0 ? (
        <div className="info-banner">
          <Icon name="info" size={18} />
          휴지통의 항목도 영구 삭제하기 전까지 저장 공간을 차지합니다.
        </div>
      ) : null}

      <div className="page-body">{body}</div>

      {dragging ? (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-card">
            <Icon name="upload" size={40} />
            <strong>파일을 놓아 업로드</strong>
            <span>{folderName || "현재 폴더"}에 업로드됩니다</span>
          </div>
        </div>
      ) : null}

      {isDrive ? (
        <div className="fab-wrap">
          <NewMenuButton variant="fab" onNewFolder={onNewFolder} onUpload={onPickFiles} />
        </div>
      ) : null}

      {menu ? (
        <Menu
          position={menu.position}
          items={menuItems(menu.item)}
          onClose={() => setMenu(null)}
          label={`${menu.item.name} 작업`}
        />
      ) : null}

      {moveTarget ? (
        <MoveDialog
          item={moveTarget}
          onClose={() => setMoveTarget(null)}
          onMove={(targetId, targetName) => {
            const item = moveTarget;
            setMoveTarget(null);
            actions.move(item, targetId, targetName);
          }}
        />
      ) : null}

      {previewFile ? (
        <PreviewModal
          files={previewable}
          initialFile={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={actions.download}
        />
      ) : null}
    </div>
  );
}

export default DrivePage;
