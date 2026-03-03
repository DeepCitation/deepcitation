import type React from "react";

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
