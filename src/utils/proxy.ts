// Node.js CLI only — not for browser or SDK consumers.
// Imported exclusively by cli.ts and must never be re-exported from public entrypoints.

/**
 * Detect proxy URL from standard environment variables.
 * Checks HTTPS_PROXY, HTTP_PROXY (and lowercase variants), plus NO_PROXY exclusions.
 */
export function detectProxyUrl(targetUrl: string): string | undefined {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || "";
  if (noProxy === "*") return undefined;

  const target = new URL(targetUrl);
  if (noProxy) {
    const exclusions = noProxy.split(",").map(s => s.trim().toLowerCase());
    const hostname = target.hostname.toLowerCase();
    // NOTE: We intentionally do NOT use isDomainMatch() here. isDomainMatch uses
    // extractRootDomain which collapses "sub.api.example.com" → "example.com",
    // losing intermediate subdomains. NO_PROXY needs "sub.api.example.com" to match
    // exclusion "api.example.com" via suffix matching — different semantics.
    for (const raw of exclusions) {
      if (!raw) continue;
      // Strip leading dot — curl convention: ".example.com" matches both
      // "example.com" and "*.example.com".
      const exc = raw.startsWith(".") ? raw.slice(1) : raw;
      if (hostname === exc || hostname.endsWith(`.${exc}`)) return undefined;
    }
  }

  // Prefer HTTPS_PROXY for https targets, fall back to HTTP_PROXY
  if (target.protocol === "https:") {
    return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  }
  return process.env.HTTP_PROXY || process.env.http_proxy;
}

/** Decode HTTP chunked transfer encoding (binary-safe). */
export function decodeChunked(raw: Buffer): Buffer {
  const crlf = Buffer.from("\r\n");
  const parts: Buffer[] = [];
  let pos = 0;
  while (pos < raw.length) {
    const lineEnd = raw.indexOf(crlf, pos);
    if (lineEnd === -1) break;
    const size = parseInt(raw.subarray(pos, lineEnd).toString("ascii"), 16);
    if (size === 0 || Number.isNaN(size)) break;
    parts.push(raw.subarray(lineEnd + 2, lineEnd + 2 + size));
    pos = lineEnd + 2 + size + 2; // skip chunk data + trailing \r\n
  }
  return Buffer.concat(parts);
}
