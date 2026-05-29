"use client";
import { parseCitationResponse } from "deepcitation";
import { CitationComponent, CitationDrawer, CitationDrawerTrigger, groupCitationsBySource, } from "deepcitation/react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CONTINUE, visit } from "unist-util-visit";
/**
 * ChatMessage Component
 *
 * Displays chat messages with inline citation verification.
 * Replaces [N] citation markers with CitationComponent using verification data.
 * Shows a CitationDrawerTrigger at the bottom of assistant messages
 * that opens a full CitationDrawer on click.
 */
export function ChatMessage({ message, citations, verifications, drawerItems }) {
    const isUser = message.role === "user";
    const [drawerOpen, setDrawerOpen] = useState(false);
    // AI SDK v6 uses parts array, fall back to content for compatibility
    const messageContent = message.content ||
        message.parts
            ?.filter(p => p.type === "text")
            .map(p => p.text)
            .join("") ||
        "";
    const parsed = useMemo(() => {
        return parseCitationResponse(messageContent);
    }, [messageContent]);
    const citationGroups = useMemo(() => {
        if (!drawerItems || drawerItems.length === 0)
            return [];
        return groupCitationsBySource(drawerItems);
    }, [drawerItems]);
    return (<div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (<div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium shrink-0">
          AI
        </div>)}

      <div className={`max-w-[80%] rounded-lg px-4 py-3 ${isUser ? "bg-blue-600 text-white" : "bg-white border shadow-sm"}`}>
        {isUser ? (<p className="whitespace-pre-wrap">{messageContent}</p>) : (<>
            <div className="prose prose-sm max-w-none">
              {parsed.format === "numeric" ? (<MarkdownWithCitations visibleText={parsed.visibleText} markerMap={parsed.markerMap} parsedCitations={parsed.citations} citations={citations ?? {}} verifications={verifications ?? {}}/>) : (<ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {parsed.visibleText}
                </ReactMarkdown>)}
            </div>

            {/* Citation Drawer Trigger — sits at bottom of assistant message */}
            {citationGroups.length > 0 && (<div className="mt-3 pt-2 border-t border-gray-100">
                <CitationDrawerTrigger citationGroups={citationGroups} onClick={() => setDrawerOpen(true)} isOpen={drawerOpen}/>
              </div>)}
          </>)}
      </div>

      {isUser && (<div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-700 text-sm font-medium shrink-0">
          U
        </div>)}

      {/* CitationDrawer rendered via portal */}
      {drawerOpen && (<CitationDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} citationGroups={citationGroups}/>)}
    </div>);
}
// ---------------------------------------------------------------------------
// Remark plugin: find `[N]` citation markers in text nodes and replace them
// with custom `citation-marker` MDAST nodes so the full markdown AST stays
// intact (bold, lists, etc. are never broken by the split).
// ---------------------------------------------------------------------------
const MARKER_RE = /(\[\d+\])/g;
function remarkCitationMarkers() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (tree) => {
        visit(tree, "text", (node, index, parent) => {
            if (index == null || !parent || !node.value)
                return;
            const parts = node.value.split(MARKER_RE);
            if (parts.length <= 1)
                return;
            const newNodes = parts
                .filter(Boolean)
                .map((part) => {
                const m = part.match(/^\[(\d+)\]$/);
                if (m) {
                    return {
                        type: "citation-marker",
                        data: { hName: "citation-marker", hProperties: { n: m[1] } },
                    };
                }
                return { type: "text", value: part };
            });
            parent.children.splice(index, 1, ...newNodes);
            return [CONTINUE, index + newNodes.length];
        });
    };
}
function MarkdownWithCitations({ visibleText, markerMap, parsedCitations, citations, verifications, }) {
    const plugins = useMemo(() => [remarkGfm, remarkCitationMarkers], []);
    const components = useMemo(() => ({
        "citation-marker": ({ n }) => {
            const key = markerMap[Number(n)];
            const citation = key ? (citations[key] ?? parsedCitations[key]) : null;
            if (!key || !citation)
                return <sup>[{n}]</sup>;
            return <CitationComponent citation={citation} verification={verifications[key]}/>;
        },
    }), [markerMap, citations, parsedCitations, verifications]);
    return (<ReactMarkdown remarkPlugins={plugins} components={components}>
      {visibleText}
    </ReactMarkdown>);
}
