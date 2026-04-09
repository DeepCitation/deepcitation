/**
 * CLI utility functions extracted for testability.
 * These are pure or near-pure functions used by the main CLI entry point.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { IS_COWORK } from "../auth.js";
import { PaymentRequiredError } from "../client/errors.js";
import { sanitizeForLog } from "../utils/logSafety.js";
import { safeMatch, safeReplace } from "../utils/regexSafety.js";
import { TimeoutError } from "./proxy.js";

// ── constants ─────────────────────────────────────────────────────

export const CLAUDE_COWORK_DOMAIN_HINT =
  "This appears to be a Claude Cowork (cloud) session.\n" +
  "  The user must add *.deepcitation.com to allowed domains:\n" +
  "  https://claude.ai/settings/capabilities\n" +
  '  → Under "Additional allowed domains", add *.deepcitation.com and press Add.';

// ── die ───────────────────────────────────────────────────────────

export function die(msg: string, help: string): never {
  console.error(`Error: ${msg}\n\n${help}`);
  process.exit(1);
}

// ── parseArgs ─────────────────────────────────────────────────────

/**
 * Parse CLI argv into a key-value record. Handles `--key value` pairs
 * and exits on `-h`/`--help`. Non-flag args are ignored.
 */
export function parseArgs(argv: string[], help: string): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "-h" || key === "--help") {
      console.log(help);
      process.exit(0);
    }
    if (key?.startsWith("--") && i + 1 < argv.length) {
      args[key.slice(2)] = argv[++i] as string;
    }
  }
  return args;
}

// ── formatNetworkError ────────────────────────────────────────────

/**
 * Wrap a network error with actionable hints for the CLI user.
 * `baseUrl` is the login/billing base URL (e.g. "https://deepcitation.com").
 *
 * For TimeoutError (transport-layer hangs caught by createProxyFetch's
 * per-phase timeouts), emits a structured multi-line block plus a final
 * `__DC_ERROR__ {...}` JSON marker line that agent-driven callers can
 * parse to short-circuit their recovery loops.
 */
export function formatNetworkError(err: unknown, baseUrl: string): string {
  if (err instanceof TimeoutError) {
    return formatTimeoutError(err);
  }
  if (err instanceof PaymentRequiredError) {
    return [
      `\nPayment required: ${sanitizeForLog(err.message)}`,
      ``,
      `  To add a credit card and unlock usage beyond the free tier:`,
      `    npx deepcitation billing`,
      `  Or visit: ${baseUrl}/billing`,
      ``,
      `  Benefits of adding a card:`,
      `    • Continue using DeepCitation without interruption`,
      `    • Pay-as-you-go: $0.05/doc, $0.01/verification`,
      `    • Set a custom monthly spend cap for cost control`,
    ].join("\n");
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("fetch failed") || msg.includes("ENOTFOUND") || msg.includes("EAI_AGAIN")) {
    if (IS_COWORK) {
      return `Network error: ${msg}.\n\n${CLAUDE_COWORK_DOMAIN_HINT}`;
    }
    const proxyHint =
      process.env.HTTPS_PROXY || process.env.HTTP_PROXY
        ? " Proxy is set but may not be working. Try: NO_PROXY=api.deepcitation.com npx deepcitation <command>"
        : " If behind a proxy, set HTTPS_PROXY=http://your-proxy:port";
    return `Network error: ${msg}.${proxyHint}`;
  }
  return msg;
}

/**
 * Format a TimeoutError as a multi-line message for humans plus a final
 * single-line `__DC_ERROR__ {...}` JSON marker that agents can grep for.
 *
 * The "Do NOT" block is intentionally explicit so an LLM agent reading the
 * stderr output recognizes that workaround attempts (npm install undici,
 * NO_PROXY, smaller payloads, etc.) cannot help and will waste time.
 */
