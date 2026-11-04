import { atom } from "recoil";

export const PipelineState = atom<{
  runs: { [key: string]: boolean | undefined };
}>({
  key: "PipelineState",
  default: {
    runs: {},
  },
});
