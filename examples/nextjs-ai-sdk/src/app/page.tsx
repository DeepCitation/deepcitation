"use client";

import { useChat } from "ai/react";
import { useState, useRef, useEffect, useId } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { FileUpload } from "@/components/FileUpload";
import { VerificationPanel } from "@/components/VerificationPanel";

type ModelProvider = "openai" | "gemini";
type CitationDisplayMode = "inline" | "superscript" | "footnotes" | "clean";

const MODEL_OPTIONS: {
  value: ModelProvider;
  label: string;
  description: string;
}[] = [
  { value: "openai", label: "OpenAI", description: "gpt-5-mini" },
  { value: "gemini", label: "Gemini", description: "gemini-2.0-flash-lite" },
];

const CITATION_DISPLAY_OPTIONS: {
  value: CitationDisplayMode;
  label: string;
  description: string;
}[] = [
  {
    value: "inline",
    label: "Inline Badges",
    description: "Show verification badges inline",
  },
  {
    value: "superscript",
    label: "Superscript",
    description: "Color-coded superscript numbers",
  },
  {
    value: "footnotes",
    label: "Footnotes",
    description: "References at the bottom",
  },
  { value: "clean", label: "Clean", description: "No citation markers" },
];

export default function Home() {
  const sessionId = useId();
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [verifications, setVerifications] = useState<Record<string, any>>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [provider, setProvider] = useState<ModelProvider>("openai");
  const [citationDisplay, setCitationDisplay] =
    useState<CitationDisplayMode>("inline");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      body: { sessionId, provider },
      onFinish: async (message) => {
        // Verify citations after message is complete
        if (uploadedFiles.length > 0 && message.role === "assistant") {
          setIsVerifying(true);
          try {
            const res = await fetch("/api/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId,
                content: message.content,
              }),
            });
            const data = await res.json();
            setVerifications((prev) => ({
              ...prev,
              [message.id]: data,
            }));
          } catch (error) {
            console.error("Verification failed:", error);
          } finally {
            setIsVerifying(false);
          }
        }
      },
    });

  const handleFileUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sessionId", sessionId);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setUploadedFiles((prev) => [...prev, file.name]);
      }
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Get latest verification summary
  const latestVerification =
    messages.length > 0
      ? verifications[messages[messages.length - 1]?.id]
      : null;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                DeepCitation Chat
              </h1>
              <p className="text-sm text-gray-500">
                Upload documents and ask questions with verified citations
              </p>
            </div>

            {/* Settings */}
            <div className="flex items-center gap-4">
              {/* Model Provider Selection */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500">
                  Model:
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as ModelProvider)}
                  className="text-sm border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {MODEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} ({option.description})
                    </option>
                  ))}
                </select>
              </div>

              {/* Citation Display Mode */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500">
                  Display:
                </label>
                <select
                  value={citationDisplay}
                  onChange={(e) =>
                    setCitationDisplay(e.target.value as CitationDisplayMode)
                  }
                  className="text-sm border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CITATION_DISPLAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
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
                <h2 className="text-lg font-medium text-gray-900 mb-2">
                  Welcome to DeepCitation Chat
                </h2>
                <p className="text-gray-600 mb-4">
                  Upload a document to get started, then ask questions. Every AI
                  response will be verified against your source documents.
                </p>

                <div className="text-left text-sm text-gray-500 mb-4">
                  <p className="font-medium mb-1">How it works:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Upload a PDF or document</li>
                    <li>Ask questions about its content</li>
                    <li>See verified citations with proof</li>
                  </ol>
                </div>

                {/* Citation Display Modes Explanation */}
                <div className="text-left text-sm bg-gray-50 rounded-lg p-4">
                  <p className="font-medium text-gray-700 mb-2">
                    Citation Display Modes:
                  </p>
                  <ul className="space-y-2 text-gray-600">
                    <li>
                      <span className="font-medium text-gray-700">
                        Inline Badges:
                      </span>{" "}
                      Shows [1]<span className="text-green-600">✓</span> badges
                      with hover tooltips
                    </li>
                    <li>
                      <span className="font-medium text-gray-700">
                        Superscript:
                      </span>{" "}
                      Shows <sup className="text-green-600">[1]</sup> with
                      color-coded status
                    </li>
                    <li>
                      <span className="font-medium text-gray-700">
                        Footnotes:
                      </span>{" "}
                      Shows <sup className="text-blue-600">[1]</sup> with
                      references at bottom
                    </li>
                    <li>
                      <span className="font-medium text-gray-700">Clean:</span>{" "}
                      No citation markers for clean reading
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  verification={verifications[message.id]}
                  citationDisplay={citationDisplay}
                />
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="animate-pulse">Thinking...</div>
                </div>
              )}
              {isVerifying && (
                <div className="flex items-center gap-2 text-blue-500 text-sm">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
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
              uploadedFiles={uploadedFiles}
            />
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder={
                uploadedFiles.length > 0
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

          {uploadedFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {uploadedFiles.map((file, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm text-gray-700"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  {file}
                </span>
              ))}
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
