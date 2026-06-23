/**
 * Security utilities for proof image source validation.
 *
 * CANONICAL LOCATION for:
 * - isValidProofImageSrc() — validate untrusted image URLs before rendering
 * - TRUSTED_IMAGE_HOSTS — allowlist of trusted CDN hostnames
 * - SAFE_DATA_IMAGE_PREFIXES — allowlist of safe data: URI image types
 *
 * @packageDocumentation
 */

import { isDomainMatch } from "../utils/urlSafety.js";

/** Safe raster image data URI prefixes (no SVG — can contain scripts). */
export const SAFE_DATA_IMAGE_PREFIXES = [
  "data:image/png",
  "data:image/jpeg",
  "data:image/jpg",
  "data:image/webp",
  "data:image/avif",
  "data:image/gif",
] as const;

/** Base trusted CDN hostnames for proof images (always included).
 *  "deepcitation.com" adds trust for the bare domain itself (e.g.
 *  https://deepcitation.com/img.png); the subdomain entries were already
 *  validated independently via isDomainMatch.
 *
 *  "firebasestorage.googleapis.com" is included because DeepCitation hosts
 *  proof images in Firebase Storage; these URLs have the form
 *  https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media&token=<token>.
 *  isDomainMatch's exact-hostname rule means only that specific host is
 *  trusted — sibling googleapis.com subdomains do not inherit trust. */
const BASE_TRUSTED_IMAGE_HOSTS = [
  "deepcitation.com",
  "api.deepcitation.com",
  "cdn.deepcitation.com",
  "proof.deepcitation.com",
  "firebasestorage.googleapis.com",
] as const;

/**
 * Trusted CDN hostnames for proof images.
 * Includes the base hosts plus any additional hosts from the `DC_TRUSTED_IMAGE_HOSTS`
 * environment variable (comma-separated, e.g. `"my-cdn.com,assets.example.com"`).
 *
 * @example .env
 * ```
 * DC_TRUSTED_IMAGE_HOSTS=my-cdn.com,assets.example.com
 * ```
 */
export const TRUSTED_IMAGE_HOSTS: readonly string[] = (() => {
  const envVar = typeof process !== "undefined" ? process.env?.DC_TRUSTED_IMAGE_HOSTS : undefined;
  const extra = envVar
    ? envVar
        .split(",")
        .map(h => h.trim())
        .filter(Boolean)
    : [];
  return [...BASE_TRUSTED_IMAGE_HOSTS, ...extra];
})();

/** Localhost hostnames allowed for development environments. */
const DEV_HOSTNAMES = ["localhost", "127.0.0.1"] as const;

/**
 * Validate that a proof image source is a trusted URL or safe data URI.
 * Blocks SVG data URIs (can contain script), javascript: URIs, and untrusted hosts.
 * Allows localhost/127.0.0.1 for development environments.
 */
export function isValidProofImageSrc(src: unknown): src is string {
  if (typeof src !== "string") return false;
  const trimmed = src.trim();
  if (trimmed.length === 0) return false;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("data:")) {
    return SAFE_DATA_IMAGE_PREFIXES.some(prefix => lower.startsWith(prefix));
  }

  // Same-origin relative paths (e.g. "/demo/legal/page-1.avif") — safe because
  // the browser resolves them against the current host.
  // Reject: protocol-relative URLs (//evil.com), path traversal (..), encoded traversal (%2e),
  // Unicode lookalike traversal (fullwidth dots), double-encoding, and null bytes.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    // Defense-in-depth: reject obvious traversal before expensive decoding
    if (trimmed.includes("..")) return false;

    try {
      // Validate input length before expensive operations to prevent DoS
      // Legitimate proof image paths (e.g., /api/proof/abc123.avif) are typically <200 chars.
      // 2KB limit provides 10x headroom for complex query strings while preventing DoS.
      const MAX_PATH_LENGTH = 2_000;
      if (trimmed.length > MAX_PATH_LENGTH) return false;

      // Iteratively decode until stable to prevent double-encoded traversal (%252e%252e)
      let decoded = trimmed;
      let previous;
      let iterations = 0;
      const MAX_DECODE_ITERATIONS = 5; // Prevent infinite loops on malicious input

      do {
        previous = decoded;
        decoded = decodeURIComponent(decoded);
        iterations++;
        if (iterations >= MAX_DECODE_ITERATIONS) break;
      } while (decoded !== previous);

      // Normalize Unicode (NFC) to handle composed characters consistently
      const normalized = decoded.normalize("NFC");

      // Reject null bytes (C truncation attack)
      if (normalized.includes("\0")) return false;

      // Reject Unicode lookalike dots that could be used for traversal obfuscation
      // U+FF0E (fullwidth full stop), U+2024 (one dot leader), U+FE52 (small full stop), etc.
      const dangerousUnicodeDots = /[\uFF0E\u2024\uFE52\u2025\u2026]/;
      if (dangerousUnicodeDots.test(normalized)) return false;

      // Reject path traversal sequences (also catches encoded forms after decoding)
      if (normalized.includes("..")) return false;

      // Accept valid same-origin relative paths
      return true;
    } catch {
      return false; // malformed percent-encoding — reject
    }
  }

  try {
    const url = new URL(trimmed);
    // blob: URLs are same-origin, unguessable object URLs minted by
    // URL.createObjectURL. They cannot be fetched cross-origin and carry no
    // script when rendered in an <img>, so they are safe as a proof image
    // source (used by hosts that synthesize page images from a cached blob).
    // Opaque-origin blobs (blob:null/<uuid>, from sandboxed iframes) are
    // accepted too — they are equally unguessable and script-free.
    if (url.protocol === "blob:") return true;
    const isLocalhost = (DEV_HOSTNAMES as readonly string[]).includes(url.hostname);
    const isTrustedHost = TRUSTED_IMAGE_HOSTS.some(trustedHost => isDomainMatch(trimmed, trustedHost));
    return (url.protocol === "https:" && isTrustedHost) || isLocalhost;
  } catch {
    return false;
  }
}