function formatTimeoutError(err: TimeoutError): string {
  const phaseExplanation: Record<TimeoutError["phase"], string> = {
    proxy_connect: "could not establish a TCP CONNECT to the proxy",
    tls_handshake: "completed CONNECT but the TLS handshake stalled",
    response_headers: "sent the request but the API never began responding",
    response_idle: "started receiving the response but the connection stalled mid-stream",
    request_overall: "exceeded the absolute 90-second ceiling for the entire request",
  };

  const lines: string[] = [
    `Request to ${err.target} timed out after ${err.elapsedMs}ms (phase: ${err.phase}).`,
    `Why: ${phaseExplanation[err.phase]}.`,
    `Proxy: ${sanitizeForLog(safeReplace(err.proxyUrl, /\/\/[^@]+@/, "//***@"))}`,
  ];
  if (IS_COWORK) {
    lines.push(`Environment: Claude Cowork (CLAUDE_CODE_REMOTE=true)`);
  }
  lines.push(
    ``,
    `This is a TRANSPORT failure, not an API or authentication failure. The CLI's`,
    `bundled HTTP client could not complete the request through the sandbox proxy.`,
    `Do NOT:`,
    `  - install undici, node-fetch, or any other npm package (the CLI is bundled)`,
    `  - modify HTTP_PROXY / HTTPS_PROXY / NO_PROXY environment variables`,
    `  - retry with a smaller payload (the request never reached the API)`,
    `  - background this command with & or wrap it in a polling loop`,
    ``,
    `If this persists, share this error verbatim with the user and stop. They may`,
    `need to contact DeepCitation support or check that *.deepcitation.com is on`,
    `the sandbox's allowed-domain list.`,
    ``,
    `__DC_ERROR__ ${JSON.stringify({
      type: "timeout",
      phase: err.phase,
      elapsedMs: err.elapsedMs,
      target: err.target,
      isCowork: IS_COWORK,
      retryable: false,
      recoverable: false,
    })}`,
  );
  return lines.join("\n");
}

// ── validateApiKeyFormat ──────────────────────────────────────────

/** Matches `sk-dc-` followed by at least 14 alphanumeric chars (total >= 20). */
const VALID_API_KEY_RE = /^sk-dc-[a-zA-Z0-9]{14,}$/;

/**
 * Check whether a string looks like a valid DeepCitation API key.
 * Requires `sk-dc-` prefix followed by alphanumeric characters only (no hyphens).
 */
export function isValidApiKeyFormat(key: string): boolean {
  return VALID_API_KEY_RE.test(key);
}

/** Extract a valid API key from arbitrary input (pasted command, quoted key, etc). */
export function extractApiKey(input: string): string | null {
  const match = safeMatch(input, /sk-dc-[a-zA-Z0-9]{14,}/);
  return match && isValidApiKeyFormat(match[0]) ? match[0] : null;
}

// ── update check ─────────────────────────────────────────────────

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Path to the timestamp file that throttles update checks. */
function updateCheckStampPath(): string {
  return join(homedir(), ".deepcitation", "update-check");
}

/** Returns true if the last check was within the throttle window. */
function isUpdateCheckThrottled(): boolean {
  try {
    const stamp = readFileSync(updateCheckStampPath(), "utf8").trim();
    const lastCheck = Number(stamp);
    return Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS;
  } catch {
    return false;
  }
}

/** Persist the current timestamp so subsequent invocations skip the fetch. */
function writeUpdateCheckStamp(): void {
  try {
    const dir = join(homedir(), ".deepcitation");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(updateCheckStampPath(), String(Date.now()), "utf8");
  } catch {
    // Best-effort — never block the CLI
  }
}

/**
 * Non-blocking check against the npm registry. Prints a warning to
 * stderr when a newer version is published. Throttled to once per 24 hours
 * via a timestamp file at `~/.deepcitation/update-check`. Swallows all
 * errors so it never interferes with the CLI command the user is running.
 */
export async function checkForUpdate(currentVersion: string): Promise<void> {
  try {
    if (isUpdateCheckThrottled()) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch("https://registry.npmjs.org/deepcitation/latest", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return;
    writeUpdateCheckStamp();
    const { version: latest } = (await res.json()) as { version: string };
    if (latest && latest !== currentVersion) {
      process.stderr.write(
        `\nUpdate available: ${currentVersion} → ${latest}. Run: npm install -g deepcitation@latest\n\n`,
      );
    }
  } catch {
    // Silent — network errors, timeouts, etc. should never block the CLI
  }
}
