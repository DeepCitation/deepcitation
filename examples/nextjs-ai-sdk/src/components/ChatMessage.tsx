"use client";

import { type Citation, parseCitationResponse, type Verification } from "deepcitation";
import {
  CitationComponent,
  CitationDrawer,
  CitationDrawerTrigger,
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
 * Replaces [N] citation markers with CitationComponent using verification data.
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

/**
 * Process content and replace [N] citation markers with CitationComponent inline.
 * Uses parseCitationResponse to parse the numeric citation format.
 */
function processContentWithCitations(
  content: string,
  citations: Record<string, Citation>,
  verifications: Record<string, Verification>,
): React.ReactNode {
  const result = parseCitationResponse(content);

  if (result.format !== "numeric") {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {result.visibleText}
      </ReactMarkdown>
    );
  }

  const segments = result.visibleText.split(result.splitPattern);

  const mdComponents = { p: ({ children }: { children: React.ReactNode }) => <span>{children}</span> };

  return (
    <>
      {segments.map((seg, i) => {
        const match = seg.match(/^\[(\d+)\]$/);
        if (match) {
          const key = result.markerMap[Number(match[1])];
          if (!key) return <span key={`citation-${i}`}>{seg}</span>;
          const citation = citations[key] ?? result.citations[key];
          if (!citation) return <span key={`citation-${i}`}>{seg}</span>;
          const verification = verifications[key];
          return (
            <CitationComponent key={`citation-${i}`} citation={citation} verification={verification} />
          );
        }
        return (
          <ReactMarkdown
            key={`text-${i}`}
            remarkPlugins={[remarkGfm]}
            components={mdComponents}
          >
            {seg}
          </ReactMarkdown>
        );
      })}
    </>
  );
}
