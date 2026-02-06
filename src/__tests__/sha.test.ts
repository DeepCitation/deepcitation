import { describe, expect, it, jest } from "@jest/globals";
import { sha1Hash } from "../utils/sha.js";

describe("sha1Hash", () => {
  it("returns empty string for falsy input", () => {
    expect(sha1Hash("")).toBe("");
    expect(sha1Hash(null)).toBe("");
    expect(sha1Hash(undefined)).toBe("");
  });

  // Known SHA-1 test vectors (FIPS 180-4)
  it("produces correct SHA-1 hashes for known test vectors", () => {
    // "abc" -> a9993e364706816aba3e25717850c26c9cd0d89d
    expect(sha1Hash("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");

    // "test" -> a94a8fe5ccb19ba61c4c0873d391e987982fbbd3
    expect(sha1Hash("test")).toBe("a94a8fe5ccb19ba61c4c0873d391e987982fbbd3");

    // Empty string would return "" due to falsy check, so test single space
    // " " -> b858cb282617fb0956d960215c8e84d1ccf909c6
    expect(sha1Hash(" ")).toBe("b858cb282617fb0956d960215c8e84d1ccf909c6");
  });

  it("returns a valid hex string", () => {
    const hash = sha1Hash("test");
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("hashes strings deterministically", () => {
    const hash1 = sha1Hash("deep-citation");
    const hash2 = sha1Hash("deep-citation");
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(40);
  });

  it("hashes objects deterministically", () => {
    const obj = { a: 1, b: "two" };
    const hash1 = sha1Hash(obj);
    const hash2 = sha1Hash(obj);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(40);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = sha1Hash("hello");
    const hash2 = sha1Hash("world");
    expect(hash1).not.toBe(hash2);
  });

  it("returns empty string and logs error for circular object input", () => {
    // Create a circular reference
    const circularObj: Record<string, unknown> = { name: "test" };
    circularObj.self = circularObj;

    // Spy on console.error to verify it's called
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = sha1Hash(circularObj);

    // Should return empty string
    expect(result).toBe("");

    // Should log error once
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error in making the hash:",
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it("handles deeply nested circular references", () => {
    const obj: Record<string, unknown> = {
      level1: {
        level2: {
          level3: {},
        },
      },
    };
    (obj.level1 as Record<string, unknown>).level2 = obj;

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = sha1Hash(obj);
    expect(result).toBe("");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("handles array with circular reference", () => {
    const arr: unknown[] = [1, 2, 3];
    arr.push(arr);

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = sha1Hash(arr);
    expect(result).toBe("");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("hashes numbers correctly", () => {
    const hash123 = sha1Hash(123);
    expect(hash123).toMatch(/^[0-9a-f]{40}$/);
    expect(sha1Hash(0)).toBe("");
    expect(sha1Hash(-1)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("hashes boolean values", () => {
    expect(sha1Hash(true)).toMatch(/^[0-9a-f]{40}$/);
    expect(sha1Hash(false)).toBe("");
  });

  it("hashes nested objects deterministically", () => {
    const obj = { outer: { inner: { value: "test" } } };
    const hash1 = sha1Hash(obj);
    const hash2 = sha1Hash(obj);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{40}$/);
  });

  it("hashes arrays deterministically", () => {
    const arr = [1, "two", { three: 3 }];
    const hash1 = sha1Hash(arr);
    const hash2 = sha1Hash(arr);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{40}$/);
  });
});
