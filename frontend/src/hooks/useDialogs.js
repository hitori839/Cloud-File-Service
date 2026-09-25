import { createContext, useContext } from "react";

export const DialogContext = createContext(null);

/**
 * confirm({ title, message, confirmLabel, danger }) → Promise<boolean>
 * prompt({ title, label, initialValue, confirmLabel, selectBaseName, validate }) → Promise<string|null>
 */
export default function useDialogs() {
  const value = useContext(DialogContext);
  if (!value) throw new Error("useDialogs must be used inside <DialogProvider>");
  return value;
}
