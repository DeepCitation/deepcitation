import { useMemo } from "react";
import type { SearchAttempt } from "../../types/search.js";
import type { Verification } from "../../types/verification.js";
import { type MessageKey, useTranslation } from "../i18n.js";
import { buildIntentSummary, type MatchSnippet } from "../searchSummaryUtils.js";

function getSearchSummaryPrimaryMessage(
  outcome: string | null | undefined,
  t: (key: MessageKey) => string,
): string | null {
  if (outcome === "not_found") return t("evidence.textNotFound");
  if (outcome === "related_found") return t("evidence.similarTextFound");
  return null;
}

/**
 * Display a single match snippet with the matched text highlighted.
 * Shows surrounding context text with the match portion bolded.
 */
function MatchSnippetDisplay({ snippet }: { snippet: MatchSnippet }) {
  const t = useTranslation();
  const before = snippet.contextText.slice(0, snippet.matchStart);
  const match = snippet.contextText.slice(snippet.matchStart, snippet.matchEnd);
  const after = snippet.contextText.slice(snippet.matchEnd);

  return (
    <div className="text-xs text-dc-muted-foreground font-mono leading-relaxed">
      {before && <span className="text-dc-subtle-foreground">...{before}</span>}
      <strong className="text-dc-foreground bg-dc-partial/15 px-0.5 rounded">{match}</strong>
      {after && <span className="text-dc-subtle-foreground">{after}...</span>}
      {snippet.page != null && (
        <span className="text-[10px] text-dc-subtle-foreground ml-1">
          ({t("location.page", { pageNumber: snippet.page })})
        </span>
      )}
      {!snippet.isProximate && (
        <span className="text-[10px] text-dc-subtle-foreground ml-1 italic">{t("evidence.differentSection")}</span>
      )}
    </div>
  );
}

/**
 * Search analysis summary for not-found / partial evidence tray.
 * Intent-centric display: clean message for misses, snippet-based for partial matches.
 */
export function SearchAnalysisSummary({
  searchAttempts,
  verification,
}: {
  searchAttempts: SearchAttempt[];
  verification?: Verification | null;
}) {
  const t = useTranslation();
  const intentSummary = useMemo(() => buildIntentSummary(verification, searchAttempts), [verification, searchAttempts]);
  const primaryMessage = getSearchSummaryPrimaryMessage(intentSummary?.outcome, t);

  // Snippets for related_found outcome (limit to 3)
  const snippets = intentSummary?.snippets?.slice(0, 3) ?? [];

  return (
    <div className="px-3 py-2 space-y-1.5">
      {/* Primary message */}
      {primaryMessage && <div className="text-[11px] text-dc-muted-foreground">{primaryMessage}</div>}

      {/* Snippets for related_found */}
      {snippets.length > 0 && (
        <div className="space-y-1">
          {snippets.map(snippet => (
            <MatchSnippetDisplay
              key={`snippet-${snippet.page ?? "na"}-${snippet.matchStart}-${snippet.matchEnd}`}
              snippet={snippet}
            />
          ))}
        </div>
      )}
    </div>
  );
}
