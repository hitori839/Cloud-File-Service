import Modal from "./Modal";

function ConfirmDialog({ title, message, confirmLabel = "확인", cancelLabel = "취소", danger, onResult }) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={() => onResult(false)}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => onResult(false)}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "btn btn-danger" : "btn btn-primary"}
            onClick={() => onResult(true)}
            data-autofocus
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="dialog-message">{message}</p>
    </Modal>
  );
}

export default ConfirmDialog;
