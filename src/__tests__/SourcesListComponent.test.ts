import { describe, expect, it } from "@jest/globals";
import {
  sourceCitationsToListItems,
  detectSourceType,
  getPlatformName,
} from "../react/SourcesListComponent.js";
import { generateCitationKey, isUrlCitation } from "../react/utils.js";
import type { Citation } from "../types/citation.js";

describe("SourcesListComponent utilities", () => {
  describe("detectSourceType", () => {
    it("detects social media platforms", () => {
      expect(detectSourceType("https://twitter.com/user/status/123")).toBe("social");
      expect(detectSourceType("https://x.com/user")).toBe("social");
      expect(detectSourceType("https://linkedin.com/in/user")).toBe("social");
      expect(detectSourceType("https://facebook.com/page")).toBe("social");
      expect(detectSourceType("https://instagram.com/user")).toBe("social");
    });

    it("detects video platforms", () => {
      expect(detectSourceType("https://youtube.com/watch?v=abc")).toBe("video");
      expect(detectSourceType("https://youtu.be/abc")).toBe("video");
      expect(detectSourceType("https://twitch.tv/channel")).toBe("video");
      expect(detectSourceType("https://vimeo.com/123")).toBe("video");
      expect(detectSourceType("https://tiktok.com/@user")).toBe("video");
    });

    it("detects code platforms", () => {
      expect(detectSourceType("https://github.com/org/repo")).toBe("code");
      expect(detectSourceType("https://gitlab.com/org/repo")).toBe("code");
      expect(detectSourceType("https://stackoverflow.com/questions/123")).toBe("code");
    });

    it("detects academic sources", () => {
      expect(detectSourceType("https://arxiv.org/abs/2301.00001")).toBe("academic");
      expect(detectSourceType("https://pubmed.ncbi.nlm.nih.gov/123")).toBe("academic");
      expect(detectSourceType("https://scholar.google.com/citations")).toBe("academic");
    });

    it("detects news sources", () => {
      expect(detectSourceType("https://news.example.com/article")).toBe("news");
      expect(detectSourceType("https://reuters.com/article")).toBe("news");
      expect(detectSourceType("https://bbc.com/news/123")).toBe("news");
      expect(detectSourceType("https://cnn.com/politics/123")).toBe("news");
    });

    it("detects reference sources", () => {
      expect(detectSourceType("https://en.wikipedia.org/wiki/Topic")).toBe("reference");
      expect(detectSourceType("https://britannica.com/topic/Subject")).toBe("reference");
    });

    it("detects forums", () => {
      expect(detectSourceType("https://reddit.com/r/programming")).toBe("forum");
      expect(detectSourceType("https://quora.com/question")).toBe("forum");
    });

    it("detects PDF files", () => {
      expect(detectSourceType("https://example.com/document.pdf")).toBe("pdf");
      expect(detectSourceType("https://example.com/DOCUMENT.PDF")).toBe("pdf");
    });

    it("returns 'web' for generic URLs", () => {
      expect(detectSourceType("https://example.com/article")).toBe("web");
      expect(detectSourceType("https://myblog.com/post")).toBe("web");
    });

    it("returns 'unknown' for invalid URLs", () => {
      expect(detectSourceType("not-a-url")).toBe("unknown");
    });
  });

  describe("getPlatformName", () => {
    it("returns mapped platform names", () => {
      expect(getPlatformName("https://twitter.com/user")).toBe("X");
      expect(getPlatformName("https://x.com/user")).toBe("X");
      expect(getPlatformName("https://youtube.com/watch")).toBe("YouTube");
      expect(getPlatformName("https://github.com/repo")).toBe("GitHub");
      expect(getPlatformName("https://linkedin.com/in/user")).toBe("LinkedIn");
      expect(getPlatformName("https://twitch.tv/channel")).toBe("Twitch");
      expect(getPlatformName("https://reddit.com/r/sub")).toBe("Reddit");
      expect(getPlatformName("https://wikipedia.org/wiki/Page")).toBe("Wikipedia");
    });

    it("capitalizes unknown domains", () => {
      expect(getPlatformName("https://example.com/page")).toBe("Example.com");
      expect(getPlatformName("https://myblog.io/post")).toBe("Myblog.io");
    });

    it("uses provided domain if given", () => {
      expect(getPlatformName("https://example.com", "twitch.tv")).toBe("Twitch");
    });
  });

  describe("sourceCitationsToListItems", () => {
    it("converts citations with URLs to list items", () => {
      const citations = [
        { url: "https://example.com/article", title: "Example Article", citationNumber: 1 },
        { url: "https://github.com/repo", title: "GitHub Repo", citationNumber: 2 },
      ];

      const items = sourceCitationsToListItems(citations);

      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        url: "https://example.com/article",
        title: "Example Article",
        domain: "example.com",
        sourceType: "web",
        citationNumbers: [1],
      });
      expect(items[1]).toMatchObject({
        url: "https://github.com/repo",
        title: "GitHub Repo",
        domain: "github.com",
        sourceType: "code",
        citationNumbers: [2],
      });
    });

    it("aggregates citations with the same URL", () => {
      const citations = [
        { url: "https://example.com/article", title: "Example Article", citationNumber: 1 },
        { url: "https://example.com/article", title: "Example Article", citationNumber: 2 },
        { url: "https://example.com/article", title: "Example Article", citationNumber: 5 },
      ];

      const items = sourceCitationsToListItems(citations);

      expect(items).toHaveLength(1);
      expect(items[0].citationNumbers).toEqual([1, 2, 5]);
    });

    it("skips citations without URLs", () => {
      const citations = [
        { url: "https://example.com/article", title: "With URL", citationNumber: 1 },
        { title: "No URL", citationNumber: 2 },
        { url: undefined, title: "Undefined URL", citationNumber: 3 },
      ];

      const items = sourceCitationsToListItems(citations);

      expect(items).toHaveLength(1);
      expect(items[0].url).toBe("https://example.com/article");
    });

    it("uses domain as fallback title", () => {
      const citations = [{ url: "https://example.com/article", citationNumber: 1 }];

      const items = sourceCitationsToListItems(citations);

      expect(items[0].title).toBe("example.com");
    });

    it("preserves custom favicon URLs", () => {
      const citations = [
        {
          url: "https://example.com/article",
          title: "Example",
          faviconUrl: "https://custom.com/favicon.ico",
          citationNumber: 1,
        },
      ];

      const items = sourceCitationsToListItems(citations);

      expect(items[0].faviconUrl).toBe("https://custom.com/favicon.ico");
    });

    it("preserves source type if provided", () => {
      const citations = [
        {
          url: "https://example.com/article",
          title: "Example",
          sourceType: "news" as const,
          citationNumber: 1,
        },
      ];

      const items = sourceCitationsToListItems(citations);

      expect(items[0].sourceType).toBe("news");
    });
  });

  describe("isUrlCitation", () => {
    it("returns true for citations with URL", () => {
      const urlCitation: Citation = {
        type: "url",
        fullPhrase: "Test phrase",
        url: "https://example.com",
        title: "Example",
      };
      expect(isUrlCitation(urlCitation)).toBe(true);
    });

    it("returns false for citations without URL", () => {
      const citation: Citation = {
        fullPhrase: "Test phrase",
        pageNumber: 1,
      };
      expect(isUrlCitation(citation)).toBe(false);
    });

    it("returns false if URL is undefined", () => {
      const citation = {
        fullPhrase: "Test phrase",
        url: undefined,
      } as Citation;
      expect(isUrlCitation(citation)).toBe(false);
    });
  });

  describe("generateCitationKey with URL citation", () => {
    it("generates deterministic keys for URL citation", () => {
      const urlCitation: Citation = {
        type: "url",
        fullPhrase: "Revenue grew by 15%",  // context/excerpt from source
        anchorText: "revenue growth",        // specific cited text
        url: "https://example.com/report",
        title: "Q4 Report",
        domain: "example.com",
      };

      const key = generateCitationKey(urlCitation);
      expect(key).toHaveLength(16);

      // Same citation should produce same key
      const key2 = generateCitationKey(urlCitation);
      expect(key2).toBe(key);
    });

    it("produces different keys for different URLs", () => {
      const citation1: Citation = {
        type: "url",
        fullPhrase: "Test",
        url: "https://example.com/page1",
      };
      const citation2: Citation = {
        type: "url",
        fullPhrase: "Test",
        url: "https://example.com/page2",
      };

      expect(generateCitationKey(citation1)).not.toBe(generateCitationKey(citation2));
    });

    it("produces different keys for different titles", () => {
      const citation1: Citation = {
        type: "url",
        fullPhrase: "Test",
        url: "https://example.com/page",
        title: "Title 1",
      };
      const citation2: Citation = {
        type: "url",
        fullPhrase: "Test",
        url: "https://example.com/page",
        title: "Title 2",
      };

      expect(generateCitationKey(citation1)).not.toBe(generateCitationKey(citation2));
    });

    it("works with regular Citation (no URL fields)", () => {
      const citation: Citation = {
        attachmentId: "file-1",
        pageNumber: 4,
        fullPhrase: "Hello",
        anchorText: "$10",
      };

      const key = generateCitationKey(citation);
      expect(key).toHaveLength(16);
    });

    it("produces consistent keys between document and URL citation with same base fields", () => {
      // A URL citation with only base fields should work the same as document Citation
      const baseCitation: Citation = {
        attachmentId: "file-1",
        pageNumber: 4,
        fullPhrase: "Hello",
      };
      const urlCitationNoUrl: Citation = {
        attachmentId: "file-1",
        pageNumber: 4,
        fullPhrase: "Hello",
        // No URL - isUrlCitation will return false
      };

      // Both should generate the same key when URL citation has no URL
      const key1 = generateCitationKey(baseCitation);
      const key2 = generateCitationKey(urlCitationNoUrl);
      expect(key1).toBe(key2);
    });
  });
});
