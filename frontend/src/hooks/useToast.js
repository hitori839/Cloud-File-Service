import { createContext, useContext } from "react";

export const ToastContext = createContext(null);

/** toast.success(msg, opts) / toast.error(errOrMsg, opts) / toast.info(msg, opts); opts: { action: { label, onClick } } */
export default function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>");
  return value;
}
