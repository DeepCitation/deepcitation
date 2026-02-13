import type React from "react";
import { getIndicator, toSuperscript } from "../../markdown/markdownVariants.js";
import { getCitationStatus } from "../../parsing/parseCitation.js";
import type { Citation } from "../../types/citation.js";
import type { Verification } from "../../types/verification.js";
import {
  DOC_CITATION_1,
  DOC_CITATION_2,
  DOC_CITATION_3,
  NOT_FOUND_VERIFICATION,
  PARTIAL_VERIFICATION,
  PROOF_BASE_URL,
  RENDER_STATUS_TYPES,
  SLACK_VARIANTS,
  VERIFIED_VERIFICATION,
} from "./RenderTargetShowcase.constants.js";

// =============================================================================
// SLACK OUTPUT SIMULATION
// =============================================================================

function slackBrackets(num: number, indicator: string, proofUrl: string): string {
  return `<${proofUrl}|[${num}${indicator}]>`;
}

function slackInline(anchorText: string, indicator: string, proofUrl: string): string {
  return `<${proofUrl}|${anchorText}${indicator}>`;
}

function slackNumber(num: number, indicator: string, proofUrl: string): string {
  return `<${proofUrl}|${toSuperscript(num)}${indicator}>`;
}

function getSlackVariantOutput(variant: string, citation: Citation, indicator: string, proofUrl: string): string {
  const num = citation.citationNumber ?? 1;
  const anchor = citation.anchorText ?? "citation";
  switch (variant) {
    case "brackets":
      return slackBrackets(num, indicator, proofUrl);
    case "inline":
      return slackInline(anchor, indicator, proofUrl);
    case "number":
      return slackNumber(num, indicator, proofUrl);
    default:
      return slackBrackets(num, indicator, proofUrl);
  }
}

// =============================================================================
// SLACK MESSAGE CONTAINER
// =============================================================================

function SlackMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded bg-indigo-500 shrink-0 flex items-center justify-center text-white text-xs font-bold">
          DC
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm text-gray-900 dark:text-white">DeepCitation Bot</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">12:34 PM</span>
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300">{children}</div>
        </div>
      </div>
    </div>
  );
}

function SlackLink({ children }: { href: string; children: React.ReactNode }) {
  return (
    <span className="text-blue-600 dark:text-blue-400 underline cursor-pointer hover:text-blue-800 dark:hover:text-blue-300">
      {children}
    </span>
  );
}

// =============================================================================
// SLACK PREVIEW COMPONENT
// =============================================================================

