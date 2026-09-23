export function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) {
    return "-";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) / Math.log(1024)
    ),
    units.length - 1
  );

  const value =
    bytes / Math.pow(1024, index);

  return `${value.toFixed(1)} ${units[index]}`;
}

export function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString(
    "ko-KR"
  );
}