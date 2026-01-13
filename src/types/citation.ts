import { type ScreenBox } from "./boxes.js";
import { type Verification } from "./verification.js";

export type OutputImageFormat = "jpeg" | "png" | "avif" | undefined | null;

export const DEFAULT_OUTPUT_IMAGE_FORMAT = "avif" as const;
export interface VerifyCitationResponse {
  verifications: { [key: string]: Verification };
}

export interface VerifyCitationRequest {
  fileId: string;
  citations: { [key: string]: Citation };
  outputImageFormat?: OutputImageFormat;
  apiKey?: string; // Optional API key for authentication
}

export interface Citation {
  fileId?: string;
  fullPhrase?: string | null;
  keySpan?: string | null;

  startPageKey?: string | null;

  lineIds?: number[] | null;
  reasoning?: string | null;
  selection?: ScreenBox | null;
  citationNumber?: number;

  //should be populated automatically via getCitationPageNumber
  pageNumber?: number | null;

  // for audio/video citations
  timestamps?: {
    endTime?: string;
    startTime?: string;
  };

  beforeCite?: string;
}

export interface CitationStatus {
  isVerified: boolean;
  isMiss: boolean;
  isPartialMatch: boolean;
  isPending: boolean;
}
