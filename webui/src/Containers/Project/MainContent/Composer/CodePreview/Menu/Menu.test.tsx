import { render } from "@testing-library/react";
import Menu from "./Menu";

describe("Menu", () => {
  it("should render the component", () => {
    const { container } = render(
      <Menu onCopy={vi.fn()} onDownload={vi.fn()} />
    );
    expect(container).toMatchSnapshot();
  });
});
