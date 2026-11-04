import { render } from "@testing-library/react";
import Header from "./Header";
import { BrowserRouter } from "react-router-dom";

describe("Header", () => {
  it("should render the component", () => {
    const { container } = render(
      <Header
        id="1"
        onRun={vi.fn()}
        breadcrumbs={[
          { title: "Projects", link: "/" },
          {
            title: "frosty-hamilton",
            link: "/project/yvzb2a5aaceuaa8vs9kawruc",
          },
        ]}
      />,
      {
        wrapper: BrowserRouter,
      }
    );
    expect(container).toMatchSnapshot();
  });
});