export function SlackPreview() {
  return (
    <div className="space-y-6">
      {/* Variants x Statuses Matrix */}
      <div data-testid="slack-variants-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Variants x Statuses</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Variant</th>
                {RENDER_STATUS_TYPES.map(({ name }) => (
                  <th key={name} className="text-left p-2 text-gray-600 dark:text-gray-400">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLACK_VARIANTS.map(variant => (
                <tr
                  key={variant}
                  className="border-b border-gray-100 dark:border-gray-800"
                  data-slack-variant={variant}
                >
                  <td className="p-2 font-mono text-gray-700 dark:text-gray-300 text-xs">{variant}</td>
                  {RENDER_STATUS_TYPES.map(({ name, verification, citation }) => {
                    const status = getCitationStatus(verification);
                    const indicator = getIndicator(status, "check");
                    const proofUrl = `${PROOF_BASE_URL}/p/${citation.attachmentId || "url"}`;
                    const output = getSlackVariantOutput(variant, citation, indicator, proofUrl);
                    return (
                      <td key={name} className="p-2" data-slack-status={name.toLowerCase().replace(" ", "-")}>
                        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-gray-800 dark:text-gray-200">
                          {output}
                        </code>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sources Appendix */}
      <div data-testid="slack-sources-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Sources Appendix</h3>
        <SlackMessage>
          <div className="space-y-1">
            <p className="font-bold italic">Sources:</p>
            <SlackSourceLine num={1} verification={VERIFIED_VERIFICATION} label="Q4 Financial Report" page={5} />
            <SlackSourceLine num={2} verification={PARTIAL_VERIFICATION} label="Q4 Financial Report" page={9} />
            <SlackSourceLine num={3} verification={NOT_FOUND_VERIFICATION} label="Q4 Financial Report" page={12} />
          </div>
        </SlackMessage>
        <div className="mt-2">
          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
            {`*Sources:*\n${slackSourceRaw(1, VERIFIED_VERIFICATION, "Q4 Financial Report", 5)}\n${slackSourceRaw(2, PARTIAL_VERIFICATION, "Q4 Financial Report", 9)}\n${slackSourceRaw(3, NOT_FOUND_VERIFICATION, "Q4 Financial Report", 12)}`}
          </pre>
        </div>
      </div>

      {/* Complete Message Example */}
      <div data-testid="slack-complete-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Complete Message</h3>
        <SlackMessage>
          <div className="space-y-2">
            <p>
              The company reported strong growth.{" "}
              <SlackCitationPreview variant="brackets" citation={DOC_CITATION_1} verification={VERIFIED_VERIFICATION} />{" "}
              Operating costs were reduced.{" "}
              <SlackCitationPreview variant="brackets" citation={DOC_CITATION_2} verification={PARTIAL_VERIFICATION} />{" "}
              However, some projections remain unverified.{" "}
              <SlackCitationPreview
                variant="brackets"
                citation={DOC_CITATION_3}
                verification={NOT_FOUND_VERIFICATION}
              />
            </p>
            <hr className="border-gray-200 dark:border-gray-600" />
            <div className="space-y-1">
              <p className="font-bold italic">Sources:</p>
              <SlackSourceLine num={1} verification={VERIFIED_VERIFICATION} label="Q4 Financial Report" page={5} />
              <SlackSourceLine num={2} verification={PARTIAL_VERIFICATION} label="Q4 Financial Report" page={9} />
              <SlackSourceLine num={3} verification={NOT_FOUND_VERIFICATION} label="Q4 Financial Report" page={12} />
            </div>
          </div>
        </SlackMessage>
        <div className="mt-2">
          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
            {completeSlackRaw()}
          </pre>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function SlackCitationPreview({
  variant,
  citation,
  verification,
}: {
  variant: string;
  citation: Citation;
  verification: Verification;
}) {
  const status = getCitationStatus(verification);
  const indicator = getIndicator(status, "check");
  const num = citation.citationNumber ?? 1;
  const anchor = citation.anchorText ?? "citation";

  let displayText: string;
  switch (variant) {
    case "inline":
      displayText = `${anchor}${indicator}`;
      break;
    case "number":
      displayText = `${toSuperscript(num)}${indicator}`;
      break;
    default:
      displayText = `[${num}${indicator}]`;
      break;
  }

  return (
    <SlackLink href={`${PROOF_BASE_URL}/p/${(citation.type !== "url" && citation.attachmentId) || "url"}`}>
      {displayText}
    </SlackLink>
  );
}

function SlackSourceLine({
  num,
  verification,
  label,
  page,
}: {
  num: number;
  verification: Verification;
  label: string;
  page: number;
}) {
  const status = getCitationStatus(verification);
  const indicator = getIndicator(status, "check");
  return (
    <p>
      {"• "}
      <SlackLink href={`${PROOF_BASE_URL}/p/proof${num}`}>
        [{num}
        {indicator}]
      </SlackLink>{" "}
      {label} — p.{page}
    </p>
  );
}

function slackSourceRaw(num: number, verification: Verification, label: string, page: number): string {
  const status = getCitationStatus(verification);
  const indicator = getIndicator(status, "check");
  return `• <${PROOF_BASE_URL}/p/proof${num}|[${num}${indicator}]> ${label} — p.${page}`;
}

function completeSlackRaw(): string {
  const v1 = getCitationStatus(VERIFIED_VERIFICATION);
  const v2 = getCitationStatus(PARTIAL_VERIFICATION);
  const v3 = getCitationStatus(NOT_FOUND_VERIFICATION);
  const i1 = getIndicator(v1, "check");
  const i2 = getIndicator(v2, "check");
  const i3 = getIndicator(v3, "check");

  return [
    `The company reported strong growth. <${PROOF_BASE_URL}/p/abc123|[1${i1}]> Operating costs were reduced. <${PROOF_BASE_URL}/p/abc123|[2${i2}]> However, some projections remain unverified. <${PROOF_BASE_URL}/p/abc123|[3${i3}]>`,
    "",
    "*Sources:*",
    slackSourceRaw(1, VERIFIED_VERIFICATION, "Q4 Financial Report", 5),
    slackSourceRaw(2, PARTIAL_VERIFICATION, "Q4 Financial Report", 9),
    slackSourceRaw(3, NOT_FOUND_VERIFICATION, "Q4 Financial Report", 12),
  ].join("\n");
}
