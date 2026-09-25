import { useEffect, useRef, useState } from "react";
import { navigate, searchPath } from "../hooks/useHashRoute";
import Icon from "./Icon";

const DEBOUNCE_MS = 300;

/** 전역 검색창: 입력 후 300ms 디바운스로 #/search?q= 이동 */
function SearchBox({ route }) {
  const onSearch = route.name === "search";
  const routeQuery = onSearch ? route.q : "";
  const [value, setValue] = useState(routeQuery);
  const [syncedQuery, setSyncedQuery] = useState(routeQuery);
  const inputRef = useRef(null);

  // 라우트가 외부에서 바뀌면(뒤로가기, 다른 메뉴 클릭) 입력값 동기화
  if (routeQuery !== syncedQuery) {
    setSyncedQuery(routeQuery);
    if (value.trim() !== routeQuery.trim()) setValue(routeQuery);
  }

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === routeQuery.trim()) return undefined;
    const timer = setTimeout(() => {
      if (trimmed) navigate(searchPath(trimmed), { replace: onSearch });
      else if (onSearch) navigate("/drive");
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, routeQuery, onSearch]);

  function submit(event) {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) navigate(searchPath(trimmed), { replace: onSearch });
  }

  return (
    <form className="search-box" role="search" onSubmit={submit}>
      <Icon name="search" size={20} className="search-icon" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.stopPropagation();
            setValue("");
          }
        }}
        placeholder="드라이브에서 검색"
        aria-label="드라이브에서 검색"
      />
      {value ? (
        <button
          type="button"
          className="icon-button small"
          aria-label="검색어 지우기"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
        >
          <Icon name="close" size={18} />
        </button>
      ) : null}
    </form>
  );
}

export default SearchBox;
