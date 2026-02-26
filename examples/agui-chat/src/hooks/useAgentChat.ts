"use client";

/**
 * useAgentChat — React hook consuming an AG-UI SSE stream
 *
 * Wraps @ag-ui/client's HttpAgent to provide a simple chat interface.
 * Subscribes to the RxJS Observable returned by HttpAgent.run() and
 * maps AG-UI events to React state.
 */

import { HttpAgent } from "@ag-ui/client";
import { EventType, type BaseEvent } from "@ag-ui/core";
import type { Citation, FileDataPart, Verification } from "deepcitation";
import { useCallback, useRef, useState } from "react";
import type { Subscription } from "rxjs";

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

export function useAgentChat({
  agentUrl,
  fileDataParts,
  deepTextPromptPortions,
}: UseAgentChatOptions): UseAgentChatReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [messageVerifications, setMessageVerifications] = useState<
    Record<string, MessageVerificationResult>
  >({});

  const subscriptionRef = useRef<Subscription | null>(null);
  // Track current assistant message ID for event correlation
  const currentMessageIdRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
    setIsLoading(false);
    setIsVerifying(false);
  }, []);

  const sendMessage = useCallback(
    (content: string, priorMessages?: AgentMessage[]) => {
      // Cancel any in-progress request
      cancel();

      const userMessage: AgentMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content,
      };

      const baseMessages = priorMessages ?? messages;
      setMessages([...baseMessages, userMessage]);
      setIsLoading(true);
      setError(null);

      const threadId = `thread-${Date.now()}`;
      const runId = `run-${++runCounter}`;

      const agent = new HttpAgent({ url: agentUrl });

      // Build message history for the agent
      const agentMessages = [
        ...baseMessages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })),
        { id: userMessage.id, role: "user" as const, content },
      ];

      const events$ = agent.run({
        threadId,
        runId,
        messages: agentMessages,
        state: {
          fileDataParts,
          deepTextPromptPortions,
        },
      });

      subscriptionRef.current = events$.subscribe({
        next: (event: BaseEvent) => {
          switch (event.type) {
            case EventType.TEXT_MESSAGE_START: {
              const messageId = (event as BaseEvent & { messageId: string }).messageId;
              currentMessageIdRef.current = messageId;
              setMessages(prev => [
                ...prev,
                { id: messageId, role: "assistant", content: "" },
              ]);
              break;
            }

            case EventType.TEXT_MESSAGE_CONTENT: {
              const { messageId, delta } = event as BaseEvent & {
                messageId: string;
                delta: string;
              };
              setMessages(prev =>
                prev.map(m =>
                  m.id === messageId
                    ? { ...m, content: m.content + delta }
                    : m,
                ),
              );
              break;
            }

            case EventType.TEXT_MESSAGE_END: {
              setIsLoading(false);
              break;
            }

            case EventType.STATE_DELTA: {
              const { delta } = event as BaseEvent & {
                delta: Array<{ op: string; path: string; value: unknown }>;
              };
              // Check for verifying status
              const verifyingOp = delta?.find(
                op => op.path === "/verificationStatus" && op.value === "verifying",
              );
              if (verifyingOp) {
                setIsVerifying(true);
              }
              break;
            }

            case EventType.STATE_SNAPSHOT: {
              const { snapshot } = event as BaseEvent & {
                snapshot: {
                  citations: Record<string, Citation>;
                  verifications: Record<string, Verification>;
                  summary: {
                    total: number;
                    verified: number;
                    missed: number;
                    pending: number;
                  };
                  verificationStatus: string;
                };
              };
              const msgId = currentMessageIdRef.current;
              if (msgId && snapshot) {
                setMessageVerifications(prev => ({
                  ...prev,
                  [msgId]: {
                    citations: snapshot.citations,
                    verifications: snapshot.verifications,
                    summary: snapshot.summary,
                  },
                }));
              }
              setIsVerifying(false);
              break;
            }

            case EventType.RUN_ERROR: {
              const { message } = event as BaseEvent & { message: string };
              setError(new Error(message || "Agent run failed"));
              setIsLoading(false);
              setIsVerifying(false);
              break;
            }

            // RUN_STARTED and RUN_FINISHED — no action needed
          }
        },

        error: (err: unknown) => {
          setError(
            err instanceof Error ? err : new Error("Connection failed"),
          );
          setIsLoading(false);
          setIsVerifying(false);
        },

        complete: () => {
          subscriptionRef.current = null;
        },
      });
    },
    [agentUrl, fileDataParts, deepTextPromptPortions, messages, cancel],
  );

  const retry = useCallback(
    (messageId: string) => {
      // Find the user message that preceded this assistant message
      const msgIndex = messages.findIndex(m => m.id === messageId);
      if (msgIndex <= 0) return;

      const userMessage = messages[msgIndex - 1];
      if (userMessage?.role !== "user") return;

      // Remove the failed assistant message and resend with filtered history
      const filteredMessages = messages.filter(m => m.id !== messageId);
      setMessageVerifications(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      setError(null);

      // Pass filtered messages explicitly to avoid stale closure
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
