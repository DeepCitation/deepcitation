import { afterEach, describe, expect, it, jest, mock } from "@jest/globals";
import { act, cleanup, render } from "@testing-library/react";
import type React from "react";
import { CitationComponent } from "../react/Citation";
import type { Citation } from "../types/citation";

const _realReactDom = require("react-dom");
const _mockedReactDom = { ..._realReactDom, createPortal: (node: React.ReactNode) => node };
mock.module("react-dom", () => ({ ..._mockedReactDom, default: _mockedReactDom }));

const baseCitation: Citation = {
  citationNumber: 1,
  anchorText: "test citation",
  fullPhrase: "This is a test citation phrase",
};

const foundVerification = {
  evidence: { src: "https://example.com/image.png" },
  verifiedMatchSnippet: "test citation phrase",
  status: "found" as const,
};

describe("disableTelemetry and prefetch props", () => {
  afterEach(() => {
    cleanup();
  });

  it("fires timing events by default", async () => {
    const onTimingEvent = jest.fn();
    render(
      <CitationComponent citation={baseCitation} verification={foundVerification} onTimingEvent={onTimingEvent} />,
    );
    await act(async () => {});

    const events = onTimingEvent.mock.calls.map(c => (c[0] as { event: string }).event);
    expect(events).toContain("citation_seen");
    expect(events).toContain("evidence_ready");
  });

  it("suppresses timing events when disableTelemetry is true", async () => {
    const onTimingEvent = jest.fn();
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
    const onTimingEvent = jest.fn();
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
