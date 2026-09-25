import { useCallback, useMemo, useState } from "react";
import { DialogContext } from "../hooks/useDialogs";
import ConfirmDialog from "./ConfirmDialog";
import PromptDialog from "./PromptDialog";

let nextId = 1;

/** Promise 기반 confirm / prompt 다이얼로그 (window.confirm 대체) */
function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const open = useCallback(
    (type, options) =>
      new Promise((resolve) => {
        setDialog({ id: nextId++, type, options, resolve });
      }),
    [],
  );

  const api = useMemo(
    () => ({
      confirm: (options) => open("confirm", options),
      prompt: (options) => open("prompt", options),
    }),
    [open],
  );

  function finish(result) {
    dialog?.resolve(result);
    setDialog(null);
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog?.type === "confirm" ? <ConfirmDialog key={dialog.id} {...dialog.options} onResult={finish} /> : null}
      {dialog?.type === "prompt" ? <PromptDialog key={dialog.id} {...dialog.options} onResult={finish} /> : null}
    </DialogContext.Provider>
  );
}

export default DialogProvider;
