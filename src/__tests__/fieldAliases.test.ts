import { describe, expect, it } from "@jest/globals";
import { getAllCitationsFromLlmOutput } from "../parsing/parseCitation.js";
import {
  getFieldAliases,
  normalizeCitationFields,
  resolveField,
  resolveFieldName,
  resolveFieldNameSnake,
} from "../utils/fieldAliases.js";

// ─── Unit tests: resolveFieldName ────────────────────────────────────

describe("resolveFieldName", () => {
  it("returns canonical name for camelCase input", () => {
    expect(resolveFieldName("anchorText")).toBe("anchorText");
    expect(resolveFieldName("fullPhrase")).toBe("fullPhrase");
    expect(resolveFieldName("attachmentId")).toBe("attachmentId");
    expect(resolveFieldName("startPageId")).toBe("startPageId");
    expect(resolveFieldName("lineIds")).toBe("lineIds");
    expect(resolveFieldName("faviconUrl")).toBe("faviconUrl");
    expect(resolveFieldName("siteName")).toBe("siteName");
  });

  it("resolves snake_case to camelCase", () => {
    expect(resolveFieldName("anchor_text")).toBe("anchorText");
    expect(resolveFieldName("full_phrase")).toBe("fullPhrase");
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
    expect(resolveFieldName("anchor-text")).toBe("anchorText");
    expect(resolveFieldName("full-phrase")).toBe("fullPhrase");
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
    expect(resolveFieldName("anchor")).toBe("anchorText");
    expect(resolveFieldName("phrase")).toBe("fullPhrase");
    expect(resolveFieldName("full")).toBe("fullPhrase");
    expect(resolveFieldName("page")).toBe("pageNumber");
    expect(resolveFieldName("lines")).toBe("lineIds");
    expect(resolveFieldName("desc")).toBe("description");
    expect(resolveFieldName("favicon")).toBe("faviconUrl");
    expect(resolveFieldName("timestamp")).toBe("timestamps");
  });

  it("resolves legacy field names (keySpan, key_span, fileId, etc.)", () => {
    expect(resolveFieldName("keySpan")).toBe("anchorText");
    expect(resolveFieldName("key_span")).toBe("anchorText");
    expect(resolveFieldName("key-span")).toBe("anchorText");
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
    expect(resolveFieldName("ANCHOR_TEXT")).toBe("anchorText");
    expect(resolveFieldName("Full_Phrase")).toBe("fullPhrase");
    expect(resolveFieldName("ANCHORTEXT")).toBe("anchorText");
    expect(resolveFieldName("FullPhrase")).toBe("fullPhrase");
    expect(resolveFieldName("LINEIDS")).toBe("lineIds");
  });

  it("returns input unchanged for unknown fields", () => {
    expect(resolveFieldName("unknownField")).toBe("unknownField");
    expect(resolveFieldName("something_else")).toBe("something_else");
    expect(resolveFieldName("foo-bar")).toBe("foo-bar");
  });
});

// ─── Unit tests: resolveFieldNameSnake ───────────────────────────────

describe("resolveFieldNameSnake", () => {
  it("returns snake_case for camelCase input", () => {
    expect(resolveFieldNameSnake("anchorText")).toBe("anchor_text");
    expect(resolveFieldNameSnake("fullPhrase")).toBe("full_phrase");
    expect(resolveFieldNameSnake("attachmentId")).toBe("attachment_id");
    expect(resolveFieldNameSnake("startPageId")).toBe("start_page_id");
    expect(resolveFieldNameSnake("lineIds")).toBe("line_ids");
    expect(resolveFieldNameSnake("faviconUrl")).toBe("favicon_url");
    expect(resolveFieldNameSnake("siteName")).toBe("site_name");
  });

  it("normalizes kebab-case to snake_case", () => {
    expect(resolveFieldNameSnake("anchor-text")).toBe("anchor_text");
    expect(resolveFieldNameSnake("full-phrase")).toBe("full_phrase");
    expect(resolveFieldNameSnake("start-page-id")).toBe("start_page_id");
  });

  it("normalizes shortened names to snake_case", () => {
    expect(resolveFieldNameSnake("anchor")).toBe("anchor_text");
    expect(resolveFieldNameSnake("phrase")).toBe("full_phrase");
    expect(resolveFieldNameSnake("page")).toBe("page_number");
    expect(resolveFieldNameSnake("lines")).toBe("line_ids");
    expect(resolveFieldNameSnake("favicon")).toBe("favicon_url");
  });

  it("normalizes legacy names to snake_case", () => {
    expect(resolveFieldNameSnake("keySpan")).toBe("anchor_text");
    expect(resolveFieldNameSnake("key_span")).toBe("anchor_text");
    expect(resolveFieldNameSnake("fileId")).toBe("attachment_id");
    expect(resolveFieldNameSnake("startPageKey")).toBe("start_page_id");
  });

  it("returns lowercase input for unknown fields", () => {
    expect(resolveFieldNameSnake("UnknownField")).toBe("unknownfield");
    expect(resolveFieldNameSnake("FOO")).toBe("foo");
  });

  it("returns canonical camelCase for fields without a snake_case mapping", () => {
    // Fields like 'reasoning', 'value', 'domain' have no snake_case mapping —
    // they're the same in both forms, so the canonical name is returned.
    expect(resolveFieldNameSnake("reasoning")).toBe("reasoning");
    expect(resolveFieldNameSnake("value")).toBe("value");
    expect(resolveFieldNameSnake("domain")).toBe("domain");
    expect(resolveFieldNameSnake("title")).toBe("title");
  });
});

// ─── Unit tests: resolveField ────────────────────────────────────────

describe("resolveField", () => {
  it("finds value by canonical name", () => {
    expect(resolveField({ anchorText: "hello" }, "anchorText")).toBe("hello");
    expect(resolveField({ fullPhrase: "world" }, "fullPhrase")).toBe("world");
  });

  it("finds value by snake_case alias", () => {
    expect(resolveField({ anchor_text: "hello" }, "anchorText")).toBe("hello");
    expect(resolveField({ full_phrase: "world" }, "fullPhrase")).toBe("world");
    expect(resolveField({ attachment_id: "abc" }, "attachmentId")).toBe("abc");
    expect(resolveField({ start_page_id: "p1" }, "startPageId")).toBe("p1");
  });

  it("finds value by kebab-case alias", () => {
    expect(resolveField({ "anchor-text": "hello" }, "anchorText")).toBe("hello");
    expect(resolveField({ "full-phrase": "world" }, "fullPhrase")).toBe("world");
    expect(resolveField({ "line-ids": [1, 2] }, "lineIds")).toEqual([1, 2]);
  });

  it("finds value by shortened alias", () => {
    expect(resolveField({ anchor: "hello" }, "anchorText")).toBe("hello");
    expect(resolveField({ phrase: "world" }, "fullPhrase")).toBe("world");
    expect(resolveField({ full: "ctx" }, "fullPhrase")).toBe("ctx");
    expect(resolveField({ page: 5 }, "pageNumber")).toBe(5);
    expect(resolveField({ lines: [1] }, "lineIds")).toEqual([1]);
    expect(resolveField({ favicon: "url" }, "faviconUrl")).toBe("url");
  });

  it("finds value by legacy alias", () => {
    expect(resolveField({ keySpan: "span" }, "anchorText")).toBe("span");
    expect(resolveField({ key_span: "span2" }, "anchorText")).toBe("span2");
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
    expect(resolveField({ anchorText: "canonical", anchor_text: "alias" }, "anchorText")).toBe("canonical");
    expect(resolveField({ fullPhrase: "canonical", full_phrase: "alias" }, "fullPhrase")).toBe("canonical");
    expect(resolveField({ url: "canonical", URL: "alias" }, "url")).toBe("canonical");
  });

  it("prefers earlier aliases in the list (camelCase legacy before snake_case legacy)", () => {
    // keySpan comes before key_span in the alias list
    expect(resolveField({ keySpan: "camel", key_span: "snake" }, "anchorText")).toBe("camel");
  });

  it("returns undefined for missing fields", () => {
    expect(resolveField({}, "anchorText")).toBeUndefined();
    expect(resolveField({ unrelated: "val" }, "fullPhrase")).toBeUndefined();
  });

  it("returns undefined for unknown canonical names", () => {
    expect(resolveField({ foo: "bar" }, "unknownField")).toBeUndefined();
  });
});

// ─── Unit tests: getFieldAliases ─────────────────────────────────────

describe("getFieldAliases", () => {
  it("includes canonical name as first element", () => {
    expect(getFieldAliases("anchorText")[0]).toBe("anchorText");
    expect(getFieldAliases("fullPhrase")[0]).toBe("fullPhrase");
    expect(getFieldAliases("url")[0]).toBe("url");
  });

  it("includes all known aliases", () => {
    const anchorAliases = getFieldAliases("anchorText");
    expect(anchorAliases).toContain("anchor_text");
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
      anchor_text: "hello",
      full_phrase: "world",
      attachment_id: "abc",
      line_ids: [1, 2],
    });
    expect(result).toEqual({
      anchorText: "hello",
      fullPhrase: "world",
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
      anchorText: "hello",
      fullPhrase: "world",
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
      anchorText: "hello",
      fullPhrase: "world",
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
      anchorText: "span",
      attachmentId: "f1",
      startPageId: "k1",
    });
  });

  it("passes through unknown fields unchanged", () => {
    const result = normalizeCitationFields({
      anchor_text: "hello",
      customField: "preserved",
      anotherThing: 42,
    });
    expect(result.anchorText).toBe("hello");
    expect(result.customField).toBe("preserved");
    expect(result.anotherThing).toBe(42);
  });

  it("first writer wins when multiple aliases map to the same canonical", () => {
    // Object.entries() preserves insertion order — anchorText appears first
    const result = normalizeCitationFields({
      anchorText: "canonical",
      anchor_text: "snake",
      anchor: "short",
    });
    expect(result.anchorText).toBe("canonical");
  });

  it("does not mutate the input", () => {
    const input = { anchor_text: "hello", full_phrase: "world" };
    const inputCopy = { ...input };
    normalizeCitationFields(input);
    expect(input).toEqual(inputCopy);
  });

  it("normalizes a full URL citation object", () => {
    const result = normalizeCitationFields({
      full_phrase: "The text says...",
      anchor_text: "text says",
      URL: "https://example.com",
      site_name: "Example",
      favicon_url: "https://example.com/favicon.ico",
      source_type: "web",
    });
    expect(result).toEqual({
      fullPhrase: "The text says...",
      anchorText: "text says",
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
      expect(citations[0].fullPhrase).toBe("Revenue grew 23% year-over-year");
      expect(citations[0].anchorText).toBe("grew 23%");
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
    it("parses citation with 'anchor' instead of 'anchorText'", () => {
      const input = {
        fullPhrase: "The company reported strong earnings",
        anchor: "strong earnings",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].anchorText).toBe("strong earnings");
    });

    it("parses citation with 'phrase' instead of 'fullPhrase'", () => {
      const input = {
        phrase: "The quarterly report showed improvement",
        anchorText: "showed improvement",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].fullPhrase).toBe("The quarterly report showed improvement");
    });

    it("parses citation with 'full' instead of 'fullPhrase'", () => {
      const input = {
        full: "Market conditions remained stable throughout",
        anchorText: "remained stable",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citations = Object.values(result);
      expect(citations).toHaveLength(1);
      expect(citations[0].fullPhrase).toBe("Market conditions remained stable throughout");
    });

    it("parses citation with 'desc' instead of 'description'", () => {
      const input = {
        fullPhrase: "Data from the report",
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
        fullPhrase: "The source confirms this",
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
        fullPhrase: "Referenced from the article",
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
        fullPhrase: "Found at the link below",
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
          fullPhrase: "First citation in camelCase",
          anchorText: "camelCase",
          attachmentId: "file12345678901234567",
        },
        {
          full_phrase: "Second citation in snake_case",
          anchor_text: "snake_case",
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
      expect(citations.map(c => c.anchorText)).toEqual(
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
      expect(citations[0].fullPhrase).toBe("Revenue grew significantly");
      expect(citations[0].anchorText).toBe("grew significantly");
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
      const input = { fullPhrase: "from the article", href: "https://example.com" };
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

// ─── Integration: XML cite tag parsing with aliases ──────────────────
//
// NOTE: XML cite tags go through normalizeCitation.ts before parsing,
// which uses TEXT_ATTRIBUTE_REGEX with hardcoded attribute name boundaries.
// This means:
//   - snake_case and camelCase aliases WORK (they're in the normalization regex)
//   - Shortened names (anchor, phrase) and kebab-case (anchor-text) do NOT work
//     in XML because the normalization pipeline can't delimit their value boundaries
//   - These shortened/kebab aliases are designed for the JSON path only

describe("getAllCitationsFromLlmOutput — XML alias integration", () => {
  it("parses XML cite tag with camelCase attribute names", () => {
    const input = `<cite fullPhrase='Revenue grew 23%' anchorText='grew 23%' attachmentId='file12345678901234567' />`;
    const result = getAllCitationsFromLlmOutput(input);

    const citations = Object.values(result);
    expect(citations).toHaveLength(1);
    expect(citations[0].fullPhrase).toBe("Revenue grew 23%");
    expect(citations[0].anchorText).toBe("grew 23%");
  });

  it("parses XML cite tag with legacy keySpan attribute", () => {
    const input = `<cite full_phrase='The data shows improvement' keySpan='shows improvement' />`;
    const result = getAllCitationsFromLlmOutput(input);

    const citations = Object.values(result);
    expect(citations).toHaveLength(1);
    expect(citations[0].anchorText).toBe("shows improvement");
  });

  it("parses XML cite tag with legacy fileId attribute", () => {
    const input = `<cite full_phrase='Important finding' anchor_text='finding' fileId='file12345678901234567' />`;
    const result = getAllCitationsFromLlmOutput(input);

    const citations = Object.values(result);
    expect(citations).toHaveLength(1);
    expect(citations[0].type).toBe("document");
  });

  it("parses XML cite tag with startPageKey legacy attribute", () => {
    const input = `<cite full_phrase='Page reference' anchor_text='reference' startPageKey='page_number_3_index_0' />`;
    const result = getAllCitationsFromLlmOutput(input);

    const citations = Object.values(result);
    expect(citations).toHaveLength(1);
    expect(citations[0].pageNumber).toBe(3);
  });

  // NOTE: In XML cite tags, URL-specific attributes (url, site_name, favicon_url)
  // must appear BEFORE text attributes (full_phrase, anchor_text) because
  // TEXT_ATTRIBUTE_REGEX only recognizes text attribute names as value boundaries.
  // If URL attributes appear after text attributes, they get consumed as part of
  // the text attribute's value during normalization.

  it("parses XML URL citation with site_name and favicon_url", () => {
    const input = `<cite url='https://example.com' site_name='Example' favicon_url='https://example.com/icon.png' full_phrase='Info from site' anchor_text='from site' />`;
    const result = getAllCitationsFromLlmOutput(input);

    const citations = Object.values(result);
    expect(citations).toHaveLength(1);
    expect(citations[0].type).toBe("url");
    if (citations[0].type === "url") {
      expect(citations[0].siteName).toBe("Example");
      expect(citations[0].faviconUrl).toBe("https://example.com/icon.png");
    }
  });

  it("parses XML URL citation with siteName and faviconUrl (camelCase)", () => {
    const input = `<cite url='https://example.com' siteName='Example' faviconUrl='https://example.com/icon.png' fullPhrase='Info from site' anchorText='from site' />`;
    const result = getAllCitationsFromLlmOutput(input);

    const citations = Object.values(result);
    expect(citations).toHaveLength(1);
    expect(citations[0].type).toBe("url");
    if (citations[0].type === "url") {
      expect(citations[0].siteName).toBe("Example");
      expect(citations[0].faviconUrl).toBe("https://example.com/icon.png");
    }
  });
});
