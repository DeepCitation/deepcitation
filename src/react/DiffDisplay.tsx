import type React from "react";
import { memo, useMemo } from "react";
import { useTranslation } from "./i18n.js";
import { useSmartDiff } from "./useSmartDiff.js";
import { cn } from "./utils.js";

interface DiffDisplayProps {
  expected: string; // The "Target" or "Claimed" text
  actual: string; // The "Source" or "Found" text
  label?: string;
  className?: string;
  sanitize?: (text: string) => string;
}

const DiffDisplay: React.FC<DiffDisplayProps> = memo(({ expected, actual, label, className, sanitize }) => {
  const t = useTranslation();
  // 1. Sanitize Inputs if sanitization function provided
  const { sanitizedExpected, sanitizedActual } = useMemo(
    () => ({
      sanitizedExpected: sanitize ? sanitize(expected) : expected,
      sanitizedActual: sanitize ? sanitize(actual) : actual,
    }),
    [expected, actual, sanitize],
  );

  // 2. Run the Smart Diff Hook
  const { diffResult } = useSmartDiff(sanitizedExpected, sanitizedActual);

  return (
    <div data-testid="diff-display" className={cn("space-y-2", className)}>
      {label && (
        <div data-testid="diff-label" className="text-xs font-medium text-dc-muted-foreground uppercase tracking-wide">
          {label}
        </div>
      )}

      <div data-testid="diff-content" className="p-3 bg-dc-muted rounded-dc-md">
        <div data-testid="diff-blocks" className="text-sm font-mono whitespace-pre-wrap break-words">
          {diffResult.map((block, blockIndex) => {
            const blockContent = block.parts.map(p => p.value).join("");
            const blockKey = `${block.type}-${blockContent.slice(0, 20)}-${blockContent.length}`;
            return (
              <div
                key={blockKey}
                className={cn(
                  block.type === "added" && "bg-dc-verified-bg",
                  block.type === "removed" && "bg-dc-destructive-bg",
                )}
              >
                {block.parts.map((part, partIndex) => {
                  const key = `p-${blockIndex}-${partIndex}`;

                  if (part.removed) {
                    return (
                      <span
                        key={key}
                        data-diff-type="removed"
                        className="bg-dc-destructive/20 text-dc-destructive line-through"
                        title={t("diff.expectedText")}
                      >
                        {part.value}
                      </span>
                    );
                  }

                  if (part.added) {
                    return (
                      <span
                        key={key}
                        data-diff-type="added"
                        className="bg-dc-verified/20 text-dc-verified"
                        title={t("diff.actualTextFound")}
                      >
                        {part.value}
                      </span>
                    );
                  }

                  // Unchanged text
                  return (
                    <span key={key} className="text-dc-foreground">
                      {part.value}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

DiffDisplay.displayName = "DiffDisplay";

export default DiffDisplay;
