"use client";

import { useChat } from "@ai-sdk/react";
import type { Citation, Verification } from "deepcitation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { FileUpload } from "@/components/FileUpload";
import { VerificationPanel } from "@/components/VerificationPanel";
import { toDrawerItems } from "@/utils/citationDrawerAdapter";
import { SAMPLE_QUESTIONS } from "@/lib/corpus";

type FileDataPart = { attachmentId: string; filename?: string };

// Type for the verify API response (per message)
interface MessageVerificationResult {
  citations: Record<string, Citation>;
  verifications: Record<string, Verification>;
  summary: {
    total: number;
    verified: number;
    missed: number;
    pending: number;
  };
}

export default function Home() {
  const [fileDataParts, setFileDataParts] = useState<FileDataPart[]>([]);
  const [deepTextPromptPortions, setDeepTextPromptPortions] = useState<string[]>([]);
  const [isCorpusLoaded, setIsCorpusLoaded] = useState(false);
  const [corpusLoading, setCorpusLoading] = useState(true);
  const [corpusError, setCorpusError] = useState<string | null>(null);

  // Map of message ID to its full verification result
  const [messageVerifications, setMessageVerifications] = useState<Record<string, MessageVerificationResult>>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load the bundled corpus (called on mount and retried on demand)
  const loadCorpus = async () => {
    setCorpusLoading(true);
    setCorpusError(null);
    try {
      const res = await fetch("/api/corpus/init");
      if (!res.ok) throw new Error("Corpus init failed");
      const data: { fileDataParts: FileDataPart[]; deepTextPromptPortions: string[] } = await res.json();
      setFileDataParts(data.fileDataParts);
      setDeepTextPromptPortions(data.deepTextPromptPortions);
      setIsCorpusLoaded(true);
      return true;
    } catch (err) {
      console.error("Corpus load failed:", err);
      setCorpusError(err instanceof Error ? err.message : "Failed to load sample documents");
      return false;
    } finally {
      setCorpusLoading(false);
    }
  };

  // Load bundled corpus on mount
  useEffect(() => { loadCorpus(); }, []);

  // Stable event handler for verification
  const onVerifyMessage = useEffectEvent((messageId: string, messageContent: string) => {
    if (!messageContent || fileDataParts.length === 0) return;

    fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llmOutput: messageContent }),
    })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Verification request failed (${res.status})`);
        }
        return res.json();
      })
      .then((data: MessageVerificationResult) => {
        setVerificationError(prev => {
          if (!(messageId in prev)) return prev;
          const next = { ...prev };
          delete next[messageId];
          return next;
        });
        setMessageVerifications(prev => ({
          ...prev,
          [messageId]: data,
        }));
      })
      .catch(err => {
        console.error("Verification failed:", err);
        setVerificationError(prev => ({
          ...prev,
          [messageId]: err instanceof Error ? err.message : "Verification failed",
        }));
      })
      .finally(() => setIsVerifying(false));
  });

  const { messages, input, handleInputChange, handleSubmit, append, isLoading, error } = useChat({
    streamProtocol: "text",
    body: {
      fileDataParts,
      deepTextPromptPortions,
    },
    onFinish: message => {
      if (message.role === "assistant") {
        const content = message.content || "";
        setIsVerifying(true);
        onVerifyMessage(message.id, content);
      }
    },
    onError: err => {
      console.error("[useChat] Error:", err);
    },
  });

  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    setUploadError(null);

    let uploadResult: { res: Response; data: Record<string, unknown> } | null = null;
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = (await res.json()) as Record<string, unknown>;
      uploadResult = { res, data };
    } catch (error) {
      setUploadError("Network error - check if the server is running");
      console.error("Upload failed:", error);
    }

    if (uploadResult) {
      const { res, data } = uploadResult;
      if (res.ok && data.fileDataPart) {
        // User upload replaces the corpus documents
        setFileDataParts([data.fileDataPart as FileDataPart]);
        setDeepTextPromptPortions(
          data.deepTextPromptPortion ? [data.deepTextPromptPortion as string] : [],
        );
        setIsCorpusLoaded(false);
      } else {
        const errorMsg = String(data.details ?? data.error ?? "Upload failed");
        setUploadError(errorMsg);
        console.error("Upload failed:", errorMsg);
      }
    }
  };

  const handleSampleQuestion = async (question: string) => {
    // Load corpus on-demand if it hasn't loaded yet
    if (!hasDocuments) {
      const ok = await loadCorpus();
      if (!ok) return;
    }
    append({ role: "user", content: question });
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Get latest message's verification result
  const latestVerification = messages.length > 0 ? messageVerifications[messages[messages.length - 1]?.id] : null;

  const hasDocuments = fileDataParts.length > 0;
  const isBusy = isLoading || isVerifying;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">DeepCitation Chat</h1>
              <p className="text-sm text-gray-500">Upload documents and ask questions with verified citations</p>
            </div>
            <div className="text-xs text-gray-400">gpt-5-mini</div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="bg-white rounded-xl p-8 shadow-sm max-w-lg">
                <h2 className="text-lg font-medium text-gray-900 mb-2">Welcome to DeepCitation Chat</h2>
                <p className="text-gray-600 mb-4">
                  {corpusLoading
                    ? "Loading sample documents..."
                    : hasDocuments && isCorpusLoaded
                      ? "Sample documents are pre-loaded. Try a question below, or upload your own document."
                      : "Try a sample question below or upload your own document. Every AI response will be verified against your attachments."}
                </p>

                {corpusError && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    Documents will be loaded when you ask a question.{" "}
                    <button
                      type="button"
                      onClick={() => loadCorpus()}
                      className="underline hover:text-amber-900"
                    >
                      Retry now
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-2 mt-4">
                  {SAMPLE_QUESTIONS.map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleSampleQuestion(q)}
                      disabled={isBusy || corpusLoading}
                      className="text-left text-sm px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map(message => {
                const msgVerification = messageVerifications[message.id];
                return (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    citations={msgVerification?.citations}
                    verifications={msgVerification?.verifications}
                    summary={msgVerification?.summary}
                    drawerItems={
                      msgVerification
                        ? toDrawerItems(msgVerification.citations, msgVerification.verifications)
                        : undefined
                    }
                  />
                );
              })}
              {isLoading && (
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="animate-pulse">Thinking...</div>
                </div>
              )}
              {isVerifying && (
                <div className="flex items-center gap-2 text-blue-500 text-sm">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verifying citations...
                </div>
              )}
              {Object.entries(verificationError).map(([msgId, errMsg]) => (
                <div key={msgId} className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <span className="flex-1">Verification failed: {errMsg}</span>
                  <button
                    onClick={() => {
                      const msg = messages.find(m => m.id === msgId);
                      if (msg) {
                        setIsVerifying(true);
                        const content = msg.content || "";
                        onVerifyMessage(msgId, content);
                      }
                    }}
                    className="px-2 py-1 bg-red-100 hover:bg-red-200 rounded text-xs font-medium"
                  >
                    Retry
                  </button>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t bg-white px-6 py-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <FileUpload
              onUpload={handleFileUpload}
              uploadedFiles={fileDataParts.map(f => ({
                name: f.filename || "Document",
                attachmentId: f.attachmentId,
              }))}
            />
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder={
                corpusLoading
                  ? "Loading sample documents..."
                  : hasDocuments
                    ? "Ask a question about your documents..."
                    : "Upload a document first, then ask questions..."
              }
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isBusy || corpusLoading}
            />
            <button
              type="submit"
              disabled={isBusy || corpusLoading || !input.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>

          {fileDataParts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {fileDataParts.map(file => (
                <span
                  key={file.attachmentId}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm text-gray-700"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  {file.filename || "Document"}
                  {isCorpusLoaded && (
                    <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                      Sample
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}

          {uploadError && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <strong>Upload Error:</strong> {uploadError}
            </div>
          )}

          {error && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <strong>Chat Error:</strong> {error.message}
            </div>
          )}
        </div>
      </div>

      {/* Verification Panel */}
      {latestVerification && latestVerification.summary?.total > 0 && (
        <VerificationPanel verification={latestVerification} />
      )}
    </div>
  );
}
