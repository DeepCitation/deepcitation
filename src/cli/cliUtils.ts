/**
 * CLI utility functions extracted for testability.
 * These are pure or near-pure functions used by the main CLI entry point.
 */

import { IS_COWORK } from "../auth.js";
import { PaymentRequiredError } from "../client/errors.js";
import { sanitizeForLog } from "../utils/logSafety.js";
import { safeMatch } from "../utils/regexSafety.js";

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
 */
export function formatNetworkError(err: unknown, baseUrl: string): string {
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

/**
 * Non-blocking check against the npm registry. Prints a warning to
 * stderr when a newer version is published. Swallows all errors so
 * it never interferes with the CLI command the user is running.
 */
export async function checkForUpdate(currentVersion: string): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch("https://registry.npmjs.org/deepcitation/latest", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return;
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
