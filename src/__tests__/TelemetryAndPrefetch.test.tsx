import { afterEach, describe, expect, it, mock } from "bun:test";
import type React from "react";

// Mock createPortal to render content in place instead of portal.
mock.module("react-dom", () => {
  const actual = require("react-dom") as typeof import("react-dom");
  return { ...actual, createPortal: (node: React.ReactNode) => node };
});

import { act, cleanup, render } from "@testing-library/react";
import { CitationComponent } from "../react/Citation";
import type { Citation } from "../types/citation";

const baseCitation: Citation = {
  citationNumber: 1,
  sourceMatch: "test citation",
  sourceContext: "This is a test citation phrase",
};

const foundVerification = {
  evidence: { src: "https://example.com/image.png" },
  sourceSnippet: "test citation phrase",
  status: "found" as const,
};

describe("disableTelemetry and prefetch props", () => {
  afterEach(() => {
    cleanup();
  });

  it("fires timing events by default", async () => {
    const onTimingEvent = mock(() => {});
    render(
      <CitationComponent citation={baseCitation} verification={foundVerification} onTimingEvent={onTimingEvent} />,
    );
    await act(async () => {});

    const events = onTimingEvent.mock.calls.map(c => (c[0] as { event: string }).event);
    expect(events).toContain("citation_seen");
    expect(events).toContain("evidence_ready");
  });

  it("suppresses timing events when disableTelemetry is true", async () => {
    const onTimingEvent = mock(() => {});
    render(
      <CitationComponent
        citation={baseCitation}
        verification={foundVerification}
        onTimingEvent={onTimingEvent}
        disableTelemetry
      />,
    );
    await act(async () => {});

    expect(onTimingEvent).not.toHaveBeenCalled();
  });

  it("skips prefetch when prefetch is lazy", async () => {
    const originalImage = globalThis.Image;
    const srcsRequested: string[] = [];
    // @ts-expect-error — minimal Image mock
    globalThis.Image = class {
      _src = "";
      get src() {
        return this._src;
      }
      set src(v: string) {
        this._src = v;
        srcsRequested.push(v);
      }
      set fetchPriority(_v: string) {}
    };

    try {
      render(<CitationComponent citation={baseCitation} verification={foundVerification} prefetch="lazy" />);
      await act(async () => {});

      expect(srcsRequested).toHaveLength(0);
    } finally {
      globalThis.Image = originalImage;
    }
  });

  it("disableTelemetry and prefetch are independent", async () => {
    const onTimingEvent = mock(() => {});
    render(
      <CitationComponent
        citation={baseCitation}
        verification={foundVerification}
        onTimingEvent={onTimingEvent}
        disableTelemetry
      />,
    );
    await act(async () => {});

    // Telemetry suppressed even with eager prefetch
    expect(onTimingEvent).not.toHaveBeenCalled();
  });
});
