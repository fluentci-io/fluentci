import { render } from "@testing-library/react";
import Composer from "./Composer";
import { RecoilRoot } from "recoil";
import { MockedProvider } from "@apollo/client/testing";

describe("Composer", () => {
  it("should render", () => {
    const { container } = render(
      <Composer
        actions={[
          {
            id: "tyzlq1mhhx3haeay79m4owhf",
            name: "gleam",
            actionName: "test",
            active: true,
            useWasmPlugin: true,
            command: "test",
            description: "",
            githubUrl: "https://github.com/fluent-ci-templates/gleam-pipeline",
            logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/gleam.png",
            packageId: "gleam",
            downloads: 0,
            version: "",
            license: "",
            defaultBranch: "",
            updatedAt: "",
            comingSoon: false,
          },
          {
            id: "qv9um6van8o271gyggzbmps5",
            name: "gleam",
            actionName: "build",
            active: true,
            useWasmPlugin: true,
            command: "build",
            description: "",
            githubUrl: "https://github.com/fluent-ci-templates/gleam-pipeline",
            logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/gleam.png",
            packageId: "gleam",
            downloads: 0,
            version: "",
            license: "",
            defaultBranch: "",
            updatedAt: "",
            comingSoon: false,
          },
        ]}
        mode="stacked"
        setActions={vi.fn()}
      />,
      {
        wrapper: ({ children }) => (
          <MockedProvider mocks={[]}>
            <RecoilRoot>{children}</RecoilRoot>
          </MockedProvider>
        ),
      }
    );
    expect(container).toMatchSnapshot();
  });
});
