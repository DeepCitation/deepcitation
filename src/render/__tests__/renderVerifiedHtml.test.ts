// packages/deepcitation/src/render/__tests__/renderVerifiedHtml.test.ts
import { describe, expect, it } from "bun:test";
import { renderVerifiedHtml } from "../renderVerifiedHtml.js";

const fakeCitations = {
  "abc123": {
    sourceMatch: "blood pressure",
    sourceContext: "The patient's blood pressure was 120/80.",
    pageNumber: 1,
    attachmentId: "att_001",
  },
};

const fakeVerifications = {
  "abc123": {
    status: "found" as const,
    verifiedPageNumber: 1,
    verifiedSourceContext: "blood pressure was 120/80",
    attachmentId: "att_001",
  },
};

describe("renderVerifiedHtml", () => {
  it("returns a non-empty HTML string", () => {
    const html = renderVerifiedHtml("The blood pressure [1] was normal.", fakeCitations, fakeVerifications);
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(100);
  });

  it("embeds dc-data script tag with verification data", () => {
    const html = renderVerifiedHtml("The blood pressure [1] was normal.", fakeCitations, fakeVerifications);
    expect(html).toContain("dc-data");
    expect(html).toContain("abc123");
  });

  it("returns valid HTML with a body tag", () => {
    const html = renderVerifiedHtml("Hello [1].", fakeCitations, fakeVerifications);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("accepts empty attachments without throwing", () => {
    expect(() =>
      renderVerifiedHtml("Hello [1].", fakeCitations, fakeVerifications, {})
    ).not.toThrow();
  });

  it("uses the title option in the HTML output", () => {
    const html = renderVerifiedHtml("Hello.", {}, {}, {}, { title: "My Report" });
    expect(html).toContain("My Report");
  });
});
