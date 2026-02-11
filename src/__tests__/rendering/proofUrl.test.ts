import { describe, expect, it } from "@jest/globals";
import { buildProofUrl, buildProofUrls, buildSnippetImageUrl } from "../../rendering/proofUrl.js";
import type { VerificationRecord } from "../../types/citation.js";

describe("buildProofUrl", () => {
  const baseOptions = { baseUrl: "https://proof.deepcitation.com" };

  it("builds a basic proof URL", () => {
    const url = buildProofUrl("abc123", baseOptions);
    expect(url).toBe("https://proof.deepcitation.com/p/abc123");
  });

  it("adds view parameter", () => {
    const url = buildProofUrl("abc123", { ...baseOptions, view: "snippet" });
    expect(url).toContain("view=snippet");
  });

  it("adds format parameter", () => {
    const url = buildProofUrl("abc123", { ...baseOptions, format: "png" });
    expect(url).toContain("format=png");
  });

  it("adds theme parameter", () => {
    const url = buildProofUrl("abc123", { ...baseOptions, theme: "dark" });
    expect(url).toContain("theme=dark");
  });

  it("adds pad parameter", () => {
    const url = buildProofUrl("abc123", { ...baseOptions, pad: 20 });
    expect(url).toContain("pad=20");
  });

  it("adds token and expires for signed URLs", () => {
    const url = buildProofUrl("abc123", { ...baseOptions, token: "tok_xyz", expires: 1700000000 });
    expect(url).toContain("token=tok_xyz");
    expect(url).toContain("expires=1700000000");
  });

  it("strips trailing slashes from baseUrl", () => {
    const url = buildProofUrl("abc123", { baseUrl: "https://proof.deepcitation.com/" });
    expect(url).toBe("https://proof.deepcitation.com/p/abc123");
  });

  it("encodes special characters in proofId", () => {
    const url = buildProofUrl("abc 123/foo", baseOptions);
    expect(url).toContain("abc%20123");
  });
});

describe("buildSnippetImageUrl", () => {
  it("builds a snippet image URL with format=png and view=snippet", () => {
    const url = buildSnippetImageUrl("abc123", { baseUrl: "https://proof.deepcitation.com" });
    expect(url).toContain("format=png");
    expect(url).toContain("view=snippet");
  });
});

describe("buildProofUrls", () => {
  it("builds proof URLs for all verifications", () => {
    const verifications = {
      key1: { status: "found" as const, verifiedPageNumber: 1 },
      key2: { status: "not_found" as const },
    };
    const urls = buildProofUrls(verifications, { baseUrl: "https://proof.deepcitation.com" });
    expect(Object.keys(urls)).toHaveLength(2);
    expect(urls.key1).toContain("/p/key1");
    expect(urls.key2).toContain("/p/key2");
  });

  it("uses proofId from verification when available", () => {
    const verifications: VerificationRecord = {
      key1: { status: "found" as const, proofId: "proof_abc" },
    };
    const urls = buildProofUrls(verifications, { baseUrl: "https://proof.deepcitation.com" });
    expect(urls.key1).toContain("/p/proof_abc");
  });
});
