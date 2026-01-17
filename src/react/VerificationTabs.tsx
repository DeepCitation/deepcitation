import React, { useEffect, useState } from "react";
import { useSmartDiff } from "./useSmartDiff.js";
import { cn } from "./utils.js";
import { CheckIcon } from "./icons.js";

interface VerificationTabsProps {
  expected: string; // The AI's Claim
  actual: string; // The Source Text Found
  label?: string;
  renderCopyButton?: (text: string, position: "expected" | "found") => React.ReactNode;
  emptyText?: string;
}

type TabType = "found" | "diff" | "expected";

// Sub-component: The individual tab button
const TabButton = ({ isActive, onClick, label }: { isActive: boolean; onClick: () => void; label: string }) => (
  <button
    onClick={e => {
      e.stopPropagation(); // Prevent tooltip from closing or dragging
      onClick();
    }}
    className={cn(
      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
      isActive
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"
    )}
    type="button"
    data-active={isActive}
  >
    {label}
  </button>
);

export const VerificationTabs: React.FC<VerificationTabsProps> = ({
  expected,
  actual,
  label,
  renderCopyButton,
  emptyText = "No text found",
}) => {
  const { diffResult, isHighVariance, hasDiff } = useSmartDiff(expected, actual);

  const [activeTab, setActiveTab] = useState<TabType>("diff");

  useEffect(() => {
    if (isHighVariance) {
      setActiveTab("found");
    } else {
      setActiveTab("diff");
    }
  }, [isHighVariance, expected, actual]);

  const renderFoundContent = () => (
    <div data-testid="tab-content-found" className="mt-3">
      {actual ? (
        <div className="relative">
          {renderCopyButton && <div className="absolute top-2 right-2">{renderCopyButton(actual, "found")}</div>}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-words">
            {actual}
          </div>
        </div>
      ) : (
        <span data-testid="empty-text" className="text-sm text-gray-500 dark:text-gray-400 italic">
          {emptyText}
        </span>
      )}
    </div>
  );

  const isExactMatch = !hasDiff && Boolean(actual) && Boolean(expected);

  if (isExactMatch) {
    return (
      <div data-testid="verification-tabs" data-exact-match="true" className="space-y-2">
        {label && <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>}

        <div data-testid="exact-match-badge" className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-medium">
          <CheckIcon />
          <span>Exact match</span>
        </div>

        <div>{renderFoundContent()}</div>
      </div>
    );
  }

  return (
    <div data-testid="verification-tabs" className="space-y-2">
      {label && <div data-testid="verification-label" className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>}

      <div data-testid="tabs-container">
        <div data-testid="tabs-nav" className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
          <TabButton label="Expected" isActive={activeTab === "expected"} onClick={() => setActiveTab("expected")} />
          <TabButton label="Diff" isActive={activeTab === "diff"} onClick={() => setActiveTab("diff")} />
          <TabButton label="Found" isActive={activeTab === "found"} onClick={() => setActiveTab("found")} />
        </div>
      </div>

      <div data-testid="tabs-content">
        {activeTab === "found" && renderFoundContent()}

        {activeTab === "expected" && (
          <div data-testid="tab-content-expected" className="mt-3">
            <div className="relative">
              {renderCopyButton && (
                <div className="absolute top-2 right-2">{renderCopyButton(expected, "expected")}</div>
              )}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-words">
                {expected}
              </div>
            </div>
          </div>
        )}

        {activeTab === "diff" && (
          <div data-testid="tab-content-diff" className="mt-3">
            {!hasDiff ? (
              <div data-testid="exact-match-indicator" className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-500 text-sm">
                <CheckIcon />
                <span>Exact Match</span>
              </div>
            ) : (
              <div data-testid="diff-result" className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm font-mono whitespace-pre-wrap break-words">
                {diffResult.map((block, i) => (
                  <div
                    key={i}
                    className={cn(
                      block.type === "added" && "bg-green-50 dark:bg-green-900/20",
                      block.type === "removed" && "bg-red-50 dark:bg-red-900/20",
                    )}
                  >
                    {block.parts.map((part, j) => {
                      if (part.removed) {
                        return (
                          <span
                            key={j}
                            data-diff-type="removed"
                            className="bg-red-200 dark:bg-red-800/50 text-red-800 dark:text-red-200 line-through"
                            title="Expected but not found"
                          >
                            {part.value}
                          </span>
                        );
                      }
                      if (part.added) {
                        return (
                          <span
                            key={j}
                            data-diff-type="added"
                            className="bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200"
                            title="Actually found in source"
                          >
                            {part.value}
                          </span>
                        );
                      }
                      return (
                        <span key={j} className="text-gray-700 dark:text-gray-300">
                          {part.value}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
