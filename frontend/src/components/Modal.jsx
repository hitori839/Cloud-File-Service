import { useEffect, useId, useRef } from "react";
import useDismiss from "../hooks/useDismiss";
import Icon from "./Icon";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 공통 모달. Esc / 배경 클릭으로 닫힘, 포커스 트랩, 닫힐 때 포커스 복원.
 */
function Modal({ title, onClose, children, footer, size = "md", className = "", closeOnBackdrop = true }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useDismiss(true, onClose);

  useEffect(() => {
    const previous = document.activeElement;
    const node = dialogRef.current;
    const target = node?.querySelector("[data-autofocus]") || node?.querySelector(FOCUSABLE) || node;
    target?.focus();
    return () => {
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, []);

  function onKeyDown(event) {
    if (event.key !== "Tab") return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE) || []);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal modal-${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export default Modal;
