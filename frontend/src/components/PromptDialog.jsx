import { useEffect, useId, useRef, useState } from "react";
import Modal from "./Modal";

function PromptDialog({ title, label, initialValue = "", confirmLabel = "확인", selectBaseName, validate, onResult }) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const inputId = useId();

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = initialValue.lastIndexOf(".");
    if (selectBaseName && dot > 0) input.setSelectionRange(0, dot);
    else input.select();
  }, [initialValue, selectBaseName]);

  function submit(event) {
    event.preventDefault();
    const message = validate ? validate(value) : null;
    if (message) {
      setError(message);
      return;
    }
    onResult(value);
  }

  return (
    <Modal title={title} size="sm" onClose={() => onResult(null)}>
      <form onSubmit={submit} noValidate>
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          className={`input${error ? " has-error" : ""}`}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          autoComplete="off"
          data-autofocus
        />
        {error ? (
          <p className="field-error" id={`${inputId}-error`}>
            {error}
          </p>
        ) : null}
        <div className="modal-footer inline">
          <button type="button" className="btn btn-ghost" onClick={() => onResult(null)}>
            취소
          </button>
          <button type="submit" className="btn btn-primary">
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default PromptDialog;
