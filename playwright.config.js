import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.js",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: ["--no-sandbox"],
        }
      : {},
  },
  webServer: [
    {
      command: "node e2e/fixtures/server.mjs",
      url: "http://127.0.0.1:3001/api/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "npm run dev --prefix web -- --host 127.0.0.1 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
