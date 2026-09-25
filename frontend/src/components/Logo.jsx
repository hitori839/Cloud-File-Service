function Logo({ size = 36, withText = true }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5b7cff" />
            <stop offset="1" stopColor="#8a5cff" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#logo-grad)" />
        <path
          d="M13.2 28.5a5.7 5.7 0 0 1-.8-11.3 7.6 7.6 0 0 1 14.6 2 4.8 4.8 0 0 1-.6 9.3z"
          fill="#fff"
        />
        <path d="M20 26v-6.2M17.3 22.3L20 19.6l2.7 2.7" stroke="#6a6cff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withText ? (
        <span className="logo-text">
          Cloud <strong>Drive</strong>
        </span>
      ) : null}
    </span>
  );
}

export default Logo;
