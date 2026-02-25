"use client";

import { type Citation, parseCitation, type Verification } from "deepcitation";
import {
  CitationComponent,
  CitationDrawer,
  CitationDrawerTrigger,
  generateCitationKey,
  groupCitationsBySource,
  type CitationDrawerItem,
} from "deepcitation/react";
import { useMemo, useState } from "react";
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
  drawerItems?: CitationDrawerItem[];
}

/**
 * ChatMessage Component
 *
 * Displays chat messages with inline citation verification.
 * Replaces <cite> tags with CitationComponent using verification data.
 * Shows a CitationDrawerTrigger at the bottom of assistant messages
 * that opens a full CitationDrawer on click.
 */
export function ChatMessage({ message, citations, verifications, drawerItems }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const citationGroups = useMemo(() => {
    if (!drawerItems || drawerItems.length === 0) return [];
    return groupCitationsBySource(drawerItems);
  }, [drawerItems]);

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
          <>
            <div className="prose prose-sm max-w-none">{processedContent}</div>

            {/* Citation Drawer Trigger — sits at bottom of assistant message */}
            {citationGroups.length > 0 && (
              <div className="mt-3 pt-2 border-t border-gray-100">
                <CitationDrawerTrigger
                  citationGroups={citationGroups}
                  onClick={() => setDrawerOpen(true)}
                  isOpen={drawerOpen}
                />
              </div>
            )}
          </>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-700 text-sm font-medium shrink-0">
          U
        </div>
      )}

      {/* CitationDrawer rendered via portal */}
      {drawerOpen && (
        <CitationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          citationGroups={citationGroups}
        />
      )}
    </div>
  );
}

const CITE_TAG_REGEX = /<cite\s+[^>]*\/>/g;

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
  const matches = Array.from(content.matchAll(CITE_TAG_REGEX));
  const parts: Array<{ type: "text" | "citation"; content: string }> = [];

  let lastIndex = 0;

  for (const match of matches) {
    const matchIndex = match.index;

    // Add text before this citation
    if (matchIndex > lastIndex) {
      parts.push({
        type: "text",
        content: content.slice(lastIndex, matchIndex),
      });
    }

    parts.push({
      type: "citation",
      content: match[0], // The full <cite ... /> tag
    });

    lastIndex = matchIndex + match[0].length;
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
          key={`text-${part.content.slice(0, 20)}`}
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
      try {
        // Parse the <cite> tag to get a Citation object, then look up by key
        const { citation: parsedCitation } = parseCitation(part.content);
        const citationKey = generateCitationKey(parsedCitation);

        // Look up the server-verified citation and verification by key
        const citation = citations[citationKey] ?? parsedCitation;
        const verification = verifications[citationKey];

        if (!citations[citationKey]) {
          console.warn("[ChatMessage] Citation key not found in verification data, using parsed fallback:", citationKey);
        }

        elements.push(
          <CitationComponent key={`citation-${citationKey}`} citation={citation} verification={verification} />,
        );
      } catch (err) {
        console.warn("[ChatMessage] Failed to parse citation tag:", part.content, err);
        elements.push(<span key={`citation-fallback-${part.content.slice(0, 30)}`}>{part.content}</span>);
      }
    }
  });

  return <>{elements}</>;
}
