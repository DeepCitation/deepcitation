import type React from "react";
import { useMemo, useState } from "react";
import type { SearchStatus } from "../types/search.js";
import { useTranslation } from "./i18n.js";
import { CheckIcon } from "./icons.js";
import type { DiffDisplayMode } from "./SplitDiffDisplay.js";
import { CollapsibleText, MatchQualityBar, SplitDiffDisplay } from "./SplitDiffDisplay.js";
import { getContextualStatusMessage } from "./statusMessage.js";
import { useSmartDiff } from "./useSmartDiff.js";
import { cn } from "./utils.js";

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
      "px-3 py-1.5 text-sm font-medium rounded-dc-md transition-colors",
      "focus:outline-none focus:ring-2 focus:ring-dc-ring focus:ring-offset-1",
      isActive
        ? "bg-dc-background text-dc-foreground shadow-sm"
        : "text-dc-muted-foreground hover:text-dc-foreground hover:bg-dc-muted",
    )}
    type="button"
    role="tab"
    aria-selected={isActive}
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
}) => {
  const t = useTranslation();
  return (
    <div className="flex items-center gap-1 ml-auto">
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onModeChange("inline");
        }}
        className={cn(
          "p-1 rounded transition-colors",
          mode === "inline" ? "bg-dc-muted text-dc-foreground" : "text-dc-pending hover:text-dc-muted-foreground",
        )}
        title={t("diff.inlineView")}
        aria-label={t("diff.inlineView")}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onModeChange("split");
        }}
        className={cn(
          "p-1 rounded transition-colors",
          mode === "split" ? "bg-dc-muted text-dc-foreground" : "text-dc-pending hover:text-dc-muted-foreground",
        )}
        title={t("diff.splitView")}
        aria-label={t("diff.splitView")}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      </button>
    </div>
  );
};

// =============================================================================
// FoundContentTab (extracted from inline renderFoundContent)
// =============================================================================

interface FoundContentTabProps {
  actual: string;
  emptyText: string;
  maxCollapsedLength: number;
  verifiedKeySpan?: string;
  renderCopyButton?: (text: string, position: "expected" | "found") => React.ReactNode;
}

const FoundContentTab = ({
  actual,
  emptyText,
  maxCollapsedLength,
  verifiedKeySpan,
  renderCopyButton,
}: FoundContentTabProps) => (
  <div data-testid="tab-content-found" className="mt-3">
    {actual ? (
      <div className="relative">
        {renderCopyButton && <div className="absolute top-2 right-2">{renderCopyButton(actual, "found")}</div>}
        <div className="p-3 bg-dc-muted rounded-dc-md text-sm text-dc-foreground font-mono whitespace-pre-wrap break-words">
          <CollapsibleText
            text={actual}
            maxLength={maxCollapsedLength}
            anchorText={verifiedKeySpan}
            anchorTextClass="bg-dc-verified/20 px-0.5 rounded border-b-2 border-dc-verified"
          />
        </div>
      </div>
    ) : (
      <span data-testid="empty-text" className="text-sm text-dc-subtle-foreground italic">
        {emptyText}
      </span>
    )}
  </div>
);

