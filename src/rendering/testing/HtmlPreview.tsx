import type React from "react";
import { useEffect, useRef } from "react";
import { getIndicator, toSuperscript } from "../../markdown/markdownVariants.js";
import { getCitationStatus } from "../../parsing/parseCitation.js";
import type { Citation } from "../../types/citation.js";
import type { Verification } from "../../types/verification.js";
import {
  DOC_CITATION_1,
  DOC_CITATION_2,
  DOC_CITATION_3,
  HTML_VARIANTS,
  NOT_FOUND_VERIFICATION,
  PARTIAL_VERIFICATION,
  PENDING_VERIFICATION,
  PROOF_BASE_URL,
  RENDER_STATUS_TYPES,
  VERIFIED_VERIFICATION,
} from "./RenderTargetShowcase.constants.js";

// =============================================================================
// HTML OUTPUT SIMULATION
// =============================================================================

type HtmlStatusClass = "dc-verified" | "dc-partial" | "dc-not-found" | "dc-pending";

function getStatusClass(verification: Verification): HtmlStatusClass {
  const status = getCitationStatus(verification);
  if (status.isMiss) return "dc-not-found";
  if (status.isPartialMatch) return "dc-partial";
  if (status.isVerified) return "dc-verified";
  return "dc-pending";
}

function htmlLinter(anchorText: string, indicator: string, statusClass: string, proofUrl: string): string {
  return `<span class="dc-citation ${statusClass}"><a href="${proofUrl}">${anchorText}${indicator}</a></span>`;
}

function htmlBrackets(num: number, indicator: string, statusClass: string, proofUrl: string): string {
  return `<a href="${proofUrl}" class="dc-citation dc-brackets ${statusClass}">[${num}${indicator}]</a>`;
}

function htmlChip(anchorText: string, indicator: string, statusClass: string, proofUrl: string): string {
  return `<span class="dc-chip ${statusClass}"><a href="${proofUrl}">${anchorText}${indicator}</a></span>`;
}

function htmlSuperscriptOutput(num: number, indicator: string, statusClass: string, proofUrl: string): string {
  return `<sup><a href="${proofUrl}" class="dc-citation ${statusClass}">${toSuperscript(num)}${indicator}</a></sup>`;
}

function getHtmlVariantOutput(
  variant: string,
  citation: Citation,
  verification: Verification,
  proofUrl: string,
): string {
  const status = getCitationStatus(verification);
  const indicator = getIndicator(status, "check");
  const statusClass = getStatusClass(verification);
  const num = citation.citationNumber ?? 1;
  const anchor = citation.anchorText ?? "citation";
  switch (variant) {
    case "linter":
      return htmlLinter(anchor, indicator, statusClass, proofUrl);
    case "brackets":
      return htmlBrackets(num, indicator, statusClass, proofUrl);
    case "chip":
      return htmlChip(anchor, indicator, statusClass, proofUrl);
    case "superscript":
      return htmlSuperscriptOutput(num, indicator, statusClass, proofUrl);
    default:
      return htmlBrackets(num, indicator, statusClass, proofUrl);
  }
}

// =============================================================================
// PREVIEW STYLE INJECTION
// Inject styles via useEffect to avoid Vite CSS pipeline issues with
// <style dangerouslySetInnerHTML>
// =============================================================================

const PREVIEW_STYLE_ID = "dc-html-preview-styles";

function getPreviewCss(): string {
  return [
    ".dc-preview-scope .dc-citation { cursor: pointer; }",
    ".dc-preview-scope .dc-citation a { color: inherit; text-decoration: none; }",
    ".dc-preview-scope .dc-verified { color: #16a34a; }",
    ".dc-preview-scope .dc-partial { color: #f59e0b; }",
    ".dc-preview-scope .dc-not-found { color: #ef4444; }",
    ".dc-preview-scope .dc-pending { color: #9ca3af; }",
    ".dc-preview-scope span.dc-citation.dc-verified { text-decoration: underline solid #16a34a; text-underline-offset: 3px; }",
    ".dc-preview-scope span.dc-citation.dc-partial { text-decoration: underline dashed #f59e0b; text-underline-offset: 3px; }",
    ".dc-preview-scope span.dc-citation.dc-not-found { text-decoration: underline wavy #ef4444; text-underline-offset: 3px; }",
    ".dc-preview-scope span.dc-citation.dc-pending { text-decoration: underline dotted #9ca3af; text-underline-offset: 3px; }",
    ".dc-preview-scope .dc-brackets { font-family: monospace; font-size: 0.85em; }",
    ".dc-preview-scope .dc-chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 8px; border-radius: 9999px; font-size: 0.85em; background: #f3f4f6; border: 1px solid #e5e7eb; }",
    ".dc-preview-scope .dc-chip.dc-verified { background: #f0fdf4; border-color: #bbf7d0; }",
    ".dc-preview-scope .dc-chip.dc-partial { background: #fffbeb; border-color: #fde68a; }",
    ".dc-preview-scope .dc-chip.dc-not-found { background: #fef2f2; border-color: #fecaca; }",
    ".dc-preview-scope .dc-chip.dc-pending { background: #f9fafb; border-color: #e5e7eb; }",
    ".dc-preview-scope .dc-tooltip-wrap { position: relative; display: inline; }",
    ".dc-preview-scope .dc-tooltip { display: none; position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: #1f2937; color: #f9fafb; padding: 6px 10px; border-radius: 6px; font-size: 12px; white-space: nowrap; z-index: 10; margin-bottom: 4px; }",
    ".dc-preview-scope .dc-tooltip-wrap:hover .dc-tooltip { display: block; }",
  ].join("\n");
}

