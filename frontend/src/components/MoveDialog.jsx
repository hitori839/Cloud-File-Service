import { useEffect, useMemo, useState } from "react";
import { getFolderTree } from "../api/folderApi";
import { errorMessage } from "../utils/format";
import Icon from "./Icon";
import Modal from "./Modal";
import Spinner from "./Spinner";

const ROOT = "root";

function buildTree(folders, excludeId) {
  const children = new Map();
  folders.forEach((folder) => {
    const parent = folder.parentFolderId ?? ROOT;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(folder);
  });
  children.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name, "ko")));

  // 폴더 이동 시 자기 자신과 하위 폴더 제외
  const excluded = new Set();
  if (excludeId !== null) {
    const stack = [excludeId];
    while (stack.length) {
      const id = stack.pop();
      excluded.add(id);
      (children.get(id) || []).forEach((child) => stack.push(child.id));
    }
  }
  return { children, excluded };
}

function TreeNode({ folder, depth, tree, selected, expanded, onSelect, onToggle, onConfirm }) {
  const kids = (tree.children.get(folder.id) || []).filter((child) => !tree.excluded.has(child.id));
  const isOpen = expanded.has(folder.id);
  return (
    <li role="treeitem" aria-expanded={kids.length ? isOpen : undefined} aria-selected={selected === folder.id}>
      <div className={`tree-row${selected === folder.id ? " selected" : ""}`} style={{ paddingLeft: 8 + depth * 18 }}>
        {kids.length ? (
          <button
            type="button"
            className="tree-toggle"
            onClick={() => onToggle(folder.id)}
            aria-label={isOpen ? `${folder.name} 접기` : `${folder.name} 펼치기`}
          >
            <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={16} />
          </button>
        ) : (
          <span className="tree-toggle-space" />
        )}
        <button
          type="button"
          className="tree-label"
          onClick={() => onSelect(folder.id)}
          onDoubleClick={() => onConfirm(folder.id)}
        >
          <Icon name="folder" size={18} />
          <span>{folder.name}</span>
        </button>
      </div>
      {isOpen && kids.length ? (
        <ul role="group">
          {kids.map((child) => (
            <TreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              tree={tree}
              selected={selected}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
              onConfirm={onConfirm}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** 폴더 트리에서 이동 위치 선택 (null = 내 드라이브) */
function MoveDialog({ item, onClose, onMove }) {
  const currentParent = (item.kind === "folder" ? item.parentFolderId : item.folderId) ?? null;
  const [result, setResult] = useState({ folders: null, error: null });
  const [selected, setSelected] = useState(currentParent);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    getFolderTree().then(
      (folders) => {
        if (!alive) return;
        const list = Array.isArray(folders) ? folders : [];
        // 현재 위치까지 펼쳐 두기
        const byId = new Map(list.map((folder) => [folder.id, folder]));
        const open = new Set();
        let cursor = currentParent === null ? null : byId.get(currentParent);
        while (cursor) {
          if (cursor.parentFolderId != null) open.add(cursor.parentFolderId);
          cursor = cursor.parentFolderId == null ? null : byId.get(cursor.parentFolderId);
        }
        setExpanded(open);
        setResult({ folders: list, error: null });
      },
      (error) => {
        if (alive) setResult({ folders: null, error });
      },
    );
    return () => {
      alive = false;
    };
  }, [currentParent]);

  const tree = useMemo(
    () => buildTree(result.folders || [], item.kind === "folder" ? item.id : null),
    [result.folders, item],
  );
  const rootChildren = (tree.children.get(ROOT) || []).filter((folder) => !tree.excluded.has(folder.id));

  const nameOf = (id) =>
    id === null ? "내 드라이브" : (result.folders || []).find((folder) => folder.id === id)?.name ?? "폴더";

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm(target = selected) {
    if (target === currentParent) return;
    onMove(target, nameOf(target));
  }

  const same = selected === currentParent;

  return (
    <Modal
      title={`"${item.name}" 이동`}
      onClose={onClose}
      footer={
        <>
          <span className="move-hint">{same ? "현재 위치입니다" : `${nameOf(selected)}(으)로 이동`}</span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn btn-primary" disabled={same || !result.folders} onClick={() => confirm()}>
            여기로 이동
          </button>
        </>
      }
    >
      {result.error ? (
        <p className="form-alert" role="alert">
          <Icon name="alert" size={18} />
          {errorMessage(result.error, "폴더 목록을 불러오지 못했습니다.")}
        </p>
      ) : !result.folders ? (
        <div className="center-pad">
          <Spinner />
        </div>
      ) : (
        <ul className="folder-tree" role="tree" aria-label="이동할 폴더">
          <li role="treeitem" aria-selected={selected === null} aria-expanded>
            <div className={`tree-row${selected === null ? " selected" : ""}`} style={{ paddingLeft: 8 }}>
              <span className="tree-toggle-space" />
              <button
                type="button"
                className="tree-label"
                onClick={() => setSelected(null)}
                onDoubleClick={() => confirm(null)}
              >
                <Icon name="drive" size={18} />
                <span>내 드라이브</span>
              </button>
            </div>
            <ul role="group">
              {rootChildren.map((folder) => (
                <TreeNode
                  key={folder.id}
                  folder={folder}
                  depth={1}
                  tree={tree}
                  selected={selected}
                  expanded={expanded}
                  onSelect={setSelected}
                  onToggle={toggle}
                  onConfirm={confirm}
                />
              ))}
            </ul>
          </li>
        </ul>
      )}
    </Modal>
  );
}

export default MoveDialog;
