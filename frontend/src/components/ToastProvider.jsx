import { useCallback, useMemo, useState } from "react";
import { ToastContext } from "../hooks/useToast";
import { errorMessage } from "../utils/format";
import Icon from "./Icon";

let nextId = 1;
const DURATION = { success: 4000, info: 3000, error: 6000 };
const ICONS = { success: "checkCircle", info: "info", error: "alert" };

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (type, message, options = {}) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { id, type, message, action: options.action }]);
      setTimeout(() => dismiss(id), options.duration ?? DURATION[type]);
      return id;
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (message, options) => push("success", message, options),
      info: (message, options) => push("info", message, options),
      error: (error, options) => push("error", errorMessage(error), options),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="region" aria-label="알림" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
            <Icon name={ICONS[toast.type]} size={20} />
            <span className="toast-message">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  dismiss(toast.id);
                  toast.action.onClick();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button type="button" className="toast-close" aria-label="알림 닫기" onClick={() => dismiss(toast.id)}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
