import Icon from "./Icon";
import Logo from "./Logo";
import SearchBox from "./SearchBox";
import UserMenu from "./UserMenu";

function TopBar({ route, onOpenNav }) {
  return (
    <header className="topbar">
      <button type="button" className="icon-button nav-toggle" onClick={onOpenNav} aria-label="메뉴 열기">
        <Icon name="menu" />
      </button>
      <a href="#/drive" className="topbar-brand" aria-label="Cloud Drive 홈">
        <Logo size={34} />
      </a>
      <SearchBox route={route} />
      <div className="topbar-actions">
        <UserMenu />
      </div>
    </header>
  );
}

export default TopBar;
