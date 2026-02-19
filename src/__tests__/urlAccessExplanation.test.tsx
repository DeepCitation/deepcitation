import { afterEach, describe, expect, it } from "@jest/globals";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { CitationComponent } from "../react/CitationComponent";
import type { Citation } from "../types/citation";
import type { UrlAccessStatus, Verification } from "../types/verification";

// Mock createPortal to render content in place instead of portal
jest.mock("react-dom", () => ({
  ...jest.requireActual("react-dom"),
  createPortal: (node: React.ReactNode) => node,
}));

// Helper to wait for popover to become visible
const waitForPopoverVisible = async (container: HTMLElement) => {
  await act(async () => {
    await waitFor(() => {
      const popover = container.querySelector('[data-state="open"]');
      expect(popover).toBeInTheDocument();
    });
  });
};

// Helper to create a URL citation for testing
function makeUrlCitation(overrides?: Partial<Citation>): Citation {
  return {
    type: "url",
    url: "https://example.com/article",
    domain: "example.com",
    title: "Test Article",
    anchorText: "test content",
    fullPhrase: "This is some test content from the article.",
    citationNumber: 1,
    ...overrides,
  } as Citation;
}

// Helper to create a verification with URL access failure
function makeUrlFailureVerification(urlAccessStatus: UrlAccessStatus, errorMessage?: string): Verification {
  return {
    status: "not_found",
    url: {
      urlAccessStatus,
      urlVerificationError: errorMessage ?? null,
    },
  } as Verification;
}

