import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "jotai";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { queryClient } from "./api";
import App from "./App";
import "./index.css";

async function bootstrap() {
  if (import.meta.env.DEV && import.meta.env.VITE_STUDIO_MOCKS === "true") {
    const { enableMocking } = await import("./mocks/browser");
    await enableMocking();
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Provider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </Provider>
    </React.StrictMode>,
  );
}

void bootstrap();
