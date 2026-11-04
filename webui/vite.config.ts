/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/graphql": "http://127.0.0.1:6076",
      "/ws": { target: "ws://127.0.0.1:6076", ws: true },
    },
  },
  test: {
    pool: "forks",
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.js",
  },
});
