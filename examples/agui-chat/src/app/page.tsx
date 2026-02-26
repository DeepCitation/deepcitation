"use client";

import type { FileDataPart } from "deepcitation";
import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { FileUpload } from "@/components/FileUpload";
import { VerificationPanel } from "@/components/VerificationPanel";
import { useAgentChat } from "@/hooks/useAgentChat";
import { toDrawerItems } from "@/utils/citationDrawerAdapter";

export default function Home() {
  const [fileDataParts, setFileDataParts] = useState<FileDataPart[]>([]);
  // Accumulated text portions for LLM prompts (one string per uploaded file)
  const [deepTextPromptPortions, setDeepTextPromptPortions] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading,
    isVerifying,
    error,
    messageVerifications,
    sendMessage,
    retry,
  } = useAgentChat({
    agentUrl: "/api/agent",
    fileDataParts,
    deepTextPromptPortions,
  });

  const handleFileUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    setUploadError(null);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.fileDataPart) {
        setFileDataParts(prev => [...prev, data.fileDataPart]);
        if (data.deepTextPromptPortion) {
          setDeepTextPromptPortions(prev => [...prev, data.deepTextPromptPortion]);
        }
      } else {
        const errorMsg = data.details || data.error || "Upload failed";
        setUploadError(errorMsg);
        console.error("Upload failed:", errorMsg);
      }
    } catch (err) {
      setUploadError("Network error - check if the server is running");
      console.error("Upload failed:", err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading || isVerifying) return;
    sendMessage(trimmed);
    setInput("");
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Get latest message's verification result for the side panel
  const latestVerification =
    messages.length > 0
      ? messageVerifications[messages[messages.length - 1]?.id]
      : null;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">DeepCitation Chat</h1>
            <p className="text-sm text-gray-500">
              AG-UI protocol — streaming chat + citation verification over a single SSE connection
            </p>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="bg-white rounded-xl p-8 shadow-sm max-w-lg">
                <h2 className="text-lg font-medium text-gray-900 mb-2">Welcome to DeepCitation Chat</h2>
                <p className="text-gray-600 mb-4">
                  Upload a document to get started, then ask questions. Every AI response will be verified against your
                  attachments.
                </p>

                <div className="text-left text-sm text-gray-500">
                  <p className="font-medium mb-1">How it works:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Upload a PDF or document</li>
                    <li>Ask questions about its content</li>
                    <li>See verified citations with proof</li>
                  </ol>
                </div>

                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-left text-xs text-blue-700">
                  <p className="font-medium mb-1">AG-UI Protocol</p>
                  <p>
                    This example uses a single SSE stream for both LLM tokens and verification results.
                    Open DevTools Network tab to see the raw AG-UI events.
                  </p>
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
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <span className="flex-1">Error: {error.message}</span>
                  {messages.length > 0 && (
                    <button
                      onClick={() => {
                        const lastAssistant = messages.findLast(m => m.role === "assistant");
                        if (lastAssistant) retry(lastAssistant.id);
                      }}
                      className="px-2 py-1 bg-red-100 hover:bg-red-200 rounded text-xs font-medium"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
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
              onChange={e => setInput(e.target.value)}
              placeholder={
                fileDataParts.length > 0
                  ? "Ask a question about your documents..."
                  : "Upload a document first, then ask questions..."
              }
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading || isVerifying}
            />
            <button
              type="submit"
              disabled={isLoading || isVerifying || !input.trim()}
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
                </span>
              ))}
            </div>
          )}

          {uploadError && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <strong>Upload Error:</strong> {uploadError}
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
