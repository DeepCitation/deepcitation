/**
 * Proxy-aware fetch for the DeepCitation CLI.
 * Tunnels HTTPS through an HTTP CONNECT proxy using only Node.js built-ins.
 */

import { request as httpRequest } from "node:http";
import type { Socket } from "node:net";
import { type TLSSocket, connect as tlsConnect } from "node:tls";
import { decodeChunked } from "../utils/proxy.js";

/**
 * Per-phase timeouts for the manual CONNECT-tunnel fetch path.
 *
 * Sized for the real DeepCitation workload:
 *   verify ≤ 0.5s, prepare ≤ 1s, prepare URL/office ≤ 30s.
 *
 * Each value is overridable via env var so users can tighten or loosen
 * without recompiling. The overall ceiling is the absolute "no individual
 * request can exceed this" bound; sub-phase timeouts fire first and produce
 * more specific errors.
 */
function parseTimeoutEnv(name: string, defaultMs: number): number {
  const v = parseInt(process.env[name] ?? "", 10);
  return Number.isNaN(v) || v <= 0 ? defaultMs : v;
}

const TIMEOUTS = {
  proxyConnect: parseTimeoutEnv("DC_PROXY_CONNECT_MS", 5000),
  tlsHandshake: parseTimeoutEnv("DC_TLS_HANDSHAKE_MS", 10000),
  headers: parseTimeoutEnv("DC_HEADERS_TIMEOUT_MS", 60000),
  idleData: parseTimeoutEnv("DC_IDLE_DATA_MS", 30000),
  overall: parseTimeoutEnv("DC_REQUEST_TIMEOUT_MS", 90000),
};

/**
 * Structured error class for transport-layer timeouts.
 *
 * The CLI's top-level error formatter recognizes this and emits both
 * a human-readable message and a __DC_ERROR__ JSON marker line so
 * agent-driven callers can short-circuit their recovery loops.
 */
export class TimeoutError extends Error {
  readonly code = "DC_TIMEOUT";
  readonly phase: "proxy_connect" | "tls_handshake" | "response_headers" | "response_idle" | "request_overall";
  readonly elapsedMs: number;
  readonly proxyUrl: string;
  readonly target: string;

  constructor(phase: TimeoutError["phase"], elapsedMs: number, proxyUrl: string, target: string) {
    super(`Request to ${target} timed out after ${elapsedMs}ms in phase "${phase}" (proxy: ${proxyUrl})`);
    this.name = "TimeoutError";
    this.phase = phase;
    this.elapsedMs = elapsedMs;
    this.proxyUrl = proxyUrl;
    this.target = target;
  }
}

/**
 * Create a proxy-aware fetch that tunnels HTTPS through an HTTP CONNECT proxy.
 * Uses only Node.js built-in modules (no external dependencies).
 *
 * Enforces per-phase timeouts at four points to prevent indefinite hangs:
 *   1. Proxy CONNECT (TIMEOUTS.proxyConnect)
 *   2. TLS handshake over the tunnel (TIMEOUTS.tlsHandshake)
 *   3. Time to first response byte (TIMEOUTS.headers)
 *   4. Idle gap between consecutive response chunks (TIMEOUTS.idleData)
 * Plus an outer ceiling (TIMEOUTS.overall) wrapping the whole request.
 */
