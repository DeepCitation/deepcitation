"use client";

import { type Citation, parseCitation, type Verification } from "@deepcitation/deepcitation-js";
import { CitationComponent } from "@deepcitation/deepcitation-js/react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  message: {
    id: string;
    role: "user" | "assistant" | "system" | "data";
    content?: string;
    parts?: Array<{ type: string; text?: string }>;
  };
  citations?: Record<string, Citation>;
  verifications?: Record<string, Verification>;
  summary?: {
    total: number;
    verified: number;
    missed: number;
    pending: number;
  };
}

/**
 * ChatMessage Component
 *
 * Displays chat messages with inline citation verification.
 * Replaces <cite> tags with CitationComponent using verification data.
 */
export function ChatMessage({ message, citations, verifications }: ChatMessageProps) {
  const isUser = message.role === "user";

  // AI SDK v6 uses parts array, fall back to content for compatibility
  const messageContent =
    message.content ||
    message.parts
      ?.filter(p => p.type === "text")
      .map(p => p.text)
      .join("") ||
    "";

  const processedContent = useMemo(() => {
    return processContentWithCitations(messageContent, citations ?? {}, verifications ?? {});
  }, [messageContent, citations, verifications]);

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
          <div className="prose prose-sm max-w-none">{processedContent}</div>
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
function _VerificationSummaryBadge({
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
 * Process content and replace <cite> tags with CitationComponent inline.
 * Uses the pre-extracted citations from the verification response to ensure
 * keys match (since getAllCitationsFromLlmOutput normalizes content before parsing).
 */
function processContentWithCitations(
  content: string,
  citations: Record<string, Citation>,
  verifications: Record<string, Verification>,
): React.ReactNode {
  // Match <cite ... /> tags
  const citationRegex = /<cite\s+[^>]*\/>/g;
  const parts: Array<{ type: "text" | "citation"; content: string }> = [];

  let lastIndex = 0;
  let match;

  while ((match = citationRegex.exec(content)) !== null) {
    // Add text before this citation
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }

    parts.push({
      type: "citation",
      content: match[0], // The full <cite ... /> tag
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) });
  }

  // Get citations and verifications as arrays (preserving order)
  const citationEntries = Object.entries(citations);
  const verificationEntries = Object.entries(verifications);
  let citationIndex = 0;

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
        </ReactMarkdown>,
      );
    } else if (part.type === "citation") {
      // Match by index - citations and verifications should be in same order
      const citationEntry = citationEntries[citationIndex];
      const verificationEntry = verificationEntries[citationIndex];
      citationIndex++;

      if (citationEntry && verificationEntry) {
        const [, citation] = citationEntry;
        const [, verificationData] = verificationEntry;
        elements.push(
          <CitationComponent key={`citation-${index}`} citation={citation} verification={verificationData} />,
        );
      } else if (citationEntry) {
        // Have citation but no verification yet
        const [, citation] = citationEntry;
        elements.push(<CitationComponent key={`citation-${index}`} citation={citation} verification={undefined} />);
      } else {
        // Fallback: parse the citation without verification
        const { citation } = parseCitation(part.content);
        elements.push(<CitationComponent key={`citation-${index}`} citation={citation} verification={undefined} />);
      }
    }
  });

  return <>{elements}</>;
}
