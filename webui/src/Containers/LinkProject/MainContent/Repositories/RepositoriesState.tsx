/* eslint-disable @typescript-eslint/no-explicit-any */
import { atom } from "recoil";

export const RepositoriesState = atom<any[]>({
  key: "gh-repositories",
  default: [],
});
