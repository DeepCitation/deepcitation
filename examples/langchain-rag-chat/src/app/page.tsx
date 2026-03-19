"use client";

import { startTransition, useState } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import type { ChatResponse, ConversationMessage } from "@/lib/types";

const SAMPLE_QUESTIONS = [
  "Which company reported 42 percent revenue growth, and what else did management say?",
  "What changed in the Solena battery safety pilot?",
  "How did Aster Health improve onboarding and activation?",
];

export default function Home() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendQuestion = async (nextQuestion: string) => {
    const trimmedQuestion = nextQuestion.trim();
    if (!trimmedQuestion || isLoading) return;

    startTransition(() => {
      setMessages(prev => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: "user",
          content: trimmedQuestion,
        },
      ]);
      setQuestion("");
      setError(null);
      setIsLoading(true);
    });

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: trimmedQuestion }),
    })
      .then(async result => {
        const payload = (await result.json()) as ChatResponse | { error?: string };
        if (!result.ok || !("rawLlmOutput" in payload)) {
          const errorMessage =
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : `Request failed with status ${result.status}`;
          throw new Error(errorMessage);
        }

        return payload;
      })
      .catch(requestError => {
        startTransition(() => {
          setError(requestError instanceof Error ? requestError.message : "Request failed");
        });
        return null;
      });

    if (response) {
      startTransition(() => {
        setMessages(prev => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: response.visibleText,
            rawLlmOutput: response.rawLlmOutput,
            citations: response.citations,
            verifications: response.verifications,
            summary: response.summary,
            retrievedSources: response.retrievedSources,
          },
        ]);
      });
    }

    startTransition(() => {
      setIsLoading(false);
    });
  };

  return (
    <main className="app-shell">
      <div className="app-grid">
        <section className="chat-panel panel">
          <div className="hero-panel">
            <span className="chip">LangChain.js + DeepCitation</span>
            <h1 className="hero-title">RAG retrieval gets you close. DeepCitation proves the answer.</h1>
            <p className="hero-copy">
              This example keeps the retrieval stack small: a bundled PDF corpus, OpenAI embeddings, LangChain&apos;s
              in-memory vector store, and DeepCitation for citation-aware generation plus verification.
            </p>
            <div className="metrics-grid">
              <div className="metric-card">
                <strong>3 PDFs</strong>
                <span>Bundled local corpus, no upload flow</span>
              </div>
              <div className="metric-card">
                <strong>0 infra</strong>
                <span>No DB, no vector service, no Docker</span>
              </div>
              <div className="metric-card">
                <strong>1 route</strong>
                <span>Retrieve, answer, cite, verify, return</span>
              </div>
            </div>
          </div>

          <div className="messages">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-card">
                  <h2 className="mt-0 text-2xl font-semibold">Ask about the bundled research packets.</h2>
                  <p className="hero-copy">
                    The server retrieves only the most relevant sources, then sends those exact PDFs through
                    DeepCitation so the answer can be verified against page-level evidence.
                  </p>
                  <div className="sample-list">
                    {SAMPLE_QUESTIONS.map(sample => (
                      <button
                        key={sample}
                        type="button"
                        className="sample-button"
                        onClick={() => setQuestion(sample)}
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="message-stack">
                {messages.map(message => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                {isLoading ? (
                  <div className="status-line">
                    <span className="dot pending" />
                    Retrieving sources, generating the answer, and verifying citations.
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="composer">
            <form
              className="composer-form"
              onSubmit={async event => {
                event.preventDefault();
                await sendQuestion(question);
              }}
            >
              <div className="sample-list">
                {SAMPLE_QUESTIONS.map(sample => (
                  <button
                    key={sample}
                    type="button"
                    className="sample-button"
                    onClick={() => setQuestion(sample)}
                    disabled={isLoading}
                  >
                    {sample}
                  </button>
                ))}
              </div>
              <div className="composer-row">
                <textarea
                  className="question-input"
                  value={question}
                  onChange={event => setQuestion(event.target.value)}
                  placeholder="Ask a question about the bundled PDFs."
                  disabled={isLoading}
                />
                <button className="send-button" type="submit" disabled={isLoading || question.trim().length === 0}>
                  {isLoading ? "Working..." : "Ask with proof"}
                </button>
              </div>
              {error ? <div className="error-banner">{error}</div> : null}
              <p className="helper-text">
                Each question is a fresh retrieval + verification pass so the LangChain and DeepCitation flow stays
                easy to inspect.
              </p>
            </form>
          </div>
        </section>

        <aside className="sidebar-panel panel">
          <section className="side-section">
            <div className="status-line">
              <span className={`dot ${isLoading ? "pending" : ""}`} />
              {isLoading ? "Processing a live request" : "Ready to run with only env vars"}
            </div>
          </section>

          <section className="side-section">
            <h3>What the example proves</h3>
            <p>
              Retrieval chooses which sources matter. DeepCitation verifies whether the answer&apos;s citations actually
              resolve to those source pages and phrases.
            </p>
          </section>

          <section className="side-section">
            <h3>Flow</h3>
            <ul>
              <li>LangChain chunks and embeds the local corpus into an in-memory vector store.</li>
              <li>The API route retrieves the best matching sources for the current question.</li>
              <li>DeepCitation uploads only those PDFs, wraps the prompt, verifies citations, and returns proof data.</li>
            </ul>
          </section>

          <section className="side-section">
            <h3>Bundled corpus</h3>
            <ul>
              <li>Northstar Robotics Q1 Brief</li>
              <li>Solena Energy Battery Safety Pilot</li>
              <li>Aster Health Onboarding Study</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
