import { atom } from "recoil";

export const TabsState = atom<string>({
  key: "TabsState",
  default: "0",
});
