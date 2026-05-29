import { useMemo } from "react";
import { CitationComponent } from "../../../src/react/Citation";
// Fixture purpose:
//   - page image is 800×1600 with the annotation at x ≈ 500 (right half)
//   - evidence image is 400×120, narrower than a default keyhole → width-fill
//     (imageOffsetLeft = 0 at runtime)
//   - evidence.textItems places the annotation at x ≈ 280 so
//     resolveEvidenceSourceAnchorRatio().x ≈ 0.825 (very off-center)
//
//   In that configuration anchorInGhostX = sourceAnchorX × srcW
//   ≠ keyhole.width / 2. That's the ingredient the page-collapse ghost
//   path math drops on the floor — expand starts at keyhole.left while
//   collapse ends at keyhole.center − anchorInGhost, so they diverge by
//   (sourceAnchorX − 0.5) × srcW px.
const baseCitation = {
    type: "document",
    attachmentId: "att-asymmetric-anchor",
    citationNumber: 1,
    sourceMatch: "installation",
    sourceContext: 'At YC we use the term "Collision installation" for the technique they invented.',
    pageNumber: 5,
};
function drawCanvas(width, height, label, mark) {
    if (typeof document === "undefined") {
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return "";
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
export function AsymmetricAnchorCitation() {
    // Annotation lives in the right half of the page (x ≈ 500 of 800).
    const pageSrc = useMemo(() => drawCanvas(800, 1600, "Collision installation technique", { x: 500, y: 790, w: 170, h: 34 }), []);
    // Evidence is narrow (400 < default keyhole width ~476) → width-fills the
    // strip, so imageOffsetLeft = 0 at runtime. Annotation is at x ≈ 280 of
    // the 400-wide evidence, so sourceAnchorX ≈ 0.825.
    const evidenceSrc = useMemo(() => drawCanvas(400, 120, '"Collision installation"', { x: 280, y: 40, w: 100, h: 28 }), []);
    const verification = useMemo(() => ({
        status: "found",
        attachmentId: "att-asymmetric-anchor",
        sourceSnippet: 'At YC we use the term "Collision installation" for the technique they invented.',
        verifiedSourceMatch: "installation",
        verifiedSourceContext: 'At YC we use the term "Collision installation" for the technique they invented.',
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
            dimensions: { width: 400, height: 120 },
            // Off-center text item → sourceAnchorX ≈ 0.825.
            textItems: [
                { x: 280, y: 40, width: 100, height: 28, text: "installation" },
            ],
        },
    }), [evidenceSrc]);
    const pageImagesByAttachmentId = useMemo(() => ({
        "att-asymmetric-anchor": [
            {
                pageNumber: 5,
                dimensions: { width: 800, height: 1600 },
                imageUrl: pageSrc,
                isMatchPage: true,
            },
        ],
    }), [pageSrc]);
    return (<div style={{ paddingTop: "120px", paddingLeft: "120px" }}>
      <CitationComponent citation={baseCitation} verification={verification} pageImagesByAttachmentId={pageImagesByAttachmentId}/>
    </div>);
}
