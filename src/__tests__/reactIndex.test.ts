import { describe, expect, it } from "@jest/globals";
import {
  CITATION_X_PADDING,
  CITATION_Y_PADDING,
  classNames,
  detectSourceType,
  // URL utilities
  extractDomain,
  generateCitationInstanceId,
  // Utilities
  generateCitationKey,
  getCitationAnchorText,
  getCitationDisplayText,
  getPlatformName,
  isAccessibleStatus,
  isBlockedStatus,
  isErrorStatus,
  isRedirectedStatus,
  isVerifiedStatus,
  // Sources list components and utilities
  SourcesListComponent,
  SourcesListItem,
  SourcesTrigger,
  sourceCitationsToListItems,
  useSourcesList,
} from "../react/index.js";

describe("react index exports", () => {
  it("exports utility functions", () => {
    expect(typeof generateCitationKey).toBe("function");
    expect(typeof generateCitationInstanceId).toBe("function");
    expect(typeof getCitationDisplayText).toBe("function");
    expect(typeof getCitationAnchorText).toBe("function");
    expect(typeof classNames).toBe("function");
  });

  it("exports constants", () => {
    expect(CITATION_X_PADDING).toBe(4);
    expect(CITATION_Y_PADDING).toBe(1);
  });

  it("exports URL utilities", () => {
    expect(typeof extractDomain).toBe("function");
    expect(typeof isBlockedStatus).toBe("function");
    expect(typeof isErrorStatus).toBe("function");
    expect(typeof isAccessibleStatus).toBe("function");
    expect(typeof isRedirectedStatus).toBe("function");
    expect(typeof isVerifiedStatus).toBe("function");
  });

  it("isBlockedStatus identifies blocked statuses", () => {
    expect(isBlockedStatus("blocked_antibot")).toBe(true);
    expect(isBlockedStatus("blocked_login")).toBe(true);
    expect(isBlockedStatus("blocked_paywall")).toBe(true);
    expect(isBlockedStatus("verified")).toBe(false);
    expect(isBlockedStatus("error_not_found")).toBe(false);
  });

  it("isErrorStatus identifies error statuses", () => {
    expect(isErrorStatus("error_not_found")).toBe(true);
    expect(isErrorStatus("error_timeout")).toBe(true);
    expect(isErrorStatus("error_server")).toBe(true);
    expect(isErrorStatus("verified")).toBe(false);
    expect(isErrorStatus("blocked_login")).toBe(false);
  });

  it("isAccessibleStatus identifies accessible URLs", () => {
    expect(isAccessibleStatus("verified")).toBe(true);
    expect(isAccessibleStatus("partial")).toBe(true);
    expect(isAccessibleStatus("accessible")).toBe(true);
    expect(isAccessibleStatus("redirected_valid")).toBe(true);
    expect(isAccessibleStatus("error_not_found")).toBe(false);
    expect(isAccessibleStatus("redirected")).toBe(false);
  });

  it("isRedirectedStatus identifies redirect statuses", () => {
    expect(isRedirectedStatus("redirected")).toBe(true);
    expect(isRedirectedStatus("redirected_valid")).toBe(true);
    expect(isRedirectedStatus("verified")).toBe(false);
    expect(isRedirectedStatus("error_not_found")).toBe(false);
  });

  it("isVerifiedStatus identifies verified content", () => {
    expect(isVerifiedStatus("verified")).toBe(true);
    expect(isVerifiedStatus("partial")).toBe(true);
    expect(isVerifiedStatus("redirected_valid")).toBe(true);
    expect(isVerifiedStatus("accessible")).toBe(false);
    expect(isVerifiedStatus("redirected")).toBe(false);
    expect(isVerifiedStatus("error_not_found")).toBe(false);
  });

  it("exports SourcesList components", () => {
    expect(SourcesListComponent).toBeDefined();
    expect(SourcesListItem).toBeDefined();
    expect(SourcesTrigger).toBeDefined();
  });

  it("exports SourcesList utilities", () => {
    expect(typeof sourceCitationsToListItems).toBe("function");
    expect(typeof useSourcesList).toBe("function");
    expect(typeof detectSourceType).toBe("function");
    expect(typeof getPlatformName).toBe("function");
  });

  it("detectSourceType categorizes URLs correctly", () => {
    expect(detectSourceType("https://github.com/repo")).toBe("code");
    expect(detectSourceType("https://youtube.com/watch")).toBe("video");
    expect(detectSourceType("https://twitter.com/user")).toBe("social");
  });

  it("getPlatformName returns human-readable names", () => {
    expect(getPlatformName("https://github.com/repo")).toBe("GitHub");
    expect(getPlatformName("https://x.com/user")).toBe("X");
  });

  it("sourceCitationsToListItems converts citations", () => {
    const citations = [
      { url: "https://example.com/page", title: "Example", citationNumber: 1 },
    ];
    const items = sourceCitationsToListItems(citations);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://example.com/page");
  });
});
