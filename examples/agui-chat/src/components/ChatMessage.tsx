"use client";

import {
  type Citation,
  parseCitationResponse,
  type Verification,
} from "deepcitation";
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
import { CONTINUE, visit } from "unist-util-visit";

interface ChatMessageProps {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
    rawContent?: string;
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

  const parsed = useMemo(() => {
    // Use rawContent (with <<<CITATION_DATA>>>) when available so parseCitationResponse
    // can build the markerMap. Falls back to stripped content for streaming display.
    const textForParsing = message.rawContent ?? message.content;
    return parseCitationResponse(textForParsing);
  }, [message.rawContent, message.content]);

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
            <div className="prose prose-sm max-w-none">
              {parsed.format === "numeric" ? (
                <MarkdownWithCitations
                  visibleText={parsed.visibleText}
                  markerMap={parsed.markerMap}
                  parsedCitations={parsed.citations}
                  citations={citations ?? {}}
                  verifications={verifications ?? {}}
                />
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {parsed.visibleText}
                </ReactMarkdown>
              )}
            </div>

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

// ---------------------------------------------------------------------------
// Remark plugin: find `[N]` citation markers in text nodes and replace them
// with custom `citation-marker` MDAST nodes so the full markdown AST stays
// intact (bold, lists, etc. are never broken by the split).
// ---------------------------------------------------------------------------
const MARKER_RE = /(\[\d+\])/g;

function remarkCitationMarkers() {
  return (tree: Parameters<Exclude<Parameters<typeof visit>[2], undefined>>[0]) => {
    visit(tree, "text", (node: { type: string; value?: string }, index, parent) => {
      if (index == null || !parent || !node.value) return;
      const parts = node.value.split(MARKER_RE);
      if (parts.length <= 1) return;

      const newNodes = parts
        .filter(Boolean)
        .map((part: string) => {
          const m = part.match(/^\[(\d+)\]$/);
          if (m) {
            return {
              type: "citation-marker" as const,
              data: { hName: "citation-marker", hProperties: { n: m[1] } },
            };
          }
          return { type: "text" as const, value: part };
        });

      parent.children.splice(index, 1, ...(newNodes as typeof parent.children));
      return [CONTINUE, index + newNodes.length] as const;
    });
  };
}

// ---------------------------------------------------------------------------
// Single-pass markdown renderer that keeps citation markers inline.
// ---------------------------------------------------------------------------
interface MarkdownWithCitationsProps {
  visibleText: string;
  markerMap: Record<number, string>;
  parsedCitations: Record<string, Citation>;
  citations: Record<string, Citation>;
  verifications: Record<string, Verification>;
}

function MarkdownWithCitations({
  visibleText,
  markerMap,
  parsedCitations,
  citations,
  verifications,
}: MarkdownWithCitationsProps) {
  const plugins = useMemo(() => [remarkGfm, remarkCitationMarkers], []);

  const components = useMemo(() => ({
    "citation-marker": ({ n }: { n: string }) => {
      const key = markerMap[Number(n)];
      const citation = key ? (citations[key] ?? parsedCitations[key]) : null;
      if (!key || !citation) return <sup>[{n}]</sup>;
      return <CitationComponent citation={citation} verification={verifications[key]} />;
    },
  }), [markerMap, citations, parsedCitations, verifications]);

  return (
    <ReactMarkdown remarkPlugins={plugins} components={components as any}>
      {visibleText}
    </ReactMarkdown>
  );
}
