import { defineConfig, devices } from "@playwright/experimental-ct-react";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Custom plugin to resolve .js imports to .ts/.tsx source files
 */
function resolveJsToTs() {
  return {
    name: "resolve-js-to-ts",
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !source.endsWith(".js")) return null;

      // Only handle relative imports within src
      if (!source.startsWith(".")) return null;

      const importerDir = path.dirname(importer);
      const basePath = path.resolve(importerDir, source.replace(/\.js$/, ""));

      // Try .tsx first, then .ts
      for (const ext of [".tsx", ".ts"]) {
        const fullPath = basePath + ext;
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }

      return null;
    },
  };
}

/**
 * Playwright Component Testing configuration for DeepCitation.
 * @see https://playwright.dev/docs/test-components
 */
export default defineConfig({
  testDir: "./src/__tests__/playwright",
  snapshotDir: "./src/__tests__/playwright/__snapshots__",
  timeout: 30 * 1000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.PLAYWRIGHT_WORKERS
    ? (() => {
        const parsed = parseInt(process.env.PLAYWRIGHT_WORKERS, 10);
        return !isNaN(parsed) && parsed > 0 ? parsed : undefined;
      })()
    : undefined,
  reporter: "html",
  use: {
    trace: "on-first-retry",
    ctPort: 3100,
    ctViteConfig: {
      plugins: [resolveJsToTs(), react()],
      resolve: {
        extensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
        alias: {
          // Map .js imports to source files
          "@": path.resolve(__dirname, "./src"),
        },
      },
      esbuild: {
        jsx: "automatic",
      },
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
