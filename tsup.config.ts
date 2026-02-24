import { defineConfig } from "tsup";
import { reactCompilerPlugin } from "./esbuild-plugin-react-compiler.js";

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
    "rendering/slack/slackRenderer": "src/rendering/slack/slackRenderer.ts",
    "rendering/github/githubRenderer": "src/rendering/github/githubRenderer.ts",
    "rendering/html/htmlRenderer": "src/rendering/html/htmlRenderer.ts",
    "rendering/terminal/terminalRenderer": "src/rendering/terminal/terminalRenderer.ts",
  },
  format: ["esm", "cjs"],
  dts: {
    compilerOptions: {
      composite: false,
      declarationMap: false,
    },
  },
  clean: true,
  minify: true,
  treeshake: true,
  splitting: true,
  sourcemap: true,
  outDir: "lib",
  target: "es2020",
  external: ["react", "react-dom", "@radix-ui/react-popover"],
  esbuildPlugins: [reactCompilerPlugin()],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
