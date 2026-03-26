// Node.js CLI only — not for browser or SDK consumers.
// This module is imported exclusively by cli.ts and must never be
// re-exported from any public entrypoint (index.ts, react/, etc.).

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { isDomainMatch } from "./utils/urlSafety.js";

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
		execFile("wslview", [url], (err) => {
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
}

const ALLOWED_ORIGIN = "https://deepcitation.com";
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function corsHeaders(origin: string | undefined): Record<string, string> {
	// Use isDomainMatch for safe subdomain validation (prevents evil.deepcitation.com.attacker.com)
	const allowed =
		origin && isDomainMatch(origin, "deepcitation.com")
			? origin
			: ALLOWED_ORIGIN;
	return {
		"Access-Control-Allow-Origin": allowed,
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Max-Age": "86400",
	};
}

function sendJson(
	res: ServerResponse,
	status: number,
	body: Record<string, unknown>,
	origin?: string,
): void {
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
						const payload = JSON.parse(body) as CallbackPayload;

						if (payload.nonce !== expectedNonce) {
							sendJson(res, 403, { error: "Invalid nonce" }, origin);
							return;
						}

						if (
							!payload.apiKey ||
							!payload.apiKey.startsWith("sk-dc-") ||
							payload.apiKey.length < 20
						) {
							sendJson(
								res,
								400,
								{ error: "Invalid API key format" },
								origin,
							);
							return;
						}

						sendJson(res, 200, { success: true }, origin);
						res.on("finish", () => {
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

		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			if (!addr || typeof addr === "string") {
				rejectServer(new Error("Failed to start callback server"));
				return;
			}

			const timeout = setTimeout(() => {
				server.close();
				rejectResult(new Error("Login timed out after 5 minutes"));
			}, TIMEOUT_MS);

			// Don't keep the process alive just for the timeout
			timeout.unref();
			server.unref();

			resolveServer({ port: addr.port, result });
		});

		server.on("error", (err) => {
			rejectServer(err);
		});
	});
}
