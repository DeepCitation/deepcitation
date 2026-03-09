import { afterEach, describe, expect, it, jest, mock } from "@jest/globals";
import { act, cleanup, render } from "@testing-library/react";
import type React from "react";
import { DeepCitationAdminProvider } from "../react/AdminModeContext";
import { CitationComponent } from "../react/Citation";
import type { Citation } from "../types/citation";

// Mock createPortal (same pattern as CitationComponentBehavior.test.tsx)
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

describe("Admin mode", () => {
  afterEach(() => {
    cleanup();
  });

  describe("telemetry suppression via adminMode prop", () => {
    it("fires timing events in normal mode", async () => {
      const onTimingEvent = jest.fn();
      render(
        <CitationComponent citation={baseCitation} verification={foundVerification} onTimingEvent={onTimingEvent} />,
      );
      // Wait for effects
      await act(async () => {});

      expect(onTimingEvent).toHaveBeenCalled();
      const events = onTimingEvent.mock.calls.map(c => (c[0] as { event: string }).event);
      expect(events).toContain("citation_seen");
      expect(events).toContain("evidence_ready");
    });

    it("suppresses timing events with adminMode prop", async () => {
      const onTimingEvent = jest.fn();
      render(
        <CitationComponent
          citation={baseCitation}
          verification={foundVerification}
          onTimingEvent={onTimingEvent}
          adminMode={true}
        />,
      );
      await act(async () => {});

      expect(onTimingEvent).not.toHaveBeenCalled();
    });
  });

  describe("telemetry suppression via DeepCitationAdminProvider", () => {
    it("suppresses timing events when wrapped in provider", async () => {
      const onTimingEvent = jest.fn();
      render(
        <DeepCitationAdminProvider>
          <CitationComponent citation={baseCitation} verification={foundVerification} onTimingEvent={onTimingEvent} />
        </DeepCitationAdminProvider>,
      );
      await act(async () => {});

      expect(onTimingEvent).not.toHaveBeenCalled();
    });

    it("allows prop override: adminMode={false} inside provider fires events", async () => {
      const onTimingEvent = jest.fn();
      render(
        <DeepCitationAdminProvider>
          <CitationComponent
            citation={baseCitation}
            verification={foundVerification}
            onTimingEvent={onTimingEvent}
            adminMode={false}
          />
        </DeepCitationAdminProvider>,
      );
      await act(async () => {});

      expect(onTimingEvent).toHaveBeenCalled();
      const events = onTimingEvent.mock.calls.map(c => (c[0] as { event: string }).event);
      expect(events).toContain("citation_seen");
    });
  });

  describe("image prefetch suppression", () => {
    it("does not create prefetch images in admin mode", async () => {
      const originalImage = globalThis.Image;
      const imageInstances: Array<{ src: string }> = [];
      // @ts-expect-error — minimal Image mock
      globalThis.Image = class {
        src = "";
        constructor() {
          imageInstances.push(this);
        }
        set fetchPriority(_v: string) {}
      };

      try {
        render(<CitationComponent citation={baseCitation} verification={foundVerification} adminMode={true} />);
        await act(async () => {});

        // No Image instances should have the evidence src
        const prefetched = imageInstances.filter(img => img.src === "https://example.com/image.png");
        expect(prefetched).toHaveLength(0);
      } finally {
        globalThis.Image = originalImage;
      }
    });
  });
});
