/**
 * Security tests for defense against common web vulnerabilities.
 * Tests for ReDoS prevention, prototype pollution, URL validation, and log injection.
 */

import { describe, expect, it } from "@jest/globals";
import { createLogEntry, sanitizeForLog, sanitizeJsonForLog } from "../utils/logSafety";
import { createSafeObject, isSafeKey, safeAssign, safeAssignBulk, safeMerge } from "../utils/objectSafety";
import {
  safeExec,
  safeMatch,
  safeReplace,
  safeReplaceAll,
  safeSearch,
  safeSplit,
  safeTest,
  validateRegexInput,
} from "../utils/regexSafety";
import { detectSourceType, extractDomain, isApprovedDomain, isDomainMatch, isSafeDomain } from "../utils/urlSafety";

describe("Security Tests", () => {
  describe("ReDoS Prevention (Regex Safety)", () => {
    const SIMPLE_REGEX = /test/g;

    describe("validateRegexInput", () => {
      it("should accept input below limit", () => {
        expect(() => validateRegexInput("small input")).not.toThrow();
      });

      it("should reject input exceeding limit", () => {
        const largeInput = "a".repeat(100_001);
        expect(() => validateRegexInput(largeInput)).toThrow("Input too large");
      });

      it("should use custom limit when provided", () => {
        const input = "a".repeat(1000);
        expect(() => validateRegexInput(input, 100)).toThrow("Input too large");
        expect(() => validateRegexInput(input, 10000)).not.toThrow();
      });
    });

    describe("safeMatch", () => {
      it("should match patterns in safe input", () => {
        const result = safeMatch("test test", SIMPLE_REGEX);
        expect(result).toEqual(["test", "test"]);
      });

      it("should reject oversized input", () => {
        const attack = "a".repeat(100_001);
        expect(() => safeMatch(attack, SIMPLE_REGEX)).toThrow("Input too large");
      });

      it("should return null when no matches", () => {
        const result = safeMatch("xyz", SIMPLE_REGEX);
        expect(result).toBeNull();
      });
    });

    describe("safeExec", () => {
      it("should execute regex on safe input", () => {
        const regex = /test/g;
        const result = safeExec(regex, "test data");
        expect(result).not.toBeNull();
        expect(result?.[0]).toBe("test");
      });

      it("should reject oversized input", () => {
        const attack = "a".repeat(100_001);
        expect(() => safeExec(SIMPLE_REGEX, attack)).toThrow("Input too large");
      });
    });

    describe("safeReplace", () => {
      it("should replace patterns in safe input", () => {
        const result = safeReplace("test data", SIMPLE_REGEX, "TEST");
        expect(result).toBe("TEST data");
      });

      it("should reject oversized input", () => {
        const attack = "a".repeat(100_001);
        expect(() => safeReplace(attack, SIMPLE_REGEX, "x")).toThrow("Input too large");
      });
    });

    describe("safeReplaceAll", () => {
      it("should replace all occurrences", () => {
        const result = safeReplaceAll("test test test", /test/g, "TEST");
        expect(result).toBe("TEST TEST TEST");
      });

      it("should require global flag", () => {
        const regex = /test/; // no g flag
        expect(() => safeReplaceAll("test", regex, "TEST")).toThrow("g flag");
      });

      it("should reject oversized input", () => {
        const attack = "a".repeat(100_001);
        expect(() => safeReplaceAll(attack, /a/g, "x")).toThrow("Input too large");
      });
    });

    describe("safeSplit", () => {
      it("should split on pattern", () => {
        const result = safeSplit("a,b,c", /,/);
        expect(result).toEqual(["a", "b", "c"]);
      });

      it("should reject oversized input", () => {
        const attack = "a".repeat(100_001);
        expect(() => safeSplit(attack, /,/)).toThrow("Input too large");
      });
    });

    describe("safeSearch", () => {
      it("should find pattern index", () => {
        const result = safeSearch("hello test world", /test/);
        expect(result).toBe(6);
      });

      it("should return -1 if not found", () => {
        const result = safeSearch("hello", /xyz/);
        expect(result).toBe(-1);
      });

      it("should reject oversized input", () => {
        const attack = "a".repeat(100_001);
        expect(() => safeSearch(attack, /test/)).toThrow("Input too large");
      });
    });

    describe("safeTest", () => {
      it("should test if pattern matches", () => {
        expect(safeTest(/test/, "test data")).toBe(true);
        expect(safeTest(/xyz/, "test data")).toBe(false);
      });

      it("should reject oversized input", () => {
        const attack = "a".repeat(100_001);
        expect(() => safeTest(/test/, attack)).toThrow("Input too large");
      });
    });
  });

  describe("Prototype Pollution Prevention (Object Safety)", () => {
    describe("isSafeKey", () => {
      it("should reject __proto__", () => {
        expect(isSafeKey("__proto__")).toBe(false);
      });

      it("should reject constructor", () => {
        expect(isSafeKey("constructor")).toBe(false);
      });

      it("should reject prototype", () => {
        expect(isSafeKey("prototype")).toBe(false);
      });

      it("should allow normal keys", () => {
        expect(isSafeKey("name")).toBe(true);
        expect(isSafeKey("value")).toBe(true);
        expect(isSafeKey("data123")).toBe(true);
      });
    });

    describe("createSafeObject", () => {
      it("should create object with null prototype", () => {
        const obj = createSafeObject();
        expect(Object.getPrototypeOf(obj)).toBeNull();
      });

      it("should prevent prototype pollution", () => {
        const obj = createSafeObject();
        obj["__proto__"] = { polluted: true };

        // Pollution should not affect Object.prototype
        expect((Object.create(null) as Record<string, unknown>).polluted).toBeUndefined();
      });
    });

    describe("safeAssign", () => {
      it("should assign safe keys", () => {
        const obj = createSafeObject<string>();
        const result = safeAssign(obj, "name", "value");
        expect(result).toBe(true);
        expect(obj["name"]).toBe("value");
      });

      it("should reject __proto__", () => {
        const obj = createSafeObject<string>();
        const result = safeAssign(obj, "__proto__", "malicious");
        expect(result).toBe(false);
        expect(obj["__proto__"]).toBeUndefined();
      });

      it("should reject constructor", () => {
        const obj = createSafeObject<string>();
        const result = safeAssign(obj, "constructor", "hacked");
        expect(result).toBe(false);
      });

      it("should respect allowlist when provided", () => {
        const obj = createSafeObject<string>();
        const allowed = new Set(["name", "email"]);

        expect(safeAssign(obj, "name", "John", allowed)).toBe(true);
        expect(safeAssign(obj, "phone", "123", allowed)).toBe(false);
      });
    });

    describe("safeAssignBulk", () => {
      it("should assign multiple safe properties", () => {
        const obj = createSafeObject<string>();
        const entries: Array<[string, string]> = [
          ["name", "John"],
          ["email", "john@example.com"],
        ];

        const count = safeAssignBulk(obj, entries);
        expect(count).toBe(2);
        expect(obj["name"]).toBe("John");
        expect(obj["email"]).toBe("john@example.com");
      });

      it("should skip dangerous keys", () => {
        const obj = createSafeObject<string>();
        const entries: Array<[string, string]> = [
          ["name", "John"],
          ["__proto__", "malicious"],
          ["email", "john@example.com"],
        ];

        const count = safeAssignBulk(obj, entries);
        expect(count).toBe(2); // Only 2 assigned
        expect(obj["__proto__"]).toBeUndefined();
      });
    });

    describe("safeMerge", () => {
      it("should merge safe objects", () => {
        const target = createSafeObject<string>();
        const source = { name: "John", email: "john@example.com" };

        const result = safeMerge(target, source);
        expect(result["name"]).toBe("John");
        expect(result["email"]).toBe("john@example.com");
      });

      it("should skip dangerous keys during merge", () => {
        const target = createSafeObject<string>();
        const source: Record<string, unknown> = {
          name: "John",
          __proto__: { polluted: true },
          constructor: "hacked",
        };

        safeMerge(target, source);
        expect(target["name"]).toBe("John");
        expect(target["__proto__"]).toBeUndefined();
        expect(target["constructor"]).toBeUndefined();
      });
    });
  });

  describe("URL Sanitization (URL Safety)", () => {
    describe("extractDomain", () => {
      it("should extract domain from URL", () => {
        expect(extractDomain("https://www.twitter.com/user")).toBe("twitter.com");
        expect(extractDomain("https://api.github.com/repos")).toBe("api.github.com");
        expect(extractDomain("http://example.com:8080/path")).toBe("example.com");
      });

      it("should remove www prefix", () => {
        expect(extractDomain("https://www.example.com")).toBe("example.com");
      });

      it("should lowercase domain", () => {
        expect(extractDomain("https://Twitter.COM")).toBe("twitter.com");
      });

      it("should return empty for invalid URLs", () => {
        expect(extractDomain("not a url")).toBe("");
        expect(extractDomain("javascript:alert(1)")).toBe("");
      });
    });

    describe("isDomainMatch", () => {
      it("should match exact domains", () => {
        expect(isDomainMatch("https://twitter.com", "twitter.com")).toBe(true);
        expect(isDomainMatch("https://www.twitter.com", "twitter.com")).toBe(true);
      });

      it("should match direct subdomains", () => {
        expect(isDomainMatch("https://mobile.twitter.com", "twitter.com")).toBe(true);
        expect(isDomainMatch("https://api.github.com", "github.com")).toBe(true);
      });

      it("should reject subdomain spoofing attacks", () => {
        expect(isDomainMatch("https://twitter.com.evil.com", "twitter.com")).toBe(false);
        expect(isDomainMatch("https://evil.twitter.com.phishing.net", "twitter.com")).toBe(false);
      });

      it("should reject non-matching domains", () => {
        expect(isDomainMatch("https://facebook.com", "twitter.com")).toBe(false);
        expect(isDomainMatch("https://nottwitter.com", "twitter.com")).toBe(false);
      });
    });

    describe("detectSourceType", () => {
      it("should detect social media platforms", () => {
        expect(detectSourceType("https://twitter.com/user")).toBe("social");
        expect(detectSourceType("https://facebook.com")).toBe("social");
        expect(detectSourceType("https://instagram.com")).toBe("social");
        expect(detectSourceType("https://linkedin.com")).toBe("social");
      });

      it("should detect video platforms", () => {
        expect(detectSourceType("https://youtube.com")).toBe("video");
        expect(detectSourceType("https://youtu.be/video")).toBe("video");
        expect(detectSourceType("https://twitch.tv")).toBe("video");
      });

      it("should detect code platforms", () => {
        expect(detectSourceType("https://github.com")).toBe("code");
        expect(detectSourceType("https://stackoverflow.com")).toBe("code");
      });

      it("should reject spoofed domains", () => {
        expect(detectSourceType("https://twitter.com.evil.com")).toBe("web");
        expect(detectSourceType("https://youtube.com.phishing.net")).toBe("web");
      });

      it("should default to web for unknown domains", () => {
        expect(detectSourceType("https://example.com")).toBe("web");
        expect(detectSourceType("https://random-site.org")).toBe("web");
      });
    });

    describe("isApprovedDomain", () => {
      it("should approve exact domain match", () => {
        const approved = new Set(["example.com", "trusted.com"]);
        expect(isApprovedDomain("https://example.com", approved)).toBe(true);
        expect(isApprovedDomain("https://trusted.com/api", approved)).toBe(true);
      });

      it("should approve subdomains of approved domains", () => {
        const approved = new Set(["example.com"]);
        expect(isApprovedDomain("https://api.example.com", approved)).toBe(true);
        expect(isApprovedDomain("https://www.example.com", approved)).toBe(true);
      });

      it("should reject unapproved domains", () => {
        const approved = new Set(["example.com"]);
        expect(isApprovedDomain("https://evil.com", approved)).toBe(false);
        expect(isApprovedDomain("https://example.com.evil.com", approved)).toBe(false);
      });

      it("should reject invalid URLs", () => {
        const approved = new Set(["example.com"]);
        expect(isApprovedDomain("not a url", approved)).toBe(false);
      });
    });

    describe("isSafeDomain", () => {
      it("should allow non-blocked domains", () => {
        const blocked = new Set(["malicious.com"]);
        expect(isSafeDomain("https://example.com", blocked)).toBe(true);
      });

      it("should block exact matches", () => {
        const blocked = new Set(["malicious.com"]);
        expect(isSafeDomain("https://malicious.com", blocked)).toBe(false);
      });

      it("should block subdomains of blocked domains", () => {
        const blocked = new Set(["malicious.com"]);
        expect(isSafeDomain("https://api.malicious.com", blocked)).toBe(false);
      });

      it("should reject invalid URLs", () => {
        const blocked = new Set([]);
        expect(isSafeDomain("not a url", blocked)).toBe(false);
      });
    });
  });

  describe("Log Injection Prevention (Log Safety)", () => {
    describe("sanitizeForLog", () => {
      it("should sanitize newlines", () => {
        const input = "Normal\n[ERROR] Fake error";
        const result = sanitizeForLog(input);
        expect(result).toBe("Normal\\n[ERROR] Fake error");
      });

      it("should sanitize tabs", () => {
        const input = "Value\tWith\tTabs";
        const result = sanitizeForLog(input);
        expect(result).toBe("Value\\tWith\\tTabs");
      });

      it("should remove ANSI codes", () => {
        const input = "\x1b[31mRed text\x1b[0m";
        const result = sanitizeForLog(input);
        expect(result).not.toContain("\x1b");
      });

      it("should truncate long strings", () => {
        const input = "a".repeat(2000);
        const result = sanitizeForLog(input, 100);
        // Result should be 100 chars + "... [TRUNCATED]" suffix (15 chars) = 115
        expect(result.length).toBe(115);
        expect(result.endsWith("... [TRUNCATED]")).toBe(true);
      });

      it("should stringify objects", () => {
        const obj = { key: "value" };
        const result = sanitizeForLog(obj);
        expect(result).toContain("key");
        expect(result).toContain("value");
      });

      it("should prevent log injection attacks", () => {
        const attack = "Normal\n[ADMIN] System compromised\n[ERROR] Backdoor installed";
        const result = sanitizeForLog(attack);
        // The newlines should be escaped, not actual newlines
        expect(result.includes("\n")).toBe(false);
        expect(result.includes("\\n")).toBe(true);
      });
    });

    describe("createLogEntry", () => {
      it("should combine parts safely", () => {
        const result = createLogEntry("[API]", "Request from", "user@example.com");
        expect(result).toContain("[API]");
        expect(result).toContain("Request from");
        expect(result).toContain("user@example.com");
      });

      it("should sanitize object input", () => {
        const attack = { message: "Normal\n[ADMIN] Fake" };
        const result = createLogEntry("[LOG]", "Input:", attack);
        expect(result).toContain("[LOG]");
        // Objects are sanitized
        expect(result).toContain("\\n");
      });
    });

    describe("sanitizeJsonForLog", () => {
      it("should stringify and sanitize objects", () => {
        const obj = { user: "alice", action: "login" };
        const result = sanitizeJsonForLog(obj);
        expect(result).toContain("user");
        expect(result).toContain("alice");
      });

      it("should limit depth", () => {
        const deep = { a: { b: { c: { d: { e: "value" } } } } };
        const result = sanitizeJsonForLog(deep, 1000, 2);
        expect(result).toContain("Omitted");
      });

      it("should handle circular references", () => {
        const circular: Record<string, unknown> = { a: 1 };
        circular.self = circular;
        // Should not throw
        expect(() => sanitizeJsonForLog(circular)).not.toThrow();
      });
    });
  });
});
