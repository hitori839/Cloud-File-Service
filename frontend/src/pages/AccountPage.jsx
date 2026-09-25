import { useState } from "react";
import * as userApi from "../api/userApi";
import Avatar from "../components/Avatar";
import FormField from "../components/FormField";
import Icon from "../components/Icon";
import StorageMeter from "../components/StorageMeter";
import useAuth from "../hooks/useAuth";
import useDialogs from "../hooks/useDialogs";
import { navigate } from "../hooks/useHashRoute";
import useToast from "../hooks/useToast";
import { errorMessage, formatJoinDate } from "../utils/format";
import { hasErrors, validateConfirm, validateName, validatePassword } from "../utils/validation";

function ProfileSection() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name || "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const message = validateName(name);
    setError(message);
    if (message) return;
    setSaving(true);
    try {
      const updated = await userApi.updateProfile(name.trim());
      updateUser(updated);
      setName(updated?.name ?? name.trim());
      toast.success("이름을 변경했습니다.");
    } catch (err) {
      setError(errorMessage(err, "이름을 변경하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  const unchanged = name.trim() === (user.name || "");

  return (
    <section className="card">
      <h2 className="card-title">
        <Icon name="user" size={20} />
        프로필
      </h2>
      <form className="stack" onSubmit={submit} noValidate>
        <FormField
          label="이름"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          error={error}
          maxLength={50}
          autoComplete="name"
        />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || unchanged}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </section>
  );
}

function PasswordSection() {
  const toast = useToast();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function update(field) {
    return (event) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
      setErrors((prev) => ({ ...prev, [field]: null }));
    };
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {
      current: form.current ? null : "현재 비밀번호를 입력해 주세요.",
      next: validatePassword(form.next),
      confirm: validateConfirm(form.next, form.confirm),
    };
    if (!nextErrors.next && form.next === form.current) nextErrors.next = "현재 비밀번호와 다른 비밀번호를 입력해 주세요.";
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setSaving(true);
    try {
      await userApi.changePassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      toast.success("비밀번호를 변경했습니다.");
    } catch (err) {
      if (err?.status === 400) setErrors({ current: errorMessage(err, "현재 비밀번호가 올바르지 않습니다.") });
      else toast.error(errorMessage(err, "비밀번호를 변경하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">
        <Icon name="lock" size={20} />
        비밀번호 변경
      </h2>
      <form className="stack" onSubmit={submit} noValidate>
        <FormField
          label="현재 비밀번호"
          type="password"
          autoComplete="current-password"
          value={form.current}
          onChange={update("current")}
          error={errors.current}
        />
        <FormField
          label="새 비밀번호"
          type="password"
          autoComplete="new-password"
          value={form.next}
          onChange={update("next")}
          error={errors.next}
          hint="8자 이상 입력해 주세요."
        />
        <FormField
          label="새 비밀번호 확인"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={update("confirm")}
          error={errors.confirm}
        />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "변경 중…" : "비밀번호 변경"}
          </button>
        </div>
      </form>
    </section>
  );
}

function DeleteAccountSection() {
  const { logout } = useAuth();
  const { confirm } = useDialogs();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!password) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    const ok = await confirm({
      title: "정말 탈퇴하시겠어요?",
      message: "계정과 모든 파일, 폴더가 즉시 영구 삭제되며 복구할 수 없습니다.",
      confirmLabel: "탈퇴하기",
      danger: true,
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await userApi.deleteAccount(password);
      logout();
      navigate("/login", { replace: true });
      toast.success("회원 탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.");
    } catch (err) {
      setDeleting(false);
      if (err?.status === 400) setError(errorMessage(err, "비밀번호가 올바르지 않습니다."));
      else toast.error(errorMessage(err, "회원 탈퇴에 실패했습니다."));
    }
  }

  return (
    <section className="card card-danger">
      <h2 className="card-title">
        <Icon name="alert" size={20} />
        회원 탈퇴
      </h2>
      <p className="muted">
        탈퇴하면 업로드한 모든 파일과 폴더(휴지통 포함)가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
      </p>
      <form className="stack" onSubmit={submit} noValidate>
        <FormField
          label="비밀번호 확인"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          error={error}
        />
        <div className="form-actions">
          <button type="submit" className="btn btn-danger" disabled={deleting}>
            {deleting ? "처리 중…" : "회원 탈퇴"}
          </button>
        </div>
      </form>
    </section>
  );
}

function AccountPage({ storage }) {
  const { user } = useAuth();
  return (
    <div className="settings-page">
      <div className="page-head">
        <h1 className="page-title">내 계정</h1>
      </div>
      <div className="settings-grid">
        <section className="card profile-card">
          <Avatar user={user} size={72} />
          <div className="profile-info">
            <strong className="profile-name">{user.name}</strong>
            <span className="muted">{user.email}</span>
            <div className="profile-tags">
              <span className={`badge${user.role === "ADMIN" ? " badge-admin" : ""}`}>
                {user.role === "ADMIN" ? "관리자" : "일반 사용자"}
              </span>
              <span className="muted small">가입일 {formatJoinDate(user.createdAt)}</span>
            </div>
          </div>
          <div className="profile-storage">
            <StorageMeter storage={storage} />
          </div>
        </section>
        <ProfileSection />
        <PasswordSection />
        <DeleteAccountSection />
      </div>
    </div>
  );
}

export default AccountPage;
