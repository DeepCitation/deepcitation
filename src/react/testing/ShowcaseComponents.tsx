import type React from "react";
import { useState } from "react";
import type { Citation } from "../../types/citation";
import type { SearchAttempt } from "../../types/search";
import type { Verification } from "../../types/verification";
import { CitationComponent } from "../CitationComponent";
import { CitationDrawer, CitationDrawerItemComponent } from "../CitationDrawer";
import type { CitationDrawerItem } from "../CitationDrawer.types";
import { groupCitationsBySource } from "../CitationDrawer.utils";
import { CitationDrawerTrigger } from "../CitationDrawerTrigger";
import { SpinnerIcon } from "../icons";
import type { UrlCitationMeta } from "../types";
import { UrlCitationComponent } from "../UrlCitationComponent";
import { QuoteBox, StatusHeader, VerificationLog } from "../VerificationLog";
import { allUrlStatuses, allVerificationStatuses } from "./ShowcaseFixtures";

// =============================================================================
// SHOWCASE LABEL COMPONENTS
// =============================================================================

/** Label showing component name, variant, and UX intent */
interface ShowcaseLabelProps {
  component: string;
  variant?: string;
  state?: string;
  uxIntent: string;
}

function ShowcaseLabel({ component, variant, state, uxIntent }: ShowcaseLabelProps) {
  return (
    <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <span className="font-semibold text-blue-600 dark:text-blue-400">{component}</span>
        {variant && (
          <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded font-mono">
            {variant}
          </span>
        )}
        {state && (
          <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded font-mono">
            {state}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">{uxIntent}</p>
    </div>
  );
}

/** Label showing available interactions */
interface InteractionLabelProps {
  hover?: string;
  click?: string;
  secondClick?: string;
  escapeKey?: string;
  children?: React.ReactNode;
}

function InteractionLabel({ hover, click, secondClick, escapeKey, children }: InteractionLabelProps) {
  return (
    <div className="mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-700">
      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
        Interactions
      </p>
      <ul className="text-[10px] text-gray-500 dark:text-gray-400 space-y-0.5">
        {hover && (
          <li>
            <span className="font-medium text-gray-600 dark:text-gray-300">Hover:</span> {hover}
          </li>
        )}
        {click && (
          <li>
            <span className="font-medium text-gray-600 dark:text-gray-300">Click:</span> {click}
          </li>
        )}
        {secondClick && (
          <li>
            <span className="font-medium text-gray-600 dark:text-gray-300">2nd Click:</span> {secondClick}
          </li>
        )}
        {escapeKey && (
          <li>
            <span className="font-medium text-gray-600 dark:text-gray-300">Escape:</span> {escapeKey}
          </li>
        )}
        {children}
      </ul>
    </div>
  );
}

/** Section container with title and description */
interface ShowcaseSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  "data-testid"?: string;
}

function ShowcaseSection({ title, description, children, "data-testid": testId }: ShowcaseSectionProps) {
  return (
    <section className="mb-10" data-testid={testId}>
      <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">{title}</h2>
      {description && <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{description}</p>}
      {children}
    </section>
  );
}

/** Card container for individual showcase items */
interface ShowcaseCardProps {
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

function ShowcaseCard({
  children,
  className = "",
  "data-testid": testId,
  ...dataProps
}: ShowcaseCardProps & Record<`data-${string}`, string | undefined>) {
  return (
    <div
      className={`p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 ${className}`}
      data-testid={testId}
      {...dataProps}
    >
      {children}
    </div>
  );
}

// =============================================================================
// CONSTANTS - Variant and Status Arrays (extracted to prevent re-creation on render)
// =============================================================================

/** All citation variant types */
const CITATION_VARIANTS = ["brackets", "chip", "text", "superscript", "linter"] as const;

/** Mobile-friendly citation variants */
const MOBILE_CITATION_VARIANTS = ["brackets", "chip", "superscript", "linter"] as const;

/** Content type options */
const CONTENT_TYPES = ["number", "anchorText", "indicator"] as const;

/** URL citation variant types */
const URL_VARIANTS = ["badge", "chip", "inline", "bracket"] as const;

/** Mobile URL status examples */
const MOBILE_URL_STATUSES = ["verified", "blocked_login", "error_not_found"] as const;

/** Border color mapping for status headers */
const BORDER_COLOR_MAP: Record<string, string> = {
  green: "border-green-200 dark:border-green-800",
  amber: "border-amber-200 dark:border-amber-800",
  red: "border-red-200 dark:border-red-800",
};

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
  fullPhrase:
    "The quarterly financial report indicates that revenue increased by 15% compared to the same period last year, driven primarily by strong performance in the enterprise segment.",
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
  verificationImageBase64:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
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
// TEST FIXTURES - URL Citations
// =============================================================================

const urlCitation: Citation = {
  type: "url",
  url: "https://www.fitandwell.com/features/kettlebell-moves",
  domain: "fitandwell.com",
  title: "Build muscular arms with kettlebell moves",
  fullPhrase: "The TGU transitions and Halos require control, not brute strength.",
  anchorText: "require control, not brute strength",
  citationNumber: 1,
};

const urlVerifiedVerification: Verification = {
  status: "found",
  verifiedPageNumber: 1,
  verifiedMatchSnippet: "The TGU transitions and Halos require control, not brute strength.",
  verificationImageBase64:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
};

const urlNotFoundVerification: Verification = {
  status: "not_found",
  verifiedPageNumber: -1,
  searchAttempts: failedSearchAttempts,
};

// =============================================================================
// TEST FIXTURES - Enhanced Audit Display (with variations and rejected matches)
// =============================================================================

/** Example: Search with spelling variations (auditor use case - spot differences like Colour/color) */
const searchWithVariations: SearchAttempt[] = [
  {
    method: "exact_line_match",
    success: false,
    searchPhrase: "Patient is allergic to penicillin",
    searchPhraseType: "full_phrase",
    searchVariations: ["Patient is allergic to Penicillin", "patient is allergic to penicillin"],
    pageSearched: 1,
    note: "not found on expected page",
  },
  {
    method: "current_page",
    success: false,
    searchPhrase: "Patient is allergic to penicillin",
    searchPhraseType: "full_phrase",
    searchVariations: ["Patient is allergic to Penicillin"],
    pageSearched: 1,
  },
  {
    method: "adjacent_pages",
    success: false,
    searchPhrase: "Patient is allergic to penicillin",
    searchPhraseType: "full_phrase",
    pageSearched: 2,
  },
  {
    method: "adjacent_pages",
    success: false,
    searchPhrase: "Patient is allergic to penicillin",
    searchPhraseType: "full_phrase",
    pageSearched: 3,
  },
  {
    method: "anchor_text_fallback",
    success: false,
    searchPhrase: "allergic to penicillin",
    searchPhraseType: "anchor_text",
    searchVariations: ["allergic to Penicillin", "penicillin allergy"],
    pageSearched: 1,
  },
  {
    method: "expanded_window",
    success: false,
    searchPhrase: "allergic to penicillin",
    searchPhraseType: "anchor_text",
    searchScope: "document",
    note: "searched entire document",
  },
  {
    method: "regex_search",
    success: false,
    searchPhrase: "allergic to penicillin",
    searchPhraseType: "anchor_text",
    searchScope: "document",
  },
  {
    method: "first_word_fallback",
    success: false,
    searchPhrase: "allergic",
    searchPhraseType: "anchor_text",
    searchScope: "document",
  },
];

const notFoundWithVariations: Verification = {
  status: "not_found",
  verifiedPageNumber: -1,
  searchAttempts: searchWithVariations,
};

/** Example: False positives - text found but rejected (e.g., "$0.00" found many times) */
const searchWithRejectedMatches: SearchAttempt[] = [
  {
    method: "exact_line_match",
    success: false,
    searchPhrase: "Total cost is $0.00",
    searchPhraseType: "full_phrase",
    pageSearched: 5,
    note: "phrase not found at expected location",
  },
  {
    method: "current_page",
    success: false,
    searchPhrase: "Total cost is $0.00",
    searchPhraseType: "full_phrase",
    pageSearched: 5,
    matchedText: "$0.00",
    note: "partial match rejected - context mismatch",
  },
  {
    method: "anchor_text_fallback",
    success: false,
    searchPhrase: "$0.00",
    searchPhraseType: "anchor_text",
    searchVariations: ["0.00", "$0"],
    pageSearched: 5,
    matchedText: "$0.00",
    note: "found 15 occurrences, none in correct context",
  },
  {
    method: "expanded_window",
    success: false,
    searchPhrase: "$0.00",
    searchPhraseType: "anchor_text",
    searchScope: "document",
    matchedText: "$0.00",
    note: "all matches rejected - wrong context",
  },
];

const notFoundWithRejectedMatches: Verification = {
  status: "not_found",
  verifiedPageNumber: -1,
  searchAttempts: searchWithRejectedMatches,
};

/** Example: Many pages searched (tests page collapsing UI) */
const searchManyPages: SearchAttempt[] = [
  {
    method: "exact_line_match",
    success: false,
    searchPhrase: "Quarterly earnings report",
    searchPhraseType: "full_phrase",
    pageSearched: 1,
  },
  {
    method: "adjacent_pages",
    success: false,
    searchPhrase: "Quarterly earnings report",
    searchPhraseType: "full_phrase",
    pageSearched: 2,
  },
  {
    method: "adjacent_pages",
    success: false,
    searchPhrase: "Quarterly earnings report",
    searchPhraseType: "full_phrase",
    pageSearched: 3,
  },
  {
    method: "expanded_window",
    success: false,
    searchPhrase: "Quarterly earnings report",
    searchPhraseType: "full_phrase",
    pageSearched: 4,
  },
  {
    method: "expanded_window",
    success: false,
    searchPhrase: "Quarterly earnings report",
    searchPhraseType: "full_phrase",
    pageSearched: 5,
  },
  {
    method: "expanded_window",
    success: false,
    searchPhrase: "Quarterly earnings report",
    searchPhraseType: "full_phrase",
    pageSearched: 6,
  },
  {
    method: "expanded_window",
    success: false,
    searchPhrase: "Quarterly earnings report",
    searchPhraseType: "full_phrase",
    pageSearched: 7,
  },
  {
    method: "expanded_window",
    success: false,
    searchPhrase: "Quarterly earnings report",
    searchPhraseType: "full_phrase",
    pageSearched: 8,
  },
];

const notFoundManyPages: Verification = {
  status: "not_found",
  verifiedPageNumber: -1,
  searchAttempts: searchManyPages,
};

// =============================================================================
// VISUAL SHOWCASE COMPONENT
// =============================================================================

export function VisualShowcase() {
  return (
    <div className="p-6 bg-white dark:bg-gray-900 min-h-screen" data-testid="visual-showcase">
      <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Citation Component Visual Showcase</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Visual reference for all citation component variants, states, and configurations
      </p>

      {/* Section: All Variants x All States */}
      <ShowcaseSection
        title="All Variants × All States"
        description="Matrix showing every visual variant combined with every verification state"
        data-testid="variants-section"
      >
        <ShowcaseCard data-testid="variants-matrix">
          <ShowcaseLabel
            component="CitationComponent"
            uxIntent="Display inline citations with verification status - visual variants for different contexts"
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left p-2 text-gray-600 dark:text-gray-400">Variant</th>
                  <th className="text-left p-2 text-gray-600 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      Verified
                    </span>
                  </th>
                  <th className="text-left p-2 text-gray-600 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      Partial
                    </span>
                  </th>
                  <th className="text-left p-2 text-gray-600 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      Not Found
                    </span>
                  </th>
                  <th className="text-left p-2 text-gray-600 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                      Pending
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {CITATION_VARIANTS.map(variant => (
                  <tr
                    key={variant}
                    className="border-b border-gray-100 dark:border-gray-800"
                    data-variant-row={variant}
                  >
                    <td className="p-2 font-mono text-gray-700 dark:text-gray-300 text-xs">{variant}</td>
                    <td className="p-2">
                      <CitationComponent
                        citation={baseCitation}
                        verification={verifiedVerification}
                        variant={variant}
                      />
                    </td>
                    <td className="p-2">
                      <CitationComponent citation={baseCitation} verification={partialVerification} variant={variant} />
                    </td>
                    <td className="p-2">
                      <CitationComponent
                        citation={baseCitation}
                        verification={notFoundVerification}
                        variant={variant}
                      />
                    </td>
                    <td className="p-2">
                      <CitationComponent citation={baseCitation} verification={pendingVerification} variant={variant} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InteractionLabel
            hover="Highlight effect on component"
            click="Opens popover with verification details"
            secondClick="Toggles search details expansion in popover"
            escapeKey="Closes popover"
          />
        </ShowcaseCard>
      </ShowcaseSection>

      {/* Section: Content Types */}
      <ShowcaseSection
        title="Content Types"
        description="What text/content is displayed inside the citation component"
        data-testid="content-section"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {CONTENT_TYPES.map(content => (
            <ShowcaseCard key={content} data-content-type={content}>
              <ShowcaseLabel
                component="CitationComponent"
                variant="brackets"
                state={content}
                uxIntent={
                  content === "number"
                    ? "Show citation number (e.g., [1]) - compact, academic style"
                    : content === "anchorText"
                      ? "Show the cited text excerpt - descriptive, inline context"
                      : "Show only status indicator - minimal, non-intrusive"
                }
              />
              <div className="py-2">
                <CitationComponent
                  citation={baseCitation}
                  verification={verifiedVerification}
                  variant="brackets"
                  content={content}
                />
              </div>
            </ShowcaseCard>
          ))}
        </div>
      </ShowcaseSection>

      {/* Section: showIndicator prop */}
      <ShowcaseSection
        title="showIndicator Prop"
        description="Control whether the status indicator (checkmark, warning, spinner) is shown"
        data-testid="show-indicator-section"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ShowcaseCard data-show-indicator="default">
            <ShowcaseLabel
              component="CitationComponent"
              variant="brackets"
              state="showIndicator=true"
              uxIntent="Default - shows verification status icon"
            />
            <div className="py-2">
              <CitationComponent citation={baseCitation} verification={verifiedVerification} variant="brackets" />
            </div>
          </ShowcaseCard>
          <ShowcaseCard data-show-indicator="false">
            <ShowcaseLabel
              component="CitationComponent"
              variant="brackets"
              state="showIndicator=false"
              uxIntent="Hide indicator - cleaner look, status via popover only"
            />
            <div className="py-2">
              <CitationComponent
                citation={baseCitation}
                verification={verifiedVerification}
                variant="brackets"
                showIndicator={false}
              />
            </div>
          </ShowcaseCard>
          <ShowcaseCard data-show-indicator="chip-on">
            <ShowcaseLabel
              component="CitationComponent"
              variant="chip"
              state="showIndicator=true"
              uxIntent="Chip with indicator - prominent status display"
            />
            <div className="py-2">
              <CitationComponent citation={baseCitation} verification={verifiedVerification} variant="chip" />
            </div>
          </ShowcaseCard>
          <ShowcaseCard data-show-indicator="chip-off">
            <ShowcaseLabel
              component="CitationComponent"
              variant="chip"
              state="showIndicator=false"
              uxIntent="Chip without indicator - badge-only appearance"
            />
            <div className="py-2">
              <CitationComponent
                citation={baseCitation}
                verification={verifiedVerification}
                variant="chip"
                showIndicator={false}
              />
            </div>
          </ShowcaseCard>
        </div>
      </ShowcaseSection>

      {/* Section: Long Text Handling */}
      <ShowcaseSection
        title="Long Text Handling"
        description="How components handle long anchor text content"
        data-testid="long-text-section"
      >
        <div className="space-y-4">
          <ShowcaseCard>
            <ShowcaseLabel
              component="CitationComponent"
              variant="chip"
              state="long anchorText"
              uxIntent="Chip truncates long text to prevent layout breaking"
            />
            <div className="py-2">
              <CitationComponent
                citation={longCitation}
                verification={verifiedVerification}
                variant="chip"
                content="anchorText"
              />
            </div>
          </ShowcaseCard>
        </div>
      </ShowcaseSection>

      {/* Section: Failed Search Attempts (Audit Log) */}
      <ShowcaseSection
        title="Verification Audit Log States"
        description="Citations with different search attempt histories - helps auditors understand why verification failed"
        data-testid="audit-log-section"
      >
        <div className="space-y-4">
          <ShowcaseCard
            className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
            data-audit="not-found"
          >
            <ShowcaseLabel
              component="CitationComponent"
              variant="brackets"
              state="not_found"
              uxIntent="Not Found - shows 6 failed search attempts in popover audit log"
            />
            <div className="py-2">
              <CitationComponent citation={baseCitation} verification={notFoundWithAudit} variant="brackets" />
            </div>
            <InteractionLabel
              click="Opens popover showing 'couldn't find' status"
              secondClick="Expands search timeline showing all 6 failed attempts"
            />
          </ShowcaseCard>

          <ShowcaseCard
            className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10"
            data-audit="partial"
          >
            <ShowcaseLabel
              component="CitationComponent"
              variant="brackets"
              state="found_on_other_page"
              uxIntent="Partial Match - found on page 7 instead of expected page 5"
            />
            <div className="py-2">
              <CitationComponent citation={baseCitation} verification={partialWithAudit} variant="brackets" />
            </div>
            <InteractionLabel
              click="Opens popover showing page mismatch"
              secondClick="Expands search timeline showing where text was found"
            />
          </ShowcaseCard>

          <ShowcaseCard
            className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10"
            data-audit="low-trust"
          >
            <ShowcaseLabel
              component="CitationComponent"
              variant="brackets"
              state="first_word_found"
              uxIntent="Low Trust - only first word matched, requires manual review"
            />
            <div className="py-2">
              <CitationComponent citation={baseCitation} verification={lowTrustWithAudit} variant="brackets" />
            </div>
          </ShowcaseCard>

          <ShowcaseCard
            className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
            data-audit="with-variations"
          >
            <ShowcaseLabel
              component="CitationComponent"
              variant="brackets"
              state="not_found + variations"
              uxIntent="Spelling variations shown - helps auditor spot Penicillin/penicillin differences"
            />
            <div className="py-2">
              <CitationComponent
                citation={{
                  ...baseCitation,
                  fullPhrase: "Patient is allergic to penicillin",
                  anchorText: "allergic to penicillin",
                }}
                verification={notFoundWithVariations}
                variant="brackets"
              />
            </div>
          </ShowcaseCard>

          <ShowcaseCard
            className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
            data-audit="rejected-matches"
          >
            <ShowcaseLabel
              component="CitationComponent"
              variant="brackets"
              state="not_found + rejected"
              uxIntent="Shows why matches were rejected - $0.00 found but wrong context"
            />
            <div className="py-2">
              <CitationComponent
                citation={{
                  ...baseCitation,
                  fullPhrase: "Total cost is $0.00",
                  anchorText: "$0.00",
                }}
                verification={notFoundWithRejectedMatches}
                variant="brackets"
              />
            </div>
          </ShowcaseCard>

          <ShowcaseCard
            className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
            data-audit="many-pages"
          >
            <ShowcaseLabel
              component="CitationComponent"
              variant="brackets"
              state="not_found + many pages"
              uxIntent="Many pages searched - tests UI collapsing of page numbers"
            />
            <div className="py-2">
              <CitationComponent
                citation={{
                  ...baseCitation,
                  fullPhrase: "Quarterly earnings report",
                  anchorText: "earnings report",
                }}
                verification={notFoundManyPages}
                variant="brackets"
              />
            </div>
          </ShowcaseCard>
        </div>
      </ShowcaseSection>

      {/* Section: URL Citations - All Statuses */}
      <ShowcaseSection
        title="URL Citations - All Fetch Statuses"
        description="URL citation component showing all possible fetch/verification states"
        data-testid="url-section"
      >
        <ShowcaseCard>
          <ShowcaseLabel
            component="UrlCitationComponent"
            uxIntent="Display URL source references with fetch status indicators"
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {allUrlStatuses.map(({ status, description }) => {
              const meta: UrlCitationMeta = {
                url: `https://example.com/${status}`,
                domain: "example.com",
                title: `${description} Article`,
                fetchStatus: status,
              };
              return (
                <div key={status} className="p-2 bg-gray-50 dark:bg-gray-800 rounded" data-url-status={status}>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1 font-mono truncate">{status}</p>
                  <UrlCitationComponent urlMeta={meta} />
                </div>
              );
            })}
          </div>
          <InteractionLabel hover="Shows domain/title tooltip" click="Opens URL in new tab (where applicable)" />
        </ShowcaseCard>
      </ShowcaseSection>

      {/* Section: URL Citation Variants */}
      <ShowcaseSection
        title="URL Citation Variants"
        description="Different visual styles for URL citations"
        data-testid="url-variants-section"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {URL_VARIANTS.map(variant => {
            const meta: UrlCitationMeta = {
              url: "https://docs.example.com/api/v2/citations",
              domain: "docs.example.com",
              title: "Citation API Documentation",
              fetchStatus: "verified",
            };
            return (
              <ShowcaseCard key={variant} data-url-variant={variant}>
                <ShowcaseLabel
                  component="UrlCitationComponent"
                  variant={variant}
                  uxIntent={
                    variant === "badge"
                      ? "Bordered badge with favicon - clean, prominent"
                      : variant === "chip"
                        ? "Pill/badge style with background color"
                        : variant === "inline"
                          ? "Underlined inline link - flows with text"
                          : "Square brackets - monospace, compact"
                  }
                />
                <div className="py-2">
                  <UrlCitationComponent urlMeta={meta} variant={variant} />
                </div>
              </ShowcaseCard>
            );
          })}
        </div>
      </ShowcaseSection>

      {/* Section: Inline Usage Context */}
      <ShowcaseSection
        title="Inline Usage Context"
        description="How citations appear in flowing paragraph text"
        data-testid="inline-context-section"
      >
        <ShowcaseCard>
          <ShowcaseLabel
            component="CitationComponent"
            variant="superscript"
            uxIntent="Superscript citations for academic/footnote style inline references"
          />
          <div className="py-4 text-gray-700 dark:text-gray-300">
            <p className="leading-relaxed">
              According to the Q4 financial report, the company saw significant growth
              <CitationComponent citation={baseCitation} verification={verifiedVerification} variant="superscript" />
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
          <InteractionLabel
            hover="Subtle highlight on superscript"
            click="Opens popover positioned near the superscript"
          />
        </ShowcaseCard>
      </ShowcaseSection>
    </div>
  );
}

// =============================================================================
// MOBILE SHOWCASE COMPONENT
// =============================================================================

export function MobileShowcase() {
  return (
    <div className="p-4 bg-white dark:bg-gray-900 min-h-screen" data-testid="mobile-showcase">
      <h1 className="text-lg font-bold mb-1 text-gray-900 dark:text-white">Mobile View (375px)</h1>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Testing overflow handling and touch interactions on mobile viewports
      </p>

      {/* Compact variants for mobile */}
      <section className="mb-6" data-testid="mobile-variants">
        <h2 className="text-sm font-semibold mb-1 text-gray-800 dark:text-gray-200">Citation Variants</h2>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">
          All variants should fit within 375px width without horizontal scroll
        </p>
        <div className="space-y-2">
          {MOBILE_CITATION_VARIANTS.map(variant => (
            <div
              key={variant}
              className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded"
              data-mobile-variant={variant}
            >
              <span className="text-xs text-gray-500 dark:text-gray-400 w-20 font-mono shrink-0">{variant}</span>
              <CitationComponent citation={baseCitation} verification={verifiedVerification} variant={variant} />
            </div>
          ))}
        </div>
        <div className="mt-2 p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded text-[10px] text-gray-500 dark:text-gray-400">
          <strong>Interaction:</strong> Tap to open popover (touch-friendly tap targets)
        </div>
      </section>

      {/* URL citations mobile */}
      <section className="mb-6" data-testid="mobile-urls">
        <h2 className="text-sm font-semibold mb-1 text-gray-800 dark:text-gray-200">URL Citations</h2>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">
          Long URLs should truncate with ellipsis, not cause overflow
        </p>
        <div className="space-y-2">
          {MOBILE_URL_STATUSES.map(status => {
            const meta: UrlCitationMeta = {
              url: `https://very-long-domain-name.example.com/path/to/article/${status}`,
              fetchStatus: status,
            };
            return (
              <div key={status} className="p-2 bg-gray-50 dark:bg-gray-800 rounded" data-mobile-url={status}>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1 font-mono">{status}</p>
                <UrlCitationComponent urlMeta={meta} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Inline text on mobile */}
      <section data-testid="mobile-inline">
        <h2 className="text-sm font-semibold mb-1 text-gray-800 dark:text-gray-200">Inline Text</h2>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">
          Superscript citations should flow naturally with paragraph text
        </p>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
          <p>
            The report shows growth
            <CitationComponent citation={baseCitation} verification={verifiedVerification} variant="superscript" />
            but some data is unverified
            <CitationComponent
              citation={{ ...baseCitation, citationNumber: 2 }}
              verification={notFoundVerification}
              variant="superscript"
            />
            .
          </p>
        </div>
        <div className="mt-2 p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded text-[10px] text-gray-500 dark:text-gray-400">
          <strong>Touch:</strong> Tap superscript to open popover positioned for mobile viewport
        </div>
      </section>
    </div>
  );
}

// =============================================================================
// POPOVER SHOWCASE COMPONENT
// =============================================================================

/** Sample verification image (1x1 green pixel base64) */
const sampleImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QzwAEjDAGNzYAAIoaB1HkOzVfAAAAAElFTkSuQmCC";

/** Larger sample image for overlay showcase (10x10 gradient) */
const sampleLargeImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAABhGlDQ1BJQ0MgcHJvZmlsZQAAKJF9kT1Iw0AcxV9TpSIVh3YQcchQnSyIijhqFYpQIdQKrTqYXPoFTRqSFBdHwbXg4Mdi1cHFWVcHV0EQ/ABxdnBSdJES/5cUWsR4cNyPd/ced+8AoV5mmtUxDmi6baYScTGTXRW7XhFACCPow4DMzDJmJSkJz/F1Dx9f72I8y/vcn6NHzVkM8InEs8wwbeIN4ulN2+C8TxxhRVklPiceM+mCxI9cVzx+41x0WeCZETOTmiOOEIuFNlbamBVNjXiSOKrqOuULGZcVzluctUqNte7JXxjO6SvLXKc5jAQWsQQJIhRUUUIZNuK06qRYSNN+wsc/5PolcinkKoORYwFVaJBdP/gf/O7WKkxOuEmhOND54jgfI0DXLtCoOc73seM0TgD/M3Clt/2VOjDzSXqtpUWPgP5t4OK6pSl7wOUOMPhkyKbclPy0hHweeD+jb8oC4VugZ83trbmP0wcgTV0lboCDQ2C0QNlrPu8Oa+3t3xOe/z4AGLHK2OQonFUAAAAGYktHRAD/AP8A/6C9p5MAAAAJcEhZcwAALiMAAC4jAXilP3YAAAAHdElNRQfnAQcSECJJXaGLAAAAGXRFWHRDb21tZW50AENyZWF0ZWQgd2l0aCBHSU1QV4EOFwAAAMVJREFUeNrt3UEKgCAQQFHr/neurdKFIEjN6D9XQjqzGh1DCAAAAAAAAAAAAAAAAAAAAAAAAACg28y6A2K9tY1JvTt7G5N6d/Y2JvXu7G1M6t3Z25jUu7O3Mal3Z29jUu/O3sak3p29jUm9O3sbk3p39jYm9e7sbUzq3dnbmNS7s7cxqXdnb2NS787exqTenb2NSb07exuTenf2Nib17uxtTOrd2duY1Luzty01t+7O3sak3p29jUm9O3sbk3p39jYm9e7sbbYAAAAAAAAAAAAAgP+6ASOpIU/l2DejAAAAAElFTkSuQmCC";

/**
 * Showcase component for testing all popover/tooltip states.
 * Displays the inner popover content directly (without hover interaction)
 * to allow visual verification of all states.
 */
export function PopoverShowcase() {
  return (
    <div className="p-6 bg-white dark:bg-gray-900 min-h-screen" data-testid="popover-showcase">
      <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
        Popover & Sub-Components Visual Showcase
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Visual reference for all popover states, sub-components, and interactive behaviors
      </p>

      {/* ========================================================================
          SECTION: Loading/Pending States
          ======================================================================== */}
      <ShowcaseSection
        title="1. Loading/Pending States"
        description="Popover content shown while verification is in progress"
        data-testid="popover-pending-section"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ShowcaseCard data-popover-state="pending">
            <ShowcaseLabel
              component="PopoverContent"
              state="pending"
              uxIntent="Show search progress - phrase being searched and target page"
            />
            <div className="p-3 flex flex-col gap-2 min-w-[200px] max-w-[400px] bg-gray-50 dark:bg-gray-800 rounded">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                <span className="inline-block relative top-[0.1em] mr-1.5 size-3 animate-spin">
                  <SpinnerIcon />
                </span>
                Searching...
              </span>
              <p className="p-2 bg-gray-100 dark:bg-gray-700 rounded font-mono text-[11px] break-words text-gray-600 dark:text-gray-400 italic">
                "Revenue increased by 15% in Q4 2024."
              </p>
              <span className="text-xs text-gray-500 dark:text-gray-400">Looking on page 5</span>
            </div>
          </ShowcaseCard>

          <ShowcaseCard data-popover-state="loading-long">
            <ShowcaseLabel
              component="PopoverContent"
              state="pending + long phrase"
              uxIntent="Long phrases are truncated with ellipsis to fit popover width"
            />
            <div className="p-3 flex flex-col gap-2 min-w-[200px] max-w-[400px] bg-gray-50 dark:bg-gray-800 rounded">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                <span className="inline-block relative top-[0.1em] mr-1.5 size-3 animate-spin">
                  <SpinnerIcon />
                </span>
                Searching...
              </span>
              <p className="p-2 bg-gray-100 dark:bg-gray-700 rounded font-mono text-[11px] break-words text-gray-600 dark:text-gray-400 italic">
                "The quarterly financial report indicates that revenue increased by 15% compared…"
              </p>
              <span className="text-xs text-gray-500 dark:text-gray-400">Looking on page 12</span>
            </div>
          </ShowcaseCard>
        </div>
      </ShowcaseSection>

      {/* ========================================================================
          SECTION: StatusHeader Sub-Component
          ======================================================================== */}
      <ShowcaseSection
        title="2. StatusHeader Sub-Component"
        description="Header row showing verification status with icon and page information"
        data-testid="popover-status-headers-section"
      >
        <ShowcaseCard className="mb-4">
          <ShowcaseLabel
            component="StatusHeader"
            uxIntent="Communicate verification result at a glance - color-coded status with page context"
          />
          <InteractionLabel>
            <li className="text-[10px]">
              <span className="font-medium text-gray-600 dark:text-gray-300">Colors:</span>{" "}
              <span className="text-green-600">Green</span>=verified, <span className="text-amber-600">Amber</span>
              =partial/mismatch, <span className="text-red-600">Red</span>=not found,{" "}
              <span className="text-gray-500">Gray</span>=pending
            </li>
          </InteractionLabel>
        </ShowcaseCard>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allVerificationStatuses.map(({ status, description, color }) => {
            const isUnexpectedLocation = status === "found_on_other_page" || status === "found_on_other_line";
            const foundPage =
              status !== "not_found" && status !== "pending" && status !== "loading"
                ? isUnexpectedLocation
                  ? 7
                  : 5
                : undefined;
            const expectedPage = 5;
            const borderColor = BORDER_COLOR_MAP[color] ?? "border-gray-200 dark:border-gray-700";

            return (
              <ShowcaseCard key={status} className={borderColor} data-status-header={status}>
                <ShowcaseLabel component="StatusHeader" state={status} uxIntent={description} />
                <div className="mt-2 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                  <StatusHeader
                    status={status}
                    foundPage={foundPage}
                    expectedPage={expectedPage}
                    anchorText="revenue increased by 15%"
                  />
                </div>
              </ShowcaseCard>
            );
          })}
        </div>
      </ShowcaseSection>

      {/* ========================================================================
          SECTION: QuoteBox Sub-Component
          ======================================================================== */}
      <ShowcaseSection
        title="3. QuoteBox Sub-Component"
        description="Displays the cited phrase in a styled quote box"
        data-testid="popover-quotebox-section"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ShowcaseCard data-quotebox="short">
            <ShowcaseLabel
              component="QuoteBox"
              state="short"
              uxIntent="Brief citation - displays fully without truncation"
            />
            <div className="mt-2">
              <QuoteBox phrase="Revenue increased by 15%." />
            </div>
          </ShowcaseCard>

          <ShowcaseCard data-quotebox="medium">
            <ShowcaseLabel
              component="QuoteBox"
              state="medium"
              uxIntent="Medium-length citation - may wrap to multiple lines"
            />
            <div className="mt-2">
              <QuoteBox phrase="Revenue increased by 15% in Q4 2024, marking a significant improvement over the previous quarter's performance." />
            </div>
          </ShowcaseCard>

          <ShowcaseCard data-quotebox="long">
            <ShowcaseLabel
              component="QuoteBox"
              state="long (truncated)"
              uxIntent="Long citation - truncated at ~150 chars with ellipsis"
            />
            <div className="mt-2">
              <QuoteBox phrase="The quarterly financial report indicates that revenue increased by 15% compared to the same period last year, driven primarily by strong performance in the enterprise segment and expansion into new markets across Asia-Pacific regions with additional growth expected in the coming fiscal year." />
            </div>
          </ShowcaseCard>
        </div>
      </ShowcaseSection>

      {/* ========================================================================
          SECTION: VerificationLog (Search Timeline) Sub-Component
          ======================================================================== */}
      <ShowcaseSection
        title="4. VerificationLog (Search Timeline) Sub-Component"
        description="Collapsible timeline showing all search attempts - helps auditors understand verification process"
        data-testid="popover-verification-log-section"
      >
        <ShowcaseCard className="mb-4">
          <ShowcaseLabel
            component="VerificationLog"
            uxIntent="Audit trail of search attempts - shows methods tried, pages searched, and why matches were accepted/rejected"
          />
          <InteractionLabel click="Toggle expansion to show/hide full search timeline">
            <li className="text-[10px]">
              <span className="font-medium text-gray-600 dark:text-gray-300">Timeline icons:</span>{" "}
              <span className="text-green-600">●</span>=success, <span className="text-red-600">●</span>=failed attempt
            </li>
          </InteractionLabel>
        </ShowcaseCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ShowcaseCard className="border-red-200 dark:border-red-800" data-verification-log="not-found">
            <ShowcaseLabel
              component="VerificationLog"
              state="not_found"
              uxIntent="All 6 search attempts failed - collapsed view shows summary"
            />
            <div className="mt-2 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
              <VerificationLog
                searchAttempts={failedSearchAttempts}
                status="not_found"
                expectedPage={5}
                expectedLine={12}
              />
            </div>
          </ShowcaseCard>

          <ShowcaseCard className="border-amber-200 dark:border-amber-800" data-verification-log="partial-page">
            <ShowcaseLabel
              component="VerificationLog"
              state="found_on_other_page"
              uxIntent="Found on page 7 instead of expected page 5"
            />
            <div className="mt-2 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
              <VerificationLog
                searchAttempts={partialMatchSearchAttempts}
                status="found_on_other_page"
                expectedPage={5}
                foundPage={7}
              />
            </div>
          </ShowcaseCard>

          <ShowcaseCard className="border-amber-200 dark:border-amber-800" data-verification-log="partial-line">
            <ShowcaseLabel
              component="VerificationLog"
              state="found_on_other_line"
              uxIntent="Found on line 45 instead of expected line 12"
            />
            <div className="mt-2 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
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
          </ShowcaseCard>

          <ShowcaseCard className="border-amber-200 dark:border-amber-800" data-verification-log="low-trust">
            <ShowcaseLabel
              component="VerificationLog"
              state="first_word_found"
              uxIntent="Low confidence - only 'Revenue' matched, full phrase not found"
            />
            <div className="mt-2 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
              <VerificationLog
                searchAttempts={lowTrustSearchAttempts}
                status="first_word_found"
                expectedPage={5}
                foundPage={3}
              />
            </div>
          </ShowcaseCard>
        </div>
      </ShowcaseSection>

      {/* ========================================================================
          SECTION: VerificationLog - Expanded State
          ======================================================================== */}
      <ShowcaseSection
        title="5. VerificationLog (Expanded Timeline)"
        description="Full search timeline visible - shows each search method and result"
        data-testid="popover-verification-log-expanded-section"
      >
        <ShowcaseCard className="max-w-lg" data-verification-log="expanded">
          <ShowcaseLabel
            component="VerificationLog"
            state="expanded"
            uxIntent="Expanded view shows complete audit trail - each search method, phrase variation, and page checked"
          />
          <div className="mt-2 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
            <VerificationLog
              searchAttempts={failedSearchAttempts}
              status="not_found"
              expectedPage={5}
              expectedLine={12}
              isExpanded={true}
            />
          </div>
          <InteractionLabel click="Collapses back to summary view" />
        </ShowcaseCard>
      </ShowcaseSection>

      {/* ========================================================================
          SECTION: Complete Popover Layouts
          ======================================================================== */}
      <ShowcaseSection
        title="6. Complete Popover Layouts"
        description="Full popover compositions showing all sub-components together"
        data-testid="popover-complete-layouts-section"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Verified with image */}
          <ShowcaseCard data-complete-popover="verified-with-image">
            <ShowcaseLabel
              component="Popover"
              variant="verified"
              state="with image"
              uxIntent="Success state - shows verification image with 'click to expand' overlay"
            />
            <div
              className="mt-2 overflow-hidden rounded-lg border border-green-200 dark:border-green-800 bg-white dark:bg-gray-900"
              style={{ width: "380px", maxWidth: "100%" }}
            >
              <StatusHeader status="found" foundPage={5} expectedPage={5} />
              <div className="p-2">
                <div className="group block relative overflow-hidden rounded-md bg-gray-50 dark:bg-gray-800 w-full">
                  <img
                    src={sampleImage}
                    alt="Citation verification"
                    className="block rounded-md w-full"
                    style={{
                      maxHeight: "min(50vh, 300px)",
                      objectFit: "contain",
                      minHeight: "100px",
                      backgroundColor: "#22c55e",
                    }}
                  />
                  <span className="absolute left-0 right-0 bottom-0 flex items-center justify-end px-2 pb-1.5 pt-4 bg-gradient-to-t from-black/50 to-transparent rounded-b-md">
                    <span className="text-xs text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      Click to expand
                    </span>
                  </span>
                </div>
              </div>
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
            <InteractionLabel click="Opens full-screen image overlay" secondClick="Toggles search details expansion" />
          </ShowcaseCard>

          {/* Partial match with image */}
          <ShowcaseCard data-complete-popover="partial-with-image">
            <ShowcaseLabel
              component="Popover"
              variant="partial"
              state="with image"
              uxIntent="Partial match - amber status indicates location mismatch"
            />
            <div
              className="mt-2 overflow-hidden rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900"
              style={{ width: "380px", maxWidth: "100%" }}
            >
              <StatusHeader status="found_on_other_page" foundPage={7} expectedPage={5} />
              <div className="p-2">
                <div className="group block relative overflow-hidden rounded-md bg-gray-50 dark:bg-gray-800 w-full">
                  <img
                    src={sampleImage}
                    alt="Citation verification"
                    className="block rounded-md w-full"
                    style={{
                      maxHeight: "min(50vh, 300px)",
                      objectFit: "contain",
                      minHeight: "100px",
                      backgroundColor: "#f59e0b",
                    }}
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
          </ShowcaseCard>

          {/* Not found without image */}
          <ShowcaseCard data-complete-popover="not-found-no-image">
            <ShowcaseLabel
              component="Popover"
              variant="not_found"
              state="no image"
              uxIntent="Failed verification - no image available, shows search log for debugging"
            />
            <div
              className="mt-2 overflow-hidden rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-gray-900"
              style={{ width: "380px", maxWidth: "100%" }}
            >
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
          </ShowcaseCard>

          {/* Text-only fallback */}
          <ShowcaseCard data-complete-popover="text-only">
            <ShowcaseLabel
              component="Popover"
              variant="text-only"
              state="fallback"
              uxIntent="Minimal fallback when no image - just status, quote, and page"
            />
            <div className="mt-2 p-3 flex flex-col gap-2 min-w-[180px] max-w-full border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
              <span className="text-xs font-medium text-green-600 dark:text-green-500">Verified Match</span>
              <span className="text-sm text-gray-700 dark:text-gray-300 italic">
                "Revenue increased by 15% in Q4 2024."
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">Page 5</span>
            </div>
          </ShowcaseCard>
        </div>
      </ShowcaseSection>

      {/* ========================================================================
          SECTION: Image Overlay (Page Viewer)
          ======================================================================== */}
      <ShowcaseSection
        title="7. Image Overlay (Page Viewer)"
        description="Full-screen overlay for viewing verification images at full size"
        data-testid="popover-image-overlay-section"
      >
        <ShowcaseCard data-image-overlay="static">
          <ShowcaseLabel
            component="ImageOverlay"
            uxIntent="Full-screen image viewer - allows zooming into verification evidence"
          />
          <div className="mt-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              The image overlay appears when clicking on a verification image in the popover. It displays the image at
              full size with a dark backdrop.
            </p>
            {/* Static preview of overlay appearance */}
            <div className="relative rounded-lg overflow-hidden bg-black/80 p-8" style={{ minHeight: "200px" }}>
              <div className="flex items-center justify-center">
                <img
                  src={sampleLargeImage}
                  alt="Sample verification - full size"
                  className="max-w-full max-h-[300px] object-contain rounded shadow-2xl"
                  style={{ backgroundColor: "#22c55e" }}
                />
              </div>
              {/* Close button preview */}
              <div className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
          </div>
          <InteractionLabel click="Closes overlay (click anywhere)" escapeKey="Closes overlay">
            <li className="text-[10px]">
              <span className="font-medium text-gray-600 dark:text-gray-300">Opens via:</span> Clicking image in popover
              or via behaviorConfig.onClick returning setImageExpanded
            </li>
          </InteractionLabel>
        </ShowcaseCard>
      </ShowcaseSection>

      {/* ========================================================================
          SECTION: Interactive Popover Examples
          ======================================================================== */}
      <ShowcaseSection
        title="8. Interactive Popover Examples"
        description="Live interactive citations - click to see actual popover behavior"
        data-testid="popover-interactive-section"
      >
        <ShowcaseCard>
          <ShowcaseLabel
            component="CitationComponent"
            uxIntent="Test actual click/popover behavior - popovers open on click (lazy mode)"
          />
          <div className="flex flex-wrap gap-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mt-4">
            <div className="flex items-center gap-2" data-interactive-popover="verified">
              <span className="text-sm text-gray-600 dark:text-gray-400">Verified:</span>
              <CitationComponent citation={baseCitation} verification={verifiedVerification} variant="brackets" />
            </div>
            <div className="flex items-center gap-2" data-interactive-popover="partial">
              <span className="text-sm text-gray-600 dark:text-gray-400">Partial:</span>
              <CitationComponent citation={baseCitation} verification={partialWithAudit} variant="brackets" />
            </div>
            <div className="flex items-center gap-2" data-interactive-popover="not-found">
              <span className="text-sm text-gray-600 dark:text-gray-400">Not Found:</span>
              <CitationComponent citation={baseCitation} verification={notFoundWithAudit} variant="brackets" />
            </div>
            <div className="flex items-center gap-2" data-interactive-popover="pending">
              <span className="text-sm text-gray-600 dark:text-gray-400">Pending:</span>
              <CitationComponent citation={baseCitation} verification={pendingVerification} variant="brackets" />
            </div>
          </div>
          <InteractionLabel
            hover="Highlight effect only (no popover)"
            click="Opens popover with verification details"
            secondClick="Toggles search details expansion"
            escapeKey="Closes popover"
          />
        </ShowcaseCard>
      </ShowcaseSection>

      {/* ========================================================================
          SECTION: URL Citation Popover Examples
          ======================================================================== */}
      <ShowcaseSection
        title="9. URL Citation Popover Examples"
        description="URL citations with popover showing source URL header"
        data-testid="popover-url-citation-section"
      >
        <ShowcaseCard>
          <ShowcaseLabel
            component="CitationComponent"
            variant="url"
            uxIntent="URL citations show source URL in header instead of page number"
          />
          <div className="flex flex-wrap gap-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mt-4">
            <div className="flex items-center gap-2" data-interactive-popover="url-verified">
              <span className="text-sm text-gray-600 dark:text-gray-400">URL Verified:</span>
              <CitationComponent citation={urlCitation} verification={urlVerifiedVerification} variant="brackets" />
            </div>
            <div className="flex items-center gap-2" data-interactive-popover="url-not-found">
              <span className="text-sm text-gray-600 dark:text-gray-400">URL Not Found:</span>
              <CitationComponent citation={urlCitation} verification={urlNotFoundVerification} variant="brackets" />
            </div>
            <div className="flex items-center gap-2" data-interactive-popover="url-pending">
              <span className="text-sm text-gray-600 dark:text-gray-400">URL Pending:</span>
              <CitationComponent citation={urlCitation} verification={pendingVerification} variant="brackets" />
            </div>
          </div>
        </ShowcaseCard>
      </ShowcaseSection>

      {/* ========================================================================
          SECTION: Accessibility & Contrast Testing
          ======================================================================== */}
      <ShowcaseSection
        title="10. Accessibility & Contrast Testing"
        description="Test visibility on various backgrounds - especially important for not-found states"
        data-testid="gray-background-section"
      >
        <ShowcaseCard>
          <ShowcaseLabel
            component="CitationComponent"
            uxIntent="Ensure citations remain visible and readable on gray/colored backgrounds"
          />
          <div className="mt-4 p-6 bg-gray-200 dark:bg-gray-700 rounded-lg space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">Linter variants:</span>
              <CitationComponent citation={baseCitation} verification={verifiedVerification} variant="linter" />
              <CitationComponent citation={baseCitation} verification={partialVerification} variant="linter" />
              <CitationComponent citation={baseCitation} verification={notFoundVerification} variant="linter" />
              <CitationComponent citation={baseCitation} verification={pendingVerification} variant="linter" />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">Inline context:</span>
              <span className="text-gray-700 dark:text-gray-200">
                Text with citation
                <CitationComponent citation={baseCitation} verification={notFoundVerification} variant="superscript" />
                continues here
              </span>
            </div>
          </div>
        </ShowcaseCard>
      </ShowcaseSection>
    </div>
  );
}

// =========
// CITATION DRAWER SHOWCASE - Fixtures
// =========

const drawerAllVerified: CitationDrawerItem[] = [
  {
    citationKey: "dv-1",
    citation: {
      type: "url",
      url: "https://stripe.com/docs/api",
      domain: "stripe.com",
      siteName: "Stripe",
      title: "Stripe API Documentation",
      fullPhrase: "Payment intents confirm the payment.",
      anchorText: "confirm the payment",
      citationNumber: 1,
    },
    verification: { status: "found", verifiedMatchSnippet: "Payment intents confirm the payment." },
  },
  {
    citationKey: "dv-2",
    citation: {
      type: "url",
      url: "https://docs.github.com/en/rest",
      domain: "github.com",
      siteName: "GitHub",
      title: "GitHub REST API",
      fullPhrase: "Authentication is required for most endpoints.",
      anchorText: "Authentication is required",
      citationNumber: 2,
    },
    verification: { status: "found", verifiedMatchSnippet: "Authentication is required for most endpoints." },
  },
  {
    citationKey: "dv-3",
    citation: {
      type: "url",
      url: "https://developer.mozilla.org/en-US/docs/Web",
      domain: "developer.mozilla.org",
      siteName: "MDN",
      title: "Web APIs",
      fullPhrase: "The Fetch API provides a modern interface for making HTTP requests.",
      anchorText: "modern interface for making HTTP requests",
      citationNumber: 3,
    },
    verification: {
      status: "found",
      verifiedMatchSnippet: "The Fetch API provides a modern interface for making HTTP requests.",
    },
  },
];

const drawerMixed: CitationDrawerItem[] = [
  {
    citationKey: "dm-1",
    citation: {
      type: "url",
      url: "https://react.dev/learn",
      domain: "react.dev",
      siteName: "React",
      title: "React Learn",
      fullPhrase: "Components let you split the UI into independent pieces.",
      anchorText: "split the UI into independent pieces",
      citationNumber: 1,
    },
    verification: { status: "found", verifiedMatchSnippet: "Components let you split the UI into independent pieces." },
  },
  {
    citationKey: "dm-2",
    citation: {
      type: "url",
      url: "https://tailwindcss.com/docs",
      domain: "tailwindcss.com",
      siteName: "Tailwind CSS",
      title: "Tailwind Documentation",
      fullPhrase: "Utility-first CSS framework for rapid UI development.",
      anchorText: "Utility-first CSS framework",
      citationNumber: 2,
    },
    verification: {
      status: "found_on_other_page",
      verifiedPageNumber: 3,
      verifiedMatchSnippet: "Utility-first CSS framework",
    },
  },
  {
    citationKey: "dm-3",
    citation: {
      type: "url",
      url: "https://nextjs.org/docs",
      domain: "nextjs.org",
      siteName: "Next.js",
      title: "Next.js Documentation",
      fullPhrase: "Server components render on the server.",
      anchorText: "Server components",
      citationNumber: 3,
    },
    verification: { status: "not_found", verifiedPageNumber: -1 },
  },
  {
    citationKey: "dm-4",
    citation: {
      type: "url",
      url: "https://www.typescriptlang.org/docs",
      domain: "typescriptlang.org",
      siteName: "TypeScript",
      title: "TypeScript Handbook",
      fullPhrase: "TypeScript adds optional static typing to JavaScript.",
      anchorText: "optional static typing",
      citationNumber: 4,
    },
    verification: { status: "pending" },
  },
  {
    citationKey: "dm-5",
    citation: {
      type: "url",
      url: "https://vitejs.dev/guide",
      domain: "vitejs.dev",
      siteName: "Vite",
      title: "Vite Guide",
      fullPhrase: "Vite provides a faster dev experience.",
      anchorText: "faster dev experience",
      citationNumber: 5,
    },
    verification: { status: "found_anchor_text_only", verifiedMatchSnippet: "faster dev experience" },
  },
];

const drawerAllPending: CitationDrawerItem[] = [
  {
    citationKey: "dp-1",
    citation: {
      type: "url",
      url: "https://openai.com/api",
      domain: "openai.com",
      siteName: "OpenAI",
      title: "API Reference",
      fullPhrase: "GPT models generate human-like text.",
      anchorText: "human-like text",
      citationNumber: 1,
    },
    verification: { status: "pending" },
  },
  {
    citationKey: "dp-2",
    citation: {
      type: "url",
      url: "https://anthropic.com/claude",
      domain: "anthropic.com",
      siteName: "Anthropic",
      title: "Claude",
      fullPhrase: "Claude is designed to be helpful and harmless.",
      anchorText: "helpful and harmless",
      citationNumber: 2,
    },
    verification: { status: "loading" },
  },
  {
    citationKey: "dp-3",
    citation: {
      type: "url",
      url: "https://huggingface.co/docs",
      domain: "huggingface.co",
      siteName: "Hugging Face",
      title: "Documentation",
      fullPhrase: "Transformers library supports thousands of models.",
      anchorText: "thousands of models",
      citationNumber: 3,
    },
    verification: { status: "pending" },
  },
  {
    citationKey: "dp-4",
    citation: {
      type: "url",
      url: "https://cohere.com/docs",
      domain: "cohere.com",
      siteName: "Cohere",
      title: "API Docs",
      fullPhrase: "Embed models convert text to vectors.",
      anchorText: "text to vectors",
      citationNumber: 4,
    },
    verification: null,
  },
];

const drawerSingleSource: CitationDrawerItem[] = [
  {
    citationKey: "ds-1",
    citation: {
      type: "url",
      url: "https://en.wikipedia.org/wiki/TypeScript",
      domain: "en.wikipedia.org",
      siteName: "Wikipedia",
      title: "TypeScript - Wikipedia",
      fullPhrase: "TypeScript is a programming language developed by Microsoft.",
      anchorText: "programming language developed by Microsoft",
      citationNumber: 1,
    },
    verification: {
      status: "found",
      verifiedMatchSnippet: "TypeScript is a programming language developed by Microsoft.",
    },
  },
];

const drawerManySources: CitationDrawerItem[] = [
  ...drawerAllVerified,
  ...drawerMixed,
  {
    citationKey: "dms-1",
    citation: {
      type: "url",
      url: "https://nodejs.org/docs",
      domain: "nodejs.org",
      siteName: "Node.js",
      title: "Node.js Docs",
      fullPhrase: "Node.js runs JavaScript outside the browser.",
      anchorText: "outside the browser",
      citationNumber: 9,
    },
    verification: { status: "found", verifiedMatchSnippet: "Node.js runs JavaScript outside the browser." },
  },
  {
    citationKey: "dms-2",
    citation: {
      type: "url",
      url: "https://www.rust-lang.org/learn",
      domain: "rust-lang.org",
      siteName: "Rust",
      title: "Learn Rust",
      fullPhrase: "Rust guarantees memory safety without garbage collection.",
      anchorText: "memory safety without garbage collection",
      citationNumber: 10,
    },
    verification: { status: "partial_text_found", verifiedMatchSnippet: "memory safety" },
  },
];

// =========
// CITATION DRAWER SHOWCASE
// =========

export function CitationDrawerShowcase() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [interactiveItems] = useState<CitationDrawerItem[]>(drawerMixed);
  const interactiveGroups = groupCitationsBySource(interactiveItems);

  const allVerifiedGroups = groupCitationsBySource(drawerAllVerified);
  const mixedGroups = groupCitationsBySource(drawerMixed);
  const allPendingGroups = groupCitationsBySource(drawerAllPending);
  const singleGroups = groupCitationsBySource(drawerSingleSource);
  const manyGroups = groupCitationsBySource(drawerManySources);

  return (
    <div className="p-6 bg-white dark:bg-gray-900 min-h-screen" data-testid="drawer-showcase">
      <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Citation Drawer Trigger Showcase</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Compact summary bar for citation verification status with progressive disclosure
      </p>

      {/* ========
          SECTION 1: Trigger States
          ======== */}
      <ShowcaseSection
        title="1. Trigger States"
        description="The trigger bar in its collapsed state across different verification scenarios"
        data-testid="drawer-trigger-states-section"
      >
        <div className="grid gap-4">
          <ShowcaseCard data-drawer-trigger-state="all-verified">
            <ShowcaseLabel
              component="CitationDrawerTrigger"
              state="all-verified"
              uxIntent="All citations verified — green dots signal confidence"
            />
            <div className="mt-3">
              <CitationDrawerTrigger citationGroups={allVerifiedGroups} />
            </div>
          </ShowcaseCard>

          <ShowcaseCard data-drawer-trigger-state="mixed">
            <ShowcaseLabel
              component="CitationDrawerTrigger"
              state="mixed"
              uxIntent="Mixed statuses — dots show at-a-glance verification breakdown"
            />
            <div className="mt-3">
              <CitationDrawerTrigger citationGroups={mixedGroups} />
            </div>
          </ShowcaseCard>

          <ShowcaseCard data-drawer-trigger-state="all-pending">
            <ShowcaseLabel
              component="CitationDrawerTrigger"
              state="all-pending"
              uxIntent="All citations pending — gray dots indicate in-progress verification"
            />
            <div className="mt-3">
              <CitationDrawerTrigger citationGroups={allPendingGroups} />
            </div>
          </ShowcaseCard>

          <ShowcaseCard data-drawer-trigger-state="single-source">
            <ShowcaseLabel
              component="CitationDrawerTrigger"
              state="single-source"
              uxIntent="Single source — minimal trigger for simple citations"
            />
            <div className="mt-3">
              <CitationDrawerTrigger citationGroups={singleGroups} />
            </div>
          </ShowcaseCard>

          <ShowcaseCard data-drawer-trigger-state="many-sources">
            <ShowcaseLabel
              component="CitationDrawerTrigger"
              state="many-sources"
              uxIntent="Many sources — overflow favicons with +N badge"
            />
            <div className="mt-3">
              <CitationDrawerTrigger citationGroups={manyGroups} />
            </div>
          </ShowcaseCard>
        </div>
      </ShowcaseSection>

      {/* ========
          SECTION 2: Hover Progressive Disclosure
          ======== */}
      <ShowcaseSection
        title="2. Hover Progressive Disclosure"
        description="On hover, the trigger expands to show individual source rows with their statuses"
        data-testid="drawer-trigger-hover-section"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ShowcaseCard data-drawer-hover-state="collapsed">
            <ShowcaseLabel
              component="CitationDrawerTrigger"
              state="collapsed"
              uxIntent="Default collapsed state — compact summary bar"
            />
            <div className="mt-3">
              <CitationDrawerTrigger citationGroups={mixedGroups} />
            </div>
            <InteractionLabel
              hover="Expands to show individual source rows"
              click="Opens full citation drawer"
              escapeKey="N/A (not a modal)"
            />
          </ShowcaseCard>

          <ShowcaseCard data-drawer-hover-state="expanded-preview">
            <ShowcaseLabel
              component="CitationDrawerTrigger"
              state="expanded (hover preview)"
              uxIntent="Hover state — progressively disclosed source details"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-3 italic">
              Preview of the expanded hover content (normally triggered on mouse hover):
            </p>
            {/* Static render of what hover content looks like */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              {/* Collapsed bar */}
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="flex items-center -space-x-1" aria-hidden="true">
                  <span className="w-2.5 h-2.5 rounded-full ring-1 ring-white dark:ring-gray-800 bg-green-500" />
                  <span className="w-2.5 h-2.5 rounded-full ring-1 ring-white dark:ring-gray-800 bg-amber-500" />
                  <span className="w-2.5 h-2.5 rounded-full ring-1 ring-white dark:ring-gray-800 bg-red-500" />
                  <span className="w-2.5 h-2.5 rounded-full ring-1 ring-white dark:ring-gray-800 bg-gray-400" />
                </div>
                <span className="flex-1 text-sm text-gray-600 dark:text-gray-300 truncate">
                  5 sources · 2 verified, 1 partial, 1 not found, 1 pending
                </span>
                <svg
                  className="w-4 h-4 text-gray-400 dark:text-gray-500 rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {/* Expanded source rows */}
              <div className="px-3 pb-2 pt-1 border-t border-gray-200 dark:border-gray-700 space-y-0.5">
                {mixedGroups.map(group => (
                  <div
                    key={group.sourceDomain ?? group.sourceName}
                    className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 py-0.5"
                  >
                    <span className="w-3.5 h-3.5 rounded-sm bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[8px] font-medium flex-shrink-0">
                      {group.sourceName.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{group.sourceName}</span>
                    {group.citations.length > 1 && (
                      <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">×{group.citations.length}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </ShowcaseCard>
        </div>
      </ShowcaseSection>

      {/* ========
          SECTION 3: Full Drawer Static Preview
          ======== */}
      <ShowcaseSection
        title="3. Full Drawer Content (Static Preview)"
        description="The citation drawer content rendered inline — shows what opens on click"
        data-testid="drawer-trigger-full-drawer-section"
      >
        <ShowcaseCard>
          <ShowcaseLabel
            component="CitationDrawer"
            uxIntent="Full drawer content — individual citations with favicon, title, snippet, and status"
          />
          <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Citations</h2>
              <div className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg
                  className="w-5 h-5 text-gray-500 dark:text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            {/* Citation items */}
            {drawerMixed.map((item, index) => (
              <CitationDrawerItemComponent
                key={item.citationKey}
                item={item}
                isLast={index === drawerMixed.length - 1}
              />
            ))}
          </div>
        </ShowcaseCard>
      </ShowcaseSection>

      {/* ========
          SECTION 4: Interactive Example
          ======== */}
      <ShowcaseSection
        title="4. Interactive Example"
        description="Click the trigger bar below to open the full citation drawer"
        data-testid="drawer-trigger-interactive-section"
      >
        <ShowcaseCard>
          <ShowcaseLabel
            component="CitationDrawerTrigger + CitationDrawer"
            uxIntent="Complete integration — trigger bar opens drawer on click"
          />
          <div className="mt-3" data-interactive-drawer="trigger">
            <CitationDrawerTrigger
              citationGroups={interactiveGroups}
              onClick={() => setDrawerOpen(true)}
              isOpen={drawerOpen}
            />
          </div>
          <InteractionLabel
            hover="Shows individual source rows"
            click="Opens full citation drawer"
            escapeKey="Closes drawer"
          />
        </ShowcaseCard>
      </ShowcaseSection>

      {/* Portal-rendered drawer for interactive example */}
      <CitationDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} citationGroups={interactiveGroups} />
    </div>
  );
}
