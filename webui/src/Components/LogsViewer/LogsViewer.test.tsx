import { render } from "@testing-library/react";
import LogsViewer from "./LogsViewer";
import { logs } from "./mocks";

describe("LogsViewer", () => {
  it("should render the component", () => {
    const { container } = render(<LogsViewer logs={logs.split("\n")} />);
    expect(container).toMatchSnapshot();
  });
});
