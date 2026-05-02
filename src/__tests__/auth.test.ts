import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("node:child_process", () => ({
  execFile: mock(() => {}),
}));

import * as childProcess from "node:child_process";
import {
  type CallbackPayload,
  type Credentials,
  generateNonce,
  maskKey,
  openBrowser,
  resolveAuth,
  sourceLabel,
  startCallbackServer,
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
    const r = httpRequest({ hostname: "127.0.0.1", port, path, method, headers }, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          body: data,
          headers: res.headers as Record<string, string | string[] | undefined>,
        }),
      );
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

/** Send a valid callback to close the server cleanly */
async function cleanup(port: number, nonce: string) {
  try {
    await req(
      port,
      "POST",
      "/callback",
      JSON.stringify({
        apiKey: "sk-dc-test1234567890abcdef",
        nonce,
      }),
      { "Content-Type": "application/json" },
    );
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

    const res = await req(
      port,
      "POST",
      "/callback",
      JSON.stringify({
        apiKey: "sk-dc-test1234567890abcdef",
        nonce: "wrong-nonce",
      }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(403);
    await cleanup(port, nonce);
  });

  it("rejects invalid API key format", async () => {
    const nonce = generateNonce();
    const { port } = await startCallbackServer(nonce);

    const res = await req(
      port,
      "POST",
      "/callback",
      JSON.stringify({
        apiKey: "invalid-key",
        nonce,
      }),
      { "Content-Type": "application/json" },
    );

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

  it("accepts form-encoded POST and returns success HTML page", async () => {
    const nonce = generateNonce();
    const { port, result } = await startCallbackServer(nonce);

    const formBody = new URLSearchParams({
      apiKey: "sk-dc-test1234567890abcdef",
      nonce,
      email: "test@example.com",
      displayName: "Test User",
    }).toString();

    const res = await req(port, "POST", "/callback", formBody, {
      "Content-Type": "application/x-www-form-urlencoded",
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/html");
    expect(res.body).toContain("Authenticated");
    expect(res.body).toContain("close it manually");

    const received = await result;
    expect(received.apiKey).toBe("sk-dc-test1234567890abcdef");
    expect(received.email).toBe("test@example.com");
  });

  it("rejects form-encoded POST with wrong nonce", async () => {
    const nonce = generateNonce();
    const { port } = await startCallbackServer(nonce);

    const formBody = new URLSearchParams({
      apiKey: "sk-dc-test1234567890abcdef",
      nonce: "wrong-nonce",
    }).toString();

    const res = await req(port, "POST", "/callback", formBody, {
      "Content-Type": "application/x-www-form-urlencoded",
    });

    expect(res.status).toBe(200);
    expect(res.body).toContain("Authentication Failed");

    await cleanup(port, nonce);
  });

  it("rejects oversized payloads with 413", async () => {
    const nonce = generateNonce();
    const { port } = await startCallbackServer(nonce);

    // Send a payload larger than the 10KB limit
    const oversized = JSON.stringify({ apiKey: "sk-dc-test1234567890abcdef", nonce, pad: "x".repeat(11_000) });
    const res = await req(port, "POST", "/callback", oversized, {
      "Content-Type": "application/json",
    });
    expect(res.status).toBe(413);

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

// ── resolveAuth ────────────────────────────────────────────────────

describe("resolveAuth", () => {
  const savedEnv = process.env.DEEPCITATION_API_KEY;

  afterEach(() => {
    // Restore env
    if (savedEnv === undefined) {
      delete process.env.DEEPCITATION_API_KEY;
    } else {
      process.env.DEEPCITATION_API_KEY = savedEnv;
    }
  });

  it("returns env-var source when DEEPCITATION_API_KEY is set", () => {
    process.env.DEEPCITATION_API_KEY = "sk-dc-test1234567890abcdef";
    const auth = resolveAuth();
    expect(auth).not.toBeNull();
    expect(auth?.apiKey).toBe("sk-dc-test1234567890abcdef");
    expect(auth?.source.kind).toBe("env-var");
  });

  it("returns null when nothing is set", () => {
    delete process.env.DEEPCITATION_API_KEY;
    // Note: this may still find credentials.json if the test runner has one.
    // We just verify it doesn't crash and returns a valid shape or null.
    const auth = resolveAuth();
    if (auth) {
      expect(auth.apiKey).toMatch(/^sk-dc-/);
      expect(auth.source.kind).toBeDefined();
    }
  });

  it("ignores env var without sk-dc- prefix", () => {
    process.env.DEEPCITATION_API_KEY = "invalid-key";
    const auth = resolveAuth();
    // Should not return env-var source for invalid key
    if (auth) {
      expect(auth.source.kind).not.toBe("env-var");
    }
  });
});

// ── sourceLabel ────────────────────────────────────────────────────

describe("sourceLabel", () => {
  it("returns label for env-var source", () => {
    expect(sourceLabel({ kind: "env-var" })).toBe("DEEPCITATION_API_KEY environment variable");
  });

  it("returns path for dotenv source", () => {
    expect(sourceLabel({ kind: "dotenv", path: "/app/.env" })).toBe("/app/.env");
  });

  it("returns path for credentials source", () => {
    expect(sourceLabel({ kind: "credentials", path: "/home/user/.deepcitation/credentials.json" })).toBe(
      "/home/user/.deepcitation/credentials.json",
    );
  });
});

// ── openBrowser ────────────────────────────────────────────────────

describe("openBrowser", () => {
  const origPlatformDesc = Object.getOwnPropertyDescriptor(process, "platform");

  afterEach(() => {
    (childProcess.execFile as ReturnType<typeof mock>).mockClear();
    delete process.env.DC_NO_BROWSER;
    if (origPlatformDesc) {
      Object.defineProperty(process, "platform", origPlatformDesc);
    }
  });

  function setPlatform(value: string) {
    Object.defineProperty(process, "platform", { value, configurable: true });
  }

  it("uses explorer.exe on Windows (no shell interpreter)", () => {
    // Security: explorer.exe opens the URL as a file association without invoking
    // a shell parser. cmd.exe /c start would interpret & as a command separator,
    // allowing a URL like https://x.com?a=1&calc.exe to execute two commands.
    setPlatform("win32");

    openBrowser("https://deepcitation.com/auth?token=abc&nonce=xyz");

    const execFileMock = childProcess.execFile as ReturnType<typeof mock>;
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock).toHaveBeenCalledWith(
      "explorer.exe",
      ["https://deepcitation.com/auth?token=abc&nonce=xyz"],
      expect.any(Function),
    );
    // Must NOT use cmd.exe — that would introduce a shell injection vector
    expect(execFileMock.mock.calls[0][0]).not.toBe("cmd.exe");
  });

  it("uses open on macOS", () => {
    setPlatform("darwin");

    openBrowser("https://deepcitation.com");

    expect(childProcess.execFile as ReturnType<typeof mock>).toHaveBeenCalledWith(
      "open",
      ["https://deepcitation.com"],
      expect.any(Function),
    );
  });

  it("uses wslview on Linux", () => {
    setPlatform("linux");

    openBrowser("https://deepcitation.com");

    expect(childProcess.execFile as ReturnType<typeof mock>).toHaveBeenCalledWith(
      "wslview",
      ["https://deepcitation.com"],
      expect.any(Function),
    );
  });

  it("does not launch a browser when DC_NO_BROWSER is set", () => {
    process.env.DC_NO_BROWSER = "1";
    setPlatform("win32");

    openBrowser("https://deepcitation.com");

    expect(childProcess.execFile as ReturnType<typeof mock>).not.toHaveBeenCalled();
  });
});
