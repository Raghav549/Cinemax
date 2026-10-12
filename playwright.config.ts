import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const args = process.env.PLAYWRIGHT_CHROMIUM_ARGS?.split(" ").filter(Boolean);

export default defineConfig({
  testDir: "./tests",
  timeout: 70_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath, args } : undefined,
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "small-mobile", use: { ...devices["iPhone SE"], browserName: "chromium", viewport: { width: 320, height: 568 } } },
    { name: "reduced-motion", use: { browserName: "chromium", viewport: { width: 375, height: 812 }, reducedMotion: "reduce", isMobile: true, hasTouch: true } },
  ],
});
