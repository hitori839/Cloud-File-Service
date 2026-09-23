function Sidebar({
  currentSection,
  onSectionChange,
}) {
  return (
    <aside className="sidebar">
      <button
        className={
          currentSection === "drive"
            ? "side-item active"
            : "side-item"
        }
        onClick={() => onSectionChange("drive")}
      >
        📁 내 드라이브
      </button>

      <button
        className={
          currentSection === "starred"
            ? "side-item active"
            : "side-item"
        }
        onClick={() => onSectionChange("starred")}
      >
        ⭐ 즐겨찾기
      </button>

      <button
        className={
          currentSection === "trash"
            ? "side-item active"
            : "side-item"
        }
        onClick={() => onSectionChange("trash")}
      >
        🗑 휴지통
      </button>
    </aside>
  );
}

export default Sidebar;