import Icon from "./Icon";

/** 내 드라이브 > A > B (마지막 항목은 현재 폴더) */
function Breadcrumb({ path }) {
  const crumbs = [{ id: null, name: "내 드라이브" }, ...path];
  return (
    <nav className="breadcrumb" aria-label="현재 위치">
      <ol>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.id ?? "root"}>
              {index > 0 ? <Icon name="chevronRight" size={18} className="crumb-sep" /> : null}
              {last ? (
                <h1 className="crumb current" aria-current="page" title={crumb.name}>
                  {crumb.name}
                </h1>
              ) : (
                <a className="crumb" href={crumb.id === null ? "#/drive" : `#/folders/${crumb.id}`} title={crumb.name}>
                  {crumb.name}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumb;
