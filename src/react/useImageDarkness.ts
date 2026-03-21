/**
 * Hook that samples the image region around the spotlight cutout to detect
 * whether the page content is dark, so the overlay can flip to a light color.
 */
import { useMemo } from "react";
import { BOX_PADDING, SPOTLIGHT_PADDING } from "../drawing/citationDrawing.js";
import type { DeepTextItem } from "../types/boxes.js";

/** Luminance threshold (0–255). Below this → dark content. */
const DARK_THRESHOLD = 100;
/** Downscaled canvas size for sampling. */
const SAMPLE_SIZE = 32;

/**
 * Compute perceived luminance from RGB using ITU-R BT.601 coefficients.
 * Returns 0–255.
 */
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Samples the image region OUTSIDE the spotlight cutout and returns the
 * average perceived luminance (0–255).
 *
 * Strategy: draw the full image to a small canvas, then read all pixels
 * except those inside the spotlight rect. This gives us the luminance
 * of the area where the overlay shadow is actually visible.
 *
 * Returns null on CORS / canvas-tainted errors.
 */
function sampleBorderLuminance(
  img: HTMLImageElement,
  spotX: number,
  spotY: number,
  spotW: number,
  spotH: number,
): number | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

    // Map spotlight rect to sample-canvas coordinates
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;
    const sx = (spotX / nw) * SAMPLE_SIZE;
    const sy = (spotY / nh) * SAMPLE_SIZE;
    const sw = (spotW / nw) * SAMPLE_SIZE;
    const sh = (spotH / nh) * SAMPLE_SIZE;

    let totalLum = 0;
    let count = 0;

    for (let y = 0; y < SAMPLE_SIZE; y++) {
      for (let x = 0; x < SAMPLE_SIZE; x++) {
        // Skip pixels inside the spotlight cutout
        if (x >= sx && x < sx + sw && y >= sy && y < sy + sh) continue;
        const i = (y * SAMPLE_SIZE + x) * 4;
        totalLum += luminance(data[i], data[i + 1], data[i + 2]);
        count++;
      }
    }

    return count > 0 ? totalLum / count : null;
  } catch {
    // CORS-tainted canvas — fall back to light assumption
    return null;
  }
}

/**
 * Returns true when the image content around the spotlight region is dark
 * and the overlay should use a light color instead of the default dark one.
 *
 * Accepts the image element directly (from a ref). Recomputes only when
 * the image or phrase item changes. Returns false on any error.
 */
export function useImageDarkness(
  img: HTMLImageElement | null,
  imageLoaded: boolean,
  phraseItem: DeepTextItem | null,
  renderScale: { x: number; y: number } | null,
): boolean {
  return useMemo(() => {
    if (!img || !imageLoaded || !phraseItem) return false;

    // Compute spotlight rect in natural-image-pixel coordinates.
    // Fall back to 1:1 scale when renderScale is not yet available.
    const scale = renderScale || { x: 1, y: 1 };
    const pad = BOX_PADDING + SPOTLIGHT_PADDING;
    const spotX = phraseItem.x * scale.x - pad;
    const spotY = phraseItem.y * scale.y - pad;
    const spotW = phraseItem.width * scale.x + 2 * pad;
    const spotH = phraseItem.height * scale.y + 2 * pad;

    const lum = sampleBorderLuminance(img, spotX, spotY, spotW, spotH);
    if (lum === null) return false;

    return lum < DARK_THRESHOLD;
  }, [img, imageLoaded, phraseItem, renderScale]);
}
