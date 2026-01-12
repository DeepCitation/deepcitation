"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getCitationStatus,
  type Verification,
  type Citation,
} from "@deepcitation/deepcitation-js";
import { CitationComponent } from "@deepcitation/deepcitation-js/react";
import "@deepcitation/deepcitation-js/react/styles.css";

interface ChatMessageProps {
  message: {
    id: string;
    role: "user" | "assistant" | "system" | "data";
    content?: string;
    parts?: Array<{ type: string; text?: string }>;
  };
  verification?: {
    citations: Record<string, Citation>;
    verifications: Record<string, Verification>;
    summary: {
      total: number;
      verified: number;
      missed: number;
      pending: number;
    };
  };
  /** Display mode for citations */
  citationDisplay?: "inline" | "superscript" | "footnotes" | "clean";
}

/**
 * ChatMessage Component
 *
 * Demonstrates multiple ways to display citation verifications in markdown:
 * - inline: Shows citation badges inline with verification status
 * - superscript: Renders citations as superscript numbers
 * - footnotes: Removes inline citations, shows as footnotes at bottom
 * - clean: Removes all citation markers for clean reading
 */
export function ChatMessage({
  message,
  verification,
  citationDisplay = "inline",
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const [hoveredCitation, setHoveredCitation] = useState<string | null>(null);

  // Debug: log message structure
  console.log("[ChatMessage] message:", JSON.stringify(message, null, 2));

  // AI SDK v6 uses parts array, fall back to content for compatibility
  const messageContent =
    message.content ||
    message.parts
      ?.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("") ||
    "";

  console.log("[ChatMessage] extracted content:", messageContent);

  // Process content based on display mode
  const { processedContent, footnotes } = useMemo(() => {
    return processContentWithCitations(
      messageContent,
      verification,
      citationDisplay,
      setHoveredCitation
    );
  }, [messageContent, verification, citationDisplay]);

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium shrink-0">
          AI
        </div>
      )}

      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser ? "bg-blue-600 text-white" : "bg-white border shadow-sm"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{messageContent}</p>
        ) : (
          <div className="prose prose-sm max-w-none">
            {processedContent}

            {/* Footnotes section (only for footnotes mode) */}
            {citationDisplay === "footnotes" && footnotes.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  References:
                </p>
                <ol className="list-decimal list-inside text-xs text-gray-600 space-y-1">
                  {footnotes.map((footnote, index) => (
                    <li key={index} className="leading-relaxed">
                      <CitationFootnote
                        citation={footnote.citation}
                        verification={footnote.verification}
                      />
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Verification summary badge */}
            {verification && verification.summary.total > 0 && (
              <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-gray-500">
                <VerificationSummaryBadge summary={verification.summary} />
              </div>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-700 text-sm font-medium shrink-0">
          U
        </div>
      )}
    </div>
  );
}

/**
 * Verification summary badge component
 */
function VerificationSummaryBadge({
  summary,
}: {
  summary: { total: number; verified: number; missed: number; pending: number };
}) {
  const allVerified = summary.verified === summary.total;
  const someVerified = summary.verified > 0;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
        allVerified
          ? "bg-green-100 text-green-700"
          : someVerified
          ? "bg-yellow-100 text-yellow-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      {allVerified ? "✓" : someVerified ? "◐" : "✗"}
      {summary.verified}/{summary.total} citations verified
    </span>
  );
}

/**
 * Citation footnote component for footnotes mode
 */
function CitationFootnote({
  citation,
  verification,
}: {
  citation: Citation;
  verification?: Verification;
}) {
  const status = getVerificationStatus(verification);

  return (
    <span className="inline-flex items-start gap-2">
      <span
        className={`inline-flex items-center shrink-0 ${
          status === "verified"
            ? "text-green-600"
            : status === "partial"
            ? "text-yellow-600"
            : status === "miss"
            ? "text-red-600"
            : "text-gray-400"
        }`}
      >
        {status === "verified"
          ? "✓"
          : status === "partial"
          ? "◐"
          : status === "miss"
          ? "✗"
          : "○"}
      </span>
      <span>
        {citation.fullPhrase ? (
          <span className="italic">
            "{citation.fullPhrase.slice(0, 100)}
            {citation.fullPhrase.length > 100 ? "..." : ""}"
          </span>
        ) : (
          <span className="text-gray-400">No phrase captured</span>
        )}
        {verification?.pageNumber && (
          <span className="text-gray-400 ml-1">
            (Page {verification.pageNumber})
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Get verification status from a Verification
 * Wraps the library's getCitationStatus for simpler string returns
 */
function getVerificationStatus(
  verification?: Verification
): "verified" | "partial" | "miss" | "pending" {
  if (!verification) return "pending";

  const status = getCitationStatus(verification);
  if (status.isVerified && !status.isPartialMatch) return "verified";
  if (status.isPartialMatch) return "partial";
  if (status.isMiss) return "miss";
  return "pending";
}

interface FootnoteData {
  citation: Citation;
  verification?: Verification;
}

/**
 * Process content and replace citation tags based on display mode
 *
 * This function demonstrates the core pattern for handling DeepCitation output:
 * 1. Parse <cite> tags from LLM response
 * 2. Match with verification results
 * 3. Render in desired format
 */
function processContentWithCitations(
  content: string,
  verification?: {
    citations: Record<string, Citation>;
    verifications: Record<string, Verification>;
  },
  displayMode: "inline" | "superscript" | "footnotes" | "clean" = "inline",
  onHoverCitation?: (key: string | null) => void
): { processedContent: React.ReactNode; footnotes: FootnoteData[] } {
  const footnotes: FootnoteData[] = [];

  // If clean mode, just strip all citation tags
  if (displayMode === "clean") {
    const cleanContent = removeCitationTags(content);
    return {
      processedContent: (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {cleanContent}
        </ReactMarkdown>
      ),
      footnotes: [],
    };
  }

  // Parse citation tags and build replacement map
  // Citation format: <cite pageNumber="X" lineId="Y">quoted text</cite> or <cite pageNumber="X" lineId="Y" />
  const citationRegex = /<cite\s+([^>]*?)(?:\/>|>(.*?)<\/cite>)/gs;
  const parts: Array<{
    type: "text" | "citation";
    content: string;
    key?: string;
  }> = [];

  let lastIndex = 0;
  let match;
  let citationIndex = 0;

  while ((match = citationRegex.exec(content)) !== null) {
    // Add text before this citation
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }

    citationIndex++;
    const key = String(citationIndex);
    const citation = verification?.citations[key];
    const verificationData = verification?.verifications[key];

    // Collect footnotes for footnotes mode
    if (displayMode === "footnotes" && citation) {
      footnotes.push({ citation, verification: verificationData });
    }

    parts.push({
      type: "citation",
      content: match[2] || "", // The quoted text inside the tag
      key,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) });
  }

  // Build the rendered content
  const elements: React.ReactNode[] = [];

  parts.forEach((part, index) => {
    if (part.type === "text") {
      // Render markdown for text parts
      elements.push(
        <ReactMarkdown
          key={index}
          remarkPlugins={[remarkGfm]}
          components={{
            // Render inline to avoid extra <p> tags breaking layout
            p: ({ children }) => <span>{children}</span>,
          }}
        >
          {part.content}
        </ReactMarkdown>
      );
    } else if (part.type === "citation" && part.key) {
      const citation = verification?.citations[part.key];
      const verificationData = verification?.verifications[part.key];
      const status = getVerificationStatus(verificationData);

      if (displayMode === "inline") {
        // Use the official CitationComponent from the library
        elements.push(
          <CitationComponent
            key={`citation-${part.key}`}
            citation={{
              citationNumber: parseInt(part.key),
              fullPhrase: citation?.fullPhrase,
              value: citation?.value,
              pageNumber: citation?.pageNumber,
            }}
            foundCitation={verificationData}
            variant="brackets"
            popoverPosition="top"
          />
        );
      } else if (displayMode === "superscript") {
        // Superscript number with color-coded status
        elements.push(
          <sup
            key={`citation-${part.key}`}
            className={`cursor-help font-semibold ${
              status === "verified"
                ? "text-green-600"
                : status === "partial"
                ? "text-yellow-600"
                : status === "miss"
                ? "text-red-600"
                : "text-gray-400"
            }`}
            title={verificationData?.matchSnippet || citation?.fullPhrase || ""}
          >
            [{part.key}]
          </sup>
        );
      } else if (displayMode === "footnotes") {
        // Just a numbered reference
        elements.push(
          <sup
            key={`citation-${part.key}`}
            className="text-blue-600 cursor-help font-semibold"
            title="See references below"
          >
            [{part.key}]
          </sup>
        );
      }
    }
  });

  return {
    processedContent: <>{elements}</>,
    footnotes,
  };
}

/**
 * Remove all citation tags from content
 */
function removeCitationTags(content: string): string {
  return content
    .replace(/<cite[^>]*\/>/g, "") // Self-closing tags
    .replace(/<cite[^>]*>.*?<\/cite>/gs, "") // Tags with content
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}
