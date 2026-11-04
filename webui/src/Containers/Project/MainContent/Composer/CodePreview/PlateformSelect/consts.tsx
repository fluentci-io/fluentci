import { PlateformItem } from "./PlateformSelectState";

export const plateforms: PlateformItem[] = [
  {
    label: "Azure Pipelines",
    id: "azure",
    filename: "azure-pipelines.yml",
  },
  {
    label: "AWS CodePipeline",
    id: "aws",
    filename: "buildspec.yml",
  },
  {
    label: "Circle CI",
    id: "circleci",
    filename: "config.yml",
  },
  {
    label: "Github Actions",
    id: "github",
    filename: "ci.yml",
  },
  {
    label: "GitLab CI",
    id: "gitlab",
    filename: ".gitlab-ci.yml",
  },
];
