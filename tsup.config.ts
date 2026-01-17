import { defineConfig } from "tsup";

// Combined single config to avoid race conditions between parallel builds
// This ensures DTS files are not cleaned up by competing processes
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "client/index": "src/client/index.ts",
    "prompts/index": "src/prompts/index.ts",
    "types/index": "src/types/index.ts",
    "react/index": "src/react/index.ts",
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
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
