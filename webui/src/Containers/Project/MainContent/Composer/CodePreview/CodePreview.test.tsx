import { render } from "@testing-library/react";
import CodePreview from "./CodePreview";
import { code } from "./mocks";
import { RecoilRoot } from "recoil";

describe("CodePreview", () => {
  it("should render the component", () => {
    const { container } = render(<CodePreview code={code} />, {
      wrapper: RecoilRoot,
    });
    expect(container).toMatchSnapshot();
  });
});
