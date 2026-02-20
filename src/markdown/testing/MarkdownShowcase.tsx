import type React from "react";
import { useMemo } from "react";
import { getCitationStatus } from "../../parsing/parseCitation.js";
import type { Citation } from "../../types/citation.js";
import type { Verification } from "../../types/verification.js";
import { getIndicator, humanizeLinePosition } from "../markdownVariants.js";
import { renderCitationsAsMarkdown, toMarkdown } from "../renderMarkdown.js";
import type { MarkdownVariant } from "../types.js";
import { INDICATOR_STYLES, MARKDOWN_VARIANTS, STATUS_TYPES } from "./MarkdownShowcase.constants.js";

// =============================================================================
// SHOWCASE HELPER COMPONENTS
// =============================================================================

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

function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div>
      {label && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">{label}</p>}
      <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
        {children}
      </pre>
    </div>
  );
}

// =============================================================================
// TEST FIXTURES
// =============================================================================

const _baseCitation: Citation = {
  attachmentId: "abc123",
  pageNumber: 5,
  lineIds: [12, 13],
  fullPhrase: "Revenue increased by 15% in Q4 2024.",
  anchorText: "increased by 15%",
  citationNumber: 1,
};

const sampleInput = `The company reported strong growth<cite attachment_id='abc123' page_number='5' full_phrase='Revenue increased by 15% in Q4 2024.' anchor_text='increased by 15%' line_ids='12,13' /> according to the quarterly report.

Additionally, costs were reduced<cite attachment_id='abc123' page_number='7' full_phrase='Operating costs decreased by 8%.' anchor_text='reduced' line_ids='25' /> through efficiency measures.

However, some projections<cite attachment_id='abc123' page_number='12' full_phrase='Market share expected to grow.' anchor_text='projections' line_ids='5' /> remain unverified.`;

const _linePositionVerification: Verification = {
  status: "found_on_other_line",
  document: {
    verifiedPageNumber: 5,
    verifiedLineIds: [80],
    totalLinesOnPage: 100,
  },
};

// =============================================================================
// MARKDOWN SHOWCASE COMPONENT
// =============================================================================

