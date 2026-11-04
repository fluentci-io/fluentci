import Home from "./Containers/Home";
import Run from "./Containers/Run";
import Project from "./Containers/Project";
import Auth from "./Containers/Auth";
import AccessTokens from "./Containers/Settings/AccessTokens";
import Billing from "./Containers/Settings/Billing";
import Settings from "./Containers/Settings";
import LinkProject from "./Containers/LinkProject";
import {
  RouterProvider,
  createBrowserRouter,
  createHashRouter,
} from "react-router-dom";
import RootLayout from "./Layouts/Root";
import { AuthenticateWithRedirectCallback } from "./lib/auth";
import NewProject from "./Containers/NewProject";

const createRouter = location.host ? createBrowserRouter : createHashRouter;

const router = createRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Home /> },
      {
        path: "/auth",
        element: <Auth />,
      },

      {
        path: "/auth/sso-callback",
        element: <AuthenticateWithRedirectCallback />,
      },
      {
        path: "/settings",
        element: <Settings />,
      },
      {
        path: "/settings/account",
        element: <Settings />,
      },
      {
        path: "/settings/billing",
        element: <Billing />,
      },
      {
        path: "/settings/tokens",
        element: <AccessTokens />,
      },
      {
        path: "/run/:id",
        element: <Run />,
      },
      {
        path: "/project/:id",
        element: <Project />,
      },
      {
        path: "/link-project/:id",
        element: <LinkProject />,
      },
      {
        path: "/new-project",
        element: <NewProject />,
      },
      {
        path: "/:id",
        element: <Home />,
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
