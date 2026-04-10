import { describe, expect, it } from "@jest/globals";
import { getAllCitationsFromLlmOutput } from "../parsing/parseCitation.js";
import { getFieldAliases, normalizeCitationFields, resolveField, resolveFieldName } from "../utils/fieldAliases.js";

// ─── Unit tests: resolveFieldName ────────────────────────────────────

describe("resolveFieldName", () => {
  it("returns canonical name for camelCase input", () => {
    expect(resolveFieldName("sourceMatch")).toBe("sourceMatch");
    expect(resolveFieldName("sourceContext")).toBe("sourceContext");
    expect(resolveFieldName("attachmentId")).toBe("attachmentId");
    expect(resolveFieldName("startPageId")).toBe("startPageId");
    expect(resolveFieldName("lineIds")).toBe("lineIds");
    expect(resolveFieldName("faviconUrl")).toBe("faviconUrl");
    expect(resolveFieldName("siteName")).toBe("siteName");
  });

  it("resolves snake_case to camelCase", () => {
    expect(resolveFieldName("source_match")).toBe("sourceMatch");
    expect(resolveFieldName("source_context")).toBe("sourceContext");
    expect(resolveFieldName("attachment_id")).toBe("attachmentId");
    expect(resolveFieldName("start_page_id")).toBe("startPageId");
    expect(resolveFieldName("line_ids")).toBe("lineIds");
    expect(resolveFieldName("favicon_url")).toBe("faviconUrl");
    expect(resolveFieldName("site_name")).toBe("siteName");
    expect(resolveFieldName("source_type")).toBe("sourceType");
    expect(resolveFieldName("page_number")).toBe("pageNumber");
    expect(resolveFieldName("citation_number")).toBe("citationNumber");
  });

  it("resolves kebab-case to camelCase", () => {
    expect(resolveFieldName("anchor-text")).toBe("sourceMatch");
    expect(resolveFieldName("full-phrase")).toBe("sourceContext");
    expect(resolveFieldName("attachment-id")).toBe("attachmentId");
    expect(resolveFieldName("start-page-id")).toBe("startPageId");
    expect(resolveFieldName("line-ids")).toBe("lineIds");
    expect(resolveFieldName("favicon-url")).toBe("faviconUrl");
    expect(resolveFieldName("site-name")).toBe("siteName");
    expect(resolveFieldName("source-type")).toBe("sourceType");
    expect(resolveFieldName("page-number")).toBe("pageNumber");
    expect(resolveFieldName("citation-number")).toBe("citationNumber");
  });

  it("resolves shortened LLM names to canonical", () => {
    expect(resolveFieldName("anchor")).toBe("sourceMatch");
    expect(resolveFieldName("phrase")).toBe("sourceContext");
    expect(resolveFieldName("full")).toBe("sourceContext");
    expect(resolveFieldName("page")).toBe("pageNumber");
    expect(resolveFieldName("lines")).toBe("lineIds");
    expect(resolveFieldName("desc")).toBe("description");
    expect(resolveFieldName("favicon")).toBe("faviconUrl");
    expect(resolveFieldName("timestamp")).toBe("timestamps");
  });

  it("resolves legacy field names (keySpan, key_span, fileId, etc.)", () => {
    expect(resolveFieldName("keySpan")).toBe("sourceMatch");
    expect(resolveFieldName("key_span")).toBe("sourceMatch");
    expect(resolveFieldName("key-span")).toBe("sourceMatch");
    expect(resolveFieldName("fileId")).toBe("attachmentId");
    expect(resolveFieldName("file_id")).toBe("attachmentId");
    expect(resolveFieldName("file-id")).toBe("attachmentId");
    expect(resolveFieldName("startPageKey")).toBe("startPageId");
    expect(resolveFieldName("start_page_key")).toBe("startPageId");
    expect(resolveFieldName("pageId")).toBe("startPageId");
    expect(resolveFieldName("page_id")).toBe("startPageId");
    expect(resolveFieldName("pageKey")).toBe("startPageId");
    expect(resolveFieldName("page_key")).toBe("startPageId");
  });

  it("resolves URL-like aliases", () => {
    expect(resolveFieldName("url")).toBe("url");
    expect(resolveFieldName("URL")).toBe("url");
    expect(resolveFieldName("uri")).toBe("url");
    expect(resolveFieldName("href")).toBe("url");
    expect(resolveFieldName("link")).toBe("url");
  });

  it("is case-insensitive", () => {
    expect(resolveFieldName("ANCHOR_TEXT")).toBe("sourceMatch");
    expect(resolveFieldName("Full_Phrase")).toBe("sourceContext");
    expect(resolveFieldName("ANCHORTEXT")).toBe("sourceMatch");
    expect(resolveFieldName("FullPhrase")).toBe("sourceContext");
    expect(resolveFieldName("LINEIDS")).toBe("lineIds");
  });

  it("returns input unchanged for unknown fields", () => {
    expect(resolveFieldName("unknownField")).toBe("unknownField");
    expect(resolveFieldName("something_else")).toBe("something_else");
    expect(resolveFieldName("foo-bar")).toBe("foo-bar");
  });
});

