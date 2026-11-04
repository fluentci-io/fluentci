import { render } from "@testing-library/react";
import MainContent from "./MainContent";
import { projects } from "./mocks";
import { BrowserRouter } from "react-router-dom";

describe("MainContent", () => {
  it("should render the component", () => {
    const { container } = render(
      <MainContent
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projects={projects as any[]}
        onNewProject={vi.fn()}
        displayNewProjectButton={true}
        loading={false}
      />,
      {
        wrapper: BrowserRouter,
      }
    );
    expect(container).toMatchSnapshot();
  });
});
