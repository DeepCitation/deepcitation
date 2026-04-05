import { defineConfig } from "tsup";

// Skip declaration generation during iterative development to halve build time.
const skipDts = process.env.SKIP_DTS === "true";

// Combined single config to avoid race conditions between parallel builds
// This ensures DTS files are not cleaned up by competing processes
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "client/index": "src/client/index.ts",
    "drawing/index": "src/drawing/index.ts",
    "prompts/index": "src/prompts/index.ts",
    "types/index": "src/types/index.ts",
    "react/index": "src/react/index.ts",
    "rendering/terminal/terminalRenderer": "src/rendering/terminal/terminalRenderer.ts",
    "vanilla/index": "src/vanilla/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: skipDts
    ? false
    : {
        compilerOptions: {
          composite: false,
          declarationMap: false,
          types: ["node"],
        },
      },
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
