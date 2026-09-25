const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** 1536 → "1.5 KB", 1073741824 → "1 GB" */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) {
    return "—";
  }
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;

  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), UNITS.length - 1);
  const scaled = value / 1024 ** index;
  const digits = scaled < 10 ? 1 : 0;
  const text = scaled.toFixed(digits).replace(/\.0$/, "");
  return `${text} ${UNITS[index]}`;
}

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * 서버 LocalDateTime → Date.
 * 서버는 UTC로 동작하므로 타임존 없는 문자열은 UTC로 해석하고, 표시할 때 브라우저 로컬 시간으로 변환한다.
 * 소수점 이하 초(6~9자리)는 3자리로 자른다. [y,m,d,h,mi,s,nano] 배열 형식도 UTC로 처리.
 */
export function parseDate(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const [y, m = 1, d = 1, h = 0, mi = 0, s = 0, nano = 0] = value;
    return new Date(Date.UTC(y, m - 1, d, h, mi, s, Math.floor(nano / 1e6)));
  }
  let text = String(value).trim().replace(" ", "T");
  text = text.replace(/(\.\d{3})\d+/, "$1");
  if (/T/.test(text) && !HAS_ZONE.test(text)) text += "Z";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateValue(value) {
  const date = parseDate(value);
  return date ? date.getTime() : 0;
}

const timeFormat = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });
const monthDayFormat = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" });
const fullDateFormat = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Drive 스타일 짧은 날짜: 오늘이면 "오후 3:12", 올해면 "9월 25일", 아니면 "2025. 9. 25." */
export function formatShortDate(value) {
  const date = parseDate(value);
  if (!date) return "—";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return timeFormat.format(date);
  if (date.getFullYear() === now.getFullYear()) return monthDayFormat.format(date);
  return fullDateFormat.format(date);
}

export function formatDateTime(value) {
  const date = parseDate(value);
  return date ? dateTimeFormat.format(date) : "—";
}

export function formatJoinDate(value) {
  const date = parseDate(value);
  return date ? fullDateFormat.format(date) : "—";
}

export function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value ?? 0);
}

export function errorMessage(error, fallback = "문제가 발생했습니다.") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  return error.message || fallback;
}
