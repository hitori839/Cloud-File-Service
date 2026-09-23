function Breadcrumb({
  folders,
  onFolderClick,
}) {
  return (
    <div className="breadcrumb">
      <button
        onClick={() => onFolderClick(null)}
      >
        내 드라이브
      </button>

      {folders.map((folder) => (
        <span key={folder.id}>
          {" / "}
          <button
            onClick={() =>
              onFolderClick(folder.id)
            }
          >
            {folder.name}
          </button>
        </span>
      ))}
    </div>
  );
}

export default Breadcrumb;