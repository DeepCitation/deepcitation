import { afterEach, describe, expect, it, mock } from "@jest/globals";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type React from "react";
import { CitationComponent } from "../react/CitationComponent";
import type { Citation } from "../types/citation";
import type { Verification } from "../types/verification";

// Mock createPortal to render content in place
mock.module("react-dom", () => ({
  createPortal: (node: React.ReactNode) => node,
}));

// Helper to click the citation trigger and wait for popover
async function openPopover() {
  const trigger = document.querySelector('[role="button"]') as HTMLElement;
  if (trigger) {
    await act(async () => {
      fireEvent.click(trigger);
    });
    // Allow popover state to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }
}

describe("CaptureTimestamp in CitationComponent", () => {
  afterEach(() => {
    cleanup();
  });

  const documentCitation: Citation = {
    type: "document",
    attachmentId: "doc-1",
    citationNumber: 1,
    anchorText: "test text",
    fullPhrase: "This is test text from document",
    pageNumber: 3,
    lineIds: [5],
  };

  const urlCitation: Citation = {
    type: "url",
    url: "https://example.com/article",
    domain: "example.com",
    citationNumber: 1,
    anchorText: "test text",
    fullPhrase: "This is test text from URL",
  };

  it("renders 'Verified' label for document citations with verifiedAt", async () => {
    const verification: Verification = {
      status: "found",
      verifiedMatchSnippet: "test text from document",
      verifiedAt: new Date("2026-01-15T10:00:00Z"),
    };

    render(
      <CitationComponent citation={documentCitation} verification={verification} />,
    );

    await openPopover();

    await waitFor(() => {
      const timestampEl = document.querySelector('[title*="2026-01-15"]');
      expect(timestampEl).toBeTruthy();
      expect(timestampEl?.textContent).toMatch(/Verified/);
      expect(timestampEl?.textContent).toMatch(/Jan\s+15/);
    });
  });

  it("renders 'Retrieved' label for URL citations with crawledAt", async () => {
    const verification: Verification = {
      status: "found",
      verifiedMatchSnippet: "test text from URL",
      crawledAt: "2026-01-15T15:42:00Z",
      verifiedAt: new Date("2026-01-15T16:00:00Z"),
    };

    render(
      <CitationComponent citation={urlCitation} verification={verification} />,
    );

    await openPopover();

    await waitFor(() => {
      const timestampEl = document.querySelector('[title*="2026-01-15"]');
      expect(timestampEl).toBeTruthy();
      expect(timestampEl?.textContent).toMatch(/Retrieved/);
      // URL citations include time
      expect(timestampEl?.textContent).toMatch(/at\s+\d+:\d+/);
    });
  });

  it("renders nothing when no date is available", async () => {
    const verification: Verification = {
      status: "found",
      verifiedMatchSnippet: "test text",
    };

    render(
      <CitationComponent citation={documentCitation} verification={verification} />,
    );

    await openPopover();

    // Wait for popover to be open
    await waitFor(() => {
      expect(document.querySelector('[data-state="open"]')).toBeTruthy();
    });

    // No element with a title containing an ISO date should exist
    const allTitled = document.querySelectorAll("[title]");
    const hasTimestamp = Array.from(allTitled).some(
      (el) => el.getAttribute("title")?.match(/^\d{4}-\d{2}-\d{2}T/),
    );
    expect(hasTimestamp).toBe(false);
  });

  it("prefers crawledAt over verifiedAt for URL citations", async () => {
    const verification: Verification = {
      status: "found",
      verifiedMatchSnippet: "test text",
      crawledAt: "2026-01-10T10:00:00Z",
      verifiedAt: new Date("2026-01-15T10:00:00Z"),
    };

    render(
      <CitationComponent citation={urlCitation} verification={verification} />,
    );

    await openPopover();

    await waitFor(() => {
      // Should show crawledAt date (Jan 10), not verifiedAt (Jan 15)
      const timestampEl = document.querySelector('[title*="2026-01-10"]');
      expect(timestampEl).toBeTruthy();
      expect(timestampEl?.textContent).toMatch(/Retrieved/);
    });
  });

  it("has title attribute with full ISO timestamp for audit hover", async () => {
    const verification: Verification = {
      status: "found",
      verifiedMatchSnippet: "test text from document",
      verifiedAt: new Date("2026-01-15T10:30:45Z"),
    };

    render(
      <CitationComponent citation={documentCitation} verification={verification} />,
    );

    await openPopover();

    await waitFor(() => {
      const timestampEl = document.querySelector('[title*="2026-01-15T10:30:45"]');
      expect(timestampEl).toBeTruthy();
      // Title should be full ISO 8601
      expect(timestampEl?.getAttribute("title")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  it("falls back to verifiedAt for URL citations without crawledAt", async () => {
    const verification: Verification = {
      status: "found",
      verifiedMatchSnippet: "test text",
      verifiedAt: new Date("2026-02-20T14:00:00Z"),
    };

    render(
      <CitationComponent citation={urlCitation} verification={verification} />,
    );

    await openPopover();

    await waitFor(() => {
      const timestampEl = document.querySelector('[title*="2026-02-20"]');
      expect(timestampEl).toBeTruthy();
      // Falls back to "Verified" label when no crawledAt
      expect(timestampEl?.textContent).toMatch(/Verified/);
    });
  });
});
