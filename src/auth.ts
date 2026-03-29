// Node.js CLI only — not for browser or SDK consumers.
// This module is imported exclusively by cli.ts and must never be
// re-exported from any public entrypoint (index.ts, react/, etc.).

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { isDomainMatch } from "./utils/urlSafety.js";

/** Escape user-controlled strings for safe HTML interpolation. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Credentials ────────────────────────────────────────────────────

export interface Credentials {
  version: 1;
  apiKey: string;
  email?: string;
  displayName?: string;
  createdAt: string;
}

const CREDENTIALS_DIR = join(homedir(), ".deepcitation");
export const CREDENTIALS_PATH = join(CREDENTIALS_DIR, "credentials.json");

export function readCredentials(): Credentials | null {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export function writeCredentials(creds: Credentials): void {
  mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
}

export function deleteCredentials(): boolean {
  try {
    unlinkSync(CREDENTIALS_PATH);
    return true;
  } catch {
    return false;
  }
}

export function maskKey(key: string): string {
  if (key.length <= 10) return `${key.slice(0, 6)}...`;
  return `${key.slice(0, 10)}...${key.slice(-4)}`;
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
  // only runs on 127.0.0.1 during interactive login so the blast radius is limited.
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
      ? "You can close this tab and return to your terminal."
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
      `<body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${message}</p>${keyHint}</div></body></html>`,
  );
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>, origin?: string): void {
  const headers = corsHeaders(origin);
  res.writeHead(status, { ...headers, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function startCallbackServer(
  expectedNonce: string,
): Promise<{ port: number; result: Promise<CallbackPayload> }> {
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

    // Bind to 0.0.0.0 so Windows browsers can reach this server in WSL2.
    // Security: the nonce (64-char random hex) prevents unauthorized callers.
    server.listen(0, "0.0.0.0", () => {
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
      loginTimeout.unref();

      resolveServer({ port: addr.port, result });
    });

    server.on("error", err => {
      rejectServer(err);
    });
  });
}
