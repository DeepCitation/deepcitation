import { afterEach, describe, expect, it } from "@jest/globals";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
	maskKey,
	generateNonce,
	startCallbackServer,
	type CallbackPayload,
	type Credentials,
} from "../auth.js";

/** Make an HTTP request using node:http (bypasses happy-dom's same-origin policy) */
function req(
	port: number,
	method: string,
	path: string,
	body?: string,
	headers?: Record<string, string>,
): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
	return new Promise((resolve, reject) => {
		const r = httpRequest(
			{ hostname: "127.0.0.1", port, path, method, headers },
			(res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () =>
					resolve({
						status: res.statusCode ?? 0,
						body: data,
						headers: res.headers as Record<string, string | string[] | undefined>,
					}),
				);
			},
		);
		r.on("error", reject);
		if (body) r.write(body);
		r.end();
	});
}

/** Send a valid callback to close the server cleanly */
async function cleanup(port: number, nonce: string) {
	try {
		await req(port, "POST", "/callback", JSON.stringify({
			apiKey: "sk-dc-test1234567890abcdef",
			nonce,
		}), { "Content-Type": "application/json" });
	} catch {
		// Server may already be closed
	}
}

// ── maskKey ──────────────────────────────────────────────────────────

describe("maskKey", () => {
	it("masks a normal-length key", () => {
		const result = maskKey("sk-dc-abcdef1234567890abcdef");
		expect(result).toBe("sk-dc-abcd...cdef");
	});

	it("masks a short key (≤10 chars)", () => {
		const result = maskKey("sk-dc-abc");
		expect(result).toBe("sk-dc-...");
	});

	it("masks a 10-char key", () => {
		const result = maskKey("sk-dc-abcd");
		expect(result).toBe("sk-dc-...");
	});

	it("masks an 11-char key with suffix", () => {
		const result = maskKey("sk-dc-abcde");
		expect(result).toBe("sk-dc-abcd...bcde");
	});
});

// ── generateNonce ───────────────────────────────────────────────────

describe("generateNonce", () => {
	it("returns a 64-character hex string", () => {
		const nonce = generateNonce();
		expect(nonce).toHaveLength(64);
		expect(nonce).toMatch(/^[0-9a-f]{64}$/);
	});

	it("generates unique values", () => {
		const a = generateNonce();
		const b = generateNonce();
		expect(a).not.toBe(b);
	});
});

// ── credentials round-trip ──────────────────────────────────────────

describe("credentials round-trip", () => {
	const testDir = join(tmpdir(), `dc-auth-test-${Date.now()}`);
	const testPath = join(testDir, "credentials.json");

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true });
		} catch {
			// ignore
		}
	});

	it("round-trips credential data through JSON", () => {
		const creds: Credentials = {
			version: 1,
			apiKey: "sk-dc-test1234567890abcdef",
			email: "test@example.com",
			displayName: "Test User",
			createdAt: "2026-03-26T12:00:00.000Z",
		};

		mkdirSync(testDir, { recursive: true });
		writeFileSync(testPath, JSON.stringify(creds, null, 2));
		const raw = readFileSync(testPath, "utf-8");
		const parsed = JSON.parse(raw) as Credentials;

		expect(parsed.version).toBe(1);
		expect(parsed.apiKey).toBe(creds.apiKey);
		expect(parsed.email).toBe(creds.email);
		expect(parsed.displayName).toBe(creds.displayName);
		expect(parsed.createdAt).toBe(creds.createdAt);
	});
});

// ── startCallbackServer ─────────────────────────────────────────────

describe("startCallbackServer", () => {
	it("starts a server and returns a port", async () => {
		const nonce = generateNonce();
		const { port, result } = await startCallbackServer(nonce);

		expect(port).toBeGreaterThan(0);
		expect(port).toBeLessThan(65536);

		const payload: CallbackPayload = {
			apiKey: "sk-dc-test1234567890abcdef",
			nonce,
			email: "test@example.com",
			displayName: "Test User",
		};

		const res = await req(port, "POST", "/callback", JSON.stringify(payload), {
			"Content-Type": "application/json",
		});

		expect(res.status).toBe(200);
		const body = JSON.parse(res.body) as { success: boolean };
		expect(body.success).toBe(true);

		const received = await result;
		expect(received.apiKey).toBe(payload.apiKey);
		expect(received.email).toBe(payload.email);
	});

	it("rejects invalid nonce", async () => {
		const nonce = generateNonce();
		const { port } = await startCallbackServer(nonce);

		const res = await req(port, "POST", "/callback", JSON.stringify({
			apiKey: "sk-dc-test1234567890abcdef",
			nonce: "wrong-nonce",
		}), { "Content-Type": "application/json" });

		expect(res.status).toBe(403);
		await cleanup(port, nonce);
	});

	it("rejects invalid API key format", async () => {
		const nonce = generateNonce();
		const { port } = await startCallbackServer(nonce);

		const res = await req(port, "POST", "/callback", JSON.stringify({
			apiKey: "invalid-key",
			nonce,
		}), { "Content-Type": "application/json" });

		expect(res.status).toBe(400);
		await cleanup(port, nonce);
	});

	it("responds to health check", async () => {
		const nonce = generateNonce();
		const { port } = await startCallbackServer(nonce);

		const res = await req(port, "GET", "/health");
		expect(res.status).toBe(200);
		const body = JSON.parse(res.body) as { ok: boolean };
		expect(body.ok).toBe(true);

		await cleanup(port, nonce);
	});

	it("handles CORS preflight", async () => {
		const nonce = generateNonce();
		const { port } = await startCallbackServer(nonce);

		const res = await req(port, "OPTIONS", "/callback", undefined, {
			Origin: "https://deepcitation.com",
		});
		expect(res.status).toBe(204);
		expect(res.headers["access-control-allow-origin"]).toBe("https://deepcitation.com");

		await cleanup(port, nonce);
	});

	it("returns 404 for unknown paths", async () => {
		const nonce = generateNonce();
		const { port } = await startCallbackServer(nonce);

		const res = await req(port, "GET", "/unknown");
		expect(res.status).toBe(404);

		await cleanup(port, nonce);
	});

	it("rejects invalid JSON", async () => {
		const nonce = generateNonce();
		const { port } = await startCallbackServer(nonce);

		const res = await req(port, "POST", "/callback", "not json", {
			"Content-Type": "application/json",
		});
		expect(res.status).toBe(400);
		const body = JSON.parse(res.body) as { error: string };
		expect(body.error).toBe("Invalid JSON");

		await cleanup(port, nonce);
	});
});
