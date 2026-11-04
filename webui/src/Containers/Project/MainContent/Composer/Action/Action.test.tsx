import { render } from "@testing-library/react";
import Action from "./Action";

describe("Action", () => {
  it("should render the component", () => {
    const { container } = render(
      <Action
        action={{
          id: "cfah1yaym5ol34wyoqyov75r",
          name: "go",
          actionName: "tests",
          active: true,
          useWasmPlugin: true,
          command: "test ./...",
          description: "",
          githubUrl: "https://github.com/fluent-ci-templates/go-pipeline",
          logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/go-original-wordmark.svg",
          packageId: "go",
          downloads: 0,
          version: "",
          license: "",
          defaultBranch: "",
          updatedAt: "",
          comingSoon: false,
        }}
        index={1}
        onClickAction={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        activate={vi.fn()}
        disabled={false}
      />
    );
    expect(container).toMatchSnapshot();
  });
});
