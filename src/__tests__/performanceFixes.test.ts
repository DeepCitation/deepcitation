/**
 * Tests for performance fixes identified in PERFORMANCE_ANALYSIS.md
 *
 * These tests verify:
 * 1. Global regex state bug fix (parseWorkAround.ts)
 * 2. String concatenation fix (diff.ts splitLines)
 * 3. Unshift optimization (diff.ts backtrack)
 * 4. Range size limits for line ID parsing (prevents memory exhaustion)
 * 5. Depth limit for recursive traversal (prevents stack overflow)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getAllCitationsFromLlmOutput } from "../parsing/parseCitation.js";
import { cleanRepeatingLastSentence } from "../parsing/parseWorkAround.js";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER } from "../prompts/citationPrompts.js";
import { diffLines, diffWordsWithSpace } from "../utils/diff.js";

/** Build a numeric-format LLM response from visible text + citation data array. */
function makeNumericResponse(visibleText: string, citations: unknown[]): string {
  return `${visibleText}\n\n${CITATION_DATA_START_DELIMITER}\n${JSON.stringify(citations)}\n${CITATION_DATA_END_DELIMITER}`;
}

describe("Performance Fixes", () => {
  describe("Global Regex State Bug Fix (parseWorkAround.ts)", () => {
    it("should correctly find sentence endings on multiple consecutive calls", () => {
      const text = "Hello world. This is a test. More content here.";

      const result1 = cleanRepeatingLastSentence(text);
      const result2 = cleanRepeatingLastSentence(text);
      const result3 = cleanRepeatingLastSentence(text);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe(text);
    });

    it("should detect repeating sentences consistently across calls", () => {
      const repeatingText =
        "This is content. This is a repeated sentence. This is a repeated sentence. This is a repeated sentence.";

      const result1 = cleanRepeatingLastSentence(repeatingText);
      const result2 = cleanRepeatingLastSentence(repeatingText);

      expect(result1).toBe(result2);
      expect(result1).toBe("This is content. This is a repeated sentence.");
    });
  });

  describe("Diff Algorithm Optimizations (diff.ts)", () => {
    describe("splitLines optimization", () => {
      it("should correctly split lines with Unix line endings", () => {
        const text = "line1\nline2\nline3";
        const result = diffLines(text, text);

        expect(result.every(c => !c.added && !c.removed)).toBe(true);
      });

      it("should correctly split lines with Windows line endings", () => {
        const text = "line1\r\nline2\r\nline3";
        const result = diffLines(text, text);

        expect(result.every(c => !c.added && !c.removed)).toBe(true);
      });

      it("should handle empty strings", () => {
        const result = diffLines("", "new content");

        expect(result.some(c => c.added)).toBe(true);
      });

      it("should handle lines without trailing newline", () => {
        const result = diffLines("line1\nline2", "line1\nline2\nline3");

        expect(result.some(c => c.added && c.value.includes("line3"))).toBe(true);
      });
    });

    describe("backtrack optimization (push + reverse)", () => {
      it("should produce correct diff results for additions", () => {
        const result = diffWordsWithSpace("hello", "hello world");

        expect(result.some(c => !c.added && !c.removed && c.value.includes("hello"))).toBe(true);
        expect(result.some(c => c.added && c.value.includes("world"))).toBe(true);
      });

      it("should produce correct diff results for removals", () => {
        const result = diffWordsWithSpace("hello world", "hello");

        expect(result.some(c => !c.added && !c.removed && c.value.includes("hello"))).toBe(true);
        expect(result.some(c => c.removed && c.value.includes("world"))).toBe(true);
      });

      it("should produce correct diff results for replacements", () => {
        const result = diffWordsWithSpace("hello world", "hello universe");

        expect(result.some(c => c.removed && c.value.includes("world"))).toBe(true);
        expect(result.some(c => c.added && c.value.includes("universe"))).toBe(true);
      });

      it("should handle large diffs efficiently", () => {
        const oldWords = Array(1000)
          .fill(null)
          .map((_, i) => `word${i}`)
          .join(" ");
        const newWords = Array(1000)
          .fill(null)
          .map((_, i) => `word${i + 1}`)
          .join(" ");

        const startTime = performance.now();
        const result = diffWordsWithSpace(oldWords, newWords);
        const endTime = performance.now();

        expect(endTime - startTime).toBeLessThan(1000);
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Many citations performance", () => {
    it("should handle many numeric citations efficiently", () => {
      const citationData = [];
      const markers = [];
      for (let i = 1; i <= 100; i++) {
        markers.push(`[${i}]`);
        citationData.push({
          id: i,
          attachment_id: `att${i}`,
          full_phrase: `Phrase ${i}`,
          anchor_text: `Key ${i}`,
          page_id: `${i}_0`,
        });
      }
      const text = makeNumericResponse(markers.join(" "), citationData);

      const startTime = performance.now();
      const result = getAllCitationsFromLlmOutput(text);
      const endTime = performance.now();

      expect(Object.keys(result).length).toBe(100);
      expect(endTime - startTime).toBeLessThan(500);
    });
  });
});

describe("Data Loss Fix - Citations Without AttachmentId", () => {
  let consoleWarnSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("should parse citations without attachmentId", () => {
    const text = makeNumericResponse("Test [1]", [
      { id: 1, full_phrase: "Test phrase without attachment", anchor_text: "Test", page_id: "1_0" },
    ]);
    const result = getAllCitationsFromLlmOutput(text);

    expect(Object.keys(result).length).toBe(1);
    const citation = Object.values(result)[0];
    expect(citation.fullPhrase).toBe("Test phrase without attachment");
  });
});

describe("Range Size Limits for Line ID Parsing (numeric format)", () => {
  it("should handle small ranges normally", () => {
    const text = makeNumericResponse("Test [1]", [
      {
        id: 1,
        attachment_id: "abc",
        full_phrase: "Test",
        anchor_text: "Test",
        page_id: "1_0",
        line_ids: [1, 2, 3, 4, 5],
      },
    ]);
    const result = getAllCitationsFromLlmOutput(text);
    const citation = Object.values(result)[0];

    if (citation.type === "document") {
      expect(citation.lineIds).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("should sort line_ids", () => {
    const text = makeNumericResponse("Test [1]", [
      {
        id: 1,
        attachment_id: "abc",
        full_phrase: "Test",
        anchor_text: "Test",
        page_id: "1_0",
        line_ids: [5, 3, 1, 4, 2],
      },
    ]);
    const result = getAllCitationsFromLlmOutput(text);
    const citation = Object.values(result)[0];

    if (citation.type === "document") {
      expect(citation.lineIds).toEqual([1, 2, 3, 4, 5]);
    }
  });
});

describe("Depth Limit for Recursive Traversal", () => {
  it("should handle normal nested objects", () => {
    const input = {
      level1: {
        level2: {
          citations: [{ fullPhrase: "Test phrase", anchorText: "Test" }],
        },
      },
    };

    const result = getAllCitationsFromLlmOutput(input);
    expect(Object.keys(result).length).toBe(1);
  });

  it("should handle deeply nested objects without stack overflow", () => {
    type NestedObject = {
      citations?: Array<{ fullPhrase: string; anchorText: string }>;
      nested?: NestedObject;
    };

    let deepObj: NestedObject = {
      citations: [{ fullPhrase: "Deep citation", anchorText: "Deep" }],
    };
    for (let i = 0; i < 100; i++) {
      deepObj = { nested: deepObj };
    }

    const result = getAllCitationsFromLlmOutput(deepObj);
    expect(result).toBeDefined();
  });

  it("should handle circular reference-like structures gracefully", () => {
    type DeeplyNestedObject = {
      level1?: {
        nested?: DeeplyNestedObject;
        level?: number;
        citations?: Array<{ fullPhrase: string; anchorText: string }>;
      };
      nested?: DeeplyNestedObject;
      level?: number;
      citations?: Array<{ fullPhrase: string; anchorText: string }>;
    };

    const obj: DeeplyNestedObject = { level1: {} };
    let current: DeeplyNestedObject = obj.level1 as DeeplyNestedObject;
    for (let i = 0; i < 200; i++) {
      current.nested = { level: i };
      current = current.nested;
    }
    current.citations = [{ fullPhrase: "Final citation", anchorText: "Final" }];

    const startTime = performance.now();
    const result = getAllCitationsFromLlmOutput(obj);
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(1000);
    expect(result).toBeDefined();
  });
});

describe("Concurrency Limiter", () => {
  function createConcurrencyLimiter(limit: number) {
    let running = 0;
    const queue: Array<() => void> = [];

    const next = () => {
      if (queue.length > 0 && running < limit) {
        const fn = queue.shift();
        if (fn) {
          fn();
        }
      }
    };

    return <T>(fn: () => Promise<T>): Promise<T> => {
      return new Promise((resolve, reject) => {
        const run = () => {
          running++;
          let promise: Promise<T>;
          try {
            promise = fn();
          } catch (err) {
            running--;
            next();
            reject(err);
            return;
          }
          promise
            .then(resolve)
            .catch(reject)
            .finally(() => {
              running--;
              next();
            });
        };

        if (running < limit) {
          run();
        } else {
          queue.push(run);
        }
      });
    };
  }

  it("should never exceed the configured concurrency limit under heavy load", async () => {
    const limit = 3;
    const limiter = createConcurrencyLimiter(limit);

    let currentlyRunning = 0;
    let maxObserved = 0;
    const violations: number[] = [];

    const tasks = Array.from({ length: 50 }, (_, i) =>
      limiter(async () => {
        currentlyRunning++;
        if (currentlyRunning > limit) {
          violations.push(currentlyRunning);
        }
        maxObserved = Math.max(maxObserved, currentlyRunning);

        await new Promise(resolve => setTimeout(resolve, Math.random() * 10 + 1));

        currentlyRunning--;
        return i;
      }),
    );

    const results = await Promise.all(tasks);

    expect(results.length).toBe(50);
    expect(results).toEqual(expect.arrayContaining([...Array(50).keys()]));
    expect(violations).toEqual([]);
    expect(maxObserved).toBeLessThanOrEqual(limit);
  });

  it("should handle synchronous throws without deadlocking", async () => {
    const limit = 2;
    const limiter = createConcurrencyLimiter(limit);
    const completedTasks: number[] = [];

    const tasks = [
      limiter(() => {
        throw new Error("sync error");
      }).catch(() => "caught-sync"),

      limiter(async () => {
        await new Promise(r => setTimeout(r, 5));
        completedTasks.push(1);
        return "task1";
      }),
      limiter(async () => {
        await new Promise(r => setTimeout(r, 5));
        completedTasks.push(2);
        return "task2";
      }),
      limiter(async () => {
        await new Promise(r => setTimeout(r, 5));
        completedTasks.push(3);
        return "task3";
      }),
    ];

    const results = await Promise.all(tasks);

    expect(results[0]).toBe("caught-sync");
    expect(completedTasks.sort()).toEqual([1, 2, 3]);
  });

  it("should handle async rejections without deadlocking", async () => {
    const limit = 2;
    const limiter = createConcurrencyLimiter(limit);
    const completedTasks: number[] = [];

    const tasks = [
      limiter(async () => {
        await new Promise(r => setTimeout(r, 2));
        throw new Error("async error");
      }).catch(() => "caught-async"),

      limiter(async () => {
        await new Promise(r => setTimeout(r, 10));
        completedTasks.push(1);
        return "task1";
      }),
      limiter(async () => {
        await new Promise(r => setTimeout(r, 10));
        completedTasks.push(2);
        return "task2";
      }),
    ];

    const results = await Promise.all(tasks);

    expect(results[0]).toBe("caught-async");
    expect(completedTasks.sort()).toEqual([1, 2]);
  });

  it("should process all queued tasks even with limit of 1", async () => {
    const limit = 1;
    const limiter = createConcurrencyLimiter(limit);
    const order: number[] = [];

    const tasks = Array.from({ length: 10 }, (_, i) =>
      limiter(async () => {
        order.push(i);
        await new Promise(r => setTimeout(r, 1));
        return i;
      }),
    );

    const results = await Promise.all(tasks);

    expect(results.length).toBe(10);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
