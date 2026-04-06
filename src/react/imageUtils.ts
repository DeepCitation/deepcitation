import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { extractDomain } from "../utils/urlSafety.js";

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

  // Reset fallback chain when inputs change (e.g. list virtualization reusing a component)
  // biome-ignore lint/correctness/useExhaustiveDependencies: url and customFaviconUrl are the reset triggers; they're not referenced inside the callback but must be deps
  useEffect(() => {
    setStage(prev => (prev !== 0 ? 0 : prev));
  }, [url, customFaviconUrl]);

  const parsed = useMemo(() => {
    if (!url) return null;
    try {
      const u = new URL(url);
      return { origin: u.origin, domain: u.hostname };
    } catch {
      return null;
    }
  }, [url]);

  const domain = parsed?.domain || (url ? extractDomain(url) : null);

  let src: string | null;
  if (stage === 0) {
    src =
      customFaviconUrl ||
      (domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}` : null);
  } else if (stage === 1 && parsed?.origin) {
    src = `${parsed.origin}/favicon.ico`;
  } else {
    src = null;
  }

  const onError = useCallback(() => {
    setStage(prev => (prev < 2 ? prev + 1 : prev));
  }, []);

  return { src, onError };
}
