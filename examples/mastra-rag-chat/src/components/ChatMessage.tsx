"use client";

import { parseCitationResponse } from "deepcitation";
import {
  CitationComponent,
  CitationDrawer,
  CitationDrawerTrigger,
  groupCitationsBySource,
} from "deepcitation/react";
import type { CitationDrawerItem } from "deepcitation/react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ConversationMessage } from "@/lib/types";

interface ChatMessageProps {
  message: ConversationMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [drawerOpen, setDrawerOpen] = useState(false);

  const parsed = useMemo(
    () => (message.rawLlmOutput ? parseCitationResponse(message.rawLlmOutput) : null),
    [message.rawLlmOutput],
  );

  const drawerItems = useMemo<CitationDrawerItem[]>(() => {
    const citations = message.citations ?? {};
    const verifications = message.verifications ?? {};
    return Object.entries(citations).map(([citationKey, citation]) => ({
      citationKey,
      citation,
      verification: verifications[citationKey] ?? null,
    }));
  }, [message.citations, message.verifications]);

  const citationGroups = useMemo(
    () => groupCitationsBySource(drawerItems),
    [drawerItems],
  );

  return (
    <div className={`message-row ${isUser ? "user" : ""}`}>
      {!isUser ? <div className="avatar">DC</div> : null}

      <article className={`message-card ${isUser ? "user" : ""}`}>
        <p className="message-heading">{isUser ? "Question" : "Answer"}</p>

        {isUser ? (
          <p className="m-0 whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <div>
              {parsed
                ? renderParsedContent(parsed, message.citations ?? {}, message.verifications ?? {})
                : <p>{message.content}</p>}
            </div>

            {citationGroups.length > 0 ? (
              <>
                <div className="drawer-trigger-row">
                  <CitationDrawerTrigger
                    citationGroups={citationGroups}
                    onClick={() => setDrawerOpen(true)}
                    isOpen={drawerOpen}
                  />
                </div>
                <CitationDrawer
                  isOpen={drawerOpen}
                  onClose={() => setDrawerOpen(false)}
                  citationGroups={citationGroups}
                />
              </>
            ) : null}

            {message.retrievedSources && message.retrievedSources.length > 0 ? (
              <div className="retrieval-grid">
                {message.retrievedSources.map(source => (
                  <div className="retrieval-card" key={source.sourceId}>
                    <h4>{source.title}</h4>
                    <div className="retrieval-meta">
                      {source.filename} • similarity {source.score}
                    </div>
                    <p>{source.excerpt}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </article>

      {isUser ? <div className="avatar user">U</div> : null}
    </div>
  );
}

/** Skeleton placeholder shown while the server is processing. */
export function LoadingSkeleton() {
  return (
    <div className="message-row">
      <div className="avatar">DC</div>
      <article className="message-card">
        <p className="message-heading">Answer</p>
        <div className="skeleton-lines">
          <div className="skeleton-line" style={{ width: "92%" }} />
          <div className="skeleton-line" style={{ width: "78%" }} />
          <div className="skeleton-line" style={{ width: "85%" }} />
          <div className="skeleton-line" style={{ width: "60%" }} />
        </div>
        <div className="loading-label">
          <span className="loading-spinner" />
          Retrieving sources, generating answer, and verifying citations&hellip;
        </div>
      </article>
    </div>
  );
}

function renderParsedContent(
  parsed: ReturnType<typeof parseCitationResponse>,
  citations: ConversationMessage["citations"] = {},
  verifications: ConversationMessage["verifications"] = {},
): React.ReactNode {
  const pieces = parsed.visibleText.split(parsed.splitPattern);

  return (
    <>
      {pieces.map((piece, index) => {
        const markerMatch = piece.match(/^\[(\d+)\]$/);
        if (markerMatch) {
          const key = parsed.markerMap[Number(markerMatch[1])];
          const citation = key ? (citations?.[key] ?? parsed.citations[key]) : null;

          if (!key || !citation) {
            return <span key={`marker-${index}`}>{piece}</span>;
          }

          return (
            <CitationComponent
              key={`marker-${index}`}
              citation={citation}
              verification={verifications?.[key]}
            />
          );
        }

        return (
          <ReactMarkdown
            key={`text-${index}`}
            remarkPlugins={[remarkGfm]}
            components={{ p: ({ children }) => <span>{children}</span> }}
          >
            {piece}
          </ReactMarkdown>
        );
      })}
    </>
  );
}
