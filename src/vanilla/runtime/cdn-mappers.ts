import type { Citation } from "../../types/citation.js";
import type { Verification } from "../../types/verification.js";
import type { VerificationData } from "./types.js";

export function mapToVerification(data: VerificationData): Verification {
  return {
    status: data.status,
    label: data.label,
    verifiedSourceContext: data.verifiedSourceContext,
    verifiedSourceMatch: data.verifiedSourceMatch,
    sourceSnippet: data.sourceSnippet,
    // Spread is safe: VerificationData sub-types use Pick<>, so no extra fields can leak through
    evidence: data.evidence?.src ? { ...data.evidence } : undefined,
    document: data.document ? { ...data.document } : undefined,
    url: data.url ? { ...data.url } : undefined,
    searchAttempts: data.searchAttempts,
  };
}

export function mapToCitation(data: VerificationData): Citation {
  const type = data.citation?.type === "url" ? "url" : "document";
  // Verified-first: the verification layer's located text is authoritative.
  // The citation's own sourceContext/sourceMatch is an LLM-authored proposal
  // and may be unreliable (paraphrased, a synthesized list, not a substring),
  // so it is only a fallback for when verification produced nothing.
  // `||` (not `??`): an empty-string verified value is "produced nothing" too,
  // so it should fall back rather than render a blank quote block.
  const sourceContext = (data.verifiedSourceContext || data.citation?.sourceContext) ?? "";
  const sourceMatch = data.verifiedSourceMatch || data.citation?.sourceMatch;
  if (type === "url") {
    return {
      type: "url",
      sourceContext,
      sourceMatch,
      url: data.url?.verifiedUrl,
      domain: data.url?.verifiedDomain,
      title: data.url?.verifiedTitle,
      faviconUrl: data.url?.verifiedFaviconUrl,
    };
  }
  return {
    type: "document",
    sourceContext,
    sourceMatch,
  };
}
