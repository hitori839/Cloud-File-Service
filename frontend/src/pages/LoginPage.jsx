import { useState } from "react";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Icon from "../components/Icon";
import Spinner from "../components/Spinner";
import useAuth from "../hooks/useAuth";
import { errorMessage } from "../utils/format";
import { hasErrors, validateEmail } from "../utils/validation";

function LoginPage() {
  const { login, expired } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(expired ? "세션이 만료되었습니다. 다시 로그인해 주세요." : "");
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (event) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
      setErrors((prev) => ({ ...prev, [field]: null }));
    };
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {
      email: validateEmail(form.email),
      password: form.password ? null : "비밀번호를 입력해 주세요.",
    };
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setSubmitting(true);
    setServerError("");
    try {
      await login({ email: form.email.trim(), password: form.password });
    } catch (error) {
      setServerError(errorMessage(error, "로그인에 실패했습니다."));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="로그인"
      subtitle="내 파일에 어디서든 안전하게 접근하세요."
      footer={
        <>
          계정이 없으신가요?{" "}
          <a href="#/signup" className="link">
            회원가입
          </a>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        {serverError ? (
          <div className="form-alert" role="alert">
            <Icon name="alert" size={18} />
            <span>{serverError}</span>
          </div>
        ) : null}
        <FormField
          label="이메일"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={update("email")}
          error={errors.email}
          autoFocus
        />
        <FormField
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={update("password")}
          error={errors.password}
        />
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={submitting}>
          {submitting ? <Spinner size={18} label="로그인 중" /> : null}
          {submitting ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </AuthLayout>
  );
}

export default LoginPage;
