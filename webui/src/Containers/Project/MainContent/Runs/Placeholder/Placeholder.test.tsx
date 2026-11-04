import { render } from "@testing-library/react";
import Placeholder from "./Placeholder";

describe("Placeholder", () => {
  it("should render", () => {
    const { container } = render(<Placeholder />);
    expect(container).toMatchSnapshot();
  });
});
