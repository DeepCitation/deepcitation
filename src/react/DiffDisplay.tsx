import type React from "react";
import { memo, useMemo } from "react";
import { useSmartDiff } from "./useSmartDiff.js";
import { cn } from "./utils.js";

interface DiffDisplayProps {
  expected: string; // The "Target" or "Claimed" text
  actual: string; // The "Source" or "Found" text
  label?: string;
  className?: string;
  sanitize?: (text: string) => string;
}

const DiffDisplay: React.FC<DiffDisplayProps> = memo(
  ({ expected, actual, label, className, sanitize }) => {
    // 1. Sanitize Inputs if sanitization function provided
    const { sanitizedExpected, sanitizedActual } = useMemo(() => {
      if (sanitize) {
        return {
          sanitizedExpected: sanitize(expected),
          sanitizedActual: sanitize(actual),
        };
      }
      return {
        sanitizedExpected: expected,
        sanitizedActual: actual,
      };
    }, [expected, actual, sanitize]);

    // 2. Run the Smart Diff Hook
    const { diffResult } = useSmartDiff(sanitizedExpected, sanitizedActual);

    return (
      <div data-testid="diff-display" className={cn("space-y-2", className)}>
        {label && (
          <div
            data-testid="diff-label"
            className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
          >
            {label}
          </div>
        )}

        <div
          data-testid="diff-content"
          className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md"
        >
          <div
            data-testid="diff-blocks"
            className="text-sm font-mono whitespace-pre-wrap break-words"
          >
            {diffResult.map((block, blockIndex) => (
              <div
                key={`block-${blockIndex}`}
                className={cn(
                  block.type === "added" && "bg-green-50 dark:bg-green-900/20",
                  block.type === "removed" && "bg-red-50 dark:bg-red-900/20"
                )}
              >
                {block.parts.map((part, partIndex) => {
                  const key = `p-${blockIndex}-${partIndex}`;

                  if (part.removed) {
                    return (
                      <span
                        key={key}
                        data-diff-type="removed"
                        className="bg-red-200 dark:bg-red-800/50 text-red-800 dark:text-red-200 line-through"
                        title="Expected text"
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
                        className="bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200"
                        title="Actual text found"
                      >
                        {part.value}
                      </span>
                    );
                  }

                  // Unchanged text
                  return (
                    <span
                      key={key}
                      className="text-gray-700 dark:text-gray-300"
                    >
                      {part.value}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

DiffDisplay.displayName = "DiffDisplay";

export default DiffDisplay;
