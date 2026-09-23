import { useState } from "react";

function RenameModal({
  open,
  item,
  onClose,
  onRename,
}) {
  const [name, setName] =
    useState("");

  if (!open || !item) {
    return null;
  }

  function submit(event) {
    event.preventDefault();

    const value = name.trim();

    if (!value) {
      return;
    }

    onRename(item, value);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>이름 변경</h2>

        <form onSubmit={submit}>
          <input
            autoFocus
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
          />

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
            >
              취소
            </button>

            <button type="submit">
              변경
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RenameModal;