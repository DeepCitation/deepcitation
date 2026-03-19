import { useMemo } from "react";
import { CitationComponent } from "../../../src/react/Citation";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

const baseCitation: Citation = {
  type: "document",
  attachmentId: "att-generated-image",
  citationNumber: 1,
  anchorText: "Functional status",
  fullPhrase: "Functional status: He is at baseline, no assistance needed, independent ADLs",
  pageNumber: 5,
};

function createCanvasDataUrl(width: number, height: number): string {
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
  ctx.font = "20px sans-serif";
  ctx.fillText("DeepCitation proof", 20, 40);
  return canvas.toDataURL("image/png");
}

export function GeneratedImageCitation({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const imageSrc = useMemo(() => createCanvasDataUrl(width, height), [width, height]);
  const verification = useMemo<Verification>(
    () => ({
      status: "found",
      attachmentId: "att-generated-image",
      verifiedMatchSnippet: "Functional status: He is at baseline",
      document: {
        verifiedPageNumber: 5,
      },
      evidence: {
        src: imageSrc,
        dimensions: { width, height },
      },
    }),
    [height, imageSrc, width],
  );

  const pageImagesByAttachmentId = useMemo(
    () => ({
      "att-generated-image": [
        {
          pageNumber: 5,
          dimensions: { width, height },
          imageUrl: imageSrc,
          isMatchPage: true,
        },
      ],
    }),
    [height, imageSrc, width],
  );

  return (
    <CitationComponent
      citation={baseCitation}
      verification={verification}
      pageImagesByAttachmentId={pageImagesByAttachmentId}
    />
  );
}
