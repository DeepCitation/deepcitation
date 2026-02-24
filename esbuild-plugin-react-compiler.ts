import type { Plugin } from "esbuild";

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

        const result = await transformAsync(code, {
          filename: args.path,
          presets: [],
          plugins: [
            [
              "@babel/plugin-syntax-typescript",
              { isTSX, disallowAmbiguousJSXLike: true },
            ],
            ["babel-plugin-react-compiler", { panicThreshold: "none" }],
          ],
          configFile: false,
          babelrc: false,
        });

        return {
          contents: result?.code ?? code,
          loader: isTSX ? "tsx" : "ts",
        };
      });
    },
  };
}
