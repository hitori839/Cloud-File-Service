import { useState } from "react";
import { formatBytes } from "../utils/format";
import FileIcon from "./FileIcon";
import Icon from "./Icon";

function statusText(item) {
  switch (item.status) {
    case "queued":
      return "대기 중";
    case "uploading":
      return `${item.progress}% · ${formatBytes(item.size)}`;
    case "done":
      return formatBytes(item.size);
    case "canceled":
      return "취소됨";
    default:
      return item.error || "실패";
  }
}

/** 오른쪽 아래 업로드 진행 패널 */
function UploadPanel({ items, onCancel, onClear }) {
  const [collapsed, setCollapsed] = useState(false);
  if (items.length === 0) return null;

  const active = items.filter((item) => item.status === "queued" || item.status === "uploading").length;
  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "error").length;

  let title;
  if (active > 0) title = `${active}개 항목 업로드 중`;
  else if (failed > 0) title = `${done}개 완료, ${failed}개 실패`;
  else title = `${done}개 업로드 완료`;

  return (
    <section className={`upload-panel${collapsed ? " collapsed" : ""}`} aria-label="업로드 진행 상황">
      <header className="upload-head">
        <strong aria-live="polite">{title}</strong>
        <button
          type="button"
          className="icon-button small on-dark"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "업로드 목록 펼치기" : "업로드 목록 접기"}
          aria-expanded={!collapsed}
        >
          <Icon name="chevronDown" className={collapsed ? "rot-180" : ""} size={20} />
        </button>
        {active === 0 ? (
          <button type="button" className="icon-button small on-dark" onClick={onClear} aria-label="업로드 목록 닫기">
            <Icon name="close" size={20} />
          </button>
        ) : null}
      </header>
      {collapsed ? null : (
        <ul className="upload-list">
          {items.map((item) => (
            <li key={item.id} className={`upload-item status-${item.status}`}>
              <FileIcon item={{ kind: "file", name: item.name }} size={26} />
              <div className="upload-info">
                <span className="upload-name" title={item.name}>
                  {item.name}
                </span>
                <span className="upload-status">{statusText(item)}</span>
                {item.status === "uploading" ? (
                  <span className="upload-bar" aria-hidden="true">
                    <span style={{ width: `${item.progress}%` }} />
                  </span>
                ) : null}
              </div>
              {item.status === "done" ? (
                <Icon name="checkCircle" className="upload-ok" size={22} title="완료" />
              ) : item.status === "error" ? (
                <Icon name="alert" className="upload-fail" size={22} title="실패" />
              ) : item.status === "queued" || item.status === "uploading" ? (
                <button
                  type="button"
                  className="icon-button small"
                  onClick={() => onCancel(item.id)}
                  aria-label={`${item.name} 업로드 취소`}
                >
                  <Icon name="close" size={18} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default UploadPanel;
