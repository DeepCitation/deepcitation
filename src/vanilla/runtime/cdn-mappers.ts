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
    evidence: data.evidence?.src ? { src: data.evidence.src, dimensions: data.evidence.dimensions } : undefined,
    document: data.document
      ? {
          verifiedPageNumber: data.document.verifiedPageNumber,
          mimeType: data.document.mimeType,
          sourceContextDeepItem: data.document.sourceContextDeepItem,
          sourceMatchDeepItems: data.document.sourceMatchDeepItems,
          renderScale: data.document.renderScale,
        }
      : undefined,
    url: data.url
      ? {
          verifiedUrl: data.url.verifiedUrl,
          verifiedTitle: data.url.verifiedTitle,
          verifiedDomain: data.url.verifiedDomain,
          verifiedFaviconUrl: data.url.verifiedFaviconUrl,
          urlAccessStatus: data.url.urlAccessStatus,
          urlVerificationError: data.url.urlVerificationError,
        }
      : undefined,
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
