import type { VerificationRecord } from "../types/citation.js";

/**
 * Options for building proof page URLs.
 */
export interface ProofUrlOptions {
  /** Base URL for the proof service (e.g., "https://proof.deepcitation.com") */
  baseUrl: string;

  /** View mode for the proof page */
  view?: "snippet" | "context" | "page";

  /** Output format */
  format?: "html" | "png";

  /** Theme */
  theme?: "light" | "dark";

  /** Extra context padding (pixels) */
  pad?: number;

  /** Signed URL token (for access control) */
  token?: string;

  /** Expiry timestamp for signed URLs */
  expires?: number;
}

/**
 * Build a proof page URL from a proof ID.
 * The proof ID comes from the verification response (assigned by backend).
 */
export function buildProofUrl(proofId: string, options: ProofUrlOptions): string {
  const base = options.baseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/p/${encodeURIComponent(proofId)}`);

  if (options.view) url.searchParams.set("view", options.view);
  if (options.format) url.searchParams.set("format", options.format);
  if (options.theme) url.searchParams.set("theme", options.theme);
  if (options.pad != null) url.searchParams.set("pad", String(options.pad));
  if (options.token) url.searchParams.set("token", options.token);
  if (options.expires != null) url.searchParams.set("expires", String(options.expires));

  return url.toString();
}

/**
 * Build a direct image URL for a proof snippet.
 * Used in GitHub Markdown (![](url)) and HTML (<img src="">) targets.
 */
export function buildSnippetImageUrl(proofId: string, options: ProofUrlOptions): string {
  return buildProofUrl(proofId, { ...options, format: "png", view: "snippet" });
}

/**
 * Build proof URLs for all citations in a verification record.
 * Returns a map of citationKey -> proofUrl.
 *
 * Note: This requires the verification objects to include a `proofId` field
 * (not yet part of the Verification interface — this is a forward-looking API
 * for when the backend returns proof IDs). For now, it uses the citationKey
 * as a fallback proof ID.
 */
export function buildProofUrls(verifications: VerificationRecord, options: ProofUrlOptions): Record<string, string> {
  const urls: Record<string, string> = {};

  for (const [citationKey, verification] of Object.entries(verifications)) {
    // Use proofId from verification if available, otherwise fall back to citationKey
    const proofId = (verification as Record<string, unknown>).proofId as string | undefined;
    urls[citationKey] = buildProofUrl(proofId || citationKey, options);
  }

  return urls;
}
