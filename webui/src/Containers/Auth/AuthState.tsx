import { atom } from "recoil";
import { Account } from "../../Hooks/GraphQL";

export const AuthState = atom<Account | undefined | null>({
  key: "AuthState",
  default: null,
});
