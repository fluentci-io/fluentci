import { atom } from "recoil";

export const ViewModeState = atom<"stacked" | "code">({
  key: "ViewModeState",
  default: "stacked",
});
