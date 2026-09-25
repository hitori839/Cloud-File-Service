const COLORS = ["#5b7cff", "#e2587a", "#1f9d74", "#e08a1e", "#8a5cff", "#1e8fc7", "#c2410c", "#0f766e"];

function colorFor(text = "") {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function Avatar({ user, size = 32 }) {
  const label = (user?.name || user?.email || "?").trim();
  const initial = label.charAt(0).toUpperCase();
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.44, background: colorFor(user?.email || label) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export default Avatar;
