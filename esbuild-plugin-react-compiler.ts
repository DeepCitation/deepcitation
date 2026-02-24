import type { Plugin } from "esbuild";
import { basename } from "path";

/**
 * esbuild plugin that runs babel-plugin-react-compiler on React source files.
 * Only processes files under src/react/ — non-React code is untouched.
 */
export function reactCompilerPlugin(): Plugin {
  return {
    name: "react-compiler",
    setup(build) {
      build.onLoad({ filter: /src[\\/]react[\\/].*\.tsx?$/ }, async (args) => {
        const [{ readFile }, { transformAsync }] = await Promise.all([
          import("fs/promises"),
          import("@babel/core"),
        ]);

        const code = await readFile(args.path, "utf8");
        const isTSX = args.path.endsWith(".tsx");

        try {
          const result = await transformAsync(code, {
            filename: args.path,
            presets: [],
            plugins: [
              [
                "@babel/plugin-syntax-typescript",
                { isTSX, disallowAmbiguousJSXLike: true },
              ],
              // "critical_errors" = bail out (skip) components the compiler can't safely handle,
              // but still compile everything else. Avoids silent incorrect memoization while
              // keeping coverage high for a pre-compiled library.
              ["babel-plugin-react-compiler", { panicThreshold: "critical_errors" }],
            ],
            configFile: false,
            babelrc: false,
          });

          return {
            contents: result?.code ?? code,
            loader: isTSX ? "tsx" : "ts",
          };
        } catch {
          // Compiler bailed out on this file (e.g. sync ref updates during render).
          // Fall back to uncompiled source — the component works fine, it just won't
          // get automatic memoization from the compiler.
          const file = basename(args.path);
          console.warn(`[react-compiler] skipped ${file} (compiler bailout)`);
          return { contents: code, loader: isTSX ? "tsx" : "ts" };
        }
      });
    },
  };
}
