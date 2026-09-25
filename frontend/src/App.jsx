import { useEffect } from "react";
import AppShell from "./components/AppShell";
import AuthProvider from "./components/AuthProvider";
import DialogProvider from "./components/DialogProvider";
import EmptyState from "./components/EmptyState";
import Logo from "./components/Logo";
import Spinner from "./components/Spinner";
import ToastProvider from "./components/ToastProvider";
import useAuth from "./hooks/useAuth";
import useHashRoute, { navigate } from "./hooks/useHashRoute";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import { errorMessage } from "./utils/format";
import "./App.css";

function Root() {
  const auth = useAuth();
  const route = useHashRoute();
  const authed = auth.status === "authenticated";
  const onAuthRoute = route.name === "login" || route.name === "signup";

  // 로그인 상태에서 로그인/회원가입 주소면 드라이브로
  useEffect(() => {
    if (authed && onAuthRoute) navigate("/drive", { replace: true });
  }, [authed, onAuthRoute]);

  if (auth.status === "loading") {
    return (
      <div className="splash">
        <Logo size={48} />
        <Spinner size={28} label="세션 확인 중" />
      </div>
    );
  }

  if (auth.status === "error") {
    return (
      <div className="splash">
        <EmptyState
          variant="error"
          title="서버에 연결할 수 없습니다"
          description={errorMessage(auth.error, "잠시 후 다시 시도해 주세요.")}
        >
          <button type="button" className="btn btn-primary" onClick={auth.retry}>
            다시 시도
          </button>
          <button type="button" className="btn btn-ghost" onClick={auth.logout}>
            로그인 화면으로
          </button>
        </EmptyState>
      </div>
    );
  }

  if (!authed) {
    return route.name === "signup" ? <SignupPage /> : <LoginPage />;
  }

  return <AppShell route={route} />;
}

function App() {
  return (
    <ToastProvider>
      <DialogProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </DialogProvider>
    </ToastProvider>
  );
}

export default App;
