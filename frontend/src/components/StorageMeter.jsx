import { formatBytes } from "../utils/format";

function StorageMeter({ storage }) {
  const used = storage?.used ?? 0;
  const limit = storage?.limit ?? 0;
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 0;
  const level = ratio >= 0.95 ? "danger" : ratio >= 0.8 ? "warn" : "ok";

  return (
    <div className="storage-meter">
      <div className="storage-title">저장용량</div>
      <div
        className={`meter meter-${level}`}
        role="progressbar"
        aria-label="저장 공간 사용량"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <span style={{ width: `${Math.max(ratio * 100, storage ? 1 : 0)}%` }} />
      </div>
      <div className="storage-text">
        {storage ? `${formatBytes(used)} / ${formatBytes(limit)} 사용` : "용량 확인 중…"}
      </div>
    </div>
  );
}

export default StorageMeter;
