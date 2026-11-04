import { atom } from "recoil";
import { Pipeline } from "./NewActionModal/NewActionModalWithData";

export const ComposerState = atom<Pipeline[]>({
  key: "ComposerState",
  default: [],
});
