import { fileKind } from "../utils/fileTypes";

/* 파일 종류별 컬러 아이콘 (인라인 SVG) */
const GLYPHS = {
  image: (
    <>
      <circle cx="9" cy="9.5" r="1.6" fill="#fff" />
      <path d="M6 17l3.8-4.2 2.6 2.7 2-2 3.6 3.5z" fill="#fff" />
    </>
  ),
  video: <path d="M9.5 8v8l6.5-4z" fill="#fff" />,
  audio: (
    <>
      <path d="M10 15.5V7.5l7-1.5v8" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
      <circle cx="8.6" cy="15.6" r="1.8" fill="#fff" />
      <circle cx="15.6" cy="14.1" r="1.8" fill="#fff" />
    </>
  ),
  pdf: (
    <text x="12" y="14.6" textAnchor="middle" fontSize="6.4" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
      PDF
    </text>
  ),
  doc: <path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />,
  text: <path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />,
  sheet: (
    <path
      d="M7 7.5h10v9H7zM7 10.5h10M7 13.5h10M11 7.5v9"
      stroke="#fff"
      strokeWidth="1.4"
      fill="none"
    />
  ),
  slides: (
    <>
      <rect x="7" y="8" width="10" height="7" rx="1" stroke="#fff" strokeWidth="1.5" fill="none" />
      <path d="M12 15v2" stroke="#fff" strokeWidth="1.5" />
    </>
  ),
  archive: (
    <path
      d="M12 6v1.5M12 9v1.5M12 12v1.5M10.5 14.5h3v2.5h-3z"
      stroke="#fff"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
    />
  ),
  code: (
    <path
      d="M9.5 8.5L6.5 12l3 3.5M14.5 8.5l3 3.5-3 3.5"
      stroke="#fff"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  other: (
    <path d="M9 7h4l3 3v7H9z" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
  ),
};

function FileIcon({ item, size = 24 }) {
  if (item.kind === "folder") {
    return (
      <svg className="file-icon kind-folder" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M2.5 6.5A2 2 0 0 1 4.5 4.5h4.6l2 2.2h8.4a2 2 0 0 1 2 2v9.8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z"
          fill="var(--folder-color)"
        />
        <path d="M2.5 9.2h19v9.3a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z" fill="var(--folder-front)" />
      </svg>
    );
  }

  const kind = fileKind(item);
  return (
    <svg className={`file-icon kind-${kind}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="currentColor" />
      {GLYPHS[kind] || GLYPHS.other}
    </svg>
  );
}

export default FileIcon;
