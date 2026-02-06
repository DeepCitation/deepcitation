import { describe, expect, it } from "@jest/globals";
import { compressPromptIds, decompressPromptIds } from "../prompts/promptCompression.js";

describe("promptCompression compress/decompress cycles", () => {
  const fullId = "file_ABC123def456";

  const cases = [
    {
      name: "attachment_id with double quotes",
      template: `<cite attachment_id="__ID__" line_ids="L1"></cite>`,
    },
    {
      name: "attachmentID with single quotes and escaped double quotes nearby",
      template: `<cite attachmentID='__ID__' note="He said \\"hi\\""></cite>`,
    },
    {
      name: "attachment_id with backticks and escaped single quote nearby",
      template: String.raw`<cite attachment_id=\`__ID__\` note='It\'s fine'></cite>`,
    },
    {
      name: "attachment_id with whitespace and newlines",
      template: `<cite attachment_id = "__ID__"\n data="x"></cite>`,
    },
    {
      name: "attachmentId with tabs and mixed quotes",
      template: `<cite attachmentId\t=\t'__ID__' data="y"></cite>`,
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

describe("promptCompression ID attribute variations", () => {
  const fullId = "doc_XYZ789abc123";

  it("handles all ID attribute name variations", () => {
    // All supported attachment ID attribute formats (fileId variants supported for backwards compatibility)
    const attributeNames = ["attachmentId", "attachment_id", "attachment_ID", "attachmentID"];

    for (const attrName of attributeNames) {
      const original = `<cite ${attrName}="${fullId}" />`;
      const { compressed, prefixMap } = compressPromptIds(original, [fullId]);

      expect(Object.keys(prefixMap)).toHaveLength(1);
      expect(compressed).not.toContain(fullId);

      const decompressed = decompressPromptIds(compressed, prefixMap);
      expect(decompressed).toBe(original);
    }
  });

  it("handles multiple IDs with different attribute formats", () => {
    const id1 = "doc_ABC123456789";
    const id2 = "doc_DEF987654321";

    const original = `<cite attachment_id="${id1}" /><cite attachmentId="${id2}" />`;
    const { compressed, prefixMap } = compressPromptIds(original, [id1, id2]);

    expect(Object.keys(prefixMap)).toHaveLength(2);
    expect(compressed).not.toContain(id1);
    expect(compressed).not.toContain(id2);

    const decompressed = decompressPromptIds(compressed, prefixMap);
    expect(decompressed).toBe(original);
  });

  it("preserves attribute name exactly as found during decompression", () => {
    const original = `<cite attachment_ID="${fullId}" />`;
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);
    const decompressed = decompressPromptIds(compressed, prefixMap);

    // Should preserve the exact attribute name "attachment_ID"
    expect(decompressed).toContain("attachment_ID=");
    expect(decompressed).toBe(original);
  });
});

describe("promptCompression backwards compatibility with fileId", () => {
  const fullId = "file_ABC123def456";

  it("handles fileId attribute (backwards compatibility)", () => {
    const original = `<cite fileId="${fullId}" />`;
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);

    expect(Object.keys(prefixMap)).toHaveLength(1);
    expect(compressed).not.toContain(fullId);

    const decompressed = decompressPromptIds(compressed, prefixMap);
    expect(decompressed).toBe(original);
  });

  it("handles file_id attribute (backwards compatibility)", () => {
    const original = `<cite file_id="${fullId}" />`;
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);

    expect(Object.keys(prefixMap)).toHaveLength(1);
    expect(compressed).not.toContain(fullId);

    const decompressed = decompressPromptIds(compressed, prefixMap);
    expect(decompressed).toBe(original);
  });

  it("handles fileID attribute (backwards compatibility)", () => {
    const original = `<cite fileID="${fullId}" />`;
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);

    expect(Object.keys(prefixMap)).toHaveLength(1);
    expect(compressed).not.toContain(fullId);

    const decompressed = decompressPromptIds(compressed, prefixMap);
    expect(decompressed).toBe(original);
  });

  it("handles file_ID attribute (backwards compatibility)", () => {
    const original = `<cite file_ID="${fullId}" />`;
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);

    expect(Object.keys(prefixMap)).toHaveLength(1);
    expect(compressed).not.toContain(fullId);

    const decompressed = decompressPromptIds(compressed, prefixMap);
    expect(decompressed).toBe(original);
  });

  it("handles mixed fileId and attachmentId in same document", () => {
    const id1 = "doc_ABC123456789";
    const id2 = "doc_DEF987654321";

    const original = `<cite file_id="${id1}" /><cite attachment_id="${id2}" />`;
    const { compressed, prefixMap } = compressPromptIds(original, [id1, id2]);

    expect(Object.keys(prefixMap)).toHaveLength(2);
    expect(compressed).not.toContain(id1);
    expect(compressed).not.toContain(id2);

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
    const original = `<cite attachment_id="${fullId}" />`;
    const { compressed, prefixMap } = compressPromptIds(original, [fullId]);

    const decompressed = decompressPromptIds(compressed as string, prefixMap);
    expect(typeof decompressed).toBe("string");
    expect(decompressed).toBe(original);
  });
});
