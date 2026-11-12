import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { LandingPage } from "./components/LandingPage";
import { NotFound } from "./components/NotFound";
import { PublisherPage } from "./components/PublisherPage";
import { ModulesPage } from "./components/ModulesPage";
import { validateCatalogSearch } from "./components/ModulesPage/filters";
import { OAuthCallback } from "./components/OAuthCallback";
import { ModulePage } from "./components/ModulePage";

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});
const moduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$handle/plugin/$rkey",
  component: ModulePage,
});
const publisherRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$handle",
  component: PublisherPage,
});
const modulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/modules",
  validateSearch: validateCatalogSearch,
  component: ModulesPage,
});

const oauthRoute = createRoute({ getParentRoute: () => rootRoute, path: "/oauth/callback", component: OAuthCallback });

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    oauthRoute,
    indexRoute,
    modulesRoute,
    moduleRoute,
    publisherRoute,
  ]),
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
