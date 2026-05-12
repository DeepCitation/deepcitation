import { describe, expect, it } from "bun:test";
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
      template: `text[1]\n\n<<<CITATION_DATA>>>\n{"__ID__":[{"id":1,"source_context":"He said \\"hi\\""}]}\n<<<END_CITATION_DATA>>>`,
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
      template: `text[1]\n\n<<<CITATION_DATA>>>\n{"__ID__":[{"id":1,"source_context":"It's $500"}]}\n<<<END_CITATION_DATA>>>`,
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
    expect(decompressPromptIds(decompressed as string, prefixMap)).toBe(decompressed);

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
    expect(decompressPromptIds(decompressed as string, prefixMap)).toBe(original);
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
    expect(decompressPromptIds(decompressed as string, prefixMap)).toBe(original);
  });

  it("handles IDs appearing multiple times in prompt context", () => {
    const original = `Page content for ${fullId}:\nLine 1: data\n\ntext[1]\n\n<<<CITATION_DATA>>>\n{"${fullId}":[{"id":1}]}\n<<<END_CITATION_DATA>>>`;
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);
    const decompressed = decompressPromptIds(compressed, prefixMap);

    expect(decompressed).toBe(original);
    expect(decompressPromptIds(decompressed as string, prefixMap)).toBe(original);
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

  it("does not expand a prefix inside an ID that the model already returned uncompressed", () => {
    const fullId = "Kzo5zrnDUGkVIDtvv4lQ";
    const prefixMap = { Kzo5: fullId };
    const modelOutput = `<<<CITATION_DATA>>>\n{"Kzo5zrnDUGkVIDtvv4lQ":[{"id":1}]}\n<<<END_CITATION_DATA>>>`;

    expect(decompressPromptIds(modelOutput, prefixMap)).toBe(modelOutput);
    expect(decompressPromptIds(decompressPromptIds(modelOutput, prefixMap) as string, prefixMap)).toBe(modelOutput);
  });

  it("expands the compressed prefix once when the full-ID suffix is absent", () => {
    const fullId = "Kzo5zrnDUGkVIDtvv4lQ";
    const prefixMap = { Kzo5: fullId };
    const compressedOutput = `<<<CITATION_DATA>>>\n{"Kzo5":[{"id":1}]}\n<<<END_CITATION_DATA>>>`;
    const decompressedOutput = `<<<CITATION_DATA>>>\n{"Kzo5zrnDUGkVIDtvv4lQ":[{"id":1}]}\n<<<END_CITATION_DATA>>>`;

    expect(decompressPromptIds(compressedOutput, prefixMap)).toBe(decompressedOutput);
    expect(decompressPromptIds(decompressedOutput, prefixMap)).toBe(decompressedOutput);
  });

  it("handles mixed compressed and already-uncompressed IDs idempotently", () => {
    const fullId = "Kzo5zrnDUGkVIDtvv4lQ";
    const prefixMap = { Kzo5: fullId };
    const mixedOutput = [
      "Visible answer [1] [2]",
      "<<<CITATION_DATA>>>",
      `{"Kzo5":[{"id":1}],"${fullId}":[{"id":2}]}`,
      "<<<END_CITATION_DATA>>>",
    ].join("\n");
    const normalizedOutput = [
      "Visible answer [1] [2]",
      "<<<CITATION_DATA>>>",
      `{"${fullId}":[{"id":1}],"${fullId}":[{"id":2}]}`,
      "<<<END_CITATION_DATA>>>",
    ].join("\n");

    expect(decompressPromptIds(mixedOutput, prefixMap)).toBe(normalizedOutput);
    expect(decompressPromptIds(normalizedOutput, prefixMap)).toBe(normalizedOutput);
  });

  it("preserves non-prefix aliases used by older tests and callers", () => {
    const prefixMap = { P0: "doc_abc123" };
    const compressedOutput = "Citation key P0 should expand.";
    const decompressedOutput = "Citation key doc_abc123 should expand.";

    expect(decompressPromptIds(compressedOutput, prefixMap)).toBe(decompressedOutput);
    expect(decompressPromptIds(decompressedOutput, prefixMap)).toBe(decompressedOutput);
  });
});
