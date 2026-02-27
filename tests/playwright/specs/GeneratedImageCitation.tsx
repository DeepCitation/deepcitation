import { useMemo } from "react";
import { CitationComponent } from "../../../src/react/CitationComponent";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

const baseCitation: Citation = {
  type: "document",
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
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111827";
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
      verifiedMatchSnippet: "Functional status: He is at baseline",
      document: {
        verifiedPageNumber: 5,
        verificationImageSrc: imageSrc,
        verificationImageDimensions: { width, height },
      },
      pages: [
        {
          pageNumber: 5,
          dimensions: { width, height },
          source: imageSrc,
          isMatchPage: true,
        },
      ],
    }),
    [height, imageSrc, width],
  );

  return <CitationComponent citation={baseCitation} verification={verification} />;
}
