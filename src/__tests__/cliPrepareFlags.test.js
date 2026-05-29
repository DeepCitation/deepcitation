/**
 * Tests for the new prepare-command text/metadata flags introduced in
 * plans/cli-improvements-plan-april-13.md § Phase 1:
 *   - `normalizeShortFlags` shorthand map (--md, -o, -p, -l, -f, --pub, ...)
 *   - `parseLineIdsMode` (accepts default/none/every=5, rejects every=N for N != 5)
 *   - `parseFormatMode`
 *   - `resolvePageSpec` page-range parser
 *   - `renderTextStream` format selector
 *
 * These are pure helpers, so the tests avoid the network path entirely.
 */
import { describe, expect, it, spyOn } from "bun:test";
import { normalizeShortFlags } from "../cli/cliUtils.js";
import { parseFormatMode, parseLineIdsMode, renderTextStream, resolvePageSpec, retagEveryN, } from "../cli/textRender.js";
describe("normalizeShortFlags", () => {
    it("rewrites short flags to their canonical long forms", () => {
        expect(normalizeShortFlags(["-o", "out.json", "-p", "1-5"])).toEqual(["--out", "out.json", "--pages", "1-5"]);
    });
    it("rewrites --md to --markdown", () => {
        expect(normalizeShortFlags(["--md", "draft.md"])).toEqual(["--markdown", "draft.md"]);
    });
    it("rewrites --pub to --publish and --vr to --verify-response", () => {
        expect(normalizeShortFlags(["--pub", "--vr", "vr.json"])).toEqual(["--publish", "--verify-response", "vr.json"]);
    });
    it("leaves long-form flags untouched", () => {
        const input = ["--out", "out.json", "--markdown", "draft.md", "--strict"];
        expect(normalizeShortFlags(input)).toEqual(input);
    });
    it("leaves positional args and unknown flags untouched", () => {
        expect(normalizeShortFlags(["file.pdf", "--custom-flag", "value"])).toEqual(["file.pdf", "--custom-flag", "value"]);
    });
});
describe("parseLineIdsMode", () => {
    it("defaults to 'default' when value is undefined", () => {
        expect(parseLineIdsMode(undefined)).toBe("default");
    });
    it("accepts 'default', 'every=5', and 'none'", () => {
        expect(parseLineIdsMode("default")).toBe("default");
        expect(parseLineIdsMode("every=5")).toBe("default");
        expect(parseLineIdsMode("none")).toBe("none");
    });
    it("accepts 'all' as an alias for every=1", () => {
        expect(parseLineIdsMode("all")).toEqual({ kind: "every", n: 1 });
    });
    it("accepts 'every=1'..'every=4' and returns a re-tagger mode", () => {
        expect(parseLineIdsMode("every=1")).toEqual({ kind: "every", n: 1 });
        expect(parseLineIdsMode("every=2")).toEqual({ kind: "every", n: 2 });
        expect(parseLineIdsMode("every=3")).toEqual({ kind: "every", n: 3 });
        expect(parseLineIdsMode("every=4")).toEqual({ kind: "every", n: 4 });
    });
    it("rejects 'every=6' because hydrate assumes every-5 is the ceiling", () => {
        const mockExit = spyOn(process, "exit").mockImplementation(((code) => {
            throw new Error(`exit(${code ?? 0})`);
        }));
        const mockError = spyOn(console, "error").mockImplementation(() => undefined);
        try {
            expect(() => parseLineIdsMode("every=6")).toThrow("exit(1)");
            expect(mockError.mock.calls.some(call => String(call[0]).includes("ceiling"))).toBe(true);
        }
        finally {
            mockExit.mockRestore();
            mockError.mockRestore();
        }
    });
    it("rejects unknown values", () => {
        const mockExit = spyOn(process, "exit").mockImplementation(((code) => {
            throw new Error(`exit(${code ?? 0})`);
        }));
        const mockError = spyOn(console, "error").mockImplementation(() => undefined);
        try {
            expect(() => parseLineIdsMode("something")).toThrow("exit(1)");
        }
        finally {
            mockExit.mockRestore();
            mockError.mockRestore();
        }
    });
});
describe("parseFormatMode", () => {
    it("returns the fallback when value is undefined", () => {
        expect(parseFormatMode(undefined, "json")).toBe("json");
        expect(parseFormatMode(undefined, "txt")).toBe("txt");
    });
    it("accepts the three supported values", () => {
        expect(parseFormatMode("json", "txt")).toBe("json");
        expect(parseFormatMode("txt", "json")).toBe("txt");
        expect(parseFormatMode("plain", "json")).toBe("plain");
    });
    it("rejects unknown values with a clear error", () => {
        const mockExit = spyOn(process, "exit").mockImplementation(((code) => {
            throw new Error(`exit(${code ?? 0})`);
        }));
        const mockError = spyOn(console, "error").mockImplementation(() => undefined);
        try {
            expect(() => parseFormatMode("yaml", "json")).toThrow("exit(1)");
        }
        finally {
            mockExit.mockRestore();
            mockError.mockRestore();
        }
    });
});
describe("resolvePageSpec", () => {
    it("returns all pages when spec is undefined or 'all'", () => {
        expect(resolvePageSpec(undefined, 5)).toEqual([0, 1, 2, 3, 4]);
        expect(resolvePageSpec("all", 5)).toEqual([0, 1, 2, 3, 4]);
    });
    it("parses a simple range '1-5'", () => {
        expect(resolvePageSpec("1-5", 10)).toEqual([0, 1, 2, 3, 4]);
    });
    it("parses multi-segment specs with ranges and singles", () => {
        expect(resolvePageSpec("1-3,5,8-10", 12)).toEqual([0, 1, 2, 4, 7, 8, 9]);
    });
    it("parses 'first=N' and 'last=N'", () => {
        expect(resolvePageSpec("first=3", 10)).toEqual([0, 1, 2]);
        expect(resolvePageSpec("last=3", 10)).toEqual([7, 8, 9]);
    });
    it("deduplicates overlapping segments", () => {
        expect(resolvePageSpec("1-3,2-4", 10)).toEqual([0, 1, 2, 3]);
    });
    it("clamps ranges that exceed the total page count", () => {
        expect(resolvePageSpec("8-20", 10)).toEqual([7, 8, 9]);
    });
    it("rejects specs that match no pages", () => {
        const mockExit = spyOn(process, "exit").mockImplementation(((code) => {
            throw new Error(`exit(${code ?? 0})`);
        }));
        const mockError = spyOn(console, "error").mockImplementation(() => undefined);
        try {
            expect(() => resolvePageSpec("50-60", 10)).toThrow("exit(1)");
        }
        finally {
            mockExit.mockRestore();
            mockError.mockRestore();
        }
    });
});
describe("retagEveryN", () => {
    // Mimic the every-5 output of addLineIdToText: first and last are tagged,
    // plus line 5 and line 10. Lines 2, 3, 4, 6, 7, 8, 9 are untagged intermediates.
    const page = '<line id="1">one</line>\n' +
        "two\n" +
        "three\n" +
        "four\n" +
        '<line id="5">five</line>\n' +
        "six\n" +
        "seven\n" +
        "eight\n" +
        "nine\n" +
        '<line id="10">ten</line>';
    it("is a no-op when there are no tags", () => {
        expect(retagEveryN("plain text\nno tags", 2)).toBe("plain text\nno tags");
    });
    it("every=1 tags every line (first/last preserved)", () => {
        const out = retagEveryN(page, 1);
        for (let id = 1; id <= 10; id++) {
            expect(out).toContain(`<line id="${id}">`);
        }
    });
    it("every=2 tags even-numbered lines plus first and last", () => {
        const out = retagEveryN(page, 2);
        for (const id of [1, 2, 4, 6, 8, 10])
            expect(out).toContain(`<line id="${id}">`);
        for (const id of [3, 5, 7, 9])
            expect(out).not.toContain(`<line id="${id}">`);
        expect(out).toContain("three");
        expect(out).toContain("seven");
    });
    it("every=3 tags multiples of 3 plus first and last", () => {
        const out = retagEveryN(page, 3);
        for (const id of [1, 3, 6, 9, 10])
            expect(out).toContain(`<line id="${id}">`);
        for (const id of [2, 4, 5, 7, 8])
            expect(out).not.toContain(`<line id="${id}">`);
    });
    it("preserves text between tags", () => {
        const out = retagEveryN(page, 1);
        for (const word of ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]) {
            expect(out).toContain(word);
        }
    });
    it("preserves prefix/suffix content (e.g. <page_number_> wrappers)", () => {
        const wrapped = `<page_number_3_index_2>\n${page}\n</page_number_3_index_2>`;
        const out = retagEveryN(wrapped, 2);
        expect(out).toMatch(/^<page_number_3_index_2>/);
        expect(out).toMatch(/<\/page_number_3_index_2>$/);
    });
});
describe("renderTextStream", () => {
    const pages = [
        '<page_number_1_index_0>line one\n<line id="5">line five</line>\nline six</page_number_1_index_0>',
        '<page_number_2_index_0>more text\n<line id="10">line ten</line></page_number_2_index_0>',
    ];
    it("txt format preserves all tags (default line-ids)", () => {
        const out = renderTextStream(pages, "txt", "default");
        expect(out).toContain("<page_number_1_index_0>");
        expect(out).toContain('<line id="5">');
        expect(out).toContain('<line id="10">');
    });
    it("txt format with line-ids=none strips <line id> but keeps page wrappers", () => {
        const out = renderTextStream(pages, "txt", "none");
        expect(out).toContain("<page_number_1_index_0>");
        expect(out).not.toContain("<line id=");
        expect(out).toContain("line five");
    });
    it("plain format strips both page and line tags", () => {
        const out = renderTextStream(pages, "plain", "default");
        expect(out).not.toContain("<page_number_");
        expect(out).not.toContain("<line id=");
        expect(out).toContain("line one");
        expect(out).toContain("more text");
    });
    it("plain format joins pages with a blank line separator", () => {
        const out = renderTextStream(pages, "plain", "default");
        expect(out).toContain("\n\n");
    });
});
