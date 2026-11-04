import { render } from "@testing-library/react";
import Navbar from "./Navbar";
import { BrowserRouter } from "react-router-dom";
import { FC, ReactNode } from "react";
import { ClerkProvider } from "../../lib/auth";

describe("Navbar", () => {
  it("should render the component", () => {
    const wrapper: FC<{ children: ReactNode }> = ({ children }) => (
      <ClerkProvider
        routerPush={vi.fn()}
        routerReplace={vi.fn()}
        publishableKey={
          "pk_test_c3BsZW5kaWQtcmFiYml0LTMyLmNsZXJrLmFjY291bnRzLmRldiQ"
        }
      >
        <BrowserRouter>{children}</BrowserRouter>
      </ClerkProvider>
    );
    const { container } = render(<Navbar onSignOut={vi.fn()} />, {
      wrapper,
    });
    expect(container).toMatchSnapshot();
  });
});
