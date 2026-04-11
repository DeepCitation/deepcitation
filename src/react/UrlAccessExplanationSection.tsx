import type React from "react";
import { useTranslation } from "./i18n.js";
import type { UrlAccessExplanation } from "./urlAccessExplanation.js";
import { cn } from "./utils.js";

/** Colored banner for URL access failures (amber for blocked, red for errors). */
export function UrlAccessExplanationSection({ explanation }: { explanation: UrlAccessExplanation }): React.ReactNode {
  const t = useTranslation();
  const isAmber = explanation.colorScheme === "amber";
  return (
    <div
      className={cn(
        "px-4 py-3 border-b",
        isAmber ? "bg-dc-partial-bg border-dc-partial-border" : "bg-dc-destructive-bg border-dc-destructive-border",
      )}
      role="status"
      aria-label={`${isAmber ? t("misc.warning") : t("misc.error")}: ${explanation.title}`}
    >
      <div
        className={cn(
          "text-sm font-medium mb-1 flex items-center gap-1.5",
          isAmber ? "text-dc-partial" : "text-dc-destructive",
        )}
      >
        <span className="shrink-0 text-xs" aria-hidden="true">
          {isAmber ? "\u26A0" : "\u2718"}
        </span>
        {explanation.title}
      </div>
      <p className={cn("text-xs", isAmber ? "text-dc-partial" : "text-dc-destructive")}>{explanation.description}</p>
      {explanation.suggestion && (
        <p className={cn("text-xs mt-1.5 opacity-80", isAmber ? "text-dc-partial" : "text-dc-destructive")}>
          {explanation.suggestion}
        </p>
      )}
    </div>
  );
}
