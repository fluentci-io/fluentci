import { render } from "@testing-library/react";
import BuildHistory from "./BuildHistory";
import _ from "lodash";
import { projects } from "../mocks";

describe("BuildHistory", () => {
  it("should render the component", () => {
    const item = projects[0];
    const { container } = render(
      <BuildHistory
        status={_.last(item.recentRuns)?.status || "PENDING"}
        reliability={item.reliability || 0}
        speed={item.speed || 0}
        buildsPerWeek={item.buildsPerWeek || 0}
        builds={
          Array.from(Array(18).keys()).map((i) => ({
            status: _.get(item, `recentRuns.${i}.status`, ""),
            duration: _.get(item, `recentRuns.${i}.duration`, 0),
          })) || []
        }
      />
    );
    expect(container).toMatchSnapshot();
  });
});
