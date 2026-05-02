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

function collectTestFiles() {
  const rg = spawnSync(
    "rg",
    ["--files", "src", "-g", "*.test.ts", "-g", "*.test.tsx", "-g", "*.spec.ts", "-g", "*.spec.tsx"],
    {
      cwd,
      encoding: "utf8",
    },
  );

  if (rg.status === 0 || rg.status === 1) {
    return rg.stdout
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean)
      .sort();
  }

  if (!existsSync(resolve(cwd, "src"))) {
    throw new Error(`Could not list test files in ${cwd}`);
  }

  throw new Error(rg.stderr || "Failed to enumerate test files");
}

const files = collectTestFiles();
let failed = false;

for (const file of files) {
  const result = spawnSync("bun", ["test", `./${file}`], {
    cwd,
    env: {
      ...process.env,
      DC_NON_INTERACTIVE: "1",
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
