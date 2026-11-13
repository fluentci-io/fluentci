import { pwa } from "./build/pwa";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [pwa(), react(), tailwindcss()],
  optimizeDeps: { exclude: ["@atcute/oauth-browser-client"] },
});
