function Header({ onRefresh }) {
  return (
    <header className="header">
      <div className="brand">
        <span>☁</span>
        <strong>Cloud File Service</strong>
      </div>

      <div className="header-actions">
        <button onClick={onRefresh}>↻</button>
        <button>⚙</button>
      </div>
    </header>
  );
}

export default Header;