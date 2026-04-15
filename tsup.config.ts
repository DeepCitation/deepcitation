import { defineConfig } from "tsup";

// DTS generation is handled by tsc (see tsconfig.declarations.json) — ~10s vs 38-99s via rollup-plugin-dts.
// JS bundling only; tsc runs as a separate build step afterward.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "client/index": "src/client/index.ts",
    "drawing/index": "src/drawing/index.ts",
    "prompts/index": "src/prompts/index.ts",
    "react/index": "src/react/index.ts",
    "rendering/terminal/terminalRenderer": "src/rendering/terminal/terminalRenderer.ts",
    "vanilla/index": "src/vanilla/index.ts",
    "html-utils": "src/html-utils.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: false,
  clean: false,
  minify: true,
  treeshake: true,
  splitting: true,
  sourcemap: true,
  outDir: "lib",
  target: "es2020",
  external: ["react", "react-dom", "undici"],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
