import { describe, expect, it } from "@jest/globals";
import { compressPromptIds, decompressPromptIds } from "../prompts/promptCompression.js";

describe("promptCompression compress/decompress cycles", () => {
  const fullId = "file_ABC123def456";

  const cases = [
    {
      name: "numeric citation with JSON double quotes",
      template: `text[1]\n\n<<<CITATION_DATA>>>\n{"__ID__":[{"id":1,"line_ids":[1]}]}\n<<<END_CITATION_DATA>>>`,
    },
    {
      name: "numeric citation with escaped double quotes nearby",
      template: `text[1]\n\n<<<CITATION_DATA>>>\n{"__ID__":[{"id":1,"full_phrase":"He said \\"hi\\""}]}\n<<<END_CITATION_DATA>>>`,
    },
    {
      name: "numeric citation with multiple markers",
      template: `first[1] and second[2]\n\n<<<CITATION_DATA>>>\n{"__ID__":[{"id":1,"line_ids":[1]},{"id":2,"line_ids":[5]}]}\n<<<END_CITATION_DATA>>>`,
    },
    {
      name: "numeric citation with whitespace and newlines",
      template: `text[1]\n\n<<<CITATION_DATA>>>\n{\n  "__ID__": [{"id": 1}]\n}\n<<<END_CITATION_DATA>>>`,
    },
    {
      name: "numeric citation with special characters in phrase",
      template: `text[1]\n\n<<<CITATION_DATA>>>\n{"__ID__":[{"id":1,"full_phrase":"It's $500"}]}\n<<<END_CITATION_DATA>>>`,
    },
  ];

  const runCycle = (template: string) => {
    const original = template.replace(/__ID__/g, fullId);
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);

    const entries = Object.entries(prefixMap);
    expect(entries).toHaveLength(1);
    const [prefix, mapped] = entries[0];
    expect(mapped).toBe(fullId);

    const expectedCompressed = original.replaceAll(fullId, prefix);
    expect(compressed).toBe(expectedCompressed);
    expect(compressed).not.toContain(fullId);
    expect(compressed).toContain(prefix);

    const decompressed = decompressPromptIds(compressed, prefixMap);
    expect(decompressed).toBe(original);

    const recompressed = compressPromptIds(decompressed as string, [fullId]);
    expect(recompressed.compressed).toBe(compressed);
    expect(recompressed.prefixMap).toEqual(prefixMap);
  };

  for (const testCase of cases) {
    it(`round-trips and preserves key/quote styles: ${testCase.name}`, () => {
      runCycle(testCase.template);
    });
  }
});

describe("promptCompression ID handling", () => {
  const fullId = "doc_XYZ789abc123";

  it("handles IDs in JSON citation data", () => {
    const original = `text[1]\n\n<<<CITATION_DATA>>>\n{"${fullId}":[{"id":1}]}\n<<<END_CITATION_DATA>>>`;
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);

    expect(Object.keys(prefixMap)).toHaveLength(1);
    expect(compressed).not.toContain(fullId);

    const decompressed = decompressPromptIds(compressed, prefixMap);
    expect(decompressed).toBe(original);
  });

  it("handles multiple IDs in citation data", () => {
    const id1 = "doc_ABC123456789";
    const id2 = "doc_DEF987654321";

    const original = `text[1] more[2]\n\n<<<CITATION_DATA>>>\n{"${id1}":[{"id":1}],"${id2}":[{"id":2}]}\n<<<END_CITATION_DATA>>>`;
    const { compressed, prefixMap } = compressPromptIds(original, [id1, id2]);

    expect(Object.keys(prefixMap)).toHaveLength(2);
    expect(compressed).not.toContain(id1);
    expect(compressed).not.toContain(id2);

    const decompressed = decompressPromptIds(compressed, prefixMap);
    expect(decompressed).toBe(original);
  });

  it("handles IDs appearing multiple times in prompt context", () => {
    const original = `Page content for ${fullId}:\nLine 1: data\n\ntext[1]\n\n<<<CITATION_DATA>>>\n{"${fullId}":[{"id":1}]}\n<<<END_CITATION_DATA>>>`;
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);
    const decompressed = decompressPromptIds(compressed, prefixMap);

    expect(decompressed).toBe(original);
  });
});

describe("promptCompression edge cases", () => {
  it("handles empty ids array", () => {
    const original = "some text without ids";
    const { compressed, prefixMap } = compressPromptIds(original, []);

    expect(compressed).toBe(original);
    expect(prefixMap).toEqual({});
  });

  it("handles undefined ids", () => {
    const original = "some text without ids";
    const { compressed, prefixMap } = compressPromptIds(original, undefined);

    expect(compressed).toBe(original);
    expect(prefixMap).toEqual({});
  });

  it("handles object input", () => {
    const fullId = "file_ABC123def456";
    const original = { content: `Reference: ${fullId}`, id: fullId };
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);

    expect(Object.keys(prefixMap)).toHaveLength(1);
    const prefix = Object.keys(prefixMap)[0];
    expect((compressed as typeof original).content).toBe(`Reference: ${prefix}`);
    expect((compressed as typeof original).id).toBe(prefix);

    const decompressed = decompressPromptIds(compressed, prefixMap);
    expect(decompressed).toEqual(original);
  });

  it("decompression with empty prefixMap returns original", () => {
    const original = "some text";
    const result = decompressPromptIds(original, {});
    expect(result).toBe(original);
  });

  it("decompression handles string input", () => {
    const fullId = "file_ABC123def456";
    const original = `citation data: {"${fullId}":[{"id":1}]}`;
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);

    const decompressed = decompressPromptIds(compressed as string, prefixMap);
    expect(typeof decompressed).toBe("string");
    expect(decompressed).toBe(original);
  });
});
