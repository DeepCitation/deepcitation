"use client";
import { parseCitationResponse } from "deepcitation";
import { CitationComponent, CitationDrawer, CitationDrawerTrigger, groupCitationsBySource, } from "deepcitation/react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CONTINUE, visit } from "unist-util-visit";
export function ChatMessage({ message }) {
    const isUser = message.role === "user";
    const [drawerOpen, setDrawerOpen] = useState(false);
    const parsed = useMemo(() => (message.rawLlmOutput ? parseCitationResponse(message.rawLlmOutput) : null), [message.rawLlmOutput]);
    const drawerItems = useMemo(() => {
        const citations = message.citations ?? {};
        const verifications = message.verifications ?? {};
        return Object.entries(citations).map(([citationKey, citation]) => ({
            citationKey,
            citation,
            verification: verifications[citationKey] ?? null,
        }));
    }, [message.citations, message.verifications]);
    const citationGroups = useMemo(() => groupCitationsBySource(drawerItems), [drawerItems]);
    return (<div className={`message-row ${isUser ? "user" : ""}`}>
      {!isUser ? <div className="avatar">DC</div> : null}

      <article className={`message-card ${isUser ? "user" : ""}`}>
        <p className="message-heading">{isUser ? "Question" : "Answer"}</p>

        {isUser ? (<p className="m-0 whitespace-pre-wrap">{message.content}</p>) : (<>
            <div className="prose">
              {parsed ? (<MarkdownWithCitations visibleText={parsed.visibleText} markerMap={parsed.markerMap} parsedCitations={parsed.citations} citations={message.citations ?? {}} verifications={message.verifications ?? {}}/>) : (<ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>)}
            </div>

            {citationGroups.length > 0 ? (<>
                <div className="drawer-trigger-row">
                  <CitationDrawerTrigger citationGroups={citationGroups} onClick={() => setDrawerOpen(true)} isOpen={drawerOpen}/>
                </div>
                <CitationDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} citationGroups={citationGroups}/>
              </>) : null}

            {message.retrievedSources && message.retrievedSources.length > 0 ? (<div className="retrieval-grid">
                {message.retrievedSources.map(source => (<div className="retrieval-card" key={source.sourceId}>
                    <h4>{source.title}</h4>
                    <div className="retrieval-meta">
                      {source.filename} • similarity {source.score}
                    </div>
                    <p>{source.excerpt}</p>
                  </div>))}
              </div>) : null}
          </>)}
      </article>

      {isUser ? <div className="avatar user">U</div> : null}
    </div>);
}
/** Skeleton placeholder shown while the server is processing. */
export function LoadingSkeleton() {
    return (<div className="message-row">
      <div className="avatar">DC</div>
      <article className="message-card">
        <p className="message-heading">Answer</p>
        <div className="skeleton-lines">
          <div className="skeleton-line" style={{ width: "92%" }}/>
          <div className="skeleton-line" style={{ width: "78%" }}/>
          <div className="skeleton-line" style={{ width: "85%" }}/>
          <div className="skeleton-line" style={{ width: "60%" }}/>
        </div>
        <div className="loading-label">
          <span className="loading-spinner"/>
          Retrieving sources, generating answer, and verifying citations&hellip;
        </div>
      </article>
    </div>);
}
// ---------------------------------------------------------------------------
// Remark plugin: find `[N]` citation markers in text nodes and replace them
// with custom `citation-marker` MDAST nodes so the full markdown AST stays
// intact (bold, lists, etc. are never broken by the split).
// ---------------------------------------------------------------------------
const MARKER_RE = /(\[\d+\])/g;
function remarkCitationMarkers() {
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
