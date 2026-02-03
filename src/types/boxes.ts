// PDF stores items just like ScreenBox, these are in PDF space
export interface DeepTextItem extends ScreenBox {
  text?: string;
}

export type IVertex = {
  x: number;
  y: number;
};

export interface ScreenBox extends IVertex {
  width: number;
  height: number;
}

/**
 * Represents a page in a document with its metadata and dimensions.
 * Used for tracking page information in multi-page documents.
 */
export interface Page {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Page dimensions in pixels or PDF units */
  dimensions: {
    width: number;
    height: number;
  };
  /** Source URL for the page image/render */
  source: string;
  /** Optional base64-encoded thumbnail image (e.g., avif) for quick preview */
  thumbnail?: string;
  /** Optional expiration date for the page data (ISO 8601 string). If "never", the page does not expire (enterprise). */
  expiresAt?: string | "never";
}
