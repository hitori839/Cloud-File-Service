import { useEffect, useRef, useState } from "react";
import { fetchPreviewBlob } from "../api/fileApi";
import useDismiss from "../hooks/useDismiss";
import { KIND_LABEL, fileKind, isUnsafeType, previewKind } from "../utils/fileTypes";
import { errorMessage, formatBytes, formatDateTime } from "../utils/format";
import FileIcon from "./FileIcon";
import Icon from "./Icon";
import Spinner from "./Spinner";

const FORCED_TYPE = { pdf: "application/pdf" };

function Unsupported({ file, onDownload, message }) {
  return (
    <div className="preview-unsupported">
      <FileIcon item={file} size={72} />
      <h3>{message || "미리보기를 지원하지 않는 형식입니다"}</h3>
      <p>
        {KIND_LABEL[fileKind(file)]} · {formatBytes(file.size)}
      </p>
      <button type="button" className="btn btn-primary" onClick={() => onDownload(file)}>
        <Icon name="download" size={18} />
        다운로드
      </button>
    </div>
  );
}

/** 파일 하나의 미리보기. 인증된 fetch → blob object URL, 언마운트 시 revoke */
function PreviewContent({ file, onDownload }) {
  const kind = previewKind(file);
  const [state, setState] = useState({ status: kind ? "loading" : "unsupported" });

  useEffect(() => {
    if (!kind) return undefined;
    let alive = true;
    let url = null;
    const controller = new AbortController();

    fetchPreviewBlob(file.id, controller.signal)
      .then(async (blob) => {
        if (!alive) return;
        // HTML/SVG/XML 등은 blob URL로 렌더링하지 않고 텍스트로만 표시
        if (kind === "text" || isUnsafeType(blob.type)) {
          const text = await blob.text();
          if (alive) setState({ status: "ready", text, asText: true });
          return;
        }
        let wanted =
          FORCED_TYPE[kind] ||
          (!blob.type || blob.type === "application/octet-stream" ? file.contentType : blob.type) ||
          "";
        if (isUnsafeType(wanted)) wanted = "application/octet-stream";
        const typed = blob.type === wanted ? blob : new Blob([blob], { type: wanted });
        url = URL.createObjectURL(typed);
        setState({ status: "ready", url });
      })
      .catch((error) => {
        if (alive && error?.name !== "AbortError") setState({ status: "error", error });
      });

    return () => {
      alive = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.id, file.contentType, kind]);

  if (state.status === "unsupported") return <Unsupported file={file} onDownload={onDownload} />;
  if (state.status === "loading") {
    return (
      <div className="preview-loading">
        <Spinner size={40} label="미리보기 불러오는 중" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Unsupported
        file={file}
        onDownload={onDownload}
        message={errorMessage(state.error, "미리보기를 불러오지 못했습니다")}
      />
    );
  }
  if (state.status === "media-error") {
    return <Unsupported file={file} onDownload={onDownload} message="이 브라우저에서 재생할 수 없는 형식입니다" />;
  }

  const onMediaError = () => setState({ status: "media-error" });

  if (state.asText) return <pre className="preview-text">{state.text}</pre>;

  switch (kind) {
    case "image":
      return <img className="preview-image" src={state.url} alt={file.name} onError={onMediaError} />;
    case "video":
      return <video className="preview-video" src={state.url} controls autoPlay onError={onMediaError} />;
    case "audio":
      return (
        <div className="preview-audio">
          <FileIcon item={file} size={96} />
          <audio src={state.url} controls autoPlay onError={onMediaError} />
        </div>
      );
    case "pdf":
      return (
        <object className="preview-pdf" data={state.url} type="application/pdf" aria-label={file.name}>
          <Unsupported file={file} onDownload={onDownload} message="이 브라우저에서는 PDF를 표시할 수 없습니다" />
        </object>
      );
    default:
      return <Unsupported file={file} onDownload={onDownload} />;
  }
}

/** 전체 화면 미리보기 (← → 로 목록 내 다른 파일 이동) */
function PreviewModal({ files, initialFile, onClose, onDownload }) {
  const [currentId, setCurrentId] = useState(initialFile.id);
  const closeRef = useRef(null);
  useDismiss(true, onClose);

  const index = files.findIndex((file) => file.id === currentId);
  const file = index >= 0 ? files[index] : initialFile;
  const prev = index > 0 ? files[index - 1] : null;
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null;

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "VIDEO", "AUDIO"].includes(event.target.tagName)) return;
      if (event.key === "ArrowLeft" && prev) setCurrentId(prev.id);
      if (event.key === "ArrowRight" && next) setCurrentId(next.id);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [prev, next]);

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label={`미리보기: ${file.name}`}>
      <header className="preview-bar">
        <button ref={closeRef} type="button" className="icon-button on-dark" onClick={onClose} aria-label="미리보기 닫기">
          <Icon name="close" />
        </button>
        <FileIcon item={file} size={24} />
        <div className="preview-title">
          <strong title={file.name}>{file.name}</strong>
          <span>
            {formatBytes(file.size)} · {formatDateTime(file.updatedAt || file.createdAt)}
          </span>
        </div>
        <button type="button" className="btn btn-on-dark" onClick={() => onDownload(file)}>
          <Icon name="download" size={18} />
          <span className="hide-sm">다운로드</span>
        </button>
      </header>
      <div
        className="preview-stage"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <PreviewContent key={file.id} file={file} onDownload={onDownload} />
      </div>
      {prev ? (
        <button type="button" className="preview-nav prev" onClick={() => setCurrentId(prev.id)} aria-label="이전 파일">
          <Icon name="chevronLeft" size={28} />
        </button>
      ) : null}
      {next ? (
        <button type="button" className="preview-nav next" onClick={() => setCurrentId(next.id)} aria-label="다음 파일">
          <Icon name="chevronRight" size={28} />
        </button>
      ) : null}
    </div>
  );
}

export default PreviewModal;
