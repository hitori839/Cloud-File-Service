import { KIND_LABEL, fileKind } from "../utils/fileTypes";
import { formatBytes, formatDateTime, formatShortDate } from "../utils/format";
import FileIcon from "./FileIcon";
import Icon from "./Icon";
import { itemKey } from "../utils/items";

function dateOf(item, view) {
  return view === "trash" ? item.trashedAt || item.updatedAt : item.updatedAt || item.createdAt;
}

function SortHeader({ label, field, sort, onSortChange, className }) {
  const active = sort.key === field;
  return (
    <div className={`col ${className}`} role="columnheader" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={`sort-header${active ? " active" : ""}`}
        onClick={() =>
          onSortChange(active ? { key: field, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: field, dir: field === "name" ? "asc" : "desc" })
        }
      >
        {label}
        {active ? <Icon name={sort.dir === "asc" ? "arrowUp" : "arrowDown"} size={15} /> : null}
      </button>
    </div>
  );
}

function MoreButton({ item, onMenu }) {
  return (
    <button
      type="button"
      className="icon-button more-button"
      aria-label={`${item.name} 작업 더보기`}
      aria-haspopup="menu"
      onClick={(event) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onMenu(item, { x: rect.right, y: rect.bottom + 2, alignRight: true, flipY: rect.top - 2 });
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Icon name="more" />
    </button>
  );
}

function itemHandlers(item, { onSelect, onOpen, onMenu, onDeleteKey }) {
  return {
    tabIndex: 0,
    onClick: () => onSelect(item),
    onDoubleClick: () => onOpen(item),
    onContextMenu: (event) => {
      event.preventDefault();
      onSelect(item, { keepFocus: true });
      onMenu(item, { x: event.clientX, y: event.clientY });
    },
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter") {
        event.preventDefault();
        onOpen(item);
      } else if (event.key === " ") {
        event.preventDefault();
        onSelect(item);
      } else if (event.key === "Delete") {
        event.preventDefault();
        onDeleteKey(item);
      } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onMenu(item, { x: rect.left + 24, y: rect.bottom, flipY: rect.top });
      }
    },
  };
}

function ItemName({ item }) {
  return (
    <>
      <span className="item-name-text" title={item.name}>
        {item.name}
      </span>
      {item.starred ? <Icon name="starFilled" size={15} className="star-badge" title="중요" /> : null}
    </>
  );
}

function ListView({ items, view, selectedKey, sort, onSortChange, handlers }) {
  return (
    <div className="item-table" role="table" aria-label="파일 목록">
      <div className="item-table-head" role="row">
        <SortHeader label="이름" field="name" sort={sort} onSortChange={onSortChange} className="col-name" />
        <SortHeader
          label={view === "trash" ? "삭제한 날짜" : "수정한 날짜"}
          field="date"
          sort={sort}
          onSortChange={onSortChange}
          className="col-date"
        />
        <SortHeader label="파일 크기" field="size" sort={sort} onSortChange={onSortChange} className="col-size" />
        <div className="col col-actions" role="columnheader">
          <span className="sr-only">작업</span>
        </div>
      </div>
      <ul className="item-rows" role="rowgroup">
        {items.map((item) => {
          const key = itemKey(item);
          const date = dateOf(item, view);
          return (
            <li
              key={key}
              role="row"
              className={`item-row${selectedKey === key ? " selected" : ""}`}
              aria-selected={selectedKey === key}
              aria-label={`${item.kind === "folder" ? "폴더" : KIND_LABEL[fileKind(item)]} ${item.name}`}
              data-item-key={key}
              {...itemHandlers(item, handlers)}
            >
              <div className="col col-name" role="cell">
                <FileIcon item={item} size={24} />
                <div className="item-name">
                  <div className="item-name-line">
                    <ItemName item={item} />
                  </div>
                  <span className="item-sub">
                    {formatShortDate(date)}
                    {item.kind === "file" ? ` · ${formatBytes(item.size)}` : ""}
                  </span>
                </div>
              </div>
              <div className="col col-date" role="cell" title={formatDateTime(date)}>
                {formatShortDate(date)}
              </div>
              <div className="col col-size" role="cell">
                {item.kind === "file" ? formatBytes(item.size) : "—"}
              </div>
              <div className="col col-actions" role="cell">
                <MoreButton item={item} onMenu={handlers.onMenu} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GridSection({ title, items, selectedKey, handlers, view }) {
  if (items.length === 0) return null;
  return (
    <section className="grid-section" aria-label={title}>
      <h2 className="grid-title">{title}</h2>
      <ul className={items[0].kind === "folder" ? "folder-grid" : "file-grid"}>
        {items.map((item) => {
          const key = itemKey(item);
          const selected = selectedKey === key;
          if (item.kind === "folder") {
            return (
              <li
                key={key}
                className={`folder-card${selected ? " selected" : ""}`}
                aria-label={`폴더 ${item.name}`}
                aria-selected={selected}
                data-item-key={key}
                {...itemHandlers(item, handlers)}
              >
                <FileIcon item={item} size={24} />
                <span className="card-name">
                  <ItemName item={item} />
                </span>
                <MoreButton item={item} onMenu={handlers.onMenu} />
              </li>
            );
          }
          return (
            <li
              key={key}
              className={`file-card${selected ? " selected" : ""}`}
              aria-label={`${KIND_LABEL[fileKind(item)]} ${item.name}`}
              aria-selected={selected}
              data-item-key={key}
              {...itemHandlers(item, handlers)}
            >
              <div className="card-head">
                <FileIcon item={item} size={20} />
                <span className="card-name">
                  <ItemName item={item} />
                </span>
                <MoreButton item={item} onMenu={handlers.onMenu} />
              </div>
              <div className={`card-thumb kind-bg-${fileKind(item)}`}>
                <FileIcon item={item} size={64} />
              </div>
              <div className="card-meta">
                {formatShortDate(dateOf(item, view))} · {formatBytes(item.size)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 목록/바둑판 보기 */
function ItemList({ items, viewMode, view, selectedKey, sort, onSortChange, onSelect, onOpen, onMenu, onDeleteKey }) {
  const handlers = { onSelect, onOpen, onMenu, onDeleteKey };
  if (viewMode === "grid") {
    const folders = items.filter((item) => item.kind === "folder");
    const files = items.filter((item) => item.kind === "file");
    return (
      <div className="item-grid-wrap">
        <GridSection title="폴더" items={folders} selectedKey={selectedKey} handlers={handlers} view={view} />
        <GridSection title="파일" items={files} selectedKey={selectedKey} handlers={handlers} view={view} />
      </div>
    );
  }
  return (
    <ListView
      items={items}
      view={view}
      selectedKey={selectedKey}
      sort={sort}
      onSortChange={onSortChange}
      handlers={handlers}
    />
  );
}

export function ItemListSkeleton({ viewMode }) {
  if (viewMode === "grid") {
    return (
      <div className="item-grid-wrap" aria-busy="true" aria-label="불러오는 중">
        <ul className="file-grid">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index} className="file-card skeleton-card">
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-thumb" />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="item-table" aria-busy="true" aria-label="불러오는 중">
      <ul className="item-rows">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index} className="item-row skeleton-row">
            <span className="skeleton skeleton-icon" />
            <span className="skeleton skeleton-line" style={{ width: `${30 + ((index * 17) % 40)}%` }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ItemList;
