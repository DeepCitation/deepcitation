// Node.js CLI only — not for browser or SDK consumers.
// This module is imported exclusively by cli.ts and must never be
// re-exported from any public entrypoint (index.ts, react/, etc.).

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { escapeHtml } from "./utils/htmlEscape.js";
import { isDomainMatch } from "./utils/urlSafety.js";

// ── Credentials ────────────────────────────────────────────────────

export interface Credentials {
  version: 1;
  apiKey: string;
  email?: string;
  displayName?: string;
  createdAt: string;
}

// CLAUDE_CODE_REMOTE=true is set in Claude Cowork (web-based cloud sessions).
export const IS_COWORK = process.env.CLAUDE_CODE_REMOTE === "true";

/**
 * Detect whether the CLI is being run by an AI coding agent.
 * Used to tailor auth error messages so agents can self-resolve.
 * Only checks known agent env vars — non-TTY alone is too broad
 * (catches test subprocesses, shell scripts, etc.).
 */
export const IS_AI_AGENT =
  IS_COWORK ||
  !!process.env.CLAUDE_CODE ||
  !!process.env.CURSOR_TRACE_ID ||
  !!process.env.CODEX_ENV ||
  !!process.env.AIDER ||
  !!process.env.CLINE_TASK_ID;

// Credentials live in one of two locations:
//   1. ~/.deepcitation/credentials.json  — standard per-user store
//   2. ./.deepcitation/credentials.json  — project-local fallback, used in
//      Claude Cowork and any other sandbox where $HOME is ephemeral/unwritable
//
// Read: project-local wins if present (most recent intentional login in this
// context); else home. Write: try preferred first (Cowork → project; else →
// home), fall back to the other on error. Delete: clear both.
// Note: process.cwd() is evaluated at module load, before any command runs.
export const HOME_CREDENTIALS_PATH = join(homedir(), ".deepcitation", "credentials.json");
export const PROJECT_CREDENTIALS_PATH = join(process.cwd(), ".deepcitation", "credentials.json");

export function readCredentials(): { creds: Credentials; path: string } | null {
  for (const path of [PROJECT_CREDENTIALS_PATH, HOME_CREDENTIALS_PATH]) {
    try {
      const raw = readFileSync(path, "utf-8");
      return { creds: JSON.parse(raw) as Credentials, path };
    } catch {
      /* try next */
    }
  }
  return null;
}

