import { defineConfig, devices } from "@playwright/test";
export default defineConfig({ testDir: "./pwa-tests", timeout: 90_000, use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4174", trace: "retain-on-failure" }, webServer: { command: "bun run preview --host 127.0.0.1 --port 4174 --strictPort", url: "http://127.0.0.1:4174" } });
