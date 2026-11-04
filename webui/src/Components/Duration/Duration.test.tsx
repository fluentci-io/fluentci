import { render } from "@testing-library/react";
import Duration from "./Duration";

describe("Duration", () => {
  it("should render the component", () => {
    const { container } = render(<Duration value={2000} />);
    expect(container).toMatchSnapshot();
  });
});
