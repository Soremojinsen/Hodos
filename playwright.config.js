import { availableParallelism } from "node:os";
import { defineConfig } from "@playwright/test";

// Software WebGL (SwiftShader), which works without a GPU and without a display server
const launchOptions = {
  env: { ...process.env, WAYLAND_DISPLAY: "" },
  args: [
    "--ozone-platform=headless",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
};

export default defineConfig({
  testDir: "tests/browser",
  // Each world takes seconds to generate on a CI runner, and some tests open two or three
  timeout: 60_000,
  // Software WebGL draws on the CPU: past four tests at once, each slows so much that some time out,
  // and the whole run is no faster. Playwright's default is half the cores.
  workers: Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2))),
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    launchOptions,
    viewport: { width: 1000, height: 700 },
    locale: "fr-FR",
  },
  projects: [
    // The production build, as deployed
    { name: "build", testIgnore: /\.dev\.spec\.js$/, use: { baseURL: "http://localhost:4173/" } },
    // The dev server, for tests that import source modules directly
    { name: "dev", testMatch: /\.dev\.spec\.js$/, use: { baseURL: "http://localhost:5173/" } },
  ],
  webServer: [
    {
      command: "npx vite build && npx vite preview --port 4173 --strictPort",
      url: "http://localhost:4173/",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx vite --port 5173 --strictPort",
      url: "http://localhost:5173/",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
