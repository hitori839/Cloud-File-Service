/* 친근한 일러스트 스타일의 빈 상태 */
function Illustration({ variant }) {
  const common = (
    <>
      <ellipse cx="80" cy="128" rx="58" ry="8" className="ill-shadow" />
      <circle cx="30" cy="30" r="4" className="ill-dot" />
      <circle cx="138" cy="44" r="3" className="ill-dot" />
      <circle cx="126" cy="16" r="2" className="ill-dot" />
    </>
  );

  switch (variant) {
    case "trash":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <rect x="52" y="38" width="56" height="10" rx="5" className="ill-accent" />
          <rect x="70" y="30" width="20" height="10" rx="4" className="ill-accent" />
          <path d="M56 52h48l-5 66a6 6 0 0 1-6 5.5H67a6 6 0 0 1-6-5.5z" className="ill-paper" />
          <path d="M71 64v46M80 64v46M89 64v46" className="ill-line" />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <path
            d="M80 22l15 30 33 5-24 23 6 33-30-16-30 16 6-33-24-23 33-5z"
            className="ill-paper"
          />
          <path d="M80 44l8 16 17 3-12 12 3 17-16-8-16 8 3-17-12-12 17-3z" className="ill-accent" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <rect x="34" y="28" width="62" height="80" rx="8" className="ill-paper" />
          <path d="M46 48h38M46 60h30M46 72h34" className="ill-line" />
          <circle cx="102" cy="82" r="20" className="ill-lens" />
          <path d="M116 96l16 16" className="ill-handle" />
        </svg>
      );
    case "recent":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <circle cx="80" cy="70" r="46" className="ill-paper" />
          <circle cx="80" cy="70" r="34" className="ill-accent-soft" />
          <path d="M80 48v24l16 10" className="ill-handle" />
        </svg>
      );
    case "error":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <path d="M31 57a18 18 0 0 1 20-27 26 26 0 0 1 48 6 18 18 0 0 1 21 26z" className="ill-paper" />
          <path d="M70 84l20 20M90 84l-20 20" className="ill-handle" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <circle cx="80" cy="54" r="22" className="ill-accent-soft" />
          <path d="M40 120a40 40 0 0 1 80 0z" className="ill-paper" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 160 140" aria-hidden="true">
          {common}
          <path d="M28 44a8 8 0 0 1 8-8h28l10 10h50a8 8 0 0 1 8 8v58a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8z" className="ill-folder-back" />
          <rect x="48" y="30" width="58" height="50" rx="6" className="ill-paper" transform="rotate(-6 77 55)" />
          <path d="M28 62h104v50a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8z" className="ill-folder" />
          <path d="M70 90h20M80 80v20" className="ill-plus" />
        </svg>
      );
  }
}

function EmptyState({ variant = "folder", title, description, children }) {
  return (
    <div className="empty-state">
      <div className="empty-illustration">
        <Illustration variant={variant} />
      </div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children ? <div className="empty-actions">{children}</div> : null}
    </div>
  );
}

export default EmptyState;
