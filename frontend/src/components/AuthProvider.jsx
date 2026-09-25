import { useCallback, useEffect, useMemo, useState } from "react";
import * as authApi from "../api/authApi";
import { clearToken, getToken, onUnauthorized, setToken } from "../api/client";
import { AuthContext } from "../hooks/useAuth";

function initialState() {
  return getToken() ? { status: "loading", user: null, error: null } : { status: "anonymous", user: null, error: null };
}

function AuthProvider({ children }) {
  const [state, setState] = useState(initialState);
  const [attempt, setAttempt] = useState(0);

  // 세션 복원: 토큰이 있으면 /api/auth/me 로 사용자 확인
  const needsRestore = state.status === "loading";
  useEffect(() => {
    if (!needsRestore) return undefined;
    let alive = true;
    authApi.getMe().then(
      (user) => {
        if (alive) setState({ status: "authenticated", user, error: null });
      },
      (error) => {
        if (!alive) return;
        if (error?.status === 401) setState({ status: "anonymous", user: null, error: null });
        else setState({ status: "error", user: null, error });
      },
    );
    return () => {
      alive = false;
    };
  }, [needsRestore, attempt]);

  // 어떤 API든 401 → 로그아웃
  useEffect(
    () =>
      onUnauthorized(() => {
        setState((prev) =>
          prev.status === "anonymous"
            ? prev
            : { status: "anonymous", user: null, error: null, expired: prev.status === "authenticated" },
        );
      }),
    [],
  );

  const login = useCallback(async (credentials) => {
    const { token, user } = await authApi.login(credentials);
    setToken(token);
    setState({ status: "authenticated", user, error: null });
    return user;
  }, []);

  const signup = useCallback(async (payload) => {
    const { token, user } = await authApi.signup(payload);
    setToken(token);
    setState({ status: "authenticated", user, error: null });
    return user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ status: "anonymous", user: null, error: null });
  }, []);

  const updateUser = useCallback((user) => {
    setState((prev) => (prev.status === "authenticated" ? { ...prev, user } : prev));
  }, []);

  const retry = useCallback(() => {
    setState({ status: getToken() ? "loading" : "anonymous", user: null, error: null });
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ ...state, login, signup, logout, updateUser, retry }),
    [state, login, signup, logout, updateUser, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
