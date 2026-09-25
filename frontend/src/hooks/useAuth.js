import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

/** { status: 'loading'|'authenticated'|'anonymous'|'error', user, login, signup, logout, updateUser, retry } */
export default function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
