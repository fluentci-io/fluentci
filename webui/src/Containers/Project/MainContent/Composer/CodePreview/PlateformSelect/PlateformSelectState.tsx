import { atom } from "recoil";

export type PlateformItem = { id: Plateform; label: string; filename: string };
export type Plateform = "github" | "gitlab" | "aws" | "circleci" | "azure";

export const PlateformSelectState = atom<PlateformItem[]>({
  key: "PlateformSelectState",
  default: [
    {
      id: "github",
      label: "Github Actions",
      filename: "ci.yml",
    },
  ],
});
