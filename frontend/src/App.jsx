import {
  useEffect,
  useState,
} from "react";

import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Breadcrumb from "./components/Breadcrumb";
import Toolbar from "./components/Toolbar";
import FileRow from "./components/FileRow";
import FolderRow from "./components/FolderRow";
import Loading from "./components/Loading";
import ErrorMessage from "./components/ErrorMessage";
import CreateFolderModal from "./components/CreateFolderModal";
import RenameModal from "./components/RenameModal";
import MoveModal from "./components/MoveModal";

import useDrive from "./hooks/useDrive";

import "./App.css";

function App() {
  const {
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
  } = useDrive();

  const [
    currentFolderId,
    setCurrentFolderId,
  ] = useState(null);

  const [folderPath, setFolderPath] =
    useState([]);

  const [section, setSection] =
    useState("drive");

  const [
    folderModalOpen,
    setFolderModalOpen,
  ] = useState(false);

  const [renameTarget, setRenameTarget] =
    useState(null);

  const [moveTarget, setMoveTarget] =
    useState(null);

  useEffect(() => {
    load(currentFolderId);
  }, [currentFolderId, load]);

  async function createFolder(name) {
    await handleCreateFolder(
      name,
      currentFolderId
    );

    setFolderModalOpen(false);
  }

  async function renameItem(item, name) {
    if (renameTarget.type === "file") {
      await handleRenameFile(
        item.id,
        name,
        currentFolderId
      );
    } else {
      await handleRenameFolder(
        item.id,
        name,
        currentFolderId
      );
    }

    setRenameTarget(null);
  }

  async function moveItem(folder) {
    await handleMoveFile(
      moveTarget.id,
      folder ? folder.id : null,
      currentFolderId
    );

    setMoveTarget(null);
  }

  function openFolder(folder) {
    setCurrentFolderId(folder.id);

    setFolderPath((current) => [
      ...current,
      folder,
    ]);
  }

  function goToFolder(folderId) {
    if (folderId === null) {
      setCurrentFolderId(null);
      setFolderPath([]);
      return;
    }

    const index =
      folderPath.findIndex(
        (folder) =>
          folder.id === folderId
      );

    if (index === -1) {
      return;
    }

    setCurrentFolderId(folderId);

    setFolderPath(
      folderPath.slice(0, index + 1)
    );
  }

  return (
    <div className="app">
      <Header
        onRefresh={() =>
          load(currentFolderId)
        }
      />

      <div className="layout">
        <Sidebar
          currentSection={section}
          onSectionChange={setSection}
        />

        <main className="content">
          <Breadcrumb
            folders={folderPath}
            onFolderClick={goToFolder}
          />

          <Toolbar
            onCreateFolder={() =>
              setFolderModalOpen(true)
            }
            onUpload={(file) =>
              handleUpload(
                file,
                currentFolderId
              )
            }
            uploading={uploading}
          />

          <ErrorMessage
            message={error}
          />

          {loading ? (
            <Loading />
          ) : (
            <div className="file-table">
              <div className="file-header file-row">
                <div>이름</div>
                <div>종류</div>
                <div>크기</div>
                <div>수정일</div>
                <div>작업</div>
              </div>

              {folders.map((folder) => (
                <FolderRow
                  key={`folder-${folder.id}`}
                  folder={folder}
                  onOpen={openFolder}
                  onRename={(item) =>
                    setRenameTarget({
                      type: "folder",
                      item,
                    })
                  }
                  onDelete={(item) =>
                    handleDeleteFolder(
                      item,
                      currentFolderId
                    )
                  }
                />
              ))}

              {files.map((file) => (
                <FileRow
                  key={`file-${file.id}`}
                  file={file}
                  onDownload={handleDownload}
                  onRename={(item) =>
                    setRenameTarget({
                      type: "file",
                      item,
                    })
                  }
                  onMove={setMoveTarget}
                  onDelete={(item) =>
                    handleDeleteFile(
                      item,
                      currentFolderId
                    )
                  }
                />
              ))}

              {folders.length === 0 &&
                files.length === 0 && (
                  <div className="empty-state">
                    이 폴더는 비어 있습니다.
                  </div>
                )}
            </div>
          )}
        </main>
      </div>

      <CreateFolderModal
        open={folderModalOpen}
        onClose={() =>
          setFolderModalOpen(false)
        }
        onCreate={createFolder}
      />

      <RenameModal
        key={renameTarget
          ? `${renameTarget.type}-${renameTarget.item.id}`
          : "rename-modal"}
        open={Boolean(renameTarget)}
        item={renameTarget?.item}
        onClose={() => setRenameTarget(null)}
        onRename={renameItem}
      />

      <MoveModal
        open={Boolean(moveTarget)}
        folders={folders}
        onClose={() => setMoveTarget(null)}
        onMove={moveItem}
      />
    </div>
  );
}

export default App;
