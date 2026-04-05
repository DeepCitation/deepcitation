#!/usr/bin/env node
/**
 * Injects "use client" into the react entry points after tsup builds them.
 *
 * Why: esbuild strips module-level directives (other than "use strict") when
 * bundling with code-splitting. The directive must be in the *output* file for
 * Next.js App Router to treat the module as client-only. Non-RSC bundlers
 * (Vite, webpack) safely ignore it as a no-op string expression.
 */

import { readFileSync, writeFileSync } from "node:fs";

const DIRECTIVE = '"use client";\n';
const targets = ["lib/react/index.js", "lib/react/index.cjs"];

for (const file of targets) {
  const content = readFileSync(file, "utf8");
  if (!content.startsWith(DIRECTIVE)) {
    writeFileSync(file, DIRECTIVE + content);
    console.log(`  ✓ added "use client" → ${file}`);
  }
}
