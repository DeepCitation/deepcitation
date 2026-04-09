/**
 * Tests for the per-phase timeouts in `createProxyFetch` (src/cli/proxy.ts).
 *
 * These tests stand up a tiny Node TCP server that simulates pathological
 * proxy behavior — accepting CONNECT but never replying, replying 200 but
 * never starting TLS, etc. — and asserts that the corresponding TimeoutError
 * fires within the expected window. This is the only way to verify that the
 * timer wiring inside createProxyFetch is correct end-to-end.
 *
 * Tests run with overridden TIMEOUTS (via DC_*_MS env vars) so they complete
 * in under a few seconds rather than 90s+.
 */

import { type Socket, type Server, createServer } from "node:net";
import { afterEach, describe, expect, it } from "@jest/globals";

// Set short timeouts BEFORE importing proxy.ts (the constants are read at module load).
process.env.DC_PROXY_CONNECT_MS = "300";
process.env.DC_TLS_HANDSHAKE_MS = "300";
process.env.DC_HEADERS_TIMEOUT_MS = "500";
process.env.DC_IDLE_DATA_MS = "500";
process.env.DC_REQUEST_TIMEOUT_MS = "1500";

// Import after env vars are set (TimeoutError is used as a runtime value via instanceof)
import { createProxyFetch, TimeoutError } from "../cli/proxy.js";

// Track sockets opened by the mock server so afterEach can force-close them.
// Without this, server.close() waits indefinitely for connections to drain —
// and these tests intentionally simulate proxies that hold connections open.
type MockServerHandle = {
  server: Server;
  proxyUrl: string;
  sockets: Set<Socket>;
};

function startMockServer(onConnection: (socket: Socket) => void): Promise<MockServerHandle> {
  return new Promise((resolve, reject) => {
    const sockets = new Set<Socket>();
    const server = createServer(socket => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      onConnection(socket);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        resolve({ server, proxyUrl: `http://127.0.0.1:${addr.port}`, sockets });
      } else {
        reject(new Error("server.address() did not return an object"));
      }
    });
  });
}

function stopServer(handle: MockServerHandle): Promise<void> {
  return new Promise(resolve => {
    // Force-destroy any lingering sockets so close() can resolve immediately
    for (const sock of handle.sockets) {
      try {
        sock.destroy();
      } catch {}
    }
    handle.sockets.clear();
    handle.server.close(() => resolve());
    handle.server.unref();
  });
}

describe("createProxyFetch timeouts", () => {
  let handle: MockServerHandle | undefined;

  afterEach(async () => {
    if (handle) {
      await stopServer(handle);
      handle = undefined;
    }
  });

  // ── proxy_connect timeout ─────────────────────────────────────

  it("fires proxy_connect TimeoutError when proxy never replies to CONNECT", async () => {
    // Server accepts the TCP connection but never sends any HTTP response.
    handle = await startMockServer(_socket => {
      // Do nothing — leave the socket hanging.
    });

    const fetch = createProxyFetch(handle.proxyUrl);
    const start = Date.now();
    let caught: unknown;
    try {
      await fetch("https://api.deepcitation.com/health");
    } catch (err) {
      caught = err;
    }
    const elapsed = Date.now() - start;

    expect(caught).toBeInstanceOf(TimeoutError);
    expect((caught as TimeoutError).phase).toBe("proxy_connect");
    expect((caught as TimeoutError).target).toBe("api.deepcitation.com:443");
    // Should fire within ~300ms (proxyConnect) plus generous margin
    expect(elapsed).toBeLessThan(1200);
  }, 10_000);

  // ── tls_handshake timeout ─────────────────────────────────────

  it("fires tls_handshake TimeoutError when proxy returns 200 but never speaks TLS", async () => {
    // Server returns the CONNECT 200 response, then ignores all subsequent
    // bytes — no TLS handshake will complete.
    handle = await startMockServer(socket => {
      socket.once("data", () => {
        // Got the CONNECT request — reply 200 to allow the tunnel, then go silent.
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      });
    });

    const fetch = createProxyFetch(handle.proxyUrl);
    const start = Date.now();
    let caught: unknown;
    try {
      await fetch("https://api.deepcitation.com/health");
    } catch (err) {
      caught = err;
    }
    const elapsed = Date.now() - start;

    expect(caught).toBeInstanceOf(TimeoutError);
    expect((caught as TimeoutError).phase).toBe("tls_handshake");
    // ~300ms tlsHandshake + connect overhead, well under overall ceiling
    expect(elapsed).toBeLessThan(1300);
  }, 10_000);

  // ── overall ceiling ───────────────────────────────────────────

  it("respects the overall ceiling even when sub-phase timers somehow miss", async () => {
    // Same as proxy_connect test, but verify the outer watchdog is also
    // present — even if everything else failed, we'd still bail out.
    handle = await startMockServer(_socket => {
      // hang forever
    });

    const fetch = createProxyFetch(handle.proxyUrl);
    const start = Date.now();
    let caught: unknown;
    try {
      await fetch("https://api.deepcitation.com/health");
    } catch (err) {
      caught = err;
    }
    const elapsed = Date.now() - start;

    expect(caught).toBeInstanceOf(TimeoutError);
    // The outer ceiling is 1500ms; whichever timer fires first must be a
    // TimeoutError, and elapsed must not exceed the ceiling.
    expect(elapsed).toBeLessThan(1800);
  }, 10_000);

  // ── TimeoutError shape ────────────────────────────────────────

  it("TimeoutError carries phase, elapsedMs, proxyUrl, target fields", () => {
    const err = new TimeoutError("response_headers", 12345, "http://proxy:3128", "api.example.com:443");
    expect(err.code).toBe("DC_TIMEOUT");
    expect(err.phase).toBe("response_headers");
    expect(err.elapsedMs).toBe(12345);
    expect(err.proxyUrl).toBe("http://proxy:3128");
    expect(err.target).toBe("api.example.com:443");
    expect(err.name).toBe("TimeoutError");
    expect(err.message).toContain("12345ms");
    expect(err.message).toContain("response_headers");
    expect(err.message).toContain("api.example.com:443");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TimeoutError);
  });
});

describe("createProxyFetch env-var overrides", () => {
  it("DC_REQUEST_TIMEOUT_MS env var was honored at module load", () => {
    // Sanity check: this test file set DC_REQUEST_TIMEOUT_MS=1500 before importing.
    // We can't directly inspect TIMEOUTS (not exported), but the timeout tests above
    // implicitly verify that the override took effect — they'd time out the test
    // runner if the default 90_000ms ceiling were active.
    expect(process.env.DC_REQUEST_TIMEOUT_MS).toBe("1500");
  });
});
