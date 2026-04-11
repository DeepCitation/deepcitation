import type React from "react";
import type { MatchSnippet } from "../analysis/intent.js";
import { useTranslation } from "./i18n.js";
import { normalizeSnippetText } from "./utils.js";

/** Renders closest-match snippets for partial/miss citations. */
export function SnippetZone({ snippets }: { snippets: MatchSnippet[] }): React.ReactNode {
  const t = useTranslation();
  if (snippets.length === 0) return null;
  return (
    <div className="px-4 py-2 space-y-1.5 border-b border-dc-border">
      {snippets.slice(0, 3).map((snippet, idx) => {
        const before = normalizeSnippetText(snippet.contextText.slice(0, snippet.matchStart));
        const match = normalizeSnippetText(snippet.contextText.slice(snippet.matchStart, snippet.matchEnd));
        const after = normalizeSnippetText(snippet.contextText.slice(snippet.matchEnd));
        return (
          <div
            key={`snippet-${snippet.matchStart}-${snippet.matchEnd}-${snippet.page ?? idx}`}
            className="text-xs text-dc-muted-foreground font-mono leading-relaxed"
          >
            {before && <span className="text-dc-subtle-foreground">...{before}</span>}
            <strong className="text-dc-foreground bg-dc-partial/15 px-0.5 rounded">{match}</strong>
            {after && <span className="text-dc-subtle-foreground">{after}...</span>}
            {snippet.page != null && (
              <span className="text-[10px] text-dc-subtle-foreground ml-1">
                ({t("location.page", { pageNumber: snippet.page })})
              </span>
            )}
            {!snippet.isProximate && (
              <span className="text-[10px] text-dc-subtle-foreground ml-1 italic">
                {t("evidence.differentSection")}
              </span>
            )}
          </div>
        );
      })}
      {snippets.length > 3 && (
        <div className="text-[10px] text-dc-subtle-foreground italic">
          {t("evidence.andMore", { count: snippets.length - 3 })}
        </div>
      )}
    </div>
  );
}
