import { describe, expect, it } from "@jest/globals";
import { normalizeCitationsFile } from "../utils/normalizeCitations.js";

describe("normalizeCitationsFile", () => {
  // ── flat-map passthrough ───────────────────────────────────────

  it("passes through flat-map format unchanged", () => {
    const input = {
      "cite-1": { attachmentId: "att-1", fullPhrase: "hello" },
      "cite-2": { attachmentId: "att-1", fullPhrase: "world" },
    };
    expect(normalizeCitationsFile(input)).toBe(input);
  });

  it("returns empty object for empty input", () => {
    expect(normalizeCitationsFile({})).toEqual({});
  });

  // ── grouped → flat conversion ─────────────────────────────────

  it("converts grouped format to flat-map", () => {
    const input = {
      "att-abc": [
        { id: "cite-1", fullPhrase: "hello" },
        { id: "cite-2", fullPhrase: "world" },
      ],
    };
    const result = normalizeCitationsFile(input);
    expect(result).toEqual({
      "cite-1": { id: "cite-1", fullPhrase: "hello", attachmentId: "att-abc" },
      "cite-2": { id: "cite-2", fullPhrase: "world", attachmentId: "att-abc" },
    });
  });

  it("converts numeric id to string key", () => {
    const input = {
      "att-1": [{ id: 1, fullPhrase: "test" }],
    };
    const result = normalizeCitationsFile(input);
    expect(result["1"]).toBeDefined();
    expect(result["1"].attachmentId).toBe("att-1");
  });

  it("generates fallback key when id is missing", () => {
    const input = {
      "att-1": [{ fullPhrase: "no id" }],
    };
    const result = normalizeCitationsFile(input);
    expect(Object.keys(result)).toEqual(["att-1-0"]);
    expect(result["att-1-0"].fullPhrase).toBe("no id");
  });

  it("generates fallback key when id is empty string", () => {
    const input = {
      "att-1": [{ id: "", fullPhrase: "empty id" }],
    };
    const result = normalizeCitationsFile(input);
    expect(Object.keys(result)).toEqual(["att-1-0"]);
  });

  it("generates fallback key when id is null", () => {
    const input = {
      "att-1": [{ id: null, fullPhrase: "null id" }],
    };
    const result = normalizeCitationsFile(input);
    expect(Object.keys(result)).toEqual(["att-1-0"]);
  });

  it("handles multiple attachment groups", () => {
    const input = {
      "att-1": [{ id: "a", fullPhrase: "one" }],
      "att-2": [{ id: "b", fullPhrase: "two" }],
    };
    const result = normalizeCitationsFile(input);
    expect(result.a.attachmentId).toBe("att-1");
    expect(result.b.attachmentId).toBe("att-2");
  });

  // ── duplicate id handling ─────────────────────────────────────

  it("skips duplicate ids and keeps the first", () => {
    const input = {
      "att-1": [
        { id: "dup", fullPhrase: "first" },
        { id: "dup", fullPhrase: "second" },
      ],
    };
    const result = normalizeCitationsFile(input);
    expect(Object.keys(result)).toEqual(["dup"]);
    expect(result.dup.fullPhrase).toBe("first");
  });

  // ── prototype pollution guard ─────────────────────────────────

  it("skips __proto__ keys", () => {
    const input = {
      "att-1": [{ id: "__proto__", fullPhrase: "bad" }],
    };
    const result = normalizeCitationsFile(input);
    expect(Object.keys(result)).toEqual([]);
  });

  it("skips constructor and prototype keys", () => {
    const input = {
      "att-1": [
        { id: "constructor", fullPhrase: "bad" },
        { id: "prototype", fullPhrase: "bad" },
        { id: "valid", fullPhrase: "good" },
      ],
    };
    const result = normalizeCitationsFile(input);
    expect(Object.keys(result)).toEqual(["valid"]);
  });

  // ── mixed format rejection ────────────────────────────────────

  it("throws on mixed formats (some arrays, some objects)", () => {
    const input = {
      "att-1": [{ id: "a", fullPhrase: "array" }],
      metadata: { version: 1 },
    };
    expect(() => normalizeCitationsFile(input)).toThrow("mixed formats");
  });

  // ── edge: values that are primitives ──────────────────────────

  it("treats primitive values as flat-map format", () => {
    // Degenerate input — not arrays, not objects → flat-map passthrough
    // Caller's attachmentId validation will catch these downstream
    const input = { key: "string-value" } as Record<string, unknown>;
    const result = normalizeCitationsFile(input);
    expect(result).toBe(input);
  });
});
