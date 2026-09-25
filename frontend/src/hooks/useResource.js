import { useEffect, useState } from "react";

/**
 * 비동기 데이터 로더.
 *  - key가 바뀌면 loading(이전 데이터 숨김)
 *  - version만 바뀌면 이전 데이터를 유지한 채 백그라운드 새로고침
 *  - loader는 key가 바뀔 때만 바뀌도록 useCallback으로 고정할 것
 */
export default function useResource(key, loader, version = 0) {
  const [state, setState] = useState({ key: null, version: null, data: undefined, error: null });

  useEffect(() => {
    let alive = true;
    loader().then(
      (data) => {
        if (alive) setState({ key, version, data, error: null });
      },
      (error) => {
        if (alive) setState({ key, version, data: undefined, error });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, loader, version]);

  const matches = state.key === key;
  return {
    data: matches ? state.data : undefined,
    error: matches ? state.error : null,
    loading: !matches,
    refreshing: matches && state.version !== version,
  };
}
