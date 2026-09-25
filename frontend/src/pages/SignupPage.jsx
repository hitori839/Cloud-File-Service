import { useState } from "react";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Icon from "../components/Icon";
import Spinner from "../components/Spinner";
import useAuth from "../hooks/useAuth";
import { errorMessage } from "../utils/format";
import {
  hasErrors,
  validateConfirm,
  validateEmail,
  validateName,
  validatePassword,
} from "../utils/validation";

function SignupPage() {
  const { signup } = useAuth();
  const [form, setForm] = useState({ email: "", name: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
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
      name: validateName(form.name),
      password: validatePassword(form.password),
      confirm: validateConfirm(form.password, form.confirm),
    };
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setSubmitting(true);
    setServerError("");
    try {
      await signup({ email: form.email.trim(), name: form.name.trim(), password: form.password });
    } catch (error) {
      if (error?.status === 409) {
        setErrors((prev) => ({ ...prev, email: errorMessage(error, "이미 가입된 이메일입니다.") }));
      } else {
        setServerError(errorMessage(error, "회원가입에 실패했습니다."));
      }
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="계정 만들기"
      subtitle="1 GB 무료 저장 공간으로 시작하세요."
      footer={
        <>
          이미 계정이 있으신가요?{" "}
          <a href="#/login" className="link">
            로그인
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
          label="이름"
          autoComplete="name"
          value={form.name}
          onChange={update("name")}
          error={errors.name}
          maxLength={50}
        />
        <FormField
          label="비밀번호"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update("password")}
          error={errors.password}
          hint="8자 이상 입력해 주세요."
        />
        <FormField
          label="비밀번호 확인"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={update("confirm")}
          error={errors.confirm}
        />
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={submitting}>
          {submitting ? <Spinner size={18} label="가입 중" /> : null}
          {submitting ? "가입 중…" : "가입하기"}
        </button>
      </form>
    </AuthLayout>
  );
}

export default SignupPage;
