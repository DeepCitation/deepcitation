import { useMemo } from "react";
import { CitationComponent } from "../../../src/react/Citation";
const baseCitation = {
    type: "document",
    attachmentId: "att-page-expand-geometry",
    citationNumber: 1,
    sourceMatch: "Collision installation",
    sourceContext: 'At YC we use the term "Collision installation" for the technique they invented. More diffident founders ask "Will you try our beta?"',
    pageNumber: 5,
};
function createCanvasDataUrl(width, height, label) {
    if (typeof document === "undefined") {
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";
    }
    ctx.fillStyle = "#f4f4f5";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#18181b";
    ctx.font = `${Math.max(16, Math.floor(height * 0.18))}px sans-serif`;
    ctx.fillText(label, 20, Math.max(30, Math.floor(height * 0.45)));
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, width - 24, height - 24);
    return canvas.toDataURL("image/png");
}
export function PageExpandGeometryCitation() {
    const pageSrc = useMemo(() => createCanvasDataUrl(800, 1600, 'At YC we use the term "Collision installation" for the technique they invented.'), []);
    const evidenceSrc = useMemo(() => createCanvasDataUrl(560, 120, '"Collision installation"'), []);
    const verification = useMemo(() => ({
        status: "found",
        attachmentId: "att-page-expand-geometry",
        sourceSnippet: 'At YC we use the term "Collision installation" for the technique they invented.',
        verifiedSourceMatch: "Collision installation",
        verifiedSourceContext: 'At YC we use the term "Collision installation" for the technique they invented. More diffident founders ask "Will you try our beta?"',
        document: {
            verifiedPageNumber: 5,
            sourceContextDeepItem: {
                x: 140,
                y: 1280,
                width: 460,
                height: 34,
                text: 'At YC we use the term "Collision installation" for the technique they invented.',
            },
            sourceMatchDeepItems: [
                {
                    x: 330,
                    y: 1280,
                    width: 170,
                    height: 34,
                    text: "Collision installation",
                },
            ],
            renderScale: { x: 1, y: 1 },
        },
        evidence: {
            src: evidenceSrc,
            dimensions: { width: 560, height: 120 },
        },
    }), [evidenceSrc]);
    const pageImagesByAttachmentId = useMemo(() => ({
        "att-page-expand-geometry": [
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
