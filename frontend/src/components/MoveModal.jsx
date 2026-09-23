function MoveModal({
  open,
  folders,
  onClose,
  onMove,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>폴더 선택</h2>

        <button onClick={() => onMove(null)}>
          📁 내 드라이브
        </button>

        {folders.map((folder) => (
          <button
            key={folder.id}
            onClick={() =>
              onMove(folder)
            }
          >
            📁 {folder.name}
          </button>
        ))}

        <button onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}

export default MoveModal;