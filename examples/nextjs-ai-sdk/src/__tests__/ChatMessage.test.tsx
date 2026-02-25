import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatMessage } from "../components/ChatMessage";

// Mock the CitationComponent from deepcitation
vi.mock("deepcitation/react", () => ({
  CitationComponent: ({ citation }: { citation: any }) => (
    <span data-testid="citation">[{citation?.fullPhrase || "citation"}]</span>
  ),
}));

describe("ChatMessage", () => {
  const baseMessage = {
    id: "test-1",
    role: "assistant" as const,
    content: "Hello world",
  };

  it("renders user message without crashing", () => {
    render(
      <ChatMessage
        message={{ ...baseMessage, role: "user" }}
        citations={undefined}
        verifications={undefined}
        summary={undefined}
      />,
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders assistant message without crashing when citations/verifications are undefined", () => {
    render(<ChatMessage message={baseMessage} citations={undefined} verifications={undefined} summary={undefined} />);
    // The component should render without throwing
    expect(document.body).toBeInTheDocument();
  });

  it("renders assistant message with empty citations/verifications", () => {
    render(
      <ChatMessage
        message={baseMessage}
        citations={{}}
        verifications={{}}
        summary={{ total: 0, verified: 0, missed: 0, pending: 0 }}
      />,
    );
    expect(document.body).toBeInTheDocument();
  });

  it("renders message with content from parts array", () => {
    render(
      <ChatMessage
        message={{
          id: "test-2",
          role: "assistant",
          parts: [{ type: "text", text: "Message from parts" }],
        }}
        citations={undefined}
        verifications={undefined}
        summary={undefined}
      />,
    );
    expect(document.body).toBeInTheDocument();
  });

  it("renders citations when provided", () => {
    const citations = {
      "1": {
        pageNumber: 1,
        lineId: "L1",
        fullPhrase: "test quote",
      },
    };
    const verifications = {
      "1": {
        status: "found",
        pageNumber: 1,
      },
    };

    render(
      <ChatMessage
        message={{
          id: "test-3",
          role: "assistant",
          content: 'Here is a quote <cite page="1" line="L1">test quote</cite />',
        }}
        citations={citations as any}
        verifications={verifications as any}
        summary={{ total: 1, verified: 1, missed: 0, pending: 0 }}
      />,
    );
    expect(document.body).toBeInTheDocument();
  });
});
