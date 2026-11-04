import { render } from "@testing-library/react";
import Loading from "./Loading";

describe("Loading", () => {
  it("should render the component", () => {
    const { container } = render(<Loading pkgxReady={true} denoReady={true} />);
    expect(container).toMatchSnapshot();
  });
});
