import {
  formatFileSize,
  formatDate,
} from "../utils/format";

function FileRow({
  file,
  onDownload,
  onRename,
  onMove,
  onDelete,
}) {
  return (
    <div className="file-row">
      <div>📄 {file.name}</div>
      <div>{file.contentType || "-"}</div>
      <div>{formatFileSize(file.size)}</div>
      <div>
        {formatDate(
          file.updatedAt || file.createdAt
        )}
      </div>

      <div className="row-actions">
        <button onClick={() => onDownload(file)}>
          다운로드
        </button>

        <button onClick={() => onRename(file)}>
          이름 변경
        </button>

        <button onClick={() => onMove(file)}>
          이동
        </button>

        <button onClick={() => onDelete(file)}>
          삭제
        </button>
      </div>
    </div>
  );
}

export default FileRow;