export const VerificationTabs: React.FC<VerificationTabsProps> = ({
  expected,
  actual,
  label,
  renderCopyButton,
  emptyText,
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
  const t = useTranslation();
  const resolvedEmptyText = emptyText ?? t("misc.noTextFound");

  const { diffResult, isHighVariance, hasDiff, similarity } = useSmartDiff(expected, actual);

  const [activeTab, setActiveTab] = useState<TabType>("diff");
  const [diffMode, setDiffMode] = useState<"inline" | "split">(() => {
    if (defaultMode === "inline") return "inline";
    if (defaultMode === "split") return "split";
    // Auto mode: default based on variance
    return isHighVariance ? "split" : "inline";
  });

  // Sync diffMode when variance changes in auto mode (setState-during-render pattern —
  // avoids the extra render cycle that useEffect would cause).
  const [prevIsHighVariance, setPrevIsHighVariance] = useState(isHighVariance);
  if (defaultMode === "auto" && isHighVariance !== prevIsHighVariance) {
    setPrevIsHighVariance(isHighVariance);
    setDiffMode(isHighVariance ? "split" : "inline");
  }

  // Get contextual status message
  const statusMessage = useMemo(() => {
    return getContextualStatusMessage(status, expectedPage, actualPage, t);
  }, [status, expectedPage, actualPage, t]);

  const foundContentElement = (
    <FoundContentTab
      actual={actual}
      emptyText={resolvedEmptyText}
      maxCollapsedLength={maxCollapsedLength}
      verifiedKeySpan={verifiedKeySpan}
      renderCopyButton={renderCopyButton}
    />
  );

  const isExactMatch = !hasDiff && Boolean(actual) && Boolean(expected);

  if (isExactMatch) {
    return (
      <div data-testid="verification-tabs" data-exact-match="true" className="space-y-2">
        {label && <div className="text-xs font-medium text-dc-subtle-foreground uppercase tracking-wide">{label}</div>}

        <div
          data-testid="exact-match-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-dc-verified/10 text-dc-verified rounded-full text-sm font-medium"
        >
          <span className="size-2">
            <CheckIcon />
          </span>
          <span>{t("tab.exactMatch")}</span>
        </div>

        <div>{foundContentElement}</div>
      </div>
    );
  }

  return (
    <div data-testid="verification-tabs" className="space-y-2">
      {label && (
        <div
          data-testid="verification-label"
          className="text-xs font-medium text-dc-subtle-foreground uppercase tracking-wide"
        >
          {label}
        </div>
      )}

      {/* Status message for partial matches */}
      {statusMessage && status && status !== "found" && status !== "pending" && status !== "loading" && (
        <div
          data-testid="status-message"
          className={cn(
            "text-xs font-medium px-2 py-1 rounded-dc-md inline-flex items-center gap-1.5",
            status === "not_found" ? "bg-dc-destructive/10 text-dc-destructive" : "bg-dc-partial/10 text-dc-partial",
          )}
        >
          {status !== "not_found" && (
            <span className="size-2.5">
              <CheckIcon />
            </span>
          )}
          {statusMessage}
        </div>
      )}

      <div data-testid="tabs-container">
        <div data-testid="tabs-nav" role="tablist" className="flex gap-1 p-1 bg-dc-muted rounded-dc-lg items-center">
          <TabButton
            label={t("tab.expected")}
            isActive={activeTab === "expected"}
            onClick={() => setActiveTab("expected")}
          />
          <TabButton label={t("tab.diff")} isActive={activeTab === "diff"} onClick={() => setActiveTab("diff")} />
          <TabButton label={t("tab.found")} isActive={activeTab === "found"} onClick={() => setActiveTab("found")} />
          {activeTab === "diff" && hasDiff && <ModeToggle mode={diffMode} onModeChange={setDiffMode} />}
        </div>
      </div>

      <div data-testid="tabs-content">
        {activeTab === "found" && foundContentElement}

        {activeTab === "expected" && (
          <div data-testid="tab-content-expected" className="mt-3">
            <div className="relative">
              {renderCopyButton && (
                <div className="absolute top-2 right-2">{renderCopyButton(expected, "expected")}</div>
              )}
              <div className="p-3 bg-dc-muted rounded-dc-md text-sm text-dc-foreground font-mono whitespace-pre-wrap break-words">
                <CollapsibleText
                  text={expected}
                  maxLength={maxCollapsedLength}
                  anchorText={anchorText}
                  anchorTextClass="bg-dc-primary/20 px-0.5 rounded border-b-2 border-dc-primary"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "diff" && (
          <div data-testid="tab-content-diff" className="mt-3">
            {!hasDiff ? (
              <div
                data-testid="exact-match-indicator"
                className="inline-flex items-center gap-1.5 text-dc-verified text-sm"
              >
                <span className="size-2">
                  <CheckIcon />
                </span>
                <span className="capitalize">{t("tab.exactMatch")}</span>
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
                {showMatchQuality && <MatchQualityBar similarity={similarity} className="mb-2" />}
                <div className="p-3 bg-dc-muted rounded-dc-md text-sm font-mono whitespace-pre-wrap break-words">
                  {diffResult.map((block, blockIdx) => (
                    <div
                      key={`${block.type}-${blockIdx}`}
                      className={cn(
                        block.type === "added" && "bg-dc-verified-bg",
                        block.type === "removed" && "bg-dc-destructive-bg",
                      )}
                    >
                      {block.parts.map((part, partIdx) => {
                        const partKey = `${part.added ? "add" : part.removed ? "rm" : "eq"}-${partIdx}`;
                        if (part.removed) {
                          return (
                            <span
                              key={partKey}
                              data-diff-type="removed"
                              className="bg-dc-destructive/20 text-dc-destructive line-through"
                              title={t("diff.expectedNotFound")}
                            >
                              {part.value}
                            </span>
                          );
                        }
                        if (part.added) {
                          return (
                            <span
                              key={partKey}
                              data-diff-type="added"
                              className="bg-dc-verified/20 text-dc-verified"
                              title={t("diff.actuallyFound")}
                            >
                              {part.value}
                            </span>
                          );
                        }
                        return (
                          <span key={partKey} className="text-dc-foreground">
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
