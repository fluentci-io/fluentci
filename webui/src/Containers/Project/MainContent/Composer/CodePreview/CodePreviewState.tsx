import { atom } from "recoil";
import { code } from "./mocks";

export const CodePreviewState = atom<string>({
  key: "CodePreviewState",
  default: code,
});