// ─── Unit tests: resolveField ────────────────────────────────────────

describe("resolveField", () => {
  it("finds value by canonical name", () => {
    expect(resolveField({ sourceMatch: "hello" }, "sourceMatch")).toBe("hello");
    expect(resolveField({ sourceContext: "world" }, "sourceContext")).toBe("world");
  });

  it("finds value by snake_case alias", () => {
    expect(resolveField({ source_match: "hello" }, "sourceMatch")).toBe("hello");
    expect(resolveField({ source_context: "world" }, "sourceContext")).toBe("world");
    expect(resolveField({ attachment_id: "abc" }, "attachmentId")).toBe("abc");
    expect(resolveField({ start_page_id: "p1" }, "startPageId")).toBe("p1");
  });

  it("finds value by kebab-case alias", () => {
    expect(resolveField({ "anchor-text": "hello" }, "sourceMatch")).toBe("hello");
    expect(resolveField({ "full-phrase": "world" }, "sourceContext")).toBe("world");
    expect(resolveField({ "line-ids": [1, 2] }, "lineIds")).toEqual([1, 2]);
  });

  it("finds value by shortened alias", () => {
    expect(resolveField({ anchor: "hello" }, "sourceMatch")).toBe("hello");
    expect(resolveField({ phrase: "world" }, "sourceContext")).toBe("world");
    expect(resolveField({ full: "ctx" }, "sourceContext")).toBe("ctx");
    expect(resolveField({ page: 5 }, "pageNumber")).toBe(5);
    expect(resolveField({ lines: [1] }, "lineIds")).toEqual([1]);
    expect(resolveField({ favicon: "url" }, "faviconUrl")).toBe("url");
  });

  it("finds value by legacy alias", () => {
    expect(resolveField({ keySpan: "span" }, "sourceMatch")).toBe("span");
    expect(resolveField({ key_span: "span2" }, "sourceMatch")).toBe("span2");
    expect(resolveField({ fileId: "f1" }, "attachmentId")).toBe("f1");
    expect(resolveField({ file_id: "f2" }, "attachmentId")).toBe("f2");
    expect(resolveField({ startPageKey: "k1" }, "startPageId")).toBe("k1");
    expect(resolveField({ pageId: "p1" }, "startPageId")).toBe("p1");
    expect(resolveField({ pageKey: "k2" }, "startPageId")).toBe("k2");
  });

  it("finds URL by alternate alias", () => {
    expect(resolveField({ URL: "https://a.com" }, "url")).toBe("https://a.com");
    expect(resolveField({ uri: "https://b.com" }, "url")).toBe("https://b.com");
    expect(resolveField({ href: "https://c.com" }, "url")).toBe("https://c.com");
    expect(resolveField({ link: "https://d.com" }, "url")).toBe("https://d.com");
  });

  it("prefers canonical name over aliases", () => {
    expect(resolveField({ sourceMatch: "canonical", source_match: "alias" }, "sourceMatch")).toBe("canonical");
    expect(resolveField({ sourceContext: "canonical", source_context: "alias" }, "sourceContext")).toBe("canonical");
    expect(resolveField({ url: "canonical", URL: "alias" }, "url")).toBe("canonical");
  });

  it("prefers earlier aliases in the list (camelCase legacy before snake_case legacy)", () => {
    // keySpan comes before key_span in the alias list
    expect(resolveField({ keySpan: "camel", key_span: "snake" }, "sourceMatch")).toBe("camel");
  });

  it("returns undefined for missing fields", () => {
    expect(resolveField({}, "sourceMatch")).toBeUndefined();
    expect(resolveField({ unrelated: "val" }, "sourceContext")).toBeUndefined();
  });

  it("returns undefined for unknown canonical names", () => {
    expect(resolveField({ foo: "bar" }, "unknownField")).toBeUndefined();
  });
});

// ─── Unit tests: getFieldAliases ─────────────────────────────────────