describe("URL Access Explanation in CitationComponent", () => {
  afterEach(() => {
    cleanup();
  });

  // ===================================================================
  // BLOCKED SCENARIOS (amber)
  // ===================================================================

  describe("blocked scenarios show amber explanation", () => {
    it("shows 'Login Required' for forbidden status", async () => {
      const { container, getByText } = render(
        <CitationComponent citation={makeUrlCitation()} verification={makeUrlFailureVerification("forbidden")} />,
      );

      // Click to open popover
      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      expect(getByText("Login Required")).toBeInTheDocument();
    });

    it("shows 'Blocked by Site Protection' for generic blocked status", async () => {
      const { container, getByText } = render(
        <CitationComponent
          citation={makeUrlCitation()}
          verification={makeUrlFailureVerification("blocked", "Cloudflare challenge page detected")}
        />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      expect(getByText("Blocked by Site Protection")).toBeInTheDocument();
    });

    it("infers paywall from error message keywords", async () => {
      const { container, getByText } = render(
        <CitationComponent
          citation={makeUrlCitation()}
          verification={makeUrlFailureVerification("blocked", "Paywall detected - subscription required")}
        />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      expect(getByText("Paywall Detected")).toBeInTheDocument();
    });

    it("infers login required from error message keywords", async () => {
      const { container, getByText } = render(
        <CitationComponent
          citation={makeUrlCitation()}
          verification={makeUrlFailureVerification("blocked", "Sign in page detected")}
        />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      expect(getByText("Login Required")).toBeInTheDocument();
    });

    it("infers rate limit from error message with 429", async () => {
      const { container, getByText } = render(
        <CitationComponent
          citation={makeUrlCitation()}
          verification={makeUrlFailureVerification("blocked", "HTTP 429: Too Many Requests")}
        />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      expect(getByText("Rate Limited")).toBeInTheDocument();
    });

    it("infers geo-restriction from error message keywords", async () => {
      const { container, getByText } = render(
        <CitationComponent
          citation={makeUrlCitation()}
          verification={makeUrlFailureVerification("blocked", "Content is only available in the UK")}
        />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      expect(getByText("Region Restricted")).toBeInTheDocument();
    });
  });

  // ===================================================================
  // ERROR SCENARIOS (red)
  // ===================================================================

  describe("error scenarios show red explanation", () => {
    it("shows 'Page Not Found' for not_found status", async () => {
      const { container, getByText } = render(
        <CitationComponent citation={makeUrlCitation()} verification={makeUrlFailureVerification("not_found")} />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      expect(getByText("Page Not Found")).toBeInTheDocument();
    });

    it("shows 'Server Error' for server_error status", async () => {
      const { container, getByText } = render(
        <CitationComponent citation={makeUrlCitation()} verification={makeUrlFailureVerification("server_error")} />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      expect(getByText("Server Error")).toBeInTheDocument();
    });

    it("shows 'Connection Timed Out' for timeout status", async () => {
      const { container, getByText } = render(
        <CitationComponent citation={makeUrlCitation()} verification={makeUrlFailureVerification("timeout")} />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      expect(getByText("Connection Timed Out")).toBeInTheDocument();
    });

    it("shows 'Network Error' for network_error status", async () => {
      const { container, getByText } = render(
        <CitationComponent citation={makeUrlCitation()} verification={makeUrlFailureVerification("network_error")} />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      expect(getByText("Network Error")).toBeInTheDocument();
    });
  });

  // ===================================================================
  // CUSTOM ERROR MESSAGE
  // ===================================================================

  describe("custom error messages", () => {
    it("uses errorMessage as description when provided", async () => {
      const { container, getByText } = render(
        <CitationComponent
          citation={makeUrlCitation()}
          verification={makeUrlFailureVerification("server_error", "502 Bad Gateway from upstream proxy")}
        />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      expect(getByText("Server Error")).toBeInTheDocument();
      expect(getByText("502 Bad Gateway from upstream proxy")).toBeInTheDocument();
    });
  });

  // ===================================================================
  // NON-ERROR STATES (no explanation shown)
  // ===================================================================

  describe("non-error states show no explanation", () => {
    it("shows no explanation for accessible URL citation", async () => {
      const { container, queryByText } = render(
        <CitationComponent
          citation={makeUrlCitation()}
          verification={
            {
              status: "found",
              url: { urlAccessStatus: "accessible" },
              verifiedMatchSnippet: "test content",
            } as Verification
          }
        />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      // Should NOT show any failure-related titles
      expect(queryByText("Login Required")).not.toBeInTheDocument();
      expect(queryByText("Paywall Detected")).not.toBeInTheDocument();
      expect(queryByText("Page Not Found")).not.toBeInTheDocument();
      expect(queryByText("Server Error")).not.toBeInTheDocument();
      expect(queryByText("Network Error")).not.toBeInTheDocument();
    });

    it("shows no explanation for document citations", async () => {
      const docCitation: Citation = {
        type: "document",
        attachmentId: "abc123",
        pageNumber: 1,
        lineIds: [1],
        anchorText: "test citation",
        fullPhrase: "This is a test citation phrase",
        citationNumber: 1,
      } as Citation;

      const { container, queryByText } = render(
        <CitationComponent
          citation={docCitation}
          verification={
            {
              status: "not_found",
              searchAttempts: [],
            } as unknown as Verification
          }
        />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      // Should NOT show URL-specific failure titles
      expect(queryByText("Login Required")).not.toBeInTheDocument();
      expect(queryByText("Page Not Found")).not.toBeInTheDocument();
    });
  });

  // ===================================================================
  // ACCESSIBILITY
  // ===================================================================

  describe("accessibility", () => {
    it("explanation banner has role=status and aria-label", async () => {
      const { container } = render(
        <CitationComponent citation={makeUrlCitation()} verification={makeUrlFailureVerification("forbidden")} />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      const statusBanner = screen.getByRole("status");
      expect(statusBanner).toBeInTheDocument();
      expect(statusBanner.getAttribute("aria-label")).toContain("Login Required");
    });

    it("amber banner has Warning aria-label prefix", async () => {
      const { container } = render(
        <CitationComponent citation={makeUrlCitation()} verification={makeUrlFailureVerification("blocked")} />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      const statusBanner = screen.getByRole("status");
      expect(statusBanner.getAttribute("aria-label")).toMatch(/^Warning:/);
    });

    it("red banner has Error aria-label prefix", async () => {
      const { container } = render(
        <CitationComponent citation={makeUrlCitation()} verification={makeUrlFailureVerification("server_error")} />,
      );

      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });
      await waitForPopoverVisible(container);

      const statusBanner = screen.getByRole("status");
      expect(statusBanner.getAttribute("aria-label")).toMatch(/^Error:/);
    });
  });
});