export function MarkdownShowcase() {
  return (
    <div className="p-6 bg-white dark:bg-gray-900 min-h-screen" data-testid="markdown-showcase">
      <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Markdown Output Visual Showcase</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Visual reference for all markdown rendering variants, indicator styles, and output formats
      </p>

      {/* Section 1: Indicator Styles Matrix */}
      <ShowcaseSection
        title="1. Indicator Styles"
        description="All indicator styles across all verification states"
        data-testid="indicator-styles-section"
      >
        <ShowcaseCard>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left p-2 text-gray-600 dark:text-gray-400">Style</th>
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
                {INDICATOR_STYLES.map(style => (
                  <tr key={style} className="border-b border-gray-100 dark:border-gray-800" data-indicator-row={style}>
                    <td className="p-2 font-mono text-gray-700 dark:text-gray-300 text-xs">{style}</td>
                    {STATUS_TYPES.map(({ name, verification }) => {
                      const status = getCitationStatus(verification);
                      const indicator = getIndicator(status, style);
                      return (
                        <td
                          key={name}
                          className="p-2 font-mono text-lg text-gray-800 dark:text-gray-200"
                          data-indicator={name.toLowerCase()}
                        >
                          {indicator || <span className="text-gray-400 dark:text-gray-500">(none)</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ShowcaseCard>
      </ShowcaseSection>

      {/* Section 2: Markdown Variants */}
      <ShowcaseSection
        title="2. Markdown Variants"
        description="Different output formats for citations"
        data-testid="markdown-variants-section"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MARKDOWN_VARIANTS.map(variant => {
            const simpleInput = `Revenue grew 45%<cite attachment_id='abc123' page_number='3' full_phrase='Revenue grew 45% in Q4.' anchor_text='grew 45%' citation_number='1' /> according to reports.`;
            const output = toMarkdown(simpleInput, {
              variant,
              indicatorStyle: "check",
              verifications: {
                // Use a mock key - in real usage this would be generated
              },
              linkStyle: "anchor",
            });

            return (
              <ShowcaseCard key={variant} data-variant={variant}>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 font-mono">{variant}</h3>
                <CodeBlock>{output}</CodeBlock>
              </ShowcaseCard>
            );
          })}
        </div>
      </ShowcaseSection>

      {/* Section 3: Reference Section Formats */}
      <ShowcaseSection
        title="3. Reference Section"
        description="Generated reference sections with different groupings"
        data-testid="reference-section"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ShowcaseCard data-reference-type="standard">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Standard References</h3>
            <ReferencePreview variant="brackets" />
          </ShowcaseCard>

          <ShowcaseCard data-reference-type="footnote">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Footnote Style</h3>
            <ReferencePreview variant="footnote" />
          </ShowcaseCard>
        </div>
      </ShowcaseSection>

      {/* Section 4: Humanized Line Position */}
      <ShowcaseSection
        title="4. Humanized Line Position"
        description="Line position indicators for location mismatches (raw line IDs are never shown)"
        data-testid="line-position-section"
      >
        <ShowcaseCard>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[10, 25, 50, 75, 95].map(lineId => {
              const position = humanizeLinePosition(lineId, 100);
              return (
                <div
                  key={lineId}
                  className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded"
                  data-line-position={position}
                >
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Line {lineId}/100</p>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">{position}</p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 italic">
            Example: "p.3 (expected early, found middle)" helps users understand location mismatches without exposing
            internal line IDs.
          </p>
        </ShowcaseCard>
      </ShowcaseSection>

      {/* Section 5: Complete Document Example */}
      <ShowcaseSection
        title="5. Complete Document Example"
        description="Full before/after transformation"
        data-testid="complete-document-section"
      >
        <div className="space-y-4">
          <ShowcaseCard>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Input (LLM Output with &lt;cite /&gt; tags)
            </h3>
            <CodeBlock>{sampleInput}</CodeBlock>
          </ShowcaseCard>

          <ShowcaseCard>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Output (Clean Markdown)</h3>
            <CompleteDocumentPreview />
          </ShowcaseCard>
        </div>
      </ShowcaseSection>

      {/* Section 6: URL Citations */}
      <ShowcaseSection
        title="6. URL Citations"
        description="How URL citations render in markdown"
        data-testid="url-citations-section"
      >
        <ShowcaseCard>
          <UrlCitationPreview />
        </ShowcaseCard>
      </ShowcaseSection>
    </div>
  );
}

// =============================================================================
// PREVIEW COMPONENTS
// =============================================================================

function ReferencePreview({ variant }: { variant: MarkdownVariant }) {
  const output = useMemo(() => {
    return renderCitationsAsMarkdown(sampleInput, {
      variant,
      indicatorStyle: "check",
      includeReferences: true,
      showPageNumber: true,
      showLinePosition: true,
    });
  }, [variant]);

  return (
    <div className="space-y-4">
      <CodeBlock label="Inline Text">{output.markdown}</CodeBlock>
      {output.references && <CodeBlock label="References Section">{output.references}</CodeBlock>}
    </div>
  );
}

function CompleteDocumentPreview() {
  const output = useMemo(() => {
    return renderCitationsAsMarkdown(sampleInput, {
      variant: "superscript",
      indicatorStyle: "check",
      includeReferences: true,
      showPageNumber: true,
      showReasoning: false,
    });
  }, []);

  return <CodeBlock>{output.full}</CodeBlock>;
}

function UrlCitationPreview() {
  const urlInput = `According to the documentation<cite type='url' url='https://docs.example.com/api' domain='docs.example.com' title='API Reference' full_phrase='The API supports REST endpoints.' anchor_text='documentation' citation_number='1' />, the API is RESTful.`;

  const output = toMarkdown(urlInput, {
    variant: "inline",
    indicatorStyle: "check",
    includeReferences: true,
  });

  return (
    <div className="space-y-4">
      <CodeBlock label="Input">{urlInput}</CodeBlock>
      <CodeBlock label="Output">{output}</CodeBlock>
    </div>
  );
}
