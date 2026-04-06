import type React from "react";
import { useCallback, useState } from "react";

/**
 * Module-level handler for hiding broken images.
 * Performance fix: avoids creating new function references on every render.
 */
export const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.display = "none";
};

/**
 * Module-level handler for hiding broken images via opacity.
 * Uses opacity instead of display:none to preserve layout space (e.g. stacked favicons).
 */
export const handleImageErrorOpacity = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.opacity = "0";
};

/**
 * Builds the origin from a URL string, returning null on invalid input.
 */
function getOrigin(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Hook that provides a favicon src with a fallback chain:
 *   1. Custom favicon URL (if provided)
 *   2. Google Favicon Service (`google.com/s2/favicons`)
 *   3. Root-domain `/favicon.ico` (when Google 404s)
 *   4. `null` (caller decides what to render — globe icon, hide, etc.)
 */
export function useFaviconSrc(
  url: string | null | undefined,
  customFaviconUrl?: string | null,
  size: number = 16,
): { src: string | null; onError: () => void } {
  const [stage, setStage] = useState(0);

  const origin = getOrigin(url);
  const domain = url ? domainFromUrl(url) : null;

  let src: string | null;
  if (stage === 0) {
    src =
      customFaviconUrl ||
      (domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}` : null);
  } else if (stage === 1 && origin) {
    src = `${origin}/favicon.ico`;
  } else {
    src = null;
  }

  const onError = useCallback(() => {
    setStage((prev) => (prev < 2 ? prev + 1 : prev));
  }, []);

  return { src, onError };
}

/**
 * Extract domain from URL string, returning empty string on failure.
 * Lightweight version for this module — avoids importing extractDomain
 * to keep imageUtils dependency-free.
 */
function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
