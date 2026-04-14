#!/usr/bin/env node

/**
 * DeepCitation CLI entry point.
 *
 * This file is intentionally thin — it handles only:
 *   1. Version resolution (requires import.meta.url)
 *   2. BASE_URL resolution (requires die() at module level)
 *   3. Spec path resolution for --prompt (requires import.meta.url)
 *   4. Dispatch: maps process.argv to command handler functions
 *
 * All command logic lives in ./cli/commands.ts (exported for Tier 2 testability).
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { checkForUpdate, formatNetworkError } from "./cli/cliUtils.js";
import {
  auth,
  getAttachment,
  HELP,
  hydrate,
  inject,
  keygen,
  lint,
  login,
  logout,
  merge,
  openBillingDashboard,
  prepare,
  publish,
  resolveBaseUrl,
  slice,
  status,
  text,
  verify,
  whoami,
} from "./cli/commands.js";

// ── version ─────────────────────────────────────────────────────────
const { version: CLI_VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };
const IS_DEV_BUILD =
  import.meta.url.endsWith(".ts") || import.meta.url.includes("/src/") || !import.meta.url.includes("node_modules");
const VERSION_DISPLAY = IS_DEV_BUILD ? `${CLI_VERSION} (dev)` : CLI_VERSION;

// ── base URL + billing URL ─────────────────────────────────────────
const BASE_URL = resolveBaseUrl();
const BILLING_URL = `${BASE_URL}/billing`;

/** formatNetworkError bound with BASE_URL for use in catch handlers */
const fmtNetErr = (err: unknown) => formatNetworkError(err, BASE_URL);

// ── spec path for --prompt ─────────────────────────────────────────
function resolveSpecPath(): string | null {
  const require = createRequire(import.meta.url);
  const dcRoot = dirname(require.resolve("deepcitation/package.json"));
  const specPath = resolve(dcRoot, "docs/prompts/citation-format.md");
  return existsSync(specPath) ? specPath : null;
}

// ── update check (non-blocking, stderr only) ──────────────────────
if (!IS_DEV_BUILD) {
  checkForUpdate(CLI_VERSION);
}

// ── dispatch ──────────────────────────────────────────────────────
const [command, ...rest] = process.argv.slice(2);

if (!command || command === "-h" || command === "--help") {
  console.log(HELP);
  process.exit(0);
}

if (command === "-v" || command === "--version") {
  console.log(VERSION_DISPLAY);
  process.exit(0);
}

switch (command) {
  case "auth":
    auth(rest, BASE_URL).catch(err => {
      console.error(`Error: ${fmtNetErr(err)}`);
      process.exit(1);
    });
    break;
  case "prepare":
    prepare(rest, fmtNetErr).catch(err => {
      console.error(`Error: ${fmtNetErr(err)}`);
      process.exit(1);
    });
    break;
  case "verify":
    verify(rest, fmtNetErr, resolveSpecPath).catch(err => {
      console.error(`Error: ${fmtNetErr(err)}`);
      process.exit(1);
    });
    break;
  case "hydrate":
    hydrate(rest);
    break;
  case "merge":
    merge(rest);
    break;
  case "lint":
    lint(rest);
    break;
  case "slice":
    slice(rest);
    break;
  case "text":
    text(rest);
    break;
  case "publish":
    publish(rest).catch(err => {
      console.error(`Error: ${fmtNetErr(err)}`);
      process.exit(1);
    });
    break;
  case "inject":
    inject(rest);
    break;
  case "keygen":
    keygen(rest);
    break;
  case "get":
    getAttachment(rest).catch(err => {
      console.error(`Error: ${fmtNetErr(err)}`);
      process.exit(1);
    });
    break;
  case "login":
    login(rest, BASE_URL).catch(err => {
      console.error(`Error: ${fmtNetErr(err)}`);
      process.exit(1);
    });
    break;
  case "logout":
    logout();
    break;
  case "whoami":
    whoami();
    break;
  case "status":
    status();
    break;
  case "billing":
    openBillingDashboard(BILLING_URL).catch(err => {
      console.error(`Error: ${fmtNetErr(err)}`);
      process.exit(1);
    });
    break;
  default:
    console.error(`Error: Unknown command: ${command}\n\n${HELP}`);
    process.exit(1);
}
