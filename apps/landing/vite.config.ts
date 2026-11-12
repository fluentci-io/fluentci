import { pwa } from "./build/pwa";
import { sessionOAuth } from "./build/sessionOAuth";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({ plugins: [sessionOAuth(), pwa(), react(), tailwindcss()], optimizeDeps: { exclude: ["@atcute/oauth-browser-client"] } });
