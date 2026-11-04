import { atom } from "recoil";

export const HomeState = atom<{ loading: boolean }>({
  key: "HomeState",
  default: {
    loading: true,
  },
});