describe("getFieldAliases", () => {
  it("includes canonical name as first element", () => {
    expect(getFieldAliases("sourceMatch")[0]).toBe("sourceMatch");
    expect(getFieldAliases("sourceContext")[0]).toBe("sourceContext");
    expect(getFieldAliases("url")[0]).toBe("url");
  });

  it("includes all known aliases", () => {
    const anchorAliases = getFieldAliases("sourceMatch");
    expect(anchorAliases).toContain("source_match");
    expect(anchorAliases).toContain("anchor-text");
    expect(anchorAliases).toContain("anchor");
    expect(anchorAliases).toContain("keySpan");
    expect(anchorAliases).toContain("key_span");
    expect(anchorAliases).toContain("key-span");
  });

  it("includes all startPageId aliases", () => {
    const aliases = getFieldAliases("startPageId");
    expect(aliases).toContain("start_page_id");
    expect(aliases).toContain("startPageKey");
    expect(aliases).toContain("start_page_key");
    expect(aliases).toContain("pageId");
    expect(aliases).toContain("page_id");
    expect(aliases).toContain("start_page");
  });

  it("includes URL aliases", () => {
    const aliases = getFieldAliases("url");
    expect(aliases).toContain("URL");
    expect(aliases).toContain("uri");
    expect(aliases).toContain("href");
    expect(aliases).toContain("link");
  });

  it("returns just the name for fields with no aliases", () => {
    expect(getFieldAliases("reasoning")).toEqual(["reasoning"]);
    expect(getFieldAliases("value")).toEqual(["value"]);
  });

  it("returns just the name for unknown fields", () => {
    expect(getFieldAliases("unknownField")).toEqual(["unknownField"]);
  });
});

// ─── Unit tests: normalizeCitationFields ─────────────────────────────

describe("normalizeCitationFields", () => {
  it("normalizes snake_case to camelCase", () => {
    const result = normalizeCitationFields({
      source_match: "hello",
      source_context: "world",
      attachment_id: "abc",
      line_ids: [1, 2],
    });
    expect(result).toEqual({
      sourceMatch: "hello",
      sourceContext: "world",
      attachmentId: "abc",
      lineIds: [1, 2],
    });
  });

  it("normalizes kebab-case to camelCase", () => {
    const result = normalizeCitationFields({
      "anchor-text": "hello",
      "full-phrase": "world",
      "start-page-id": "p1",
    });
    expect(result).toEqual({
      sourceMatch: "hello",
      sourceContext: "world",
      startPageId: "p1",
    });
  });

  it("normalizes shortened names to canonical", () => {
    const result = normalizeCitationFields({
      anchor: "hello",
      phrase: "world",
      page: 3,
      lines: [1, 2, 3],
    });
    expect(result).toEqual({
      sourceMatch: "hello",
      sourceContext: "world",
      pageNumber: 3,
      lineIds: [1, 2, 3],
    });
  });

  it("normalizes legacy names", () => {
    const result = normalizeCitationFields({
      keySpan: "span",
      fileId: "f1",
      startPageKey: "k1",
    });
    expect(result).toEqual({
      sourceMatch: "span",
      attachmentId: "f1",
      startPageId: "k1",
    });
  });

  it("passes through unknown fields unchanged", () => {
    const result = normalizeCitationFields({
      source_match: "hello",
      customField: "preserved",
      anotherThing: 42,
    });
    expect(result.sourceMatch).toBe("hello");
    expect(result.customField).toBe("preserved");
    expect(result.anotherThing).toBe(42);
  });

  it("first writer wins when multiple aliases map to the same canonical", () => {
    // Object.entries() preserves insertion order — sourceMatch appears first
    const result = normalizeCitationFields({
      sourceMatch: "canonical",
      source_match: "snake",
      anchor: "short",
    });
    expect(result.sourceMatch).toBe("canonical");
  });

  it("does not mutate the input", () => {
    const input = { source_match: "hello", source_context: "world" };
    const inputCopy = { ...input };
    normalizeCitationFields(input);
    expect(input).toEqual(inputCopy);
  });

  it("normalizes a full URL citation object", () => {
    const result = normalizeCitationFields({
      source_context: "The text says...",
      source_match: "text says",
      URL: "https://example.com",
      site_name: "Example",
      favicon_url: "https://example.com/favicon.ico",
      source_type: "web",
    });
    expect(result).toEqual({
      sourceContext: "The text says...",
      sourceMatch: "text says",
      url: "https://example.com",
      siteName: "Example",
      faviconUrl: "https://example.com/favicon.ico",
      sourceType: "web",
    });
  });
});

// ─── Integration: JSON citation parsing with new aliases ─────────────

