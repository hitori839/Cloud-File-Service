import { useState } from "react";
import useAuth from "../hooks/useAuth";
import { navigate } from "../hooks/useHashRoute";
import Avatar from "./Avatar";
import Menu from "./Menu";

function UserMenu() {
  const { user, logout } = useAuth();
  const [position, setPosition] = useState(null);

  function toggle(event) {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.right, y: rect.bottom + 6, alignRight: true });
  }

  const items = [
    { key: "account", label: "내 계정", icon: "user", onSelect: () => navigate("/account") },
    ...(user?.role === "ADMIN"
      ? [{ key: "admin", label: "관리자", icon: "shield", onSelect: () => navigate("/admin") }]
      : []),
    { key: "d1", divider: true },
    {
      key: "logout",
      label: "로그아웃",
      icon: "logout",
      onSelect: () => {
        logout();
        navigate("/login", { replace: true });
      },
    },
  ];

  return (
    <>
      <button
        type="button"
        className="avatar-button"
        onClick={toggle}
        onMouseDown={(event) => position && event.stopPropagation()}
        aria-label={`계정 메뉴: ${user?.name ?? ""}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
      >
        <Avatar user={user} size={34} />
      </button>
      {position ? (
        <Menu
          position={position}
          onClose={() => setPosition(null)}
          items={items}
          label="계정 메뉴"
          className="user-menu"
          header={
            <div className="menu-header">
              <Avatar user={user} size={44} />
              <div className="menu-header-text">
                <strong>{user?.name}</strong>
                <span>{user?.email}</span>
                {user?.role === "ADMIN" ? <span className="badge">관리자</span> : null}
              </div>
            </div>
          }
        />
      ) : null}
    </>
  );
}

export default UserMenu;
