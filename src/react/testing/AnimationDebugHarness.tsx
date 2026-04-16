import { useEffect, useMemo, useRef, useState } from "react";
import type { Citation } from "../../types/citation";
import type { PageImage, Verification } from "../../types/verification";
import { CitationComponent } from "../Citation";
import { ControlBar } from "../debug/ControlBar.js";
import { GhostRectsOverlay } from "../debug/GhostRectsOverlay.js";

const HARNESS_ATTACHMENT_ID = "att-dc-animation-harness";

function makeTallImage(): string {
  if (typeof document === "undefined") {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";
  }
  const width = 800;
  const height = 1600;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 100) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#111827";
  ctx.font = "24px sans-serif";
  for (let y = 60; y < height; y += 100) {
    ctx.fillText(`Line ${Math.floor(y / 100)} — the quick brown fox jumps over the lazy dog`, 40, y);
  }
  // Highlight the matched line (y=760 matches sourceMatch "Line 8").
  ctx.fillStyle = "rgba(245, 158, 11, 0.25)";
  ctx.fillRect(0, 730, width, 50);
  return canvas.toDataURL("image/png");
}

/**
 * Dev-only interactive harness for debugging the focus↔page animation handoff.
 * Mounts a control bar and an interactive popover with a grid-backed image so
 * aim drift is visible at any speed. Meant to be rendered from a Playwright CT
 * spec or a local demo route.
 *
 * Callers MUST gate the mount behind `process.env.NODE_ENV !== "production"`.
 */
export function AnimationDebugHarness(): React.ReactElement {
  const [imageSrc, setImageSrc] = useState<string>("");

  useEffect(() => {
    setImageSrc(makeTallImage());
  }, []);

  const citation = useMemo<Citation>(
    () => ({
      attachmentId: HARNESS_ATTACHMENT_ID,
      citationNumber: 1,
      sourceMatch: "Line 8",
      sourceContext: "Line 8 — the quick brown fox jumps over the lazy dog",
      pageNumber: 1,
      lineIds: [8],
    }),
    [],
  );

  const verification = useMemo<Verification | null>(() => {
    if (!imageSrc) return null;
    return {
      status: "found",
      attachmentId: HARNESS_ATTACHMENT_ID,
      document: { verifiedPageNumber: 1 },
      evidence: {
        src: imageSrc,
        dimensions: { width: 800, height: 1600 },
      },
    };
  }, [imageSrc]);

  const pageImages = useMemo<Record<string, PageImage[]> | undefined>(() => {
    if (!imageSrc) return undefined;
    return {
      [HARNESS_ATTACHMENT_ID]: [
        {
          pageNumber: 1,
          imageUrl: imageSrc,
          dimensions: { width: 800, height: 1600 },
          isMatchPage: true,
        },
      ],
    };
  }, [imageSrc]);

  return (
    <div data-dc-debug-harness="" style={{ font: "14px/1.4 system-ui, sans-serif" }}>
      <ControlBar />
      <GhostRectsOverlay />
      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        <section data-dc-debug-panel="live">
          <h2 style={panelHeading}>Live panel</h2>
          <p style={panelHint}>
            Click the citation to drive through summary → focus → page at the current speed. Toggle <code>aim</code> to
            render crosshairs in both focus and page views.
          </p>
          <div style={livePanelFrame}>
            <p style={{ margin: 0 }}>
              Revenue grew quickly in the quarter{" "}
              {verification && pageImages ? (
                <CitationComponent
                  citation={citation}
                  verification={verification}
                  pageImagesByAttachmentId={pageImages}
                />
              ) : (
                <span>(loading fixture…)</span>
              )}{" "}
              — verify the aim tracks through both transitions.
            </p>
          </div>
        </section>

        <AimAlignmentPanel citation={citation} verification={verification} pageImages={pageImages} />
      </div>
    </div>
  );
}

function AimAlignmentPanel({
  citation,
  verification,
  pageImages,
}: {
  citation: Citation;
  verification: Verification | null;
  pageImages: Record<string, PageImage[]> | undefined;
}): React.ReactElement {
  const focusHost = useRef<HTMLDivElement>(null);
  const pageHost = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const AIM_SELECTOR = "[data-dc-debug-aim='focus'],[data-dc-debug-aim='page']";
      const focusEl = focusHost.current?.querySelector<HTMLElement>(AIM_SELECTOR);
      const pageEl = pageHost.current?.querySelector<HTMLElement>(AIM_SELECTOR);
      if (focusEl && pageEl) {
        const a = focusEl.getBoundingClientRect();
        const b = pageEl.getBoundingClientRect();
        setOffset({ dx: Math.round(b.left - a.left), dy: Math.round(b.top - a.top) });
      } else {
        setOffset(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!verification || !pageImages) {
    return (
      <section data-dc-debug-panel="aim-alignment">
        <h2 style={panelHeading}>Aim alignment</h2>
        <p style={panelHint}>Loading fixture…</p>
      </section>
    );
  }

  return (
    <section data-dc-debug-panel="aim-alignment">
      <h2 style={panelHeading}>Aim alignment</h2>
      <p style={panelHint}>
        Two popovers mounted against the same citation. Enable <code>aim</code> and click each citation to open its
        popover — the focus-view crosshair and page-view crosshair should coincide.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div ref={focusHost} style={livePanelFrame}>
          <div style={{ marginBottom: 8, font: "11px ui-monospace, monospace", color: "#6b7280" }}>focus mount</div>
          <CitationComponent citation={citation} verification={verification} pageImagesByAttachmentId={pageImages} />
        </div>
        <div ref={pageHost} style={livePanelFrame}>
          <div style={{ marginBottom: 8, font: "11px ui-monospace, monospace", color: "#6b7280" }}>page mount</div>
          <CitationComponent citation={citation} verification={verification} pageImagesByAttachmentId={pageImages} />
        </div>
      </div>
      <div style={{ marginTop: 8, font: "12px ui-monospace, monospace", color: offset ? "#111827" : "#9ca3af" }}>
        aim offset (page - focus):{" "}
        {offset ? (
          <span>
            dx={offset.dx}px dy={offset.dy}px
          </span>
        ) : (
          <span>—</span>
        )}
      </div>
    </section>
  );
}

const panelHeading: React.CSSProperties = {
  margin: "0 0 4px",
  font: "600 14px/1.3 system-ui, sans-serif",
};

const panelHint: React.CSSProperties = {
  margin: "0 0 8px",
  font: "12px/1.4 system-ui, sans-serif",
  color: "#6b7280",
};

const livePanelFrame: React.CSSProperties = {
  padding: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#ffffff",
};
