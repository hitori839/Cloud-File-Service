const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value) {
  const email = value.trim();
  if (!email) return "이메일을 입력해 주세요.";
  if (!EMAIL_RE.test(email)) return "올바른 이메일 형식이 아닙니다.";
  return null;
}

export function validatePassword(value) {
  if (!value) return "비밀번호를 입력해 주세요.";
  if (value.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  return null;
}

export function validateName(value) {
  const name = value.trim();
  if (!name) return "이름을 입력해 주세요.";
  if (name.length > 50) return "이름은 50자 이하로 입력해 주세요.";
  return null;
}

export function validateConfirm(password, confirm) {
  if (!confirm) return "비밀번호를 한 번 더 입력해 주세요.";
  if (password !== confirm) return "비밀번호가 일치하지 않습니다.";
  return null;
}

export function hasErrors(errors) {
  return Object.values(errors).some(Boolean);
}
