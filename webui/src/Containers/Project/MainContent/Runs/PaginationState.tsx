import { atom } from "recoil";

export const PaginationState = atom<{
  cursor?: string;
  currentPage: number;
  limit: number;
  numPages: number;
}>({
  key: "PaginationState",
  default: {
    currentPage: 1,
    limit: 20,
    numPages: 1,
  },
});
