import { useState } from "react";
import type { Preview } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { initialize, mswLoader } from "msw-storybook-addon";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "../src/index.css";

initialize({ onUnhandledRequest: "bypass" });

function Providers({
  children,
  path,
}: {
  children: React.ReactNode;
  path: string;
}) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <Provider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <div className="min-h-screen bg-canvas text-text">{children}</div>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "graphite",
      values: [{ name: "graphite", value: "#101214" }],
    },
    controls: { expanded: true },
  },
  loaders: [mswLoader],
  decorators: [
    (Story, context) => (
      <Providers key={context.id} path={context.parameters.path || "/"}>
        <Story />
      </Providers>
    ),
  ],
};

export default preview;
