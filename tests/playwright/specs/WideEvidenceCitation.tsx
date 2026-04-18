import { useMemo } from "react";
import { CitationComponent } from "../../../src/react/Citation";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

// Fixture purpose:
//   Evidence image is 1200×120 — wide enough that the keyhole strip cannot
//   display it without horizontal overflow (displayedWidth > containerWidth),
//   so clicking the keyhole opens expanded-keyhole (fill=false) instead of
//   jumping directly to expanded-page.
//
//   This enables testing the collapse path:
//     summary → expanded-keyhole → expanded-page → (collapse) → expanded-keyhole
//
//   The annotation is off-center (at x ≈ 990 of 1200) so that the scroll
//   required to center it in expanded-keyhole is substantial. This maximises
//   the chance of detecting the "ghost starts off-screen" bug: if
//   buildCollapseGhostSnapshot does NOT annotation-center the expanded-keyhole
//   scroll, anchorInGhostX ≠ elW/2 and the ghost's start rect has a very
//   negative left — off-screen to the left.

function drawCanvas(
  width: number,
  height: number,
  label: string,
  mark: { x: number; y: number; w: number; h: number } | null,
): string {
  if (typeof document === "undefined") {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#f4f4f5";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#18181b";
  ctx.font = `${Math.max(14, Math.floor(height * 0.18))}px sans-serif`;
  ctx.fillText(label, 16, Math.max(28, Math.floor(height * 0.5)));
  if (mark) {
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 3;
    ctx.strokeRect(mark.x, mark.y, mark.w, mark.h);
  }
  return canvas.toDataURL("image/png");
}

const baseCitation: Citation = {
  type: "document",
  attachmentId: "att-wide-evidence",
  citationNumber: 1,
  sourceMatch: "technique",
  sourceContext: "the technique they invented",
  pageNumber: 3,
};

export function WideEvidenceCitation() {
  const pageSrc = useMemo(
    () => drawCanvas(800, 1600, "Wide evidence technique page", { x: 500, y: 600, w: 170, h: 34 }),
    [],
  );

  // 1200×120 — height-fill zoom = stripH/120, displayedWidth = 1200*(stripH/120)
  // For any reasonable strip height (40–80px), displayedWidth ≥ 400 px, which
  // exceeds typical popover widths (~350 px) → imageFitsCompletely = false → canExpand.
  // Annotation is at x=990 of 1200 (82.5% — same ratio as AsymmetricAnchorCitation).
  const evidenceSrc = useMemo(
    () => drawCanvas(1200, 120, '"the technique"', { x: 990, y: 40, w: 100, h: 28 }),
    [],
  );

  const verification = useMemo<Verification>(
    () => ({
      status: "found",
      attachmentId: "att-wide-evidence",
      sourceSnippet: "the technique they invented",
      verifiedSourceMatch: "technique",
      verifiedSourceContext: "the technique they invented",
      document: {
        verifiedPageNumber: 3,
        sourceContextDeepItem: {
          x: 450,
          y: 600,
          width: 220,
          height: 34,
          text: "the technique they invented",
        },
        sourceMatchDeepItems: [
          {
            x: 500,
            y: 600,
            width: 170,
            height: 34,
            text: "technique",
          },
        ],
        renderScale: { x: 1, y: 1 },
      },
      evidence: {
        src: evidenceSrc,
        dimensions: { width: 1200, height: 120 },
        textItems: [{ x: 990, y: 40, width: 100, height: 28, text: "technique" }],
      },
    }),
    [evidenceSrc],
  );

  const pageImagesByAttachmentId = useMemo(
    () => ({
      "att-wide-evidence": [
        {
          pageNumber: 3,
          dimensions: { width: 800, height: 1600 },
          imageUrl: pageSrc,
          isMatchPage: true,
        },
      ],
    }),
    [pageSrc],
  );

  return (
    <div style={{ paddingTop: "120px", paddingLeft: "120px" }}>
      <CitationComponent
        citation={baseCitation}
        verification={verification}
        pageImagesByAttachmentId={pageImagesByAttachmentId}
      />
    </div>
  );
}