export function createProxyFetch(
  proxyUrl: string,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const proxy = new URL(proxyUrl);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startTime = Date.now();
    const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const targetHost = url.hostname;
    const targetPort = url.port || (url.protocol === "https:" ? "443" : "80");
    const targetDescriptor = `${targetHost}:${targetPort}`;

    if (url.protocol !== "https:") {
      // For non-HTTPS, just use global fetch (proxy env var may work for plain HTTP)
      return globalThis.fetch(input, init);
    }

    // If the caller passed FormData, serialize it to a multipart body + derived
    // Content-Type header BEFORE opening the socket. This used to fall out to
    // sendViaUndiciProxy, which failed in Cowork when `undici` wasn't importable.
    // Now multipart goes over the same hand-rolled tunnel as JSON.
    let preBuiltBody: Buffer | undefined;
    let preBuiltContentType: string | undefined;
    if (init?.body instanceof FormData) {
      const encoded = await encodeMultipart(init.body);
      preBuiltBody = encoded.body;
      preBuiltContentType = encoded.contentType;
    }

    // Track everything we open so the overall-timeout watchdog can tear it all down.
    let openSocket: Socket | undefined;
    let openTlsSocket: TLSSocket | undefined;
    const teardown = () => {
      try {
        openTlsSocket?.destroy();
      } catch {}
      try {
        openSocket?.destroy();
      } catch {}
    };

    // Outer ceiling: hard cap on the entire request lifetime. Wraps the inner
    // promise chain via Promise.race so that even if all sub-phase timers somehow
    // fail to fire, we still bail out.
    let overallTimer: NodeJS.Timeout | undefined;
    const overallPromise = new Promise<Response>((_, rej) => {
      overallTimer = setTimeout(() => {
        teardown();
        rej(new TimeoutError("request_overall", Date.now() - startTime, proxyUrl, targetDescriptor));
      }, TIMEOUTS.overall);
      overallTimer.unref?.();
    });

    const inner = (async (): Promise<Response> => {
      // Phase 1: establish CONNECT tunnel through the proxy.
      const socket = await new Promise<Socket>((res, rej) => {
        const req = httpRequest({
          host: proxy.hostname,
          port: Number(proxy.port) || 3128,
          method: "CONNECT",
          path: `${targetHost}:${targetPort}`,
          timeout: TIMEOUTS.proxyConnect,
        });
        req.on("timeout", () => {
          req.destroy();
          rej(new TimeoutError("proxy_connect", Date.now() - startTime, proxyUrl, targetDescriptor));
        });
        req.on("connect", (_res, sock) => {
          if (_res.statusCode === 200) {
            res(sock);
          } else {
            sock.destroy();
            rej(
              new Error(
                `Proxy CONNECT failed with status ${_res.statusCode}. ` +
                  `Try bypassing the proxy with: NO_PROXY=api.deepcitation.com npx deepcitation <command>`,
              ),
            );
          }
        });
        req.on("error", rej);
        req.end();
      });
      openSocket = socket;

      // Phase 2: upgrade to TLS over the tunnel, with handshake timeout.
      const tlsSocket: TLSSocket = await new Promise<TLSSocket>((res, rej) => {
        const ts = tlsConnect({ socket, servername: targetHost });
        const tlsTimer = setTimeout(() => {
          try {
            ts.destroy();
          } catch {}
          try {
            socket.destroy();
          } catch {}
          rej(new TimeoutError("tls_handshake", Date.now() - startTime, proxyUrl, targetDescriptor));
        }, TIMEOUTS.tlsHandshake);
        tlsTimer.unref?.();
        ts.on("secureConnect", () => {
          clearTimeout(tlsTimer);
          res(ts);
        });
        ts.on("error", err => {
          clearTimeout(tlsTimer);
          try {
            socket.destroy();
          } catch {}
          rej(err);
        });
      });
      openTlsSocket = tlsSocket;

      // Build raw HTTP request over TLS tunnel
      const method = (init?.method ?? "GET").replace(/[\r\n]/g, "");
      const headers = new Headers(init?.headers);
      if (!headers.has("host")) headers.set("host", targetHost);

      let bodyBuffer: Buffer | undefined;
      if (preBuiltBody) {
        // Multipart was serialized above the socket open — splice it in and set
        // the boundary-aware Content-Type header (unless the caller already set one).
        bodyBuffer = preBuiltBody;
        if (preBuiltContentType && !headers.has("content-type")) {
          headers.set("content-type", preBuiltContentType);
        }
      } else if (init?.body) {
        if (init.body instanceof ArrayBuffer) {
          bodyBuffer = Buffer.from(init.body);
        } else if (Buffer.isBuffer(init.body)) {
          bodyBuffer = init.body;
        } else if (typeof init.body === "string") {
          bodyBuffer = Buffer.from(init.body);
        } else {
          // ReadableStream or other — collect into buffer
          const chunks: Uint8Array[] = [];
          const reader = (init.body as ReadableStream<Uint8Array>).getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          bodyBuffer = Buffer.concat(chunks);
        }
      }

      if (bodyBuffer && !headers.has("content-length")) {
        headers.set("content-length", String(bodyBuffer.byteLength));
      }

      // Serialize request
      let head = `${method} ${url.pathname}${url.search} HTTP/1.1\r\n`;
      headers.forEach((v, k) => {
        head += `${k}: ${v}\r\n`;
      });
      head += "\r\n";

      tlsSocket.write(head);
      if (bodyBuffer) tlsSocket.write(bodyBuffer);

      // Phase 3+4: parse response with headers timeout (time to first byte)
      // and idle-data timeout (time between consecutive chunks). Either firing
      // destroys the socket and rejects with a structured TimeoutError.
      return new Promise<Response>((res, rej) => {
        const chunks: Buffer[] = [];
        let receivedFirstByte = false;

        // Headers timer: cleared on the first `data` event.
        const headersTimer: NodeJS.Timeout = setTimeout(() => {
          tlsSocket.destroy();
          rej(new TimeoutError("response_headers", Date.now() - startTime, proxyUrl, targetDescriptor));
        }, TIMEOUTS.headers);
        headersTimer.unref?.();

        // Idle-data timer: reset on every `data` event.
        let idleTimer: NodeJS.Timeout | undefined;
        const armIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            tlsSocket.destroy();
            rej(new TimeoutError("response_idle", Date.now() - startTime, proxyUrl, targetDescriptor));
          }, TIMEOUTS.idleData);
          idleTimer.unref?.();
        };

        tlsSocket.on("data", (chunk: Buffer) => {
          if (!receivedFirstByte) {
            receivedFirstByte = true;
            clearTimeout(headersTimer);
          }
          armIdleTimer();
          chunks.push(chunk);
        });
        tlsSocket.on("end", () => {
          clearTimeout(headersTimer);
          if (idleTimer) clearTimeout(idleTimer);
          const raw = Buffer.concat(chunks);
          const separator = Buffer.from("\r\n\r\n");
          const headerEnd = raw.indexOf(separator);
          if (headerEnd === -1) {
            rej(new Error("Invalid HTTP response from proxy tunnel"));
            return;
          }
          const headerSection = raw.subarray(0, headerEnd).toString("ascii");
          const bodyBuf = raw.subarray(headerEnd + 4);
          const [statusLine, ...headerLines] = headerSection.split("\r\n");
          const statusMatch = statusLine.match(/^HTTP\/[\d.]+ (\d+)/);
          const status = statusMatch ? Number(statusMatch[1]) : 0;
          const responseHeaders = new Headers();
          for (const line of headerLines) {
            const sep = line.indexOf(":");
            if (sep > 0) responseHeaders.append(line.slice(0, sep).trim(), line.slice(sep + 1).trim());
          }

          // Handle chunked transfer encoding
          const responseBody = responseHeaders.get("transfer-encoding")?.includes("chunked")
            ? decodeChunked(bodyBuf)
            : bodyBuf;

          // Pass ArrayBuffer (BodyInit-compatible) to avoid corrupting binary responses
          const ab = responseBody.buffer.slice(
            responseBody.byteOffset,
            responseBody.byteOffset + responseBody.byteLength,
          ) as ArrayBuffer;
          res(new Response(ab, { status, headers: responseHeaders }));
          tlsSocket.destroy();
        });
        tlsSocket.on("error", err => {
          clearTimeout(headersTimer);
          if (idleTimer) clearTimeout(idleTimer);
          tlsSocket.destroy();
          rej(err);
        });
      });
    })();

    // Drain inner's rejection after the race resolves so it doesn't become an
    // unhandled rejection warning when teardown() destroys the socket mid-flight.
    inner.catch(() => {});

    try {
      return await Promise.race([inner, overallPromise]);
    } finally {
      if (overallTimer) clearTimeout(overallTimer);
    }
  };
}

