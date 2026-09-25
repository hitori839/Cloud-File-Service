import { useCallback, useRef, useState } from "react";
import { getStorage } from "../api/driveApi";
import useAuth from "../hooks/useAuth";
import useItemActions from "../hooks/useItemActions";
import useLocalStorageState from "../hooks/useLocalStorageState";
import useResource from "../hooks/useResource";
import useUploads from "../hooks/useUploads";
import AccountPage from "../pages/AccountPage";
import AdminPage from "../pages/AdminPage";
import DrivePage from "../pages/DrivePage";
import EmptyState from "./EmptyState";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import UploadPanel from "./UploadPanel";

const DRIVE_VIEWS = new Set(["drive", "folder", "recent", "starred", "search", "trash"]);

/** 로그인 후 레이아웃: 상단 바 + 사이드바 + 메인 영역 + 업로드 패널 */
function AppShell({ route }) {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [viewMode, setViewMode] = useLocalStorageState("cfs_view_mode", "list");
  const fileInputRef = useRef(null);

  const uploads = useUploads();
  const dataVersion = version + uploads.completed;

  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const actions = useItemActions(refresh);
  const storage = useResource("storage", getStorage, dataVersion);

  // login/signup 라우트는 App에서 /drive로 교체되는 중 → 드라이브로 취급
  const effectiveRoute = route.name === "login" || route.name === "signup" ? { name: "drive", folderId: null } : route;
  const uploadFolderId = effectiveRoute.name === "folder" ? effectiveRoute.folderId : null;

  const pickFiles = useCallback(() => fileInputRef.current?.click(), []);
  const newFolder = useCallback(() => actions.createFolder(uploadFolderId), [actions, uploadFolderId]);
  const uploadFiles = useCallback((files) => uploads.startUpload(files, uploadFolderId), [uploads, uploadFolderId]);

  let content;
  if (DRIVE_VIEWS.has(effectiveRoute.name)) {
    content = (
      <DrivePage
        key={`${effectiveRoute.name}-${effectiveRoute.folderId ?? "root"}`}
        route={effectiveRoute}
        version={dataVersion}
        actions={actions}
        viewMode={viewMode === "grid" ? "grid" : "list"}
        onViewModeChange={setViewMode}
        onUploadFiles={uploadFiles}
        onNewFolder={newFolder}
        onPickFiles={pickFiles}
        onRefresh={refresh}
      />
    );
  } else if (effectiveRoute.name === "account") {
    content = <AccountPage storage={storage.data} />;
  } else if (effectiveRoute.name === "admin") {
    content =
      user.role === "ADMIN" ? (
        <AdminPage version={version} onChanged={refresh} />
      ) : (
        <EmptyState variant="error" title="권한이 없습니다" description="관리자만 접근할 수 있는 페이지입니다.">
          <a className="btn btn-primary" href="#/drive">
            내 드라이브로 이동
          </a>
        </EmptyState>
      );
  } else {
    content = (
      <EmptyState variant="search" title="페이지를 찾을 수 없습니다" description="주소를 다시 확인해 주세요.">
        <a className="btn btn-primary" href="#/drive">
          내 드라이브로 이동
        </a>
      </EmptyState>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <TopBar route={effectiveRoute} onOpenNav={() => setNavOpen(true)} />
      <div className="shell-body">
        <Sidebar
          route={effectiveRoute}
          open={navOpen}
          onClose={closeNav}
          storage={storage.data}
          onNewFolder={newFolder}
          onUpload={pickFiles}
        />
        <main className="main-panel" id="main-content" tabIndex={-1}>
          {content}
        </main>
      </div>
      <UploadPanel items={uploads.items} onCancel={uploads.cancel} onClear={uploads.clearFinished} />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          uploadFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export default AppShell;
