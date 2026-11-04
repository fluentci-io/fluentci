import { render } from "@testing-library/react";
import PlateformSelect from "./PlateformSelect";

describe("PlateformSelect", () => {
  it("should render the component", () => {
    const { container } = render(
      <PlateformSelect
        current={[
          {
            id: "github",
            label: "Github Actions",
            filename: "ci.yml",
          },
        ]}
        plateforms={[
          {
            filename: "azure-pipelines.yml",
            id: "azure",
            label: "Azure Pipelines",
          },
          { filename: "buildspec.yml", id: "aws", label: "AWS CodePiepline" },
          { filename: "config.yml", id: "circleci", label: "CirecleCI" },
          { filename: "ci.yml", id: "github", label: "Github Actions" },
          { filename: ".gitlab-ci.yml", id: "gitlab", label: "Gitlab CI" },
        ]}
        onSelect={vi.fn()}
      />
    );
    expect(container).toMatchSnapshot();
  });
});