/**
 * Escape a header-parameter token for safe inclusion inside a quoted string in
 * Content-Disposition (field name / filename). Matches what modern browsers do:
 * percent-encode CR, LF, and double-quote.
 */
function escapeHeaderParam(s: string): string {
  return s.replace(/["\r\n]/g, c => {
    if (c === '"') return "%22";
    if (c === "\r") return "%0D";
    return "%0A";
  });
}

/**
 * Serialize a WHATWG FormData to an RFC 7578 multipart/form-data body buffer
 * plus the matching Content-Type header (including the generated boundary).
 *
 * Exported for unit tests. Used internally by `createProxyFetch` so multipart
 * uploads can ride the same hand-rolled CONNECT tunnel as JSON POSTs —
 * eliminating the `undici` runtime dependency that used to block the FormData
 * path in Cowork sandboxes where `import("undici")` fails.
 */
export async function encodeMultipart(fd: FormData): Promise<{ body: Buffer; contentType: string }> {
  // Random + timestamp suffix makes boundary collisions with any uploaded byte
  // sequence vanishingly unlikely for the upload workloads this CLI handles.
  const boundary = `----dc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const CRLF = "\r\n";
  const parts: Buffer[] = [];

  for (const [name, value] of fd.entries()) {
    const escName = escapeHeaderParam(name);
    if (typeof value === "string") {
      const header = `--${boundary}${CRLF}Content-Disposition: form-data; name="${escName}"${CRLF}${CRLF}`;
      parts.push(Buffer.from(header));
      parts.push(Buffer.from(value, "utf8"));
    } else {
      // Blob or File (File extends Blob in Node's WHATWG implementation).
      const filename = escapeHeaderParam((value as File).name || "blob");
      const contentType = value.type || "application/octet-stream";
      const header =
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${escName}"; filename="${filename}"${CRLF}` +
        `Content-Type: ${contentType}${CRLF}${CRLF}`;
      parts.push(Buffer.from(header));
      parts.push(Buffer.from(await value.arrayBuffer()));
    }
    parts.push(Buffer.from(CRLF));
  }
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * Create a fetch function for Cowork (Claude Code Remote) environments.
 *
 * Historically this used `undici.EnvHttpProxyAgent` directly, but it was
 * observed to hang indefinitely on JSON POSTs through the Cowork proxy at
 * localhost:3128 (while FormData multipart succeeded). Rather than guess
 * at the root cause inside undici's pooling layer, we now route through
 * the same hand-rolled CONNECT tunnel used in non-Cowork environments —
 * which is built only on Node built-ins, has explicit per-phase timeouts
 * (see TIMEOUTS at top of this file), and serializes FormData inline via
 * `encodeMultipart`. There is no remaining `undici` dependency on any path.
 */
export async function createCoworkFetch(
  proxyUrl: string,
): Promise<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>> {
  return createProxyFetch(proxyUrl);
}
