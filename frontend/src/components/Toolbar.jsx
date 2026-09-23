function Toolbar({
  onCreateFolder,
  onUpload,
  uploading,
}) {
  return (
    <div className="toolbar">
      <button
        className="primary-button"
        onClick={onCreateFolder}
      >
        + 새 폴더
      </button>

      <label
        className={`secondary-button${
          uploading ? " is-uploading" : ""
        }`}
      >
        {uploading
          ? "업로드 중..."
          : "파일 업로드"}

        <input
          hidden
          type="file"
          disabled={uploading}
          onChange={(event) => {
            const file =
              event.target.files?.[0];

            if (file) {
              onUpload(file);
            }

            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

export default Toolbar;