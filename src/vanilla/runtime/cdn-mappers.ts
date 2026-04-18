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
  if (type === "url") {
    return {
      type: "url",
      sourceContext: data.citation?.sourceContext ?? data.verifiedSourceContext ?? "",
      sourceMatch: data.citation?.sourceMatch ?? data.verifiedSourceMatch,
      url: data.url?.verifiedUrl,
      domain: data.url?.verifiedDomain,
      title: data.url?.verifiedTitle,
      faviconUrl: data.url?.verifiedFaviconUrl,
    };
  }
  return {
    type: "document",
    sourceContext: data.citation?.sourceContext ?? data.verifiedSourceContext ?? "",
    sourceMatch: data.citation?.sourceMatch ?? data.verifiedSourceMatch,
  };
}
