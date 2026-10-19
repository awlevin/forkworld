import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a deployment with real models:
 * E2E_BASE_URL=https://forkworld-....vercel.app pnpm e2e
 * A fresh run generates at least one new path (about $0.50).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 8 * 60 * 1000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    ...devices["iPhone 14"],
    browserName: "chromium",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
