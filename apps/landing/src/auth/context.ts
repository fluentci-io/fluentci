import { createContext, useContext } from "react";
import type { Account } from "./client";
export type AuthState = {
  account: Account | null;
  loading: boolean;
  error: string;
  openSignIn: () => void;
  logout: () => void;
};
export const AuthContext = createContext<AuthState>({
  account: null,
  loading: false,
  error: "",
  openSignIn: () => {},
  logout: () => {},
});
export const useAuth = () => useContext(AuthContext);
