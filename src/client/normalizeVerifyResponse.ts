import type { AttachmentAssets } from "../types/index.js";
import type { VerifyCitationsResponse } from "./types.js";

/**
 * Normalize a verify-citations response so attachment assets always live on
 * the top-level `attachments` map rather than duplicated per-verification.
 *
 * If the server already returns `attachments`, the response passes through
 * unchanged. Otherwise, `pageImages` / `originalDownload` / `convertedDownload`
 * are extracted from the first verification per `attachmentId` (first-writer-wins
 * — all copies are identical in the legacy format) and stripped from every
 * verification.
 */
export function normalizeVerifyResponse(response: VerifyCitationsResponse): VerifyCitationsResponse {
  if (response.attachments) return response;
  const attachments: Record<string, AttachmentAssets> = {};
  for (const v of Object.values(response.verifications)) {
    const aid = v.attachmentId;
    if (!aid || attachments[aid]) {
      delete (v as Record<string, unknown>).pageImages;
      delete (v as Record<string, unknown>).pageImagesStatus;
      delete (v as Record<string, unknown>).originalDownload;
      delete (v as Record<string, unknown>).convertedDownload;
      continue;
    }
    const raw = v as Record<string, unknown>;
    const assets: AttachmentAssets = {};
    if (raw.pageImages) assets.pageImages = raw.pageImages as AttachmentAssets["pageImages"];
    if (raw.pageImagesStatus) assets.pageImagesStatus = raw.pageImagesStatus as AttachmentAssets["pageImagesStatus"];
    if (raw.originalDownload) assets.originalDownload = raw.originalDownload as AttachmentAssets["originalDownload"];
    if (raw.convertedDownload)
      assets.convertedDownload = raw.convertedDownload as AttachmentAssets["convertedDownload"];
    attachments[aid] = assets;
    delete raw.pageImages;
    delete raw.pageImagesStatus;
    delete raw.originalDownload;
    delete raw.convertedDownload;
  }
  return { ...response, attachments };
}
