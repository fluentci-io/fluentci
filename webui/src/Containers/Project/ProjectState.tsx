import { atom } from "recoil";
import { Project } from "../../Hooks/GraphQL";

export const ProjectState = atom<{
  project?: Project | null;
}>({
  key: "project-state",
  default: {
    project: null,
  },
});
