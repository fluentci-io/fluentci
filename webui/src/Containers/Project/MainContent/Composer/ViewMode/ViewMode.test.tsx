import { render } from "@testing-library/react";
import ViewMode from "./ViewMode";

describe("ViewMode", () => {
  it("should render", () => {
    const { container } = render(
      <ViewMode mode="stacked" onSetViewMode={vi.fn()} />
    );
    expect(container).toMatchSnapshot();
  });
});
