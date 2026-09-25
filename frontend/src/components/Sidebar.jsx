import useDismiss from "../hooks/useDismiss";
import Icon from "./Icon";
import Logo from "./Logo";
import NewMenuButton from "./NewMenuButton";
import StorageMeter from "./StorageMeter";

const NAV = [
  { name: "drive", href: "#/drive", label: "내 드라이브", icon: "drive" },
  { name: "recent", href: "#/recent", label: "최근 문서함", icon: "clock" },
  { name: "starred", href: "#/starred", label: "중요 문서함", icon: "star" },
  { name: "trash", href: "#/trash", label: "휴지통", icon: "trash" },
];

function Sidebar({ route, open, onClose, storage, onNewFolder, onUpload }) {
  useDismiss(open, onClose);
  const active = route.name === "folder" ? "drive" : route.name;

  return (
    <>
      <div className={`drawer-backdrop${open ? " visible" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="탐색">
        <div className="drawer-head">
          <Logo size={32} />
          <button type="button" className="icon-button" onClick={onClose} aria-label="메뉴 닫기">
            <Icon name="close" />
          </button>
        </div>
        <NewMenuButton
          onNewFolder={() => {
            onClose();
            onNewFolder();
          }}
          onUpload={() => {
            onClose();
            onUpload();
          }}
        />
        <nav className="side-nav">
          {NAV.map((item) => (
            <a
              key={item.name}
              href={item.href}
              className={`side-link${active === item.name ? " active" : ""}`}
              aria-current={active === item.name ? "page" : undefined}
              onClick={onClose}
            >
              <Icon name={active === item.name && item.icon === "star" ? "starFilled" : item.icon} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <StorageMeter storage={storage} />
      </aside>
    </>
  );
}

export default Sidebar;
