import { describe, expect, it } from "bun:test";
import { normalizeVerifyResponse } from "../client/normalizeVerifyResponse.js";
import type { VerifyCitationsResponse } from "../client/types.js";
import type { AttachmentAssets } from "../types/index.js";

const PAGE_IMAGES: AttachmentAssets["pageImages"] = [
  {
    pageNumber: 1,
    dimensions: { width: 800, height: 1200 },
    imageUrl: "https://example.com/p1.avif",
    isMatchPage: true,
  },
];
const ORIGINAL_DL: AttachmentAssets["originalDownload"] = {
  link: { url: "https://example.com/orig.pdf", expiresAt: "2099-01-01" },
};
const CONVERTED_DL: AttachmentAssets["convertedDownload"] = {
  link: { url: "https://example.com/conv.pdf", expiresAt: "2099-01-01" },
};

function makeLegacyResponse(overrides?: Partial<VerifyCitationsResponse>): VerifyCitationsResponse {
  return {
    verifications: {
      key1: {
        status: "found",
        attachmentId: "att-1",
        pageImages: PAGE_IMAGES,
        originalDownload: ORIGINAL_DL,
        convertedDownload: CONVERTED_DL,
      } as any,
      key2: {
        status: "found",
        attachmentId: "att-1",
        pageImages: PAGE_IMAGES,
        originalDownload: ORIGINAL_DL,
      } as any,
    },
    ...overrides,
  };
}

describe("normalizeVerifyResponse", () => {
  it("passes through if attachments already present", () => {
    const existing: VerifyCitationsResponse = {
      verifications: { k: { status: "found", attachmentId: "a" } },
      attachments: { a: { pageImages: PAGE_IMAGES } },
    };
    const result = normalizeVerifyResponse(existing);
    expect(result).toBe(existing); // same reference — no transformation
  });

  it("extracts assets from legacy per-verification format", () => {
    const result = normalizeVerifyResponse(makeLegacyResponse());
    expect(result.attachments).toBeDefined();
    expect(result.attachments?.["att-1"]).toEqual({
      pageImages: PAGE_IMAGES,
      originalDownload: ORIGINAL_DL,
      convertedDownload: CONVERTED_DL,
    });
  });

  it("strips assets from all verifications", () => {
    const result = normalizeVerifyResponse(makeLegacyResponse());
    for (const v of Object.values(result.verifications)) {
      const raw = v as Record<string, unknown>;
      expect(raw.pageImages).toBeUndefined();
      expect(raw.originalDownload).toBeUndefined();
      expect(raw.convertedDownload).toBeUndefined();
    }
  });

  it("uses first-writer-wins for duplicate attachmentIds", () => {
    // In the real API, all verifications for the same attachmentId carry
    // identical assets. First-writer-wins is a simplification; if a server
    // bug ever sends mismatched assets, the second writer's data is silently
    // dropped. Acceptable because the only alternative (deep-merge) risks
    // combining stale/partial assets into an inconsistent snapshot.
    const response: VerifyCitationsResponse = {
      verifications: {
        k1: { status: "found", attachmentId: "att-1", pageImages: PAGE_IMAGES } as any,
        k2: { status: "found", attachmentId: "att-1", originalDownload: ORIGINAL_DL } as any,
      },
    };
    const result = normalizeVerifyResponse(response);
    // First verification had pageImages, second had originalDownload — only first wins
    expect(result.attachments?.["att-1"]).toEqual({ pageImages: PAGE_IMAGES });
  });

  it("skips verifications without attachmentId", () => {
    const response: VerifyCitationsResponse = {
      verifications: {
        k1: { status: "not_found" } as any,
        k2: { status: "found", attachmentId: "att-1", pageImages: PAGE_IMAGES } as any,
      },
    };
    const result = normalizeVerifyResponse(response);
    expect(Object.keys(result.attachments ?? {})).toEqual(["att-1"]);
  });

  it("handles multiple different attachmentIds", () => {
    const response: VerifyCitationsResponse = {
      verifications: {
        k1: { status: "found", attachmentId: "att-1", pageImages: PAGE_IMAGES } as any,
        k2: { status: "found", attachmentId: "att-2", originalDownload: ORIGINAL_DL } as any,
      },
    };
    const result = normalizeVerifyResponse(response);
    expect(result.attachments?.["att-1"]).toEqual({ pageImages: PAGE_IMAGES });
    expect(result.attachments?.["att-2"]).toEqual({ originalDownload: ORIGINAL_DL });
  });

  it("returns empty attachments map when no verifications have assets", () => {
    const response: VerifyCitationsResponse = {
      verifications: {
        k1: { status: "found", attachmentId: "att-1" } as any,
      },
    };
    const result = normalizeVerifyResponse(response);
    expect(result.attachments).toEqual({ "att-1": {} });
  });

  it("hoists pageImagesStatus alongside pageImages", () => {
    const response: VerifyCitationsResponse = {
      verifications: {
        k1: {
          status: "found",
          attachmentId: "att-1",
          pageImages: PAGE_IMAGES,
          pageImagesStatus: "completed",
        } as any,
      },
    };
    const result = normalizeVerifyResponse(response);
    expect(result.attachments?.["att-1"]?.pageImagesStatus).toBe("completed");
    // Stripped from verification
    expect((result.verifications.k1 as any).pageImagesStatus).toBeUndefined();
  });
});
