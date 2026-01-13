/**
 * Tests for knowledge base module
 *
 * These tests verify:
 * - Knowledge base structure and content
 * - Document format validation
 * - Content completeness
 */

import { describe, expect, it } from "bun:test";
import {
  SAMPLE_KNOWLEDGE_BASE,
  getKnowledgeBaseSummary,
  type KnowledgeDocument,
} from "../knowledge-base.js";

describe("SAMPLE_KNOWLEDGE_BASE", () => {
  describe("structure", () => {
    it("is an array of documents", () => {
      expect(Array.isArray(SAMPLE_KNOWLEDGE_BASE)).toBe(true);
      expect(SAMPLE_KNOWLEDGE_BASE.length).toBeGreaterThan(0);
    });

    it("each document has required properties", () => {
      for (const doc of SAMPLE_KNOWLEDGE_BASE) {
        expect(doc).toHaveProperty("filename");
        expect(doc).toHaveProperty("content");
        expect(typeof doc.filename).toBe("string");
        expect(typeof doc.content).toBe("string");
      }
    });

    it("filenames are unique", () => {
      const filenames = SAMPLE_KNOWLEDGE_BASE.map((doc) => doc.filename);
      const uniqueFilenames = new Set(filenames);
      expect(uniqueFilenames.size).toBe(filenames.length);
    });

    it("filenames have valid extensions", () => {
      const validExtensions = [".txt", ".md", ".pdf", ".doc", ".docx"];

      for (const doc of SAMPLE_KNOWLEDGE_BASE) {
        const hasValidExtension = validExtensions.some((ext) =>
          doc.filename.endsWith(ext)
        );
        expect(hasValidExtension).toBe(true);
      }
    });

    it("content is non-empty", () => {
      for (const doc of SAMPLE_KNOWLEDGE_BASE) {
        expect(doc.content.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe("content coverage", () => {
    const allContent = SAMPLE_KNOWLEDGE_BASE.map((doc) => doc.content).join(
      "\n"
    );

    it("includes refund policy information", () => {
      expect(allContent.toLowerCase()).toContain("refund");
      expect(allContent).toContain("30 days");
    });

    it("includes shipping information", () => {
      expect(allContent.toLowerCase()).toContain("shipping");
      expect(allContent.toLowerCase()).toContain("delivery");
    });

    it("includes account management information", () => {
      expect(allContent.toLowerCase()).toContain("password");
      expect(allContent.toLowerCase()).toContain("account");
    });

    it("includes warranty information", () => {
      expect(allContent.toLowerCase()).toContain("warranty");
      expect(allContent).toContain("2-year");
    });

    it("includes contact information", () => {
      expect(allContent.toLowerCase()).toContain("support");
      expect(allContent.toLowerCase()).toContain("contact");
    });

    it("includes pricing information", () => {
      // Should have dollar amounts
      expect(allContent).toMatch(/\$\d+(\.\d{2})?/);
    });
  });

  describe("document quality", () => {
    it("documents have meaningful headers", () => {
      for (const doc of SAMPLE_KNOWLEDGE_BASE) {
        // Each document should start with a header
        expect(doc.content).toMatch(/^#/m);
      }
    });

    it("documents have structured content", () => {
      for (const doc of SAMPLE_KNOWLEDGE_BASE) {
        // Should have multiple sections or bullet points
        const hasStructure =
          doc.content.includes("##") ||
          doc.content.includes("- ") ||
          doc.content.includes("1.");
        expect(hasStructure).toBe(true);
      }
    });

    it("documents are reasonable length", () => {
      for (const doc of SAMPLE_KNOWLEDGE_BASE) {
        // Not too short (at least 100 chars)
        expect(doc.content.length).toBeGreaterThan(100);
        // Not too long (less than 10KB)
        expect(doc.content.length).toBeLessThan(10000);
      }
    });
  });

  describe("specific documents", () => {
    it("has refund policy document", () => {
      const refundDoc = SAMPLE_KNOWLEDGE_BASE.find(
        (doc) =>
          doc.filename.includes("refund") || doc.filename.includes("policy")
      );
      expect(refundDoc).toBeDefined();
      expect(refundDoc?.content).toContain("30 days");
      expect(refundDoc?.content.toLowerCase()).toContain("digital");
    });

    it("has shipping document", () => {
      const shippingDoc = SAMPLE_KNOWLEDGE_BASE.find((doc) =>
        doc.filename.includes("shipping")
      );
      expect(shippingDoc).toBeDefined();
      expect(shippingDoc?.content.toLowerCase()).toContain("standard");
      expect(shippingDoc?.content.toLowerCase()).toContain("express");
      expect(shippingDoc?.content.toLowerCase()).toContain("overnight");
    });

    it("has account management document", () => {
      const accountDoc = SAMPLE_KNOWLEDGE_BASE.find((doc) =>
        doc.filename.includes("account")
      );
      expect(accountDoc).toBeDefined();
      expect(accountDoc?.content.toLowerCase()).toContain("password reset");
      expect(accountDoc?.content.toLowerCase()).toContain("2fa");
    });

    it("has warranty document", () => {
      const warrantyDoc = SAMPLE_KNOWLEDGE_BASE.find((doc) =>
        doc.filename.includes("warranty")
      );
      expect(warrantyDoc).toBeDefined();
      expect(warrantyDoc?.content).toContain("2-year");
      expect(warrantyDoc?.content.toLowerCase()).toContain("extended");
    });
  });
});

describe("getKnowledgeBaseSummary", () => {
  it("returns a string", () => {
    const summary = getKnowledgeBaseSummary();
    expect(typeof summary).toBe("string");
  });

  it("includes all document filenames", () => {
    const summary = getKnowledgeBaseSummary();

    for (const doc of SAMPLE_KNOWLEDGE_BASE) {
      expect(summary).toContain(doc.filename);
    }
  });

  it("formats as bullet list", () => {
    const summary = getKnowledgeBaseSummary();
    const lines = summary.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      expect(line.startsWith("- ")).toBe(true);
    }
  });

  it("has correct number of entries", () => {
    const summary = getKnowledgeBaseSummary();
    const lines = summary.split("\n").filter((line) => line.trim());

    expect(lines.length).toBe(SAMPLE_KNOWLEDGE_BASE.length);
  });
});

describe("KnowledgeDocument type", () => {
  it("accepts string content", () => {
    const doc: KnowledgeDocument = {
      content: "Test content",
      filename: "test.txt",
    };

    expect(doc.content).toBe("Test content");
    expect(doc.filename).toBe("test.txt");
  });

  it("validates required fields at compile time", () => {
    // This is a compile-time check - if this compiles, the types are correct
    const validDoc: KnowledgeDocument = {
      content: "Content",
      filename: "file.txt",
    };

    expect(validDoc).toBeDefined();
  });
});

describe("Knowledge base usage scenarios", () => {
  it("can be filtered by topic", () => {
    const policyDocs = SAMPLE_KNOWLEDGE_BASE.filter(
      (doc) =>
        doc.filename.includes("policy") || doc.filename.includes("warranty")
    );

    expect(policyDocs.length).toBeGreaterThan(0);
  });

  it("can be searched for specific content", () => {
    const docsWithPricing = SAMPLE_KNOWLEDGE_BASE.filter((doc) =>
      doc.content.includes("$")
    );

    expect(docsWithPricing.length).toBeGreaterThan(0);
  });

  it("can be converted to buffers for upload", () => {
    const bufferedDocs = SAMPLE_KNOWLEDGE_BASE.map((doc) => ({
      file: Buffer.from(doc.content),
      filename: doc.filename,
    }));

    for (const doc of bufferedDocs) {
      expect(Buffer.isBuffer(doc.file)).toBe(true);
      expect(doc.file.length).toBeGreaterThan(0);
    }
  });

  it("can be combined into single content", () => {
    const combinedContent = SAMPLE_KNOWLEDGE_BASE.map(
      (doc) => `## ${doc.filename}\n\n${doc.content}`
    ).join("\n\n---\n\n");

    expect(combinedContent.length).toBeGreaterThan(
      SAMPLE_KNOWLEDGE_BASE.reduce((sum, doc) => sum + doc.content.length, 0)
    );
  });
});

describe("Content validation", () => {
  it("no documents contain placeholder text", () => {
    const placeholders = [
      "TODO",
      "FIXME",
      "XXX",
      "[insert",
      "[placeholder",
      "lorem ipsum",
    ];

    for (const doc of SAMPLE_KNOWLEDGE_BASE) {
      for (const placeholder of placeholders) {
        expect(doc.content.toLowerCase()).not.toContain(
          placeholder.toLowerCase()
        );
      }
    }
  });

  it("no documents contain actual sensitive data", () => {
    // Check for actual credential patterns (not documentation about them)
    const sensitivePatterns = [
      /api[_-]?key\s*[:=]\s*["']?sk-[a-zA-Z0-9]+/i, // Actual API keys like sk-xxx
      /password\s*[:=]\s*["'][^"']+["']/i, // Password with actual value in quotes
      /secret\s*[:=]\s*["'][^"']+["']/i, // Secret with actual value
      /\b\d{16}\b/, // Credit card-like numbers (16 consecutive digits)
      /\b\d{9}\b/, // 9 consecutive digits (potential SSN without dashes)
    ];

    for (const doc of SAMPLE_KNOWLEDGE_BASE) {
      for (const pattern of sensitivePatterns) {
        expect(pattern.test(doc.content)).toBe(false);
      }
    }
  });

  it("all URLs are example domains", () => {
    const urlPattern = /https?:\/\/([a-z0-9-]+\.)+[a-z]+/gi;

    for (const doc of SAMPLE_KNOWLEDGE_BASE) {
      const urls = doc.content.match(urlPattern) || [];

      for (const url of urls) {
        const isExampleDomain =
          url.includes("example.com") ||
          url.includes("example.org") ||
          url.includes("acme.example");
        expect(isExampleDomain).toBe(true);
      }
    }
  });

  it("email addresses use example domains", () => {
    const emailPattern = /[\w.-]+@[\w.-]+\.[a-z]+/gi;

    for (const doc of SAMPLE_KNOWLEDGE_BASE) {
      const emails = doc.content.match(emailPattern) || [];

      for (const email of emails) {
        expect(email).toContain("example");
      }
    }
  });

  it("phone numbers are clearly fake", () => {
    // Using 1-800 or example format
    const phonePattern = /1-800-[A-Z-]+/g;

    for (const doc of SAMPLE_KNOWLEDGE_BASE) {
      const phones = doc.content.match(/\d{3}[-.]?\d{3}[-.]?\d{4}/g) || [];
      const vanityPhones = doc.content.match(phonePattern) || [];

      // If there are phone numbers, they should be vanity (1-800-SOMETHING)
      // or the pattern should allow them
      expect(phones.length === 0 || vanityPhones.length > 0).toBe(true);
    }
  });
});
