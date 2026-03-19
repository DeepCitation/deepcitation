"use client";

import { startTransition, useState } from "react";
import { ChatMessage, LoadingSkeleton } from "@/components/ChatMessage";
import type { ChatResponse, ConversationMessage } from "@/lib/types";

const SAMPLE_QUESTIONS = [
  "What discount rate applies when the YC SAFE converts, and what triggers a conversion event?",
  "How many NVIDIA shares is Robertson planning to sell, and what is the estimated aggregate market value?",
  "How does multi-head attention work, and why does the Transformer drop recurrence entirely?",
  "What are the root causes of hallucination in language models, and how does RAG reduce them?",
];

const CORPUS_DOCS = [
  { title: "YC SAFE (Discount Only)", filename: "YC_SAFE_Discount_Only.docx.pdf" },
  { title: "NVDA Form 144 – Robertson", filename: "NVDA_Form144_Robertson.pdf" },
  { title: "Attention Is All You Need", filename: "Attention Is All You Need.pdf" },
  { title: "Why Language Models Hallucinate", filename: "Why Language Models Hallucinate.pdf" },
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
                <strong>4 PDFs</strong>
                <span>Remote corpus, fetched and cached on first use</span>
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
                  <h2 className="mt-0 text-2xl font-semibold">Ask about the three corpus documents.</h2>
                  <p className="hero-copy">
                    The server retrieves only the most relevant sources, then fetches those exact PDFs and sends them
                    through DeepCitation so the answer can be verified against page-level evidence.
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
                {isLoading ? <LoadingSkeleton /> : null}
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
            <ul className="corpus-list">
              {CORPUS_DOCS.map(doc => (
                <li key={doc.filename}>
                  <a className="corpus-link" href={`/api/corpus/${doc.filename}`} download>
                    <span>{doc.title}</span>
                    <svg className="download-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M10 3a.75.75 0 0 1 .75.75v7.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 1.06-1.06l2.72 2.72V3.75A.75.75 0 0 1 10 3ZM4 15.25a.75.75 0 0 1 .75.75v.5h10.5v-.5a.75.75 0 0 1 1.5 0v.5A1.5 1.5 0 0 1 15.25 18H4.75A1.5 1.5 0 0 1 3.25 16.5v-.5a.75.75 0 0 1 .75-.75Z" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
