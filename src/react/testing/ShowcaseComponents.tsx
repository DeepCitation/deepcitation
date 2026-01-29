import React from "react";
import { CitationComponent } from "../CitationComponent";
import { UrlCitationComponent } from "../UrlCitationComponent";
import { StatusHeader, VerificationLog, QuoteBox } from "../VerificationLog";
import { SpinnerIcon } from "../icons";
import type { Citation } from "../../types/citation";
import type { Verification } from "../../types/verification";
import type { SearchAttempt, SearchStatus } from "../../types/search";
import type { UrlCitationMeta, UrlFetchStatus } from "../types";

// =============================================================================
// TEST FIXTURES - Citations
// =============================================================================

const baseCitation: Citation = {
  pageNumber: 5,
  lineIds: [12, 13],
  fullPhrase: "Revenue increased by 15% in Q4 2024.",
  anchorText: "increased by 15%",
  citationNumber: 1,
};

const longCitation: Citation = {
  ...baseCitation,
  fullPhrase: "The quarterly financial report indicates that revenue increased by 15% compared to the same period last year, driven primarily by strong performance in the enterprise segment.",
  anchorText: "revenue increased by 15% compared to the same period last year",
  citationNumber: 2,
};

// =============================================================================
// TEST FIXTURES - Verifications
// =============================================================================

const verifiedVerification: Verification = {
  status: "found",
  verifiedPageNumber: 5,
  verifiedMatchSnippet: "Revenue increased by 15% in Q4 2024.",
  verificationImageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
};

const partialVerification: Verification = {
  status: "found_on_other_page",
  verifiedPageNumber: 7,
  verifiedMatchSnippet: "increased by 15%",
};

const notFoundVerification: Verification = {
  status: "not_found",
  verifiedPageNumber: -1,
};

const pendingVerification: Verification = {
  status: "pending",
};

// =============================================================================
// TEST FIXTURES - Failed Search Attempts (Audit Log)
// =============================================================================

const failedSearchAttempts: SearchAttempt[] = [
  {
    method: "exact_line_match",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 5,
    note: "not found on expected page (5)",
  },
  {
    method: "current_page",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 5,
    note: "not found with exact match",
  },
  {
    method: "adjacent_pages",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 4,
    note: "searched adjacent pages 4-6",
  },
  {
    method: "adjacent_pages",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 6,
  },
  {
    method: "anchor_text_fallback",
    success: false,
    searchPhrase: "increased by 15%",
    searchPhraseType: "anchor_text",
    pageSearched: 5,
    note: "anchor text not found",
  },
  {
    method: "expanded_window",
    success: false,
    searchPhrase: "increased by 15%",
    searchPhraseType: "anchor_text",
    note: "searched pages 1-10",
  },
];

const partialMatchSearchAttempts: SearchAttempt[] = [
  {
    method: "exact_line_match",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 5,
    note: "exact phrase not found",
  },
  {
    method: "anchor_text_fallback",
    success: true,
    searchPhrase: "increased by 15%",
    searchPhraseType: "anchor_text",
    pageSearched: 7,
    matchedVariation: "exact_anchor_text",
    matchedText: "increased by 15%",
    note: "found on different page",
  },
];

const lowTrustSearchAttempts: SearchAttempt[] = [
  {
    method: "exact_line_match",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 5,
  },
  {
    method: "first_word_fallback",
    success: true,
    searchPhrase: "Revenue",
    searchPhraseType: "anchor_text",
    pageSearched: 3,
    matchedVariation: "first_word_only",
    matchedText: "Revenue",
    note: "only first word matched",
  },
];

const notFoundWithAudit: Verification = {
  status: "not_found",
  verifiedPageNumber: -1,
  searchAttempts: failedSearchAttempts,
};

const partialWithAudit: Verification = {
  status: "found_on_other_page",
  verifiedPageNumber: 7,
  searchAttempts: partialMatchSearchAttempts,
};

const lowTrustWithAudit: Verification = {
  status: "first_word_found",
  verifiedPageNumber: 3,
  searchAttempts: lowTrustSearchAttempts,
};