export function writeCredentials(creds: Credentials): string {
  const order = IS_COWORK
    ? [PROJECT_CREDENTIALS_PATH, HOME_CREDENTIALS_PATH]
    : [HOME_CREDENTIALS_PATH, PROJECT_CREDENTIALS_PATH];

  let lastErr: unknown;
  for (const path of order) {
    try {
      const dir = dirname(path);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(path, JSON.stringify(creds, null, 2), { mode: 0o600 });
      // Defense-in-depth: drop a self-ignoring .gitignore next to any
      // project-local credentials so they can't be committed even if the
      // repo's root .gitignore doesn't mention .deepcitation/.
      if (path === PROJECT_CREDENTIALS_PATH) {
        try {
          writeFileSync(join(dir, ".gitignore"), "*\n");
        } catch {
          /* best effort */
        }
      }
      return path;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Failed to write credentials to any location");
}

export function deleteCredentials(): boolean {
  let any = false;
  for (const path of [HOME_CREDENTIALS_PATH, PROJECT_CREDENTIALS_PATH]) {
    try {
      unlinkSync(path);
      any = true;
    } catch {
      /* not present */
    }
  }
  return any;
}

export function maskKey(key: string): string {
  if (key.length <= 10) return `${key.slice(0, 6)}...`;
  return `${key.slice(0, 10)}...${key.slice(-4)}`;
}

// ── Auth resolution ───────────────────────────────────────────────

export type AuthSource = { kind: "env-var" } | { kind: "dotenv"; path: string } | { kind: "credentials"; path: string };

export interface ResolvedAuth {
  apiKey: string;
  source: AuthSource;
  /** Credentials metadata (email, displayName) — only from credentials.json */
  credentials?: Credentials;
}

/** Human-readable label for where a key was loaded from. */
export function sourceLabel(source: AuthSource): string {
  switch (source.kind) {
    case "env-var":
      return "DEEPCITATION_API_KEY environment variable";
    case "dotenv":
    case "credentials":
      return source.path;
  }
}

/**
 * Resolve an API key from all known sources, in priority order:
 *   1. DEEPCITATION_API_KEY env var (Cowork env settings, shell export)
 *   2. .env / .deepcitation/.env files in project dir
 *   3. credentials.json (homedir or project dir depending on environment)
 */
export function resolveAuth(): ResolvedAuth | null {
  const envKey = process.env.DEEPCITATION_API_KEY;
  if (envKey && envKey.startsWith("sk-dc-")) {
    return { apiKey: envKey, source: { kind: "env-var" } };
  }

  for (const p of [resolve(".env"), resolve(".deepcitation", ".env")]) {
    try {
      const content = readFileSync(p, "utf-8");
      const match = content.match(/^DEEPCITATION_API_KEY\s*=\s*["']?(sk-dc-[A-Za-z0-9]+)["']?/m);
      if (match) return { apiKey: match[1], source: { kind: "dotenv", path: p } };
    } catch {
      /* file not found */
    }
  }

  const found = readCredentials();
  if (found) {
    return {
      apiKey: found.creds.apiKey,
      source: { kind: "credentials", path: found.path },
      credentials: found.creds,
    };
  }

  return null;
}

// ── Browser ────────────────────────────────────────────────────────

export function openBrowser(url: string): void {
  const { platform } = process;
  const noop = () => {};

  if (platform === "darwin") {
    execFile("open", [url], noop);
  } else if (platform === "win32") {
    execFile("cmd.exe", ["/c", "start", "", url], noop);
  } else {
    // Linux / WSL — try wslview first (WSL helper), fall back to xdg-open
    execFile("wslview", [url], err => {
      if (err) execFile("xdg-open", [url], noop);
    });
  }
}

// ── Nonce ──────────────────────────────────────────────────────────

export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}

// ── Callback server ────────────────────────────────────────────────

export interface CallbackPayload {
  apiKey: string;
  nonce: string;
  email?: string;
  displayName?: string;
  keyName?: string;
}

const ALLOWED_ORIGIN = "https://deepcitation.com";
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function corsHeaders(origin: string | undefined): Record<string, string> {
  // Intentionally trusts all *.deepcitation.com subdomains — the callback server
  // binds to 0.0.0.0 in WSL2, 127.0.0.1 elsewhere; the nonce prevents abuse.
  // isDomainMatch prevents suffix-spoofing (e.g. evil.deepcitation.com.attacker.com).
  const allowed = origin && isDomainMatch(origin, "deepcitation.com") ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // Required for Chrome Private Network Access: the dashboard (public network)
    // fetches to the localhost callback server (private network).
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "86400",
  };
}

/** Respond with a full-page HTML result (shown after form POST redirect). */
function sendFormResult(res: ServerResponse, status: "success" | "error", keyName?: string): void {
  res.writeHead(200, { "Content-Type": "text/html" });
  const title = status === "success" ? "Authenticated" : "Authentication Failed";
  const message =
    status === "success"
      ? "This tab will close shortly, or you can close it manually."
      : "Authentication failed. Please try again from the CLI.";
  const icon = status === "success" ? "&#10003;" : "&#10007;";
  const color = status === "success" ? "#10b981" : "#ef4444";
  const keyHint =
    status === "success" && keyName
      ? `<p style="margin-top:12px;font-size:13px;color:#a1a1aa">API key: <strong style="color:#3f3f46">${escapeHtml(keyName)}</strong></p>`
      : "";
  res.end(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DeepCitation – ${title}</title>` +
      `<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;` +
      `display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fafafa;color:#18181b}` +
      `.card{text-align:center;max-width:360px;padding:48px 32px}.icon{font-size:48px;color:${color};margin-bottom:16px}` +
      `h1{font-size:20px;font-weight:600;margin-bottom:8px}p{font-size:14px;color:#71717a}</style></head>` +
      `<body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${message}</p>${keyHint}</div>` +
      (status === "success"
        ? `<script>document.addEventListener("DOMContentLoaded",function(){setTimeout(function(){window.close();},1500);});</script>`
        : "") +
      `</body></html>`,
  );
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>, origin?: string): void {
  const headers = corsHeaders(origin);
  res.writeHead(status, { ...headers, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function startCallbackServer(
  expectedNonce: string,
): Promise<{ port: number; result: Promise<CallbackPayload>; cancel: () => void }> {
  return new Promise((resolveServer, rejectServer) => {
    let resolveResult: (payload: CallbackPayload) => void;
    let rejectResult: (err: Error) => void;
    let loginTimeout: ReturnType<typeof setTimeout> | undefined;

    const result = new Promise<CallbackPayload>((res, rej) => {
      resolveResult = res;
      rejectResult = rej;
    });

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const origin = req.headers.origin;

      // Preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders(origin));
        res.end();
        return;
      }

      // Health check (so the web page can verify the server is up)
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { ok: true }, origin);
        return;
      }

      // Callback
      if (req.method === "POST" && req.url === "/callback") {
        let body = "";
        let destroyed = false;
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
          if (body.length > 10_000 && !destroyed) {
            destroyed = true;
            sendJson(res, 413, { error: "Payload too large" }, origin);
            req.destroy();
          }
        });
        req.on("end", () => {
          if (destroyed) return;
          try {
            const ct = req.headers["content-type"] || "";
            const isForm = ct.includes("application/x-www-form-urlencoded");

            let payload: CallbackPayload;
            if (isForm) {
              const params = new URLSearchParams(body);
              payload = {
                apiKey: params.get("apiKey") || "",
                nonce: params.get("nonce") || "",
                email: params.get("email") || undefined,
                displayName: params.get("displayName") || undefined,
                keyName: params.get("keyName") || undefined,
              };
            } else {
              payload = JSON.parse(body) as CallbackPayload;
            }

            if (payload.nonce !== expectedNonce) {
              if (isForm) {
                sendFormResult(res, "error");
              } else {
                sendJson(res, 403, { error: "Invalid nonce" }, origin);
              }
              return;
            }

            if (!payload.apiKey || !payload.apiKey.startsWith("sk-dc-") || payload.apiKey.length < 20) {
              if (isForm) {
                sendFormResult(res, "error");
              } else {
                sendJson(res, 400, { error: "Invalid API key format" }, origin);
              }
              return;
            }

            if (isForm) {
              sendFormResult(res, "success", payload.keyName);
            } else {
              sendJson(res, 200, { success: true }, origin);
            }
            res.on("finish", () => {
              if (loginTimeout) clearTimeout(loginTimeout);
              resolveResult(payload);
              setTimeout(() => server.close(), 100);
            });
          } catch {
            sendJson(res, 400, { error: "Invalid JSON" }, origin);
          }
        });
        return;
      }

      sendJson(res, 404, { error: "Not found" }, origin);
    });

    // WSL: Windows browsers can't reach 127.0.0.1 inside the VM (WSL2), so
    // bind to 0.0.0.0 when running under WSL. WSL_DISTRO_NAME is set in both
    // WSL1 and WSL2; binding 0.0.0.0 in WSL1 is unnecessary but harmless.
    // Everywhere else, keep loopback-only for defense-in-depth.
    // Note: 0.0.0.0 exposes the server on LAN for the ~5-min login window.
    // The /health endpoint is reachable without a nonce, but only reveals that
    // the server is listening. Auth completion requires the 64-char random nonce.
    const host = process.env.WSL_DISTRO_NAME ? "0.0.0.0" : "127.0.0.1";
    server.listen(0, host, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        rejectServer(new Error("Failed to start callback server"));
        return;
      }

      loginTimeout = setTimeout(() => {
        server.close();
        rejectResult(new Error("Login timed out after 5 minutes"));
      }, TIMEOUT_MS);

      // Don't keep the process alive just for the timeout timer,
      // but DO keep it alive for the server (it must stay up to receive the callback).
      if (typeof loginTimeout === "object" && "unref" in loginTimeout) {
        loginTimeout.unref();
      }

      const cancel = () => {
        if (loginTimeout) clearTimeout(loginTimeout);
        server.close();
        rejectResult(new Error("Login cancelled"));
      };
      resolveServer({ port: addr.port, result, cancel });
    });

    server.on("error", err => {
      rejectServer(err);
    });
  });
}
