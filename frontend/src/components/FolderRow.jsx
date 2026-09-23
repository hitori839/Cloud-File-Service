function FolderRow({
  folder,
  onOpen,
  onRename,
  onDelete,
}) {
  return (
    <div className="file-row">
      <button
        className="folder-name"
        onClick={() => onOpen(folder)}
      >
        📁 {folder.name}
      </button>

      <div>폴더</div>
      <div>-</div>
      <div>
        {folder.updatedAt ||
          folder.createdAt ||
          "-"}
      </div>

      <div className="row-actions">
        <button
          onClick={() => onRename(folder)}
        >
          이름 변경
        </button>

        <button
          onClick={() => onDelete(folder)}
        >
          삭제
        </button>
      </div>
    </div>
  );
}

export default FolderRow;