function usePreviewStyles() {
  useEffect(() => {
    if (document.getElementById(PREVIEW_STYLE_ID)) return;
    const styleEl = document.createElement("style");
    styleEl.id = PREVIEW_STYLE_ID;
    styleEl.textContent = getPreviewCss();
    document.head.appendChild(styleEl);
    return () => {
      styleEl.remove();
    };
  }, []);
}

// =============================================================================
// HTML PREVIEW COMPONENT
// =============================================================================

export function HtmlPreview() {
  usePreviewStyles();

  return (
    <div className="space-y-6">
      {/* Variants x Statuses Matrix */}
      <div data-testid="html-variants-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Variants x Statuses</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Variant</th>
                {RENDER_STATUS_TYPES.map(({ name }) => (
                  <th key={name} className="text-left p-2 text-gray-600 dark:text-gray-400">{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HTML_VARIANTS.map(variant => (
                <tr
                  key={variant}
                  className="border-b border-gray-100 dark:border-gray-800"
                  data-html-variant={variant}
                >
                  <td className="p-2 font-mono text-gray-700 dark:text-gray-300 text-xs">{variant}</td>
                  {RENDER_STATUS_TYPES.map(({ name, verification, citation }) => {
                    const proofUrl = `${PROOF_BASE_URL}/p/${citation.attachmentId || "url"}`;
                    const rawHtml = getHtmlVariantOutput(variant, citation, verification, proofUrl);
                    return (
                      <td key={name} className="p-2" data-html-status={name.toLowerCase().replace(" ", "-")}>
                        <div className="space-y-1">
                          <div
                            className="dc-preview-scope text-sm"
                            dangerouslySetInnerHTML={{ __html: rawHtml }}
                          />
                          <code className="block text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono text-gray-500 dark:text-gray-400 break-all">
                            {rawHtml}
                          </code>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSS-Only Tooltip Demo */}
      <div data-testid="html-tooltip-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">CSS-Only Tooltip</h3>
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
          <p className="dc-preview-scope text-sm text-gray-800 dark:text-gray-200">
            The company reported strong growth.{" "}
            <span className="dc-tooltip-wrap">
              <span className="dc-citation dc-brackets dc-verified">
                <a href="#">[1✓]</a>
              </span>
              <span className="dc-tooltip">✓ Verified — Q4 Financial Report, p.5</span>
            </span>
            {" "}Operating costs were reduced.{" "}
            <span className="dc-tooltip-wrap">
              <span className="dc-citation dc-brackets dc-partial">
                <a href="#">[2⚠]</a>
              </span>
              <span className="dc-tooltip">⚠ Partial — Q4 Financial Report, p.9</span>
            </span>
            {" "}However, some projections remain unverified.{" "}
            <span className="dc-tooltip-wrap">
              <span className="dc-citation dc-brackets dc-not-found">
                <a href="#">[3✗]</a>
              </span>
              <span className="dc-tooltip">✗ Not Found</span>
            </span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 italic">
            Hover over citations above to see CSS-only tooltips (no JavaScript required).
          </p>
        </div>
      </div>

      {/* Self-Contained HTML Example */}
      <div data-testid="html-complete-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Self-Contained HTML</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Raw HTML</p>
            <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-80 overflow-y-auto">
              {selfContainedHtml()}
            </pre>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Live Preview</p>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-900">
              <div
                className="dc-preview-scope text-sm text-gray-800 dark:text-gray-200"
                dangerouslySetInnerHTML={{ __html: selfContainedHtmlBody() }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// RAW OUTPUT STRINGS
// =============================================================================

function selfContainedHtmlBody(): string {
  const v1 = getCitationStatus(VERIFIED_VERIFICATION);
  const v2 = getCitationStatus(PARTIAL_VERIFICATION);
  const v3 = getCitationStatus(NOT_FOUND_VERIFICATION);

  const i1 = getIndicator(v1, "check");
  const i2 = getIndicator(v2, "check");
  const i3 = getIndicator(v3, "check");

  return [
    `<p>The company reported strong growth. `,
    `<a href="${PROOF_BASE_URL}/p/abc123" class="dc-citation dc-brackets dc-verified">[1${i1}]</a> `,
    `Operating costs were reduced. `,
    `<a href="${PROOF_BASE_URL}/p/abc123" class="dc-citation dc-brackets dc-partial">[2${i2}]</a> `,
    `However, some projections remain unverified. `,
    `<a href="${PROOF_BASE_URL}/p/abc123" class="dc-citation dc-brackets dc-not-found">[3${i3}]</a>`,
    `</p>`,
  ].join("");
}

function selfContainedHtml(): string {
  return [
    "<style>",
    "  .dc-citation { cursor: pointer; }",
    "  .dc-citation a { color: inherit; text-decoration: none; }",
    "  .dc-verified { color: #16a34a; }",
    "  .dc-partial { color: #f59e0b; }",
    "  .dc-not-found { color: #ef4444; }",
    "  .dc-pending { color: #9ca3af; }",
    "  .dc-brackets { font-family: monospace; font-size: 0.85em; }",
    "</style>",
    "",
    selfContainedHtmlBody(),
  ].join("\n");
}
