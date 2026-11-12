import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./registry/queryClient";
import { AuthProvider } from "./components/AuthProvider";
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./pwa";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider><RouterProvider router={router} /></AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
