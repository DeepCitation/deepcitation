/**
 * Tests for `deepcitation lint` — pre-flight citation-syntax validator.
 *
 * Covers the rules introduced in plans/cli-improvements-plan-april-13.md § Phase 1:
 *   - Rule 1: orphan markers / orphan citations
 *   - Rule 2: unique n
 *   - Rule 3: k ≤4 words and ≤40 chars (WARN)
 *   - Rule 4: k is a contiguous substring of f (ERR)
 *   - Rule 5: [N] adjacency to closing ** (WARN)
 *   - Rule 6/7: l and p shape
 *   - Rule 8: code-fenced CITATION_DATA block (ERR)
 *   - Rule 9: format-2 k mismatch (WARN)
 *
 * Each test runs the exported `lint()` against a fixture file on disk, captures
 * stderr output, and asserts on the exit code + written findings.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lint } from "../cli/lint.js";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER } from "../prompts/citationPrompts.js";
// ── fixture helpers ─────────────────────────────────────────────────
function sectionWithBlock(body, jsonBody) {
    return `${body}\n\n${CITATION_DATA_START_DELIMITER}\n${jsonBody}\n${CITATION_DATA_END_DELIMITER}\n`;
}
const VALID = sectionWithBlock("Revenue grew **45%** [1] in Q4, beating **consensus** [2] estimates.", JSON.stringify({
    doc1: [
        { n: 1, k: "45%", p: "1_0", l: [5], f: "Revenue grew 45% year over year in Q4." },
        { n: 2, k: "consensus", p: "1_0", l: [10], f: "Beat consensus estimates by a wide margin." },
    ],
}));
// ── test harness ────────────────────────────────────────────────────
describe("lint", () => {
    let tmp;
    let mockExit;
    let mockError;
    let mockLog;
    const errorLines = [];
    const logLines = [];
    beforeEach(() => {
        tmp = join(tmpdir(), `dc-lint-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        mkdirSync(tmp, { recursive: true });
        errorLines.length = 0;
        logLines.length = 0;
        mockExit = spyOn(process, "exit").mockImplementation(((code) => {
            throw new Error(`process.exit(${code ?? 0})`);
        }));
        mockError = spyOn(console, "error").mockImplementation(((...args) => {
            errorLines.push(args.map(String).join(" "));
        }));
        mockLog = spyOn(console, "log").mockImplementation(((...args) => {
            logLines.push(args.map(String).join(" "));
        }));
    });
    afterEach(() => {
        rmSync(tmp, { recursive: true, force: true });
        mockExit.mockRestore();
        mockError.mockRestore();
        mockLog.mockRestore();
    });
    function write(name, content) {
        const path = join(tmp, name);
        writeFileSync(path, content);
        return path;
    }
    function lintAndCatchExit(args) {
        try {
            lint(args);
        }
        catch (err) {
            const match = err.message.match(/process\.exit\((\d+)\)/);
            if (match)
                return parseInt(match[1], 10);
            throw err;
        }
        return 0;
    }
    // ── happy path ────────────────────────────────────────────────────
    it("exits 0 and prints OK for a valid section file", () => {
        const path = write("valid.md", VALID);
        const code = lintAndCatchExit([path]);
        expect(code).toBe(0);
        expect(errorLines.join("\n")).toMatch(/OK\s+2 citations/);
    });
    it("emits structured JSON when --json is passed on a valid file", () => {
        const path = write("valid.md", VALID);
        const code = lintAndCatchExit([path, "--json"]);
        expect(code).toBe(0);
        const parsed = JSON.parse(logLines.join("\n"));
        expect(parsed.citationCount).toBe(2);
        expect(parsed.errors).toHaveLength(0);
        expect(parsed.warnings).toHaveLength(0);
    });
    it("emits structured JSON with populated errors array on a file with errors", () => {
        const content = sectionWithBlock("Body **foo** [1] and **bar** [1].", JSON.stringify({
            doc1: [
                { n: 1, k: "foo", p: "1_0", l: [1], f: "sentence with foo in it." },
                { n: 1, k: "bar", p: "1_0", l: [2], f: "sentence with bar." },
            ],
        }));
        const path = write("dup-json.md", content);
        const code = lintAndCatchExit([path, "--json"]);
        expect(code).toBe(1);
        const parsed = JSON.parse(logLines.join("\n"));
        expect(parsed.errors.length).toBeGreaterThan(0);
        expect(parsed.errors.some(e => e.rule === "unique-n")).toBe(true);
    });
    // ── rule 2: duplicate n ──────────────────────────────────────────
    it("flags duplicate citation ids as ERR", () => {
        const content = sectionWithBlock("Body **foo** [1] and **bar** [1].", JSON.stringify({
            doc1: [
                { n: 1, k: "foo", p: "1_0", l: [1], f: "sentence with foo in it." },
                { n: 1, k: "bar", p: "1_0", l: [2], f: "sentence with bar." },
            ],
        }));
        const path = write("dup.md", content);
        const code = lintAndCatchExit([path]);
        expect(code).toBe(1);
        expect(errorLines.some(l => l.includes("ERR") && l.includes("unique-n"))).toBe(true);
    });
    // ── rule 3: k length ─────────────────────────────────────────────
    it("warns when k exceeds 4 words", () => {
        const content = sectionWithBlock("Body **five word bold term here** [1].", JSON.stringify({
            doc1: [
                {
                    n: 1,
                    k: "five word bold term here",
                    p: "1_0",
                    l: [1],
                    f: "The full sentence contains five word bold term here and more words.",
                },
            ],
        }));
        const path = write("long-k.md", content);
        const code = lintAndCatchExit([path]);
        expect(code).toBe(0); // WARN, not ERR
        expect(errorLines.some(l => l.includes("WARN") && l.includes("k-words"))).toBe(true);
    });
    it("warns when k exceeds 40 chars", () => {
        const long = "this is a phrase that is more than forty characters total";
        const content = sectionWithBlock(`Body **${long}** [1].`, JSON.stringify({
            doc1: [{ n: 1, k: long, p: "1_0", l: [1], f: `Context containing ${long} verbatim.` }],
        }));
        const path = write("long-chars.md", content);
        const code = lintAndCatchExit([path]);
        expect(code).toBe(0);
        expect(errorLines.some(l => l.includes("WARN") && l.includes("k-chars"))).toBe(true);
    });
    it("promotes WARN to ERR when --strict is passed", () => {
        const content = sectionWithBlock("Body **five word bold term here** [1].", JSON.stringify({
            doc1: [
                {
                    n: 1,
                    k: "five word bold term here",
                    p: "1_0",
                    l: [1],
                    f: "Sentence containing five word bold term here and more words.",
                },
            ],
        }));
        const path = write("strict.md", content);
        const code = lintAndCatchExit([path, "--strict"]);
        expect(code).toBe(1);
    });
    // ── rule 4: k not a substring of f ───────────────────────────────
    it("errors when k is not a substring of f", () => {
        const content = sectionWithBlock("Body **forty five** [1].", JSON.stringify({
            doc1: [{ n: 1, k: "forty five", p: "1_0", l: [1], f: "Revenue grew 45 percent year over year." }],
        }));
        const path = write("no-substring.md", content);
        const code = lintAndCatchExit([path]);
        expect(code).toBe(1);
        expect(errorLines.some(l => l.includes("ERR") && l.includes("k-not-in-f"))).toBe(true);
    });
    // ── rule 5: marker adjacency ─────────────────────────────────────
    it("warns when intervening text sits between ** and [N]", () => {
        // `**foo** of the bar [1]` — "of the bar" is the suffix text that breaks verify
        const content = sectionWithBlock("The actual **reward** of the total rewards [1] is significant.", JSON.stringify({
            doc1: [{ n: 1, k: "reward", p: "1_0", l: [1], f: "The reward is one of several." }],
        }));
        const path = write("adjacency.md", content);
        const code = lintAndCatchExit([path]);
        expect(code).toBe(0); // WARN
        expect(errorLines.some(l => l.includes("WARN") && l.includes("marker-adjacency"))).toBe(true);
    });
    it("does not warn when whitespace is the only thing between ** and [N]", () => {
        const content = sectionWithBlock("Clean **phrase** [1] here.", JSON.stringify({
            doc1: [{ n: 1, k: "phrase", p: "1_0", l: [1], f: "The phrase appears in context." }],
        }));
        const path = write("clean.md", content);
        const code = lintAndCatchExit([path]);
        expect(code).toBe(0);
        expect(errorLines.some(l => l.includes("marker-adjacency"))).toBe(false);
    });
    // ── rule 7: page_id format ───────────────────────────────────────
    it("errors on malformed page_id", () => {
        const content = sectionWithBlock("Body **foo** [1].", JSON.stringify({
            doc1: [{ n: 1, k: "foo", p: "pg-one", l: [1], f: "sentence with foo." }],
        }));
        const path = write("bad-p.md", content);
        const code = lintAndCatchExit([path]);
        expect(code).toBe(1);
        expect(errorLines.some(l => l.includes("ERR") && l.includes("p-format"))).toBe(true);
    });
    it("accepts both compact (N_I) and verbose page_id formats", () => {
        const content = sectionWithBlock("Body **foo** [1] and **bar** [2].", JSON.stringify({
            doc1: [
                { n: 1, k: "foo", p: "1_0", l: [1], f: "sentence with foo." },
                { n: 2, k: "bar", p: "page_number_2_index_0", l: [2], f: "sentence with bar." },
            ],
        }));
        const path = write("mixed-p.md", content);
        const code = lintAndCatchExit([path]);
        expect(code).toBe(0);
    });
    // ── rule 8: code fence ───────────────────────────────────────────
    it("errors when CITATION_DATA is wrapped in a markdown code fence", () => {
        const content = `Body **foo** [1].\n\n\`\`\`json\n${CITATION_DATA_START_DELIMITER}\n[{"n":1,"k":"foo","p":"1_0","l":[1],"f":"sentence with foo."}]\n${CITATION_DATA_END_DELIMITER}\n\`\`\`\n`;
        const path = write("fenced.md", content);
        const code = lintAndCatchExit([path]);
        expect(code).toBe(1);
        expect(errorLines.some(l => l.includes("ERR") && l.includes("code-fence"))).toBe(true);
    });
    // ── rule 1: orphan markers ───────────────────────────────────────
    it("errors on a body marker that has no matching citation", () => {
        const content = sectionWithBlock("Body **foo** [1] and **bar** [99].", JSON.stringify({
            doc1: [{ n: 1, k: "foo", p: "1_0", l: [1], f: "sentence with foo." }],
        }));
        const path = write("orphan-marker.md", content);
        const code = lintAndCatchExit([path]);
        expect(code).toBe(1);
        expect(errorLines.some(l => l.includes("ERR") && l.includes("orphan-marker"))).toBe(true);
    });
    // ── missing block ────────────────────────────────────────────────
    it("errors when the body has markers but no CITATION_DATA block", () => {
        const path = write("no-block.md", "Body **foo** [1] without a data block.");
        const code = lintAndCatchExit([path]);
        expect(code).toBe(1);
        expect(errorLines.some(l => l.includes("ERR") && l.includes("missing-block"))).toBe(true);
    });
});
