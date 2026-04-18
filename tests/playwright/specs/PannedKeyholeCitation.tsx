import { useMemo } from "react";
import { CitationComponent } from "../../../src/react/Citation";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

// Fixture purpose:
//   - Evidence image is 1600×80 — *wider* than a default keyhole strip
//     (~476px), so the keyhole MUST overflow horizontally and becomes
//     panable.  This is the only way to exercise the pan-bypass defect
//     in runPageCollapseGhostAnimation (viewTransition.ts:1263-1267)
//     where the ghost's end rect is seated at `keyholeRect.center`
//     regardless of where the anchor visually sits inside the panned strip.
//   - Anchor annotation text item sits at x ≈ 1250 of 1600, so
//     resolveEvidenceSourceAnchorRatio() returns sourceAnchorX ≈ 0.828.
//   - The page image is 800×1600 with annotation at x ≈ 500 (right half),
//     so the spotlight on the expanded page has a well-defined target.
//
//   Important: tests that drive pan use `container.scrollLeft = N` directly
//   (not drag), because EvidenceKeyhole freezes the *initial* centering via
//   `keyholeInitAppliedRef` — once past that, scroll is free to be set by
//   the test.

const baseCitation: Citation = {
  type: "document",
  attachmentId: "att-panned-keyhole",
  citationNumber: 1,
  sourceMatch: "installation",
  sourceContext:
    'At YC we use the term "Collision installation" for the technique they invented.',
  pageNumber: 5,
};

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
  ctx.font = `${Math.max(14, Math.floor(height * 0.4))}px sans-serif`;
  ctx.fillText(label, 16, Math.max(28, Math.floor(height * 0.6)));
  if (mark) {
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 3;
    ctx.strokeRect(mark.x, mark.y, mark.w, mark.h);
  }
  return canvas.toDataURL("image/png");
}

export function PannedKeyholeCitation() {
  const pageSrc = useMemo(
    () => drawCanvas(800, 1600, "Collision installation technique", { x: 500, y: 790, w: 170, h: 34 }),
    [],
  );
  // Wide (1600px) so it overflows the keyhole strip and becomes pannable.
  const evidenceSrc = useMemo(
    () => drawCanvas(1600, 80, '"Collision installation"', { x: 1250, y: 28, w: 150, h: 34 }),
    [],
  );

  const verification = useMemo<Verification>(
    () => ({
      status: "found",
      attachmentId: "att-panned-keyhole",
      sourceSnippet: 'At YC we use the term "Collision installation" for the technique they invented.',
      verifiedSourceMatch: "installation",
      verifiedSourceContext:
        'At YC we use the term "Collision installation" for the technique they invented.',
      document: {
        verifiedPageNumber: 5,
        sourceContextDeepItem: {
          x: 140,
          y: 790,
          width: 560,
          height: 34,
          text: 'At YC we use the term "Collision installation" for the technique they invented.',
        },
        sourceMatchDeepItems: [
          {
            x: 500,
            y: 790,
            width: 170,
            height: 34,
            text: "installation",
          },
        ],
        renderScale: { x: 1, y: 1 },
      },
      evidence: {
        src: evidenceSrc,
        dimensions: { width: 1600, height: 80 },
        // x=1250, width=150 → center = 1325, ratio ≈ 0.828.
        textItems: [{ x: 1250, y: 28, width: 150, height: 34, text: "installation" }],
      },
    }),
    [evidenceSrc],
  );

  const pageImagesByAttachmentId = useMemo(
    () => ({
      "att-panned-keyhole": [
        {
          pageNumber: 5,
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
