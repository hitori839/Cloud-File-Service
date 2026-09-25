const EXT_KIND = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif", "heic"],
  video: ["mp4", "webm", "mov", "mkv", "avi", "m4v", "ogv"],
  audio: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "oga", "opus"],
  pdf: ["pdf"],
  doc: ["doc", "docx", "odt", "rtf", "hwp", "hwpx", "pages"],
  sheet: ["xls", "xlsx", "ods", "csv", "tsv", "numbers"],
  slides: ["ppt", "pptx", "odp", "key"],
  archive: ["zip", "tar", "gz", "tgz", "rar", "7z", "bz2", "xz", "jar", "war"],
  code: [
    "js", "jsx", "ts", "tsx", "java", "py", "go", "rs", "c", "h", "cpp", "cs", "rb",
    "php", "kt", "swift", "sh", "sql", "html", "css", "scss", "json", "xml", "yaml",
    "yml", "toml", "gradle", "properties", "tf", "dockerfile",
  ],
  text: ["txt", "md", "log", "ini", "conf", "env"],
};

const EXT_LOOKUP = Object.entries(EXT_KIND).reduce((acc, [kind, exts]) => {
  exts.forEach((ext) => {
    acc[ext] = kind;
  });
  return acc;
}, {});

export function extensionOf(name = "") {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
}

/** 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'archive' | 'code' | 'text' | 'other' */
export function fileKind(file) {
  const type = (file?.contentType || "").toLowerCase();
  const byExt = EXT_LOOKUP[extensionOf(file?.name || file?.originalName)];

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";
  if (byExt) return byExt;
  if (type.includes("spreadsheet") || type.includes("excel") || type === "text/csv") return "sheet";
  if (type.includes("presentation") || type.includes("powerpoint")) return "slides";
  if (type.includes("word") || type.includes("opendocument.text")) return "doc";
  if (type.includes("zip") || type.includes("compressed") || type.includes("tar")) return "archive";
  if (type.includes("json") || type.includes("javascript") || type.includes("xml")) return "code";
  if (type.startsWith("text/")) return "text";
  return "other";
}

export const KIND_LABEL = {
  folder: "폴더",
  image: "이미지",
  video: "동영상",
  audio: "오디오",
  pdf: "PDF",
  doc: "문서",
  sheet: "스프레드시트",
  slides: "프레젠테이션",
  archive: "압축 파일",
  code: "코드",
  text: "텍스트",
  other: "파일",
};

const TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024;

/* 스크립트를 실행할 수 있는 형식은 절대 렌더링하지 않고 텍스트로만 보여준다 */
const UNSAFE_TYPE = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)\b/i;
const UNSAFE_EXT = new Set(["html", "htm", "xhtml", "svg", "xml", "xsl", "xslt"]);

export function isUnsafeType(contentType) {
  return UNSAFE_TYPE.test((contentType || "").trim());
}

function isUnsafeFile(file) {
  return isUnsafeType(file?.contentType) || UNSAFE_EXT.has(extensionOf(file?.name || file?.originalName));
}

/** 미리보기 방식: 'image' | 'video' | 'audio' | 'pdf' | 'text' | null */
export function previewKind(file) {
  const size = file?.size ?? 0;
  if (isUnsafeFile(file)) return size <= TEXT_PREVIEW_LIMIT ? "text" : null;

  const kind = fileKind(file);
  if (["image", "video", "audio", "pdf"].includes(kind)) return kind;
  const ext = extensionOf(file?.name);
  const textLike = kind === "text" || kind === "code" || ext === "csv" || ext === "tsv";
  if (textLike && size <= TEXT_PREVIEW_LIMIT) return "text";
  return null;
}
