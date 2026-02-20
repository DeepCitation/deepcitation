"use client";

import { useChat } from "@ai-sdk/react";
import type { Citation, FileDataPart, Verification } from "@deepcitation/deepcitation-js";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { FileUpload } from "@/components/FileUpload";
import { VerificationPanel } from "@/components/VerificationPanel";
import { toDrawerItems } from "@/utils/citationDrawerAdapter";

type ModelProvider = "openai" | "gemini";

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

const MODEL_OPTIONS: {
  value: ModelProvider;
  label: string;
  description: string;
}[] = [
  { value: "gemini", label: "Gemini", description: "gemini-2.0-flash-lite" },
  { value: "openai", label: "OpenAI", description: "gpt-5-mini" },
];

export default function Home() {
  // FileDataPart is now the single source of truth (includes deepTextPromptPortion)
  const [fileDataParts, setFileDataParts] = useState<FileDataPart[]>([]);

  // Map of message ID to its full verification result (citations + verifications + summary)
  const [messageVerifications, setMessageVerifications] = useState<Record<string, MessageVerificationResult>>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [provider, setProvider] = useState<ModelProvider>("gemini");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wasLoadingRef = useRef(false);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    streamProtocol: "text",
    body: {
      provider,
      // Pass complete fileDataParts - includes deepTextPromptPortion
      fileDataParts,
    },
    onError: error => {
      console.error("[useChat] Error:", error);
    },
  });

  // Stable event handler for verification - doesn't need to be in deps
  const onVerifyMessage = useEffectEvent((messageId: string, messageContent: string) => {
    if (!messageContent || fileDataParts.length === 0) return;

    // Send llmOutput to verify API - citation extraction happens server-side
    fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llmOutput: messageContent,
        attachmentId: fileDataParts[0].attachmentId,
      }),
    })
      .then(res => res.json())
      .then((data: MessageVerificationResult) => {
        // Store the full verification result keyed by message ID
        setMessageVerifications(prev => ({
          ...prev,
          [messageId]: data,
        }));
      })
      .catch(err => console.error("Verification failed:", err))
      .finally(() => setIsVerifying(false));
  });

  // Detect when streaming completes (isLoading: true -> false) and verify
  useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = isLoading;

    // When loading just finished
    if (wasLoading && !isLoading) {
      const lastMessage = messages[messages.length - 1];
      // Only verify if this message hasn't been verified yet
      if (lastMessage?.role === "assistant" && !messageVerifications[lastMessage.id]) {
        console.log("[useEffect] Stream finished, verifying...");
        setIsVerifying(true);

        // Get message content from either content or parts
        const messageContent =
          lastMessage.content ||
          lastMessage.parts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map(p => p.text)
            .join("") ||
          "";

        onVerifyMessage(lastMessage.id, messageContent);
      }
    }
  }, [isLoading, messages, messageVerifications]);

  const [uploadError, setUploadError] = useState<string | null>(null);

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
        // Store the complete FileDataPart as single source of truth
        setFileDataParts(prev => [...prev, data.fileDataPart]);
      } else {
        // Show error to user
        const errorMsg = data.details || data.error || "Upload failed";
        setUploadError(errorMsg);
        console.error("Upload failed:", errorMsg);
      }
    } catch (error) {
      setUploadError("Network error - check if the server is running");
      console.error("Upload failed:", error);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Get latest message's verification result
  const latestVerification = messages.length > 0 ? messageVerifications[messages[messages.length - 1]?.id] : null;

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

            {/* Settings */}
            <div className="flex items-center gap-4">
              {/* Model Provider Selection */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500">Model:</label>
                <select
                  value={provider}
                  onChange={e => setProvider(e.target.value as ModelProvider)}
                  className="text-sm border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {MODEL_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label} ({option.description})
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
                fileDataParts.length > 0
                  ? "Ask a question about your documents..."
                  : "Upload a document first, then ask questions..."
              }
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
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
