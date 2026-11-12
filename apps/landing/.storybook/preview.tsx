import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { Preview } from "@storybook/react";
import { initialize, mswLoader } from "msw-storybook-addon";
import { http, HttpResponse } from "msw";
import { author, plugin } from "../src/fixtures/registry";
import { validateCatalogSearch } from "../src/components/ModulesPage/filters";
import "../src/styles.css";

initialize({ onUnhandledRequest: "bypass" });
function StoryRouter({
  children,
  path,
  theme,
}: {
  children: ReactNode;
  path: string;
  theme: "dark" | "light";
}) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
      }),
  );
  const [router] = useState(() => {
    const root = createRootRoute({ component: Outlet });
    const home = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => children,
    });
    const module = createRoute({
      getParentRoute: () => root,
      path: "/$handle/plugin/$rkey",
      component: () => children,
    });
    const publisher = createRoute({
      getParentRoute: () => root,
      path: "/$handle",
      component: () => children,
    });
    const catalog = createRoute({
      getParentRoute: () => root,
      path: "/modules",
      validateSearch: validateCatalogSearch,
      component: () => children,
    });
    return createRouter({
      routeTree: root.addChildren([home, catalog, module, publisher]),
      history: createMemoryHistory({ initialEntries: [path] }),
    });
  });
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
const preview: Preview = {
  decorators: [
    (Story, context) => (
      <StoryRouter
        path={context.parameters.path ?? "/"}
        theme={context.parameters.theme ?? "dark"}
      >
        <Story />
      </StoryRouter>
    ),
  ],
  loaders: [mswLoader],
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        http.get(
          "https://api.fluentci.io/xrpc/io.fluentci.registry.getActorPackages",
          () =>
            HttpResponse.json({
              packages: [plugin],
              total: 1,
              totalDownloads: plugin.downloads ?? 0,
            }),
        ),
        http.get(
          "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile",
          () =>
            HttpResponse.json({
              ...author,
              displayName: "FluentCI",
              description: "Build pipelines in any language.",
            }),
        ),
        http.get(
          "https://api.fluentci.io/xrpc/io.fluentci.registry.listPackages",
          () => HttpResponse.json({ packages: [plugin] }),
        ),
        http.get(
          "https://api.fluentci.io/xrpc/io.fluentci.registry.searchPackages",
          () => HttpResponse.json({ packages: [plugin] }),
        ),
        http.get(
          "https://api.fluentci.io/xrpc/io.fluentci.registry.getPackage",
          () => HttpResponse.json({ package: plugin }),
        ),
        http.get(
          "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles",
          () => HttpResponse.json({ profiles: [author] }),
        ),
        http.get(
          "https://modules.example/README.md",
          () =>
            new HttpResponse(
              "# sccache\n\nFast compiler caching.\n\n```sh\nfluentci run @fluentci.io/sccache setup\n```",
              { headers: { "Content-Type": "text/markdown" } },
            ),
        ),
      ],
    },
  },
};
export default preview;
