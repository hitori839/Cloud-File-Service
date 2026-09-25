import { useState } from "react";
import Icon from "./Icon";
import Menu from "./Menu";

/** "+ 새로 만들기" 버튼 (사이드바) / 모바일 FAB */
function NewMenuButton({ onNewFolder, onUpload, variant = "sidebar" }) {
  const [position, setPosition] = useState(null);

  function open(event) {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition(
      variant === "fab"
        ? { x: rect.right, y: rect.top - 8, alignRight: true, flipY: rect.top - 8 }
        : { x: rect.left, y: rect.bottom + 6 },
    );
  }

  return (
    <>
      <button
        type="button"
        className={variant === "fab" ? "fab" : "new-button"}
        onClick={open}
        onMouseDown={(event) => position && event.stopPropagation()}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        aria-label={variant === "fab" ? "새로 만들기" : undefined}
      >
        <Icon name="plus" size={variant === "fab" ? 26 : 22} strokeWidth={2.2} />
        {variant === "fab" ? null : <span>새로 만들기</span>}
      </button>
      {position ? (
        <Menu
          position={position}
          onClose={() => setPosition(null)}
          label="새로 만들기"
          items={[
            { key: "folder", label: "새 폴더", icon: "folderPlus", onSelect: onNewFolder },
            { key: "d", divider: true },
            { key: "upload", label: "파일 업로드", icon: "fileUpload", onSelect: onUpload },
          ]}
        />
      ) : null}
    </>
  );
}

export default NewMenuButton;
