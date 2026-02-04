import React, { useEffect, useState, useMemo } from "react";
import { useSmartDiff } from "./useSmartDiff.js";
import { cn } from "./utils.js";
import { CheckIcon } from "./icons.js";
import { SplitDiffDisplay, MatchQualityBar, CollapsibleText, getContextualStatusMessage } from "./SplitDiffDisplay.js";
import type { SearchStatus } from "../types/search.js";
import type { DiffDisplayMode } from "./SplitDiffDisplay.js";

interface VerificationTabsProps {
  expected: string; // The AI's Claim
  actual: string; // The Source Text Found
  label?: string;
  renderCopyButton?: (text: string, position: "expected" | "found") => React.ReactNode;
  emptyText?: string;
  // NEW PROPS from PRD
  /** Verification status for contextual messages */
  status?: SearchStatus | null;
  /** Expected anchorText to highlight */
  anchorText?: string;
  /** Found anchorText to highlight */
  verifiedKeySpan?: string;
  /** Default display mode */
  defaultMode?: DiffDisplayMode;
  /** Expected page number (for status messages) */
  expectedPage?: number | null;
  /** Actual page number found (for status messages) */
  actualPage?: number | null;
  /** Show match quality indicator */
  showMatchQuality?: boolean;
  /** Maximum length before collapsing text */
  maxCollapsedLength?: number;
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

// Sub-component: Mode toggle button for switching between inline and split
const ModeToggle = ({
  mode,
  onModeChange,
}: {
  mode: "inline" | "split";
  onModeChange: (mode: "inline" | "split") => void;
}) => (
  <div className="flex items-center gap-1 ml-auto">
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onModeChange("inline");
      }}
      className={cn(
        "p-1 rounded transition-colors",
        mode === "inline"
          ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
      )}
      title="Inline diff view"
      aria-label="Inline diff view"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onModeChange("split");
      }}
      className={cn(
        "p-1 rounded transition-colors",
        mode === "split"
          ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
      )}
      title="Split view"
      aria-label="Split view"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    </button>
  </div>
);

export const VerificationTabs: React.FC<VerificationTabsProps> = ({
  expected,
  actual,
  label,
  renderCopyButton,
  emptyText = "No text found",
  // New props
  status,
  anchorText,
  verifiedKeySpan,
  defaultMode = "auto",
  expectedPage,
  actualPage,
  showMatchQuality = true,
  maxCollapsedLength = 200,
}) => {
  const { diffResult, isHighVariance, hasDiff, similarity } = useSmartDiff(expected, actual);

  const [activeTab, setActiveTab] = useState<TabType>("diff");
  const [diffMode, setDiffMode] = useState<"inline" | "split">(() => {
    if (defaultMode === "inline") return "inline";
    if (defaultMode === "split") return "split";
    // Auto mode: default based on variance
    return isHighVariance ? "split" : "inline";
  });

  // Update mode when variance changes (for auto mode)
  useEffect(() => {
    if (defaultMode === "auto") {
      setDiffMode(isHighVariance ? "split" : "inline");
    }
  }, [isHighVariance, defaultMode]);

  useEffect(() => {
    if (isHighVariance) {
      setActiveTab("diff"); // Stay on diff tab but use split view
    } else {
      setActiveTab("diff");
    }
  }, [isHighVariance, expected, actual]);

  // Get contextual status message
  const statusMessage = useMemo(() => {
    return getContextualStatusMessage(status, expectedPage, actualPage);
  }, [status, expectedPage, actualPage]);

  const renderFoundContent = () => (
    <div data-testid="tab-content-found" className="mt-3">
      {actual ? (
        <div className="relative">
          {renderCopyButton && <div className="absolute top-2 right-2">{renderCopyButton(actual, "found")}</div>}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-words">
            <CollapsibleText
              text={actual}
              maxLength={maxCollapsedLength}
              anchorText={verifiedKeySpan}
              anchorTextClass="bg-green-200 dark:bg-green-800/50 px-0.5 rounded border-b-2 border-green-400 dark:border-green-500"
            />
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
          <span className="size-2">
            <CheckIcon />
          </span>
          <span>Exact match</span>
        </div>

        <div>{renderFoundContent()}</div>
      </div>
    );
  }

  return (
    <div data-testid="verification-tabs" className="space-y-2">
      {label && <div data-testid="verification-label" className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>}

      {/* Status message for partial matches */}
      {statusMessage && status && status !== "found" && status !== "pending" && status !== "loading" && (
        <div data-testid="status-message" className={cn(
          "text-xs font-medium px-2 py-1 rounded-md inline-flex items-center gap-1.5",
          status === "not_found"
            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
            : "bg-amber-100 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400"
        )}>
          {status !== "not_found" && (
            <span className="size-2.5">
              <CheckIcon />
            </span>
          )}
          {statusMessage}
        </div>
      )}

      <div data-testid="tabs-container">
        <div data-testid="tabs-nav" className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg items-center">
          <TabButton label="Expected" isActive={activeTab === "expected"} onClick={() => setActiveTab("expected")} />
          <TabButton label="Diff" isActive={activeTab === "diff"} onClick={() => setActiveTab("diff")} />
          <TabButton label="Found" isActive={activeTab === "found"} onClick={() => setActiveTab("found")} />
          {activeTab === "diff" && hasDiff && (
            <ModeToggle mode={diffMode} onModeChange={setDiffMode} />
          )}
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
                <CollapsibleText
                  text={expected}
                  maxLength={maxCollapsedLength}
                  anchorText={anchorText}
                  anchorTextClass="bg-blue-200 dark:bg-blue-800/50 px-0.5 rounded border-b-2 border-blue-400 dark:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "diff" && (
          <div data-testid="tab-content-diff" className="mt-3">
            {!hasDiff ? (
              <div data-testid="exact-match-indicator" className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-500 text-sm">
                <span className="size-2">
                  <CheckIcon />
                </span>
                <span>Exact Match</span>
              </div>
            ) : diffMode === "split" ? (
              // Split view mode
              <SplitDiffDisplay
                expected={expected}
                actual={actual}
                mode="split"
                showMatchQuality={showMatchQuality}
                maxCollapsedLength={maxCollapsedLength}
                anchorTextExpected={anchorText}
                anchorTextFound={verifiedKeySpan}
                status={status}
                similarity={similarity}
              />
            ) : (
              // Inline diff mode
              <div data-testid="diff-result" className="space-y-2">
                {showMatchQuality && (
                  <MatchQualityBar similarity={similarity} className="mb-2" />
                )}
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm font-mono whitespace-pre-wrap break-words">
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
