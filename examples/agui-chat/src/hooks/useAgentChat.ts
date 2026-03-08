"use client";

import type { Citation, Verification } from "deepcitation";
import { extractVisibleText } from "deepcitation";
import { useCallback, useRef, useState } from "react";

interface FileDataPart {
  attachmentId: string;
  filename?: string;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface MessageVerificationResult {
  citations: Record<string, Citation>;
  verifications: Record<string, Verification>;
  summary: {
    total: number;
    verified: number;
    missed: number;
    pending: number;
  };
}

interface UseAgentChatOptions {
  agentUrl: string;
  fileDataParts: FileDataPart[];
  deepTextPromptPortions: string[];
}

interface UseAgentChatReturn {
  messages: AgentMessage[];
  isLoading: boolean;
  isVerifying: boolean;
  error: Error | null;
  messageVerifications: Record<string, MessageVerificationResult>;
  sendMessage: (content: string) => void;
  retry: (messageId: string) => void;
  cancel: () => void;
}

let runCounter = 0;

type AgUiEvent =
  | { type: "TEXT_MESSAGE_START"; messageId: string }
  | { type: "TEXT_MESSAGE_CONTENT"; messageId: string; delta: string }
  | { type: "TEXT_MESSAGE_END"; messageId: string }
  | { type: "STATE_DELTA"; delta: Array<{ path: string; value: unknown }> }
  | {
      type: "STATE_SNAPSHOT";
      snapshot: MessageVerificationResult & { verificationStatus?: string };
    }
  | { type: "RUN_ERROR"; message?: string };

export function useAgentChat({
  agentUrl,
  fileDataParts,
  deepTextPromptPortions,
}: UseAgentChatOptions): UseAgentChatReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [messageVerifications, setMessageVerifications] = useState<Record<string, MessageVerificationResult>>({});

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setIsVerifying(false);
  }, []);

  const applyVisibleText = (content: string) => extractVisibleText(content).trimEnd();

  const processEvent = useCallback((event: AgUiEvent) => {
    switch (event.type) {
      case "TEXT_MESSAGE_START":
        currentMessageIdRef.current = event.messageId;
        setMessages(prev => [...prev, { id: event.messageId, role: "assistant", content: "" }]);
        break;

      case "TEXT_MESSAGE_CONTENT":
        setMessages(prev =>
          prev.map(message =>
            message.id === event.messageId
              ? { ...message, content: applyVisibleText(message.content + event.delta) }
              : message,
          ),
        );
        break;

      case "TEXT_MESSAGE_END":
        setIsLoading(false);
        break;

      case "STATE_DELTA":
        if (event.delta.some(op => op.path === "/verificationStatus" && op.value === "verifying")) {
          setIsVerifying(true);
        }
        break;

      case "STATE_SNAPSHOT":
        if (currentMessageIdRef.current) {
          setMessageVerifications(prev => ({
            ...prev,
            [currentMessageIdRef.current as string]: {
              citations: event.snapshot.citations,
              verifications: event.snapshot.verifications,
              summary: event.snapshot.summary,
            },
          }));
        }
        setIsVerifying(false);
        break;

      case "RUN_ERROR":
        setError(new Error(event.message || "Agent run failed"));
        setIsLoading(false);
        setIsVerifying(false);
        break;
    }
  }, []);

  const streamAgentRun = useCallback(
    async (content: string, baseMessages: AgentMessage[]) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMessage: AgentMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content,
      };

      setMessages([...baseMessages, userMessage]);
      setIsLoading(true);
      setError(null);

      const threadId = `thread-${Date.now()}`;
      const runId = `run-${++runCounter}`;

      const response = await fetch(agentUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        signal: controller.signal,
        body: JSON.stringify({
          threadId,
          runId,
          messages: [
            ...baseMessages.map(message => ({
              id: message.id,
              role: message.role,
              content: message.content,
            })),
            { id: userMessage.id, role: "user", content },
          ],
          tools: [],
          context: [],
          state: {
            fileDataParts,
            deepTextPromptPortions,
          },
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Agent request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const dataLines = frame
              .split("\n")
              .filter(line => line.startsWith("data:"))
              .map(line => line.slice(5).trim())
              .filter(Boolean);

            if (dataLines.length === 0) continue;

            processEvent(JSON.parse(dataLines.join("\n")) as AgUiEvent);
          }
        }

        const finalChunk = decoder.decode();
        if (finalChunk) {
          buffer += finalChunk;
        }
      } finally {
        reader.releaseLock();
      }
    },
    [agentUrl, deepTextPromptPortions, fileDataParts, processEvent],
  );

  const sendMessage = useCallback(
    (content: string, priorMessages?: AgentMessage[]) => {
      cancel();

      const baseMessages = priorMessages ?? messages;
      void streamAgentRun(content, baseMessages).catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setError(err instanceof Error ? err : new Error("Connection failed"));
        setIsLoading(false);
        setIsVerifying(false);
      });
    },
    [cancel, messages, streamAgentRun],
  );

  const retry = useCallback(
    (messageId: string) => {
      const msgIndex = messages.findIndex(message => message.id === messageId);
      if (msgIndex <= 0) return;

      const userMessage = messages[msgIndex - 1];
      if (userMessage?.role !== "user") return;

      const filteredMessages = messages.filter(message => message.id !== messageId);
      setMessageVerifications(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      setError(null);
      sendMessage(userMessage.content, filteredMessages);
    },
    [messages, sendMessage],
  );

  return {
    messages,
    isLoading,
    isVerifying,
    error,
    messageVerifications,
    sendMessage,
    retry,
    cancel,
  };
}
