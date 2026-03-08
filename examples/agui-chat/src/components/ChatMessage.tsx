"use client";

import { extractVisibleText, replaceCitations, type Citation, parseCitation, type Verification } from "deepcitation";
import {
  CitationComponent,
  CitationDrawer,
  CitationDrawerTrigger,
  getCitationKey,
  groupCitationsBySource,
  type CitationDrawerItem,
} from "deepcitation/react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
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
 * ChatMessage Component (AG-UI version)
 *
 * Simplified from the nextjs-ai-sdk version — no AI SDK `parts` array,
 * just plain `message.content` string. Otherwise identical rendering logic.
 */
export function ChatMessage({ message, citations, verifications, drawerItems }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [drawerOpen, setDrawerOpen] = useState(false);

  const processedContent = useMemo(() => {
    const visibleText = extractVisibleText(message.content);
    const displayText = replaceCitations(visibleText, {
      leaveAnchorTextBehind: true,
      verifications: verifications ?? {},
      showVerificationStatus: true,
    });
    return processContentWithCitations(displayText, citations ?? {}, verifications ?? {});
  }, [message.content, citations, verifications]);

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
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <div className="prose prose-sm max-w-none">{processedContent}</div>

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

    if (matchIndex > lastIndex) {
      parts.push({
        type: "text",
        content: content.slice(lastIndex, matchIndex),
      });
    }

    parts.push({
      type: "citation",
      content: match[0],
    });

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) });
  }

  const elements: React.ReactNode[] = [];

  parts.forEach((part) => {
    if (part.type === "text") {
      elements.push(
        <ReactMarkdown
          key={`text-${part.content.slice(0, 20)}`}
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <span>{children}</span>,
          }}
        >
          {part.content}
        </ReactMarkdown>,
      );
    } else if (part.type === "citation") {
      try {
        const { citation: parsedCitation } = parseCitation(part.content);
        const citationKey = getCitationKey(parsedCitation);

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
