/* eslint-disable @typescript-eslint/no-explicit-any */
import { atom } from "recoil";

export const OrganizationsState = atom<{
  orgs: any[];
  current: any[];
}>({
  key: "organizations",
  default: {
    orgs: [],
    current: [],
  },
});
