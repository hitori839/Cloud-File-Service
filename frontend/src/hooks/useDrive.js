import {
  useCallback,
  useState,
} from "react";

import {
  getFiles,
  uploadFile,
  downloadFile,
  renameFile,
  moveFile,
  deleteFile,
} from "../api/fileApi";

import {
  getFolders,
  createFolder,
  renameFolder,
  deleteFolder,
} from "../api/folderApi";

function useDrive() {
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] =
    useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (folderId = null) => {
      setLoading(true);
      setError("");

      try {
        const [fileResult, folderResult] =
          await Promise.all([
            getFiles(folderId),
            getFolders(folderId),
          ]);

        setFiles(
          Array.isArray(fileResult)
            ? fileResult
            : []
        );

        setFolders(
          Array.isArray(folderResult)
            ? folderResult
            : []
        );
      } catch (err) {
        setError(
          err.message ||
            "목록을 불러오지 못했습니다."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  async function handleUpload(
    file,
    folderId = null
  ) {
    setUploading(true);
    setError("");

    try {
      await uploadFile(file, folderId);
      await load(folderId);
    } catch (err) {
      setError(
        err.message ||
          "파일 업로드에 실패했습니다."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateFolder(
    name,
    parentId = null
  ) {
    setError("");

    try {
      await createFolder(name, parentId);
      await load(parentId);
    } catch (err) {
      setError(
        err.message ||
          "폴더 생성에 실패했습니다."
      );
    }
  }

  async function handleRenameFile(
    fileId,
    name,
    folderId = null
  ) {
    setError("");

    try {
      await renameFile(fileId, name);
      await load(folderId);
    } catch (err) {
      setError(
        err.message ||
          "파일 이름 변경에 실패했습니다."
      );
    }
  }

  async function handleRenameFolder(
    folderId,
    name,
    parentFolderId = null
  ) {
    setError("");

    try {
      await renameFolder(folderId, name);
      await load(parentFolderId);
    } catch (err) {
      setError(
        err.message ||
          "폴더 이름 변경에 실패했습니다."
      );
    }
  }

  async function handleMoveFile(
    fileId,
    folderId,
    currentFolderId = null
  ) {
    setError("");

    try {
      await moveFile(fileId, folderId);
      await load(currentFolderId);
    } catch (err) {
      setError(
        err.message ||
          "파일 이동에 실패했습니다."
      );
    }
  }

  async function handleDownload(file) {
    setError("");

    try {
      const response = await downloadFile(file.id);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err.message ||
          "파일 다운로드에 실패했습니다."
      );
    }
  }

  async function handleDeleteFile(
    file,
    folderId = null
  ) {
    if (
      !window.confirm(
        `"${file.name}"을 삭제할까요?`
      )
    ) {
      return;
    }

    try {
      await deleteFile(file.id);
      await load(folderId);
    } catch (err) {
      setError(
        err.message ||
          "파일 삭제에 실패했습니다."
      );
    }
  }

  async function handleDeleteFolder(
    folder,
    folderId = null
  ) {
    if (
      !window.confirm(
        `"${folder.name}" 폴더를 삭제할까요?`
      )
    ) {
      return;
    }

    try {
      await deleteFolder(folder.id);
      await load(folderId);
    } catch (err) {
      setError(
        err.message ||
          "폴더 삭제에 실패했습니다."
      );
    }
  }

  return {
    files,
    folders,
    loading,
    uploading,
    error,
    load,
    handleUpload,
    handleDownload,
    handleCreateFolder,
    handleRenameFile,
    handleRenameFolder,
    handleMoveFile,
    handleDeleteFile,
    handleDeleteFolder,
  };
}

export default useDrive;