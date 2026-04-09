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
const TIMEOUTS = {
  proxyConnect: parseInt(process.env.DC_PROXY_CONNECT_MS ?? "5000", 10),
  tlsHandshake: parseInt(process.env.DC_TLS_HANDSHAKE_MS ?? "10000", 10),
  headers: parseInt(process.env.DC_HEADERS_TIMEOUT_MS ?? "60000", 10),
  idleData: parseInt(process.env.DC_IDLE_DATA_MS ?? "30000", 10),
  overall: parseInt(process.env.DC_REQUEST_TIMEOUT_MS ?? "90000", 10),
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
      if (init?.body) {
        if (init.body instanceof ArrayBuffer) {
          bodyBuffer = Buffer.from(init.body);
        } else if (Buffer.isBuffer(init.body)) {
          bodyBuffer = init.body;
        } else if (typeof init.body === "string") {
          bodyBuffer = Buffer.from(init.body);
        } else if (init.body instanceof FormData) {
          // For FormData, fall back to undici or global fetch with dispatcher.
          // Clean up the TLS socket we already opened — sendViaUndiciProxy creates its own connection.
          tlsSocket.destroy();
          openTlsSocket = undefined;
          openSocket = undefined;
          return sendViaUndiciProxy(proxyUrl, input, init);
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

    try {
      return await Promise.race([inner, overallPromise]);
    } finally {
      if (overallTimer) clearTimeout(overallTimer);
    }
  };
}

/**
 * Convert globalThis.FormData → undici.FormData.
 * undici.fetch cannot serialize globalThis.FormData (the server receives no file).
 */
function convertFormData(
  body: BodyInit | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // biome-ignore lint/suspicious/noExplicitAny: undici types not available at runtime
  undici: any,
): BodyInit | null | undefined {
  if (body instanceof FormData) {
    const ufd = new undici.FormData();
    for (const [key, value] of (body as globalThis.FormData).entries()) {
      if (value instanceof Blob) {
        ufd.append(key, value, (value as File).name || key);
      } else {
        ufd.append(key, value);
      }
    }
    // undici.FormData is not assignable to globalThis.BodyInit; safe because
    // undici.fetch accepts its own FormData via the dispatcher path.
    return ufd as unknown as BodyInit;
  }
  return body;
}

/**
 * FormData proxy fallback: try undici ProxyAgent, then EnvHttpProxyAgent,
 * or fall back to global fetch if undici isn't importable.
 *
 * Both ProxyAgent and EnvHttpProxyAgent are constructed with the same per-phase
 * timeouts as the manual CONNECT path, plus an AbortSignal.timeout matching the
 * overall ceiling. This keeps the FormData path's failure mode aligned with the
 * JSON path: a stuck request bails out within the same budgets, regardless of
 * which transport carried it.
 */
async function sendViaUndiciProxy(proxyUrl: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // biome-ignore lint/suspicious/noExplicitAny: undici types not available at runtime
  let undici: any;
  try {
    undici = await import(/* webpackIgnore: true */ "undici" as string);
  } catch {
    // undici not installed — warn and try direct (import failure only, not network errors)
    console.error("Warning: FormData upload through proxy requires the 'undici' package. Trying direct connection...");
    return globalThis.fetch(input, init);
  }

  const body = convertFormData(init?.body, undici);

  const dispatcherOptions = {
    connectTimeout: TIMEOUTS.proxyConnect,
    headersTimeout: TIMEOUTS.headers,
    bodyTimeout: TIMEOUTS.idleData,
    keepAliveTimeout: 10_000,
  };

  // Try explicit ProxyAgent first (works in non-cowork environments)
  let agent;
  try {
    agent = new undici.ProxyAgent({ uri: proxyUrl, ...dispatcherOptions });
  } catch (err) {
    // ProxyAgent construction can fail in Cowork (e.g. malformed URL from env). Log the
    // real error so users can diagnose misconfigurations, then fall back to EnvHttpProxyAgent.
    console.error(`Warning: ProxyAgent construction failed (${err}), falling back to EnvHttpProxyAgent.`);
    agent = new undici.EnvHttpProxyAgent(dispatcherOptions);
  }

  // Must use undici.fetch (not globalThis.fetch) — only undici.fetch respects `dispatcher`.
  // AbortSignal.timeout enforces the same overall ceiling as the manual CONNECT path.
  return (await undici.fetch(input, {
    ...init,
    body,
    dispatcher: agent,
    signal: AbortSignal.timeout(TIMEOUTS.overall),
  })) as Response;
}

/**
 * Create a fetch function for Cowork (Claude Code Remote) environments.
 *
 * Historically this used `undici.EnvHttpProxyAgent` directly, but it was
 * observed to hang indefinitely on JSON POSTs through the Cowork proxy at
 * localhost:3128 (while FormData multipart succeeded). Rather than guess
 * at the root cause inside undici's pooling layer, we now route through
 * the same hand-rolled CONNECT tunnel used in non-Cowork environments —
 * which is built only on Node built-ins and has explicit per-phase timeouts
 * (see TIMEOUTS at top of this file).
 *
 * The FormData fallback inside `createProxyFetch` (which delegates to
 * `sendViaUndiciProxy`) is preserved unchanged, so multipart uploads still
 * work via undici but with timeouts now applied.
 */
export async function createCoworkFetch(
  proxyUrl: string,
): Promise<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>> {
  return createProxyFetch(proxyUrl);
}
