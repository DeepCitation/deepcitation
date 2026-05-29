"use client";
import { extractVisibleText } from "deepcitation";
import { useCallback, useRef, useState } from "react";
const applyVisibleText = (content) => extractVisibleText(content).trimEnd();
let runCounter = 0;
export function useAgentChat({ agentUrl, fileDataParts, deepTextPagesByAttachmentId, }) {
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState(null);
    const [messageVerifications, setMessageVerifications] = useState({});
    const abortControllerRef = useRef(null);
    const currentMessageIdRef = useRef(null);
    const cancel = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setIsLoading(false);
        setIsVerifying(false);
    }, []);
    const processEvent = useCallback((event) => {
        switch (event.type) {
            case "TEXT_MESSAGE_START":
                currentMessageIdRef.current = event.messageId;
                setMessages(prev => [...prev, { id: event.messageId, role: "assistant", content: "" }]);
                break;
            case "TEXT_MESSAGE_CONTENT":
                setMessages(prev => prev.map(message => {
                    if (message.id !== event.messageId)
                        return message;
                    const raw = (message.rawContent ?? "") + event.delta;
                    return { ...message, content: applyVisibleText(raw), rawContent: raw };
                }));
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
                        [currentMessageIdRef.current]: {
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
    const streamAgentRun = useCallback(async (content, baseMessages) => {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const userMessage = {
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
                    deepTextPagesByAttachmentId,
                },
            }),
        });
        if (!response.ok || !response.body) {
            throw new Error(`Agent request failed with status ${response.status}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const processFrames = (raw) => {
            const frames = raw.split("\n\n");
            const remainder = frames.pop() ?? "";
            for (const frame of frames) {
                const dataLines = frame
                    .split("\n")
                    .filter(line => line.startsWith("data:"))
                    .map(line => line.slice(5).trim())
                    .filter(Boolean);
                if (dataLines.length === 0)
                    continue;
                try {
                    // Join without separator: each data: line is a JSON fragment;
                    // JSON is whitespace-insensitive between tokens so "" and "\n"
                    // are equivalent here.
                    processEvent(JSON.parse(dataLines.join("")));
                }
                catch (err) {
                    // Malformed event — skip rather than break the stream.
                    if (process.env.NODE_ENV === "development") {
                        console.warn("[useAgentChat] Skipped malformed SSE frame:", err);
                    }
                }
            }
            return remainder;
        };
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                buffer = processFrames(buffer);
            }
            // Flush any remaining bytes from the TextDecoder and process the
            // final buffer — the last SSE frame may not end with \n\n.
            buffer += decoder.decode();
            if (buffer.trim()) {
                // Remainder intentionally discarded — stream is complete
                processFrames(buffer + "\n\n");
            }
        }
        finally {
            reader.releaseLock();
        }
    }, [agentUrl, deepTextPagesByAttachmentId, fileDataParts, processEvent]);
    const sendMessage = useCallback((content, priorMessages) => {
        cancel();
        const baseMessages = priorMessages ?? messages;
        void streamAgentRun(content, baseMessages).catch((err) => {
            if (err instanceof Error && err.name === "AbortError") {
                return;
            }
            setError(err instanceof Error ? err : new Error("Connection failed"));
            setIsLoading(false);
            setIsVerifying(false);
        });
    }, [cancel, messages, streamAgentRun]);
    const retry = useCallback((messageId) => {
        const msgIndex = messages.findIndex(message => message.id === messageId);
        if (msgIndex <= 0)
            return;
        const userMessage = messages[msgIndex - 1];
        if (userMessage?.role !== "user")
            return;
        const filteredMessages = messages.filter(message => message.id !== messageId);
        setMessageVerifications(prev => {
            const next = { ...prev };
            delete next[messageId];
            return next;
        });
        setError(null);
        sendMessage(userMessage.content, filteredMessages);
    }, [messages, sendMessage]);
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
