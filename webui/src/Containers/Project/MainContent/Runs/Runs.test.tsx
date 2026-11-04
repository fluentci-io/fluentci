/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from "@testing-library/react";
import Runs from "./Runs";
import { RecoilRoot } from "recoil";
import { BrowserRouter } from "react-router-dom";
import { runs } from "./mocks";

describe("Runs", () => {
  it("should render", () => {
    window.scrollTo = vi.fn() as any;
    const { container } = render(
      <Runs
        loading={false}
        data={runs as any}
        pagination={{
          currentPage: 1,
          limit: 20,
          numPages: 1,
        }}
        setCurrentPage={vi.fn()}
        total={20}
      />,
      {
        wrapper: ({ children }) => (
          <BrowserRouter>
            <RecoilRoot>{children}</RecoilRoot>
          </BrowserRouter>
        ),
      }
    );
    expect(container).toMatchSnapshot();
  });
});
