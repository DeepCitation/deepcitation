/**
 * Search analysis summary for not-found/partial evidence tray.
 *
 * Shows attempt count, human-readable summary, and an expandable
 * search details log.
 *
 * @packageDocumentation
 */

import { useMemo, useState } from "react";
import type { SearchAttempt } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { formatCaptureDate } from "./dateUtils.js";
import { buildSearchSummary } from "./searchSummaryUtils.js";
import { cn } from "./utils.js";
import { VerificationLogTimeline } from "./VerificationLog.js";

/**
 * Search analysis summary for not-found evidence tray.
 * Shows attempt count, human-readable summary, and an expandable search details log.
 */
export function SearchAnalysisSummary({
  searchAttempts,
  verification,
}: {
  searchAttempts: SearchAttempt[];
  verification?: Verification | null;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const summary = useMemo(() => buildSearchSummary(searchAttempts, verification), [searchAttempts, verification]);

  // Build 1-2 sentence summary
  let description: string;
  if (summary.includesFullDocScan) {
    description = "Searched the full document.";
  } else if (summary.pageRange) {
    description = `Searched ${summary.pageRange}.`;
  } else {
    description = `Ran ${summary.totalAttempts} ${summary.totalAttempts === 1 ? "search" : "searches"}.`;
  }

  if (summary.closestMatch) {
    const truncated =
      summary.closestMatch.text.length > 60
        ? `${summary.closestMatch.text.slice(0, 60)}...`
        : summary.closestMatch.text;
    description += ` Closest match: "${truncated}"`;
    if (summary.closestMatch.page) {
      description += ` on page ${summary.closestMatch.page}`;
    }
    description += ".";
  }

  // Format verified date for compact display
  const formatted = formatCaptureDate(verification?.verifiedAt);
  const dateStr = formatted?.display ?? "";

  return (
    <div className="px-3 py-2">
      {/* Compact single-line summary — entire line clickable to toggle details */}
      {searchAttempts.length > 0 ? (
        <button
          type="button"
          className="w-full flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer transition-colors text-left"
          onClick={e => {
            e.stopPropagation();
            setShowDetails(s => !s);
          }}
          aria-expanded={showDetails}
          title={description}
        >
          <svg
            className={cn("size-2.5 shrink-0 transition-transform duration-150", showDetails && "rotate-90")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="truncate">
            {description}
            {dateStr && <> · {dateStr}</>}
          </span>
        </button>
      ) : (
        <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate" title={description}>
          {description}
          {dateStr && <> · {dateStr}</>}
        </span>
      )}
      {showDetails && (
        <div className="mt-2">
          <VerificationLogTimeline searchAttempts={searchAttempts} status={verification?.status} />
        </div>
      )}
    </div>
  );
}
