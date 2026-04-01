/**
 * Proxy-aware fetch for the DeepCitation CLI.
 * Tunnels HTTPS through an HTTP CONNECT proxy using only Node.js built-ins.
 */

import { request as httpRequest } from "node:http";
import { connect as tlsConnect } from "node:tls";
import { decodeChunked } from "../utils/proxy.js";

/**
 * Create a proxy-aware fetch that tunnels HTTPS through an HTTP CONNECT proxy.
 * Uses only Node.js built-in modules (no external dependencies).
 */
export function createProxyFetch(
  proxyUrl: string,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const proxy = new URL(proxyUrl);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const targetHost = url.hostname;
    const targetPort = url.port || (url.protocol === "https:" ? "443" : "80");

    if (url.protocol !== "https:") {
      // For non-HTTPS, just use global fetch (proxy env var may work for plain HTTP)
      return globalThis.fetch(input, init);
    }

    // Establish CONNECT tunnel through the proxy
    const socket = await new Promise<import("node:net").Socket>((res, rej) => {
      const req = httpRequest({
        host: proxy.hostname,
        port: Number(proxy.port) || 3128,
        method: "CONNECT",
        path: `${targetHost}:${targetPort}`,
      });
      req.on("connect", (_res, socket) => {
        if (_res.statusCode === 200) {
          res(socket);
        } else {
          socket.destroy();
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

    // Upgrade to TLS over the tunnel
    const tlsSocket = tlsConnect({ socket, servername: targetHost });
    await new Promise<void>((res, rej) => {
      tlsSocket.on("secureConnect", res);
      tlsSocket.on("error", err => {
        socket.destroy();
        rej(err);
      });
    });

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

    // Parse response — keep body as Buffer to avoid corrupting binary data
    return new Promise<Response>((res, rej) => {
      const chunks: Buffer[] = [];
      tlsSocket.on("data", (chunk: Buffer) => chunks.push(chunk));
      tlsSocket.on("end", () => {
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
        tlsSocket.destroy();
        rej(err);
      });
    });
  };
}

/**
 * FormData proxy fallback: try undici ProxyAgent (available in Node 22+),
 * or fall back to global fetch if undici isn't importable.
 */
async function sendViaUndiciProxy(proxyUrl: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undici = await import(/* webpackIgnore: true */ "undici" as string);
    const agent = new undici.ProxyAgent(proxyUrl);
    return await globalThis.fetch(input, { ...init, dispatcher: agent } as RequestInit);
  } catch {
    // undici not available — warn and try direct
    console.error("Warning: FormData upload through proxy requires the 'undici' package. Trying direct connection...");
    return globalThis.fetch(input, init);
  }
}
