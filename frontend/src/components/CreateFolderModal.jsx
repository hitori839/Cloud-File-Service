import { useState } from "react";

function CreateFolderModal({
  open,
  onClose,
  onCreate,
}) {
  const [name, setName] = useState("");

  if (!open) {
    return null;
  }

  function submit(event) {
    event.preventDefault();

    const value = name.trim();

    if (!value) {
      return;
    }

    onCreate(value);
    setName("");
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>새 폴더</h2>

        <form onSubmit={submit}>
          <input
            autoFocus
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            placeholder="폴더 이름"
          />

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
            >
              취소
            </button>

            <button type="submit">
              만들기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateFolderModal;