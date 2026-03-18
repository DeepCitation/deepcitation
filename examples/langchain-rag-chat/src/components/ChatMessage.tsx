"use client";

import { parseCitationResponse } from "deepcitation";
import { CitationComponent } from "deepcitation/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ConversationMessage } from "@/lib/types";

interface ChatMessageProps {
  message: ConversationMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

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
              {renderMessageContent(
                message.rawLlmOutput ?? message.content,
                message.citations ?? {},
                message.verifications ?? {},
              )}
            </div>

            {message.summary ? (
              <div className="summary-badges">
                <span className="summary-badge verified">{message.summary.verified} verified</span>
                {message.summary.partial > 0 ? (
                  <span className="summary-badge partial">{message.summary.partial} partial</span>
                ) : null}
                {message.summary.missed > 0 ? (
                  <span className="summary-badge missed">{message.summary.missed} missed</span>
                ) : null}
                {message.summary.pending > 0 ? (
                  <span className="summary-badge pending">{message.summary.pending} pending</span>
                ) : null}
                <span className="summary-badge pending">{message.summary.total} total</span>
              </div>
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

function renderMessageContent(
  rawLlmOutput: string,
  citations: ConversationMessage["citations"] = {},
  verifications: ConversationMessage["verifications"] = {},
): React.ReactNode {
  const parsed = parseCitationResponse(rawLlmOutput);
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