// =============================================================================
// TEST FIXTURES - URL Metas
// =============================================================================

const allUrlStatuses: Array<{ status: UrlFetchStatus; description: string }> = [
  { status: "verified", description: "Verified" },
  { status: "partial", description: "Partial" },
  { status: "pending", description: "Pending" },
  { status: "accessible", description: "Accessible" },
  { status: "redirected", description: "Redirected" },
  { status: "redirected_valid", description: "Redirected Valid" },
  { status: "blocked_antibot", description: "Blocked Anti-bot" },
  { status: "blocked_login", description: "Blocked Login" },
  { status: "blocked_paywall", description: "Blocked Paywall" },
  { status: "blocked_geo", description: "Blocked Geo" },
  { status: "blocked_rate_limit", description: "Blocked Rate Limit" },
  { status: "error_timeout", description: "Error Timeout" },
  { status: "error_not_found", description: "Error 404" },
  { status: "error_server", description: "Error Server" },
  { status: "error_network", description: "Error Network" },
  { status: "unknown", description: "Unknown" },
];

// =============================================================================
// VISUAL SHOWCASE COMPONENT
// =============================================================================

export function VisualShowcase() {
  return (
    <div className="p-6 bg-white dark:bg-gray-900 min-h-screen" data-testid="visual-showcase">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Citation Component Visual Showcase</h1>

      {/* Section: All Variants x All States */}
      <section className="mb-10" data-testid="variants-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">All Variants × All States</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Variant</th>
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Verified</th>
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Partial</th>
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Not Found</th>
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Pending</th>
              </tr>
            </thead>
            <tbody>
              {(["brackets", "chip", "text", "superscript", "minimal", "linter"] as const).map(variant => (
                <tr key={variant} className="border-b border-gray-100 dark:border-gray-800" data-variant-row={variant}>
                  <td className="p-2 font-mono text-gray-700 dark:text-gray-300">{variant}</td>
                  <td className="p-2">
                    <CitationComponent
                      citation={baseCitation}
                      verification={verifiedVerification}
                      variant={variant}
                    />
                  </td>
                  <td className="p-2">
                    <CitationComponent
                      citation={baseCitation}
                      verification={partialVerification}
                      variant={variant}
                    />
                  </td>
                  <td className="p-2">
                    <CitationComponent
                      citation={baseCitation}
                      verification={notFoundVerification}
                      variant={variant}
                    />
                  </td>
                  <td className="p-2">
                    <CitationComponent
                      citation={baseCitation}
                      verification={pendingVerification}
                      variant={variant}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section: Content Types */}
      <section className="mb-10" data-testid="content-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Content Types</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(["number", "anchorText", "indicator"] as const).map(content => (
            <div key={content} className="p-3 bg-gray-50 dark:bg-gray-800 rounded" data-content-type={content}>
              <p className="text-xs text-gray-500 mb-2 font-mono">{content}</p>
              <CitationComponent
                citation={baseCitation}
                verification={verifiedVerification}
                variant="brackets"
                content={content}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Section: showIndicator prop */}
      <section className="mb-10" data-testid="show-indicator-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">showIndicator Prop</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Control whether the status indicator (checkmark, warning, spinner) is shown
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded" data-show-indicator="default">
            <p className="text-xs text-gray-500 mb-2 font-mono">showIndicator=true (default)</p>
            <CitationComponent
              citation={baseCitation}
              verification={verifiedVerification}
              variant="brackets"
            />
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded" data-show-indicator="false">
            <p className="text-xs text-gray-500 mb-2 font-mono">showIndicator=false</p>
            <CitationComponent
              citation={baseCitation}
              verification={verifiedVerification}
              variant="brackets"
              showIndicator={false}
            />
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded" data-show-indicator="chip-on">
            <p className="text-xs text-gray-500 mb-2 font-mono">chip with indicator</p>
            <CitationComponent
              citation={baseCitation}
              verification={verifiedVerification}
              variant="chip"
            />
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded" data-show-indicator="chip-off">
            <p className="text-xs text-gray-500 mb-2 font-mono">chip without indicator</p>
            <CitationComponent
              citation={baseCitation}
              verification={verifiedVerification}
              variant="chip"
              showIndicator={false}
            />
          </div>
        </div>
      </section>

      {/* Section: Long Text Handling */}
      <section className="mb-10" data-testid="long-text-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Long Text Handling</h2>
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <p className="text-xs text-gray-500 mb-2">Chip with long anchorText</p>
            <CitationComponent
              citation={longCitation}
              verification={verifiedVerification}
              variant="chip"
              content="anchorText"
            />
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <p className="text-xs text-gray-500 mb-2">Minimal with long anchorText</p>
            <CitationComponent
              citation={longCitation}
              verification={verifiedVerification}
              variant="minimal"
              content="anchorText"
            />
          </div>
        </div>
      </section>

      {/* Section: Failed Search Attempts (Audit Log) */}
      <section className="mb-10" data-testid="audit-log-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Failed Search Attempts (Audit Log)</h2>
        <div className="space-y-6">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800" data-audit="not-found">
            <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-3">Not Found - 6 search attempts</p>
            <CitationComponent
              citation={baseCitation}
              verification={notFoundWithAudit}
              variant="brackets"
            />
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800" data-audit="partial">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-3">Partial Match - Found on different page</p>
            <CitationComponent
              citation={baseCitation}
              verification={partialWithAudit}
              variant="brackets"
            />
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800" data-audit="low-trust">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-3">Low Trust - Only first word matched</p>
            <CitationComponent
              citation={baseCitation}
              verification={lowTrustWithAudit}
              variant="brackets"
            />
          </div>
        </div>
      </section>

      {/* Section: URL Citations - All Statuses */}
      <section className="mb-10" data-testid="url-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">URL Citations - All Statuses</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {allUrlStatuses.map(({ status, description }) => {
            const meta: UrlCitationMeta = {
              url: `https://example.com/${status}`,
              domain: "example.com",
              title: `${description} Article`,
              fetchStatus: status,
            };
            return (
              <div key={status} className="p-2 bg-gray-50 dark:bg-gray-800 rounded" data-url-status={status}>
                <p className="text-[10px] text-gray-500 mb-1 font-mono truncate">{status}</p>
                <UrlCitationComponent urlMeta={meta} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Section: URL Citation Variants */}
      <section className="mb-10" data-testid="url-variants-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">URL Citation Variants</h2>
        <div className="space-y-4">
          {(["badge", "chip", "inline", "bracket"] as const).map(variant => {
            const meta: UrlCitationMeta = {
              url: "https://docs.example.com/api/v2/citations",
              domain: "docs.example.com",
              title: "Citation API Documentation",
              fetchStatus: "verified",
            };
            return (
              <div key={variant} className="p-3 bg-gray-50 dark:bg-gray-800 rounded" data-url-variant={variant}>
                <p className="text-xs text-gray-500 mb-2 font-mono">{variant}</p>
                <UrlCitationComponent urlMeta={meta} variant={variant} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Section: Inline Usage Context */}
      <section className="mb-10" data-testid="inline-context-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Inline Usage Context</h2>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded text-gray-700 dark:text-gray-300">
          <p className="leading-relaxed">
            According to the Q4 financial report, the company saw significant growth
            <CitationComponent
              citation={baseCitation}
              verification={verifiedVerification}
              variant="superscript"
            />
            with revenue increasing by 15%
            <CitationComponent
              citation={{ ...baseCitation, citationNumber: 2 }}
              verification={partialVerification}
              variant="superscript"
            />
            compared to the previous quarter. However, some claims could not be verified
            <CitationComponent
              citation={{ ...baseCitation, citationNumber: 3 }}
              verification={notFoundVerification}
              variant="superscript"
            />
            and require further review.
          </p>
        </div>
      </section>
    </div>
  );
}

// =============================================================================
// MOBILE SHOWCASE COMPONENT
// =============================================================================

export function MobileShowcase() {
  return (
    <div className="p-4 bg-white dark:bg-gray-900 min-h-screen" data-testid="mobile-showcase">
      <h1 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Mobile View</h1>

      {/* Compact variants for mobile */}
      <section className="mb-6" data-testid="mobile-variants">
        <h2 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">Citation Variants</h2>
        <div className="space-y-2">
          {(["brackets", "chip", "superscript", "minimal", "linter"] as const).map(variant => (
            <div key={variant} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded" data-mobile-variant={variant}>
              <span className="text-xs text-gray-500 w-20 font-mono">{variant}</span>
              <CitationComponent
                citation={baseCitation}
                verification={verifiedVerification}
                variant={variant}
              />
            </div>
          ))}
        </div>
      </section>

      {/* URL citations mobile */}
      <section className="mb-6" data-testid="mobile-urls">
        <h2 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">URL Citations</h2>
        <div className="space-y-2">
          {(["verified", "blocked_login", "error_not_found"] as const).map(status => {
            const meta: UrlCitationMeta = {
              url: `https://very-long-domain-name.example.com/path/to/article/${status}`,
              fetchStatus: status,
            };
            return (
              <div key={status} className="p-2 bg-gray-50 dark:bg-gray-800 rounded" data-mobile-url={status}>
                <UrlCitationComponent urlMeta={meta} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Inline text on mobile */}
      <section data-testid="mobile-inline">
        <h2 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">Inline Text</h2>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
          <p>
            The report shows growth
            <CitationComponent citation={baseCitation} verification={verifiedVerification} variant="superscript" />
            but some data is unverified
            <CitationComponent citation={{ ...baseCitation, citationNumber: 2 }} verification={notFoundVerification} variant="superscript" />.
          </p>
        </div>
      </section>
    </div>
  );
}

// =============================================================================
// POPOVER SHOWCASE COMPONENT
// =============================================================================

/** All verification statuses for comprehensive popover showcase */
const allVerificationStatuses: Array<{ status: SearchStatus; label: string; description: string }> = [
  // Green statuses
  { status: "found", label: "Found", description: "Exact match verified" },
  { status: "found_anchor_text_only", label: "Anchor Text Only", description: "Key phrase matched" },
  { status: "found_phrase_missed_anchor_text", label: "Phrase (Missed Anchor)", description: "Full phrase found but anchor text differed" },
  // Amber statuses
  { status: "found_on_other_page", label: "Other Page", description: "Found on different page" },
  { status: "found_on_other_line", label: "Other Line", description: "Found on different line" },
  { status: "partial_text_found", label: "Partial Text", description: "Partial text matched" },
  { status: "first_word_found", label: "First Word", description: "Only first word matched" },
  // Red statuses
  { status: "not_found", label: "Not Found", description: "Citation could not be verified" },
  // Gray statuses
  { status: "pending", label: "Pending", description: "Verification in progress" },
  { status: "loading", label: "Loading", description: "Loading verification" },
];

/** Sample verification image (1x1 green pixel base64) */
const sampleImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QzwAEjDAGNzYAAIoaB1HkOzVfAAAAAElFTkSuQmCC";

/**
 * Showcase component for testing all popover/tooltip states.
 * Displays the inner popover content directly (without hover interaction)
 * to allow visual verification of all states.
 */
export function PopoverShowcase() {
  return (
    <div className="p-6 bg-white dark:bg-gray-900 min-h-screen" data-testid="popover-showcase">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        Citation Popover/Tooltip Visual Showcase
      </h1>

      {/* Section: Loading/Pending State */}
      <section className="mb-10" data-testid="popover-pending-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
          Loading/Pending State
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" data-popover-state="pending">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
              pending (with phrase + page)
            </div>
            <div className="p-3 flex flex-col gap-2 min-w-[200px] max-w-[400px]">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                <span className="inline-block relative top-[0.1em] mr-1.5 size-3 animate-spin">
                  <SpinnerIcon />
                </span>
                Searching...
              </span>
              <p className="p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-[11px] break-words text-gray-600 dark:text-gray-400 italic">
                "Revenue increased by 15% in Q4 2024."
              </p>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Looking on page 5
              </span>
            </div>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" data-popover-state="loading-long">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
              pending (long phrase, truncated)
            </div>
            <div className="p-3 flex flex-col gap-2 min-w-[200px] max-w-[400px]">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                <span className="inline-block relative top-[0.1em] mr-1.5 size-3 animate-spin">
                  <SpinnerIcon />
                </span>
                Searching...
              </span>
              <p className="p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-[11px] break-words text-gray-600 dark:text-gray-400 italic">
                "The quarterly financial report indicates that revenue increased by 15% compared…"
              </p>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Looking on page 12
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Section: StatusHeader - All Statuses */}
      <section className="mb-10" data-testid="popover-status-headers-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
          Status Headers (All Verification Statuses)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allVerificationStatuses.map(({ status, label, description }) => {
            // For "unexpected location" statuses, show different expected vs found pages
            const isUnexpectedLocation = status === "found_on_other_page" || status === "found_on_other_line";
            const foundPage = status !== "not_found" && status !== "pending" && status !== "loading"
              ? (isUnexpectedLocation ? 7 : 5)
              : undefined;
            const expectedPage = 5;

            return (
              <div
                key={status}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                data-status-header={status}
              >
                <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
                  {status}
                </div>
                <StatusHeader
                  status={status}
                  foundPage={foundPage}
                  expectedPage={expectedPage}
                />
                <div className="p-2 text-xs text-gray-600 dark:text-gray-400">
                  {description}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section: Combined Headers (with anchor text and quote) */}
      <section className="mb-10" data-testid="popover-combined-headers-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
          Combined Headers (Status + Anchor Text + Quote)
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Used for not_found and partial states without images
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" data-combined-header="not-found">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
              not_found - with anchor text and quote
            </div>
            <StatusHeader
              status="not_found"
              expectedPage={5}
              anchorText="increased by 15%"
              fullPhrase="Revenue increased by 15% in Q4 2024, marking a significant improvement over the previous quarter's performance."
            />
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" data-combined-header="partial">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
              found_on_other_page - with anchor text and quote
            </div>
            <StatusHeader
              status="found_on_other_page"
              foundPage={7}
              expectedPage={5}
              anchorText="increased by 15%"
              fullPhrase="Revenue increased by 15% in Q4 2024."
            />
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" data-combined-header="first-word">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
              first_word_found - low confidence match
            </div>
            <StatusHeader
              status="first_word_found"
              foundPage={3}
              expectedPage={5}
              anchorText="Revenue"
              fullPhrase="Revenue increased by 15% in Q4 2024."
            />
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" data-combined-header="long-quote">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
              not_found - with very long quote (truncated)
            </div>
            <StatusHeader
              status="not_found"
              expectedPage={5}
              anchorText="quarterly financial improvements"
              fullPhrase="The quarterly financial report indicates that revenue increased by 15% compared to the same period last year, driven primarily by strong performance in the enterprise segment and expansion into new markets across Asia-Pacific regions."
            />
          </div>
        </div>
      </section>

      {/* Section: QuoteBox Variations */}
      <section className="mb-10" data-testid="popover-quotebox-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
          Quote Box Variations
        </h2>
        <div className="space-y-4 max-w-md">
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden p-4" data-quotebox="short">
            <div className="text-xs text-gray-500 font-mono mb-2">Short quote</div>
            <QuoteBox phrase="Revenue increased by 15%." />
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden p-4" data-quotebox="medium">
            <div className="text-xs text-gray-500 font-mono mb-2">Medium quote</div>
            <QuoteBox phrase="Revenue increased by 15% in Q4 2024, marking a significant improvement over the previous quarter's performance." />
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden p-4" data-quotebox="long">
            <div className="text-xs text-gray-500 font-mono mb-2">Long quote (truncated at 150 chars)</div>
            <QuoteBox phrase="The quarterly financial report indicates that revenue increased by 15% compared to the same period last year, driven primarily by strong performance in the enterprise segment and expansion into new markets across Asia-Pacific regions with additional growth expected in the coming fiscal year." />
          </div>
        </div>
      </section>

      {/* Section: Verification Log - All States */}
      <section className="mb-10" data-testid="popover-verification-log-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
          Verification Log (Search Timeline)
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Collapsible log showing search attempts. Click to expand timeline.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Not Found - All failed */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" data-verification-log="not-found">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
              not_found - 6 failed attempts
            </div>
            <VerificationLog
              searchAttempts={failedSearchAttempts}
              status="not_found"
              expectedPage={5}
              expectedLine={12}
            />
          </div>

          {/* Partial - Found on different page */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" data-verification-log="partial-page">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
              found_on_other_page - found on page 7
            </div>
            <VerificationLog
              searchAttempts={partialMatchSearchAttempts}
              status="found_on_other_page"
              expectedPage={5}
              foundPage={7}
            />
          </div>

          {/* Partial - Found on different line */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" data-verification-log="partial-line">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
              found_on_other_line - expected line 12, found line 45
            </div>
            <VerificationLog
              searchAttempts={[
                {
                  method: "exact_line_match",
                  success: false,
                  searchPhrase: "Revenue increased by 15%",
                  searchPhraseType: "full_phrase",
                  pageSearched: 5,
                  lineSearched: 12,
                  note: "not found on expected line",
                },
                {
                  method: "current_page",
                  success: true,
                  searchPhrase: "Revenue increased by 15%",
                  searchPhraseType: "full_phrase",
                  pageSearched: 5,
                  lineSearched: 45,
                  matchedText: "Revenue increased by 15%",
                  note: "found on different line",
                },
              ]}
              status="found_on_other_line"
              expectedPage={5}
              expectedLine={12}
              foundPage={5}
              foundLine={45}
            />
          </div>

          {/* Low trust - First word only */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" data-verification-log="low-trust">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
              first_word_found - low confidence
            </div>
            <VerificationLog
              searchAttempts={lowTrustSearchAttempts}
              status="first_word_found"
              expectedPage={5}
              foundPage={3}
            />
          </div>
        </div>
      </section>

      {/* Section: Verification Log - Expanded State */}
      <section className="mb-10" data-testid="popover-verification-log-expanded-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
          Verification Log (Expanded Timeline)
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Pre-expanded to show the full search attempt timeline
        </p>
        <div className="max-w-md">
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" data-verification-log="expanded">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 font-mono">
              not_found - expanded timeline
            </div>
            <VerificationLog
              searchAttempts={failedSearchAttempts}
              status="not_found"
              expectedPage={5}
              expectedLine={12}
              isExpanded={true}
            />
          </div>
        </div>
      </section>

      {/* Section: Complete Popover Layouts */}
      <section className="mb-10" data-testid="popover-complete-layouts-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
          Complete Popover Layouts
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Full popover content as rendered in the actual tooltip
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Verified with image */}
          <div data-complete-popover="verified-with-image">
            <div className="text-xs text-gray-500 font-mono mb-2">Verified (green) - with image + expandable log</div>
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" style={{ width: "380px", maxWidth: "90vw" }}>
              <StatusHeader status="found" foundPage={5} expectedPage={5} />
              <div className="p-2">
                <div className="group block relative overflow-hidden rounded-md bg-gray-50 dark:bg-gray-800 w-full">
                  <img
                    src={sampleImage}
                    alt="Citation verification"
                    className="block rounded-md w-full"
                    style={{ maxHeight: "min(50vh, 300px)", objectFit: "contain", minHeight: "100px", backgroundColor: "#22c55e" }}
                  />
                  <span className="absolute left-0 right-0 bottom-0 flex items-center justify-end px-2 pb-1.5 pt-4 bg-gradient-to-t from-black/50 to-transparent rounded-b-md">
                    <span className="text-xs text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      Click to expand
                    </span>
                  </span>
                </div>
              </div>
              {/* Expandable search details for verified matches */}
              <VerificationLog
                searchAttempts={[
                  {
                    method: "exact_line_match",
                    success: true,
                    searchPhrase: "Revenue increased by 15% in Q4 2024.",
                    searchPhraseType: "full_phrase",
                    pageSearched: 5,
                    lineSearched: 12,
                    matchedText: "Revenue increased by 15% in Q4 2024.",
                  },
                ]}
                status="found"
                expectedPage={5}
                expectedLine={12}
                foundPage={5}
                foundLine={12}
              />
            </div>
          </div>

          {/* Partial match with image */}
          <div data-complete-popover="partial-with-image">
            <div className="text-xs text-gray-500 font-mono mb-2">Partial (amber) - with image + log</div>
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" style={{ width: "380px", maxWidth: "90vw" }}>
              <StatusHeader status="found_on_other_page" foundPage={7} expectedPage={5} />
              <div className="p-2">
                <div className="group block relative overflow-hidden rounded-md bg-gray-50 dark:bg-gray-800 w-full">
                  <img
                    src={sampleImage}
                    alt="Citation verification"
                    className="block rounded-md w-full"
                    style={{ maxHeight: "min(50vh, 300px)", objectFit: "contain", minHeight: "100px", backgroundColor: "#f59e0b" }}
                  />
                </div>
              </div>
              <VerificationLog
                searchAttempts={partialMatchSearchAttempts}
                status="found_on_other_page"
                expectedPage={5}
                foundPage={7}
              />
            </div>
          </div>

          {/* Not found without image */}
          <div data-complete-popover="not-found-no-image">
            <div className="text-xs text-gray-500 font-mono mb-2">Not Found (red) - no image, combined header</div>
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" style={{ width: "380px", maxWidth: "90vw" }}>
              <StatusHeader
                status="not_found"
                expectedPage={5}
                anchorText="increased by 15%"
                fullPhrase="Revenue increased by 15% in Q4 2024."
              />
              <VerificationLog
                searchAttempts={failedSearchAttempts}
                status="not_found"
                expectedPage={5}
                expectedLine={12}
              />
            </div>
          </div>

          {/* Text-only fallback */}
          <div data-complete-popover="text-only">
            <div className="text-xs text-gray-500 font-mono mb-2">Text-only fallback (no image)</div>
            <div className="p-3 flex flex-col gap-2 min-w-[180px] max-w-full border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
              <span className="text-xs font-medium text-green-600 dark:text-green-500">
                Verified Match
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300 italic">
                "Revenue increased by 15% in Q4 2024."
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Page 5
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Section: Interactive Popover Examples */}
      <section className="mb-10" data-testid="popover-interactive-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
          Interactive Popover Examples
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Hover over citations to see the actual popover behavior
        </p>
        <div className="flex flex-wrap gap-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-2" data-interactive-popover="verified">
            <span className="text-sm text-gray-600 dark:text-gray-400">Verified:</span>
            <CitationComponent
              citation={baseCitation}
              verification={verifiedVerification}
              variant="brackets"
            />
          </div>
          <div className="flex items-center gap-2" data-interactive-popover="partial">
            <span className="text-sm text-gray-600 dark:text-gray-400">Partial:</span>
            <CitationComponent
              citation={baseCitation}
              verification={partialWithAudit}
              variant="brackets"
            />
          </div>
          <div className="flex items-center gap-2" data-interactive-popover="not-found">
            <span className="text-sm text-gray-600 dark:text-gray-400">Not Found:</span>
            <CitationComponent
              citation={baseCitation}
              verification={notFoundWithAudit}
              variant="brackets"
            />
          </div>
          <div className="flex items-center gap-2" data-interactive-popover="pending">
            <span className="text-sm text-gray-600 dark:text-gray-400">Pending:</span>
            <CitationComponent
              citation={baseCitation}
              verification={pendingVerification}
              variant="brackets"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// Export the URL statuses for tests
export { allUrlStatuses, allVerificationStatuses };
