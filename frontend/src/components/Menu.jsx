import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import useDismiss from "../hooks/useDismiss";
import Icon from "./Icon";

/**
 * 팝업 메뉴 (⋮ 메뉴, 우클릭 컨텍스트 메뉴, 새로 만들기, 사용자 메뉴 공용).
 * position: { x, y, alignRight?, flipY? }  (viewport 좌표)
 * items: [{ key, label, icon, onSelect, danger, disabled } | { key, divider: true }]
 */
function Menu({ position, items, onClose, header, label = "메뉴", className = "" }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useDismiss(true, onClose, ref);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { innerWidth, innerHeight } = window;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    let left = position.alignRight ? position.x - width : position.x;
    left = Math.max(8, Math.min(left, innerWidth - width - 8));
    let top = position.y;
    if (top + height > innerHeight - 8) {
      top = Math.max(8, (position.flipY ?? position.y) - height);
    }
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.style.visibility = "visible";
  }, [position]);

  useEffect(() => {
    const previous = document.activeElement;
    const first = ref.current?.querySelector('[role="menuitem"]:not([disabled])');
    first?.focus();

    function close() {
      onCloseRef.current();
    }
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      // 메뉴가 닫히면 포커스를 연 요소로 되돌림 (다른 곳을 클릭해 닫힌 경우 제외)
      const active = document.activeElement;
      if (previous instanceof HTMLElement && previous.isConnected && (!active || active === document.body)) {
        previous.focus();
      }
    };
  }, []);

  function onKeyDown(event) {
    const nodes = Array.from(ref.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || []);
    const index = nodes.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      nodes[(index + 1) % nodes.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nodes[(index - 1 + nodes.length) % nodes.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      nodes[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (event.key === "Tab") {
      onClose();
    }
  }

  return createPortal(
    <div
      ref={ref}
      className={`menu ${className}`}
      role="menu"
      aria-label={label}
      style={{ left: position.x, top: position.y, visibility: "hidden" }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {header}
      {items.map((item) =>
        item.divider ? (
          <div key={item.key} className="menu-divider" role="separator" />
        ) : (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className={`menu-item${item.danger ? " danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect?.();
            }}
          >
            {item.icon ? <Icon name={item.icon} size={18} /> : <span className="menu-icon-space" />}
            <span>{item.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

export default Menu;
