import { defineConfig } from "tsup";

export default defineConfig([
  // Main entry points (non-React)
  {
    entry: {
      index: "src/index.ts",
      "client/index": "src/client/index.ts",
      "prompts/index": "src/prompts/index.ts",
      "types/index": "src/types/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    minify: true,
    treeshake: true,
    splitting: true,
    sourcemap: false,
    outDir: "lib",
    target: "es2020",
    external: ["react", "react-dom", "@radix-ui/react-popover"],
  },
  // React entry point (separate to handle JSX)
  {
    entry: {
      "react/index": "src/react/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    clean: false, // Don't clean since first config already did
    minify: true,
    treeshake: true,
    splitting: true,
    sourcemap: false,
    outDir: "lib",
    target: "es2020",
    external: ["react", "react-dom", "@radix-ui/react-popover"],
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
  },
]);