describe("getAllCitationsFromLlmOutput — field alias integration", () => {
  describe("kebab-case field names in JSON citations", () => {
    it("parses citation with kebab-case field names", () => {
      const input = {
        "full-phrase": "Revenue grew 23% year-over-year",
        "anchor-text": "grew 23%",
        "attachment-id": "file12345678901234567",
        "line-ids": [10, 11, 12],
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].sourceContext).toBe("Revenue grew 23% year-over-year");
      expect(citations[0].sourceMatch).toBe("grew 23%");
      expect(citations[0].type).toBe("document");
    });

    it("parses URL citation with kebab-case field names", () => {
      const input = {
        "full-phrase": "The article discusses trends",
        "anchor-text": "discusses trends",
        url: "https://example.com/article",
        "site-name": "Example News",
        "favicon-url": "https://example.com/favicon.ico",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].type).toBe("url");
      if (citations[0].type === "url") {
        expect(citations[0].siteName).toBe("Example News");
        expect(citations[0].faviconUrl).toBe("https://example.com/favicon.ico");
      }
    });
  });

  describe("shortened field names in JSON citations", () => {
    it("parses citation with 'anchor' instead of 'sourceMatch'", () => {
      const input = {
        sourceContext: "The company reported strong earnings",
        anchor: "strong earnings",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].sourceMatch).toBe("strong earnings");
    });

    it("parses citation with 'phrase' instead of 'sourceContext'", () => {
      const input = {
        phrase: "The quarterly report showed improvement",
        sourceMatch: "showed improvement",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].sourceContext).toBe("The quarterly report showed improvement");
    });

    it("parses citation with 'full' instead of 'sourceContext'", () => {
      const input = {
        full: "Market conditions remained stable throughout",
        sourceMatch: "remained stable",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].sourceContext).toBe("Market conditions remained stable throughout");
    });

    it("parses citation with 'desc' instead of 'description'", () => {
      const input = {
        sourceContext: "Data from the report",
        url: "https://example.com",
        desc: "A detailed report about data",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      if (citations[0].type === "url") {
        expect(citations[0].description).toBe("A detailed report about data");
      }
    });
  });

  describe("URL field aliases in JSON citations", () => {
    it("parses citation using 'URI' as url alias", () => {
      const input = {
        sourceContext: "The source confirms this",
        uri: "https://example.com/source",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].type).toBe("url");
      if (citations[0].type === "url") {
        expect(citations[0].url).toBe("https://example.com/source");
      }
    });

    it("parses citation using 'href' as url alias", () => {
      const input = {
        sourceContext: "Referenced from the article",
        href: "https://example.com/article",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].type).toBe("url");
      if (citations[0].type === "url") {
        expect(citations[0].url).toBe("https://example.com/article");
      }
    });

    it("parses citation using 'link' as url alias", () => {
      const input = {
        sourceContext: "Found at the link below",
        link: "https://example.com/resource",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].type).toBe("url");
      if (citations[0].type === "url") {
        expect(citations[0].url).toBe("https://example.com/resource");
      }
    });
  });

  describe("mixed alias formats in JSON citation arrays", () => {
    it("handles array where each citation uses different naming conventions", () => {
      const input = [
        {
          sourceContext: "First citation in camelCase",
          sourceMatch: "camelCase",
          attachmentId: "file12345678901234567",
        },
        {
          source_context: "Second citation in snake_case",
          source_match: "snake_case",
          file_id: "file12345678901234568",
        },
        {
          "full-phrase": "Third citation in kebab-case",
          "anchor-text": "kebab-case",
          "attachment-id": "file12345678901234569",
        },
        {
          phrase: "Fourth citation with shortened names",
          anchor: "shortened",
        },
      ];
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(4);
      expect(citations.map(c => c.sourceMatch)).toEqual(
        expect.arrayContaining(["camelCase", "snake_case", "kebab-case", "shortened"]),
      );
    });
  });

  describe("nested JSON citations with aliases", () => {
    it("finds citations in nested 'citations' property using aliases", () => {
      const input = {
        response: "Here is my analysis",
        citations: [
          {
            "full-phrase": "Revenue grew significantly",
            anchor: "grew significantly",
          },
        ],
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].sourceContext).toBe("Revenue grew significantly");
      expect(citations[0].sourceMatch).toBe("grew significantly");
    });
  });

  describe("hasCitationProperties detects aliased fields", () => {
    it("detects objects using kebab-case citation fields", () => {
      const input = { "full-phrase": "some text", "anchor-text": "text" };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("detects objects using shortened citation fields", () => {
      const input = { phrase: "some text", anchor: "text" };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("detects URL citations using 'href' alias", () => {
      const input = { sourceContext: "from the article", href: "https://example.com" };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.type).toBe("url");
    });

    it("detects URL citations using 'link' + 'phrase' aliases", () => {
      const input = { phrase: "from the article", link: "https://example.com" };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.type).toBe("url");
    });
  });
});
