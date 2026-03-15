import type { Citation } from "../../types/citation.js";
import type { SearchStatus } from "../../types/search.js";
import type { PageImage, Verification } from "../../types/verification.js";
import type { VerificationData } from "./types.js";

export function mapToVerification(data: VerificationData): Verification {
  return {
    status: (data.status as SearchStatus) ?? undefined,
    label: data.label,
    verifiedFullPhrase: data.verifiedFullPhrase,
    verifiedAnchorText: data.verifiedAnchorText,
    verifiedMatchSnippet: data.verifiedMatchSnippet,
    evidence: data.evidence?.src ? { src: data.evidence.src, dimensions: data.evidence.dimensions } : undefined,
    document: data.document
      ? { verifiedPageNumber: data.document.verifiedPageNumber, mimeType: data.document.mimeType }
      : undefined,
    url: data.url
      ? {
          verifiedUrl: data.url.verifiedUrl,
          verifiedTitle: data.url.verifiedTitle,
          verifiedDomain: data.url.verifiedDomain,
          verifiedFaviconUrl: data.url.verifiedFaviconUrl,
        }
      : undefined,
    pageImages: data.pageImages as PageImage[] | undefined,
  };
}

export function mapToCitation(data: VerificationData): Citation {
  const type = data.citation?.type === "url" ? "url" : "document";
  if (type === "url") {
    return {
      type: "url",
      fullPhrase: data.citation?.fullPhrase ?? data.verifiedFullPhrase ?? "",
      anchorText: data.citation?.anchorText ?? data.verifiedAnchorText,
      url: data.url?.verifiedUrl,
      domain: data.url?.verifiedDomain,
      title: data.url?.verifiedTitle,
      faviconUrl: data.url?.verifiedFaviconUrl,
    };
  }
  return {
    type: "document",
    fullPhrase: data.citation?.fullPhrase ?? data.verifiedFullPhrase ?? "",
    anchorText: data.citation?.anchorText ?? data.verifiedAnchorText,
  };
}
