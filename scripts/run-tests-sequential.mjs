import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const cliEntry = resolve(cwd, "lib/cli.js");

if (!existsSync(cliEntry)) {
  const build = spawnSync("bun", ["run", "build"], {
    cwd,
    env: {
      ...process.env,
      DC_NON_INTERACTIVE: "1",
    },
    stdio: "inherit",
  });

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const result = spawnSync("bun", ["test", "--isolate", "--timeout", "60000"], {
  cwd,
  env: {
    ...process.env,
    DC_NON_INTERACTIVE: "1",
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);
