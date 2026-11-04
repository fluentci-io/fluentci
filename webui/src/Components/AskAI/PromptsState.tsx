import { atom } from "recoil";

export const promptsState = atom<
  {
    interactionId: string;
    query: string;
    response: string;
  }[]
>({
  key: "promptsState",
  default: [],
});
