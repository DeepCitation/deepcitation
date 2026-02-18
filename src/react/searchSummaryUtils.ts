import type { SearchAttempt } from "../types/search.js";
import type { Verification } from "../types/verification.js";

export interface SearchSummary {
  totalAttempts: number;
  pageRange: string; // "page 3" or "pages 3-7"
  includesFullDocScan: boolean;
  closestMatch?: { text: string; page?: number };
}

/**
 * Build a human-readable summary of search attempts for not-found states.
 * Computes page range, full doc scan presence, and closest match if any.
 * See plans/drawer-trigger-copy-polish.md for remaining tasks.
 */
export function buildSearchSummary(searchAttempts: SearchAttempt[], verification?: Verification | null): SearchSummary {
  const totalAttempts = searchAttempts.length;

  // Collect unique pages searched (including pages found by adjacent_pages method)
  const pagesSearched = new Set<number>();
  let includesFullDocScan = false;
  for (const attempt of searchAttempts) {
    if (attempt.pageSearched != null) {
      pagesSearched.add(attempt.pageSearched);
    }
    if (attempt.foundLocation?.page != null) {
      pagesSearched.add(attempt.foundLocation.page);
    }
    if (attempt.searchScope === "document") {
      includesFullDocScan = true;
    }
  }

  // Format page range
  let pageRange: string;
  if (pagesSearched.size === 0) {
    pageRange = "";
  } else if (pagesSearched.size === 1) {
    const [page] = pagesSearched;
    pageRange = `page ${page}`;
  } else {
    const sorted = Array.from(pagesSearched).sort((a, b) => a - b);
    pageRange = `pages ${sorted[0]}-${sorted[sorted.length - 1]}`;
  }

  // Find closest match: look for matchedText on unsuccessful attempts, or rejected matches
  let closestMatch: SearchSummary["closestMatch"];

  // First check verification.verifiedMatchSnippet
  if (verification?.verifiedMatchSnippet) {
    const page = verification.document?.verifiedPageNumber ?? undefined;
    closestMatch = {
      text: verification.verifiedMatchSnippet,
      page: page != null && page > 0 ? page : undefined,
    };
  }

  // If no snippet from verification, look through search attempts for rejected/partial matches
  if (!closestMatch) {
    for (const attempt of searchAttempts) {
      if (!attempt.success && attempt.matchedText) {
        closestMatch = {
          text: attempt.matchedText,
          page: attempt.pageSearched,
        };
        break; // Take the first one found
      }
    }
  }

  return { totalAttempts, pageRange, includesFullDocScan, closestMatch };
}
