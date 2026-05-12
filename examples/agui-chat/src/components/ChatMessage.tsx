"use client";

import {
  CITATION_DATA_END_DELIMITER,
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
import { useCallback, useMemo, useState } from "react";
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
    // During streaming the citation data block arrives incrementally. Parse only the
    // stripped content so markers render as plain [N] superscripts — interactive
    // CitationComponents activate once the full <<<CITATION_DATA>>> block arrives.
    // (parseCitationResponse handles malformed JSON gracefully via try/catch + repair.)
    if (message.rawContent && !message.rawContent.includes(CITATION_DATA_END_DELIMITER)) {
      return parseCitationResponse(message.content);
    }
    return parseCitationResponse(textForParsing);
  }, [message.rawContent, message.content]);

  const citationGroups = useMemo(() => {
    if (!drawerItems || drawerItems.length === 0) return [];
    return groupCitationsBySource(drawerItems);
  }, [drawerItems]);

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="size-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium shrink-0">
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
              <div className="mt-3 pt-2 border-t border-zinc-100">
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
        <div className="size-8 rounded-full bg-zinc-300 flex items-center justify-center text-zinc-700 text-sm font-medium shrink-0">
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
  return (tree: any) => {
    visit(tree, "text", (node: any, index: any, parent: any) => {
      if (index == null || !parent || !node.value) return;
      const parts = node.value.split(MARKER_RE);
      if (parts.length <= 1) return;

      const newNodes = [];
      for (const part of parts) {
        if (!part) continue;
        const m = part.match(/^\[(\d+)\]$/);
        if (m) {
          newNodes.push({
            type: "citation-marker" as const,
            data: { hName: "citation-marker", hProperties: { n: m[1] } },
          });
        } else {
          newNodes.push({ type: "text" as const, value: part });
        }
      }

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

  const resolveCitation = useCallback(
    (n: string) => {
      const key = markerMap[Number(n)];
      const citation = key ? (citations[key] ?? parsedCitations[key]) : null;
      if (!key || !citation) return <sup>[{n}]</sup>;
      return <CitationComponent citation={citation} verification={verifications[key]} />;
    },
    [markerMap, citations, parsedCitations, verifications],
  );

  const components = useMemo(() => ({
    "citation-marker": ({ n }: { n: string }) => resolveCitation(n),
    code: ({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
      const language = className?.match(/language-(\w+)/)?.[1];
      if (!inline && (language === "text" || language === "txt")) {
        const text = String(children ?? "");
        const parts = text.split(/(\[\d+\])/g);
        let markerOrdinal = 0;
        const nodes = parts.map(part => {
          const m = part.match(/^\[(\d+)\]$/);
          if (m) {
            markerOrdinal += 1;
            return <span key={`citation-${m[1]}-${part}-${markerOrdinal}`}>{resolveCitation(m[1])}</span>;
          }
          return part;
        });
        return (
          <pre className="bg-zinc-50 border border-zinc-200 rounded p-3 text-sm overflow-auto">
            <code>{nodes}</code>
          </pre>
        );
      }
      return <code className={className}>{children}</code>;
    },
  }), [resolveCitation]);

  return (
    <ReactMarkdown remarkPlugins={plugins} components={components as any}>
      {visibleText}
    </ReactMarkdown>
  );
}
