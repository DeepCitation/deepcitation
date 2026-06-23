import { describe, expect, it } from "bun:test";
import {
  extractDeepTextPageBlocks,
  formatDeepTextLineTag,
  formatDeepTextPageId,
  hasDeepTextLineTags,
  normalizeDeepTextLineIds,
  normalizeDeepTextPageId,
  pageToDeepTextLineTaggedText,
  parseDeepTextLineMarkers,
  parseDeepTextPageId,
  parseDeepTextPageLines,
  parseDeepTextPageNumber,
  stripDeepTextTags,
  wrapDeepTextLine,
  wrapDeepTextPage,
} from "../deeptext/index.js";

describe("DeepText helpers", () => {
  it("formats canonical 1-based page ids with matching zero-based indexes", () => {
    expect(formatDeepTextPageId(1)).toBe("page_number_1_index_0");
    expect(formatDeepTextPageId(4)).toBe("page_number_4_index_3");
    expect(formatDeepTextPageId("12")).toBe("page_number_12_index_11");
  });

  it("parses page id parts without accepting unrelated strings", () => {
    expect(parseDeepTextPageId("page_number_4_index_3")).toEqual({ pageNumber: 4, pageIndex: 3 });
    expect(parseDeepTextPageNumber("page_number_4_index_3")).toBe(4);
    expect(parseDeepTextPageNumber('<page_number_4_index_3>\n<line id="1">Text</line>\n</page_number_4_index_3>')).toBe(
      4,
    );
    expect(parseDeepTextPageNumber("4")).toBe(4);
    expect(parseDeepTextPageId("page 4")).toBeUndefined();
    expect(formatDeepTextPageId(0)).toBeUndefined();
    expect(formatDeepTextPageId(Number.NaN)).toBeUndefined();
  });

  it("normalizes compact and legacy citation page ids", () => {
    expect(normalizeDeepTextPageId("2_1")).toEqual({
      pageNumber: 2,
      pageIndex: 1,
      startPageId: "page_number_2_index_1",
    });
    expect(normalizeDeepTextPageId("0_0")).toEqual({
      pageNumber: 1,
      pageIndex: 0,
      startPageId: "page_number_1_index_0",
    });
    expect(normalizeDeepTextPageId("page_number_0_index_0")).toEqual({
      pageNumber: 1,
      pageIndex: 0,
      startPageId: "page_number_1_index_0",
    });
    expect(normalizeDeepTextPageId("page 4")).toEqual({ pageNumber: undefined, startPageId: undefined });
  });

  it("normalizes line ids for tool and citation payloads", () => {
    expect(normalizeDeepTextLineIds([3, "2", 2, 0, -1, Number.NaN, 1.7])).toEqual([3, 2, 1]);
    expect(normalizeDeepTextLineIds([3, "2", 2, 1], { sort: true })).toEqual([1, 2, 3]);
    expect(normalizeDeepTextLineIds("not-array")).toEqual([]);
  });

  it("renders line tags through the same escaping path", () => {
    expect(formatDeepTextLineTag(7)).toBe('<line id="7">');
    expect(wrapDeepTextLine(7, "A & B < C")).toBe('<line id="7">A &amp; B &lt; C</line>');
    expect(formatDeepTextLineTag(0)).toBeUndefined();
  });

  it("wraps page text with canonical page tags", () => {
    expect(wrapDeepTextPage(2, '<line id="1">Text</line>')).toBe(
      '<page_number_2_index_1>\n<line id="1">Text</line>\n</page_number_2_index_1>',
    );
  });

  it("detects and strips DeepText page and line tags", () => {
    const tagged = '<page_number_2_index_1>\n<line id="7">Existing text</line>\n</page_number_2_index_1>';

    expect(hasDeepTextLineTags(tagged)).toBe(true);
    expect(hasDeepTextLineTags("plain text")).toBe(false);
    expect(stripDeepTextTags(tagged)).toBe("Existing text");
  });

  it("extracts page blocks from DeepText prompt text", () => {
    const prompt = [
      "<page_number_1_index_0>",
      '<line id="1">First</line>',
      "</page_number_1_index_0>",
      "<page_number_2_index_1>",
      '<line id="1">Second</line>',
      "</page_number_2_index_1>",
    ].join("\n");

    expect(extractDeepTextPageBlocks(prompt)).toEqual([
      { pageId: "page_number_1_index_0", pageNumber: 1, pageIndex: 0, content: '<line id="1">First</line>' },
      { pageId: "page_number_2_index_1", pageNumber: 2, pageIndex: 1, content: '<line id="1">Second</line>' },
    ]);
  });

  it("parses page text lines with explicit and carried line ids", () => {
    const page = ['<line id="5">A</line>', "B", '<line id="9">C</line>'].join("\n");

    expect(parseDeepTextPageLines(page)).toEqual([
      { lineId: 5, text: "A" },
      { lineId: 6, text: "B" },
      { lineId: 9, text: "C" },
    ]);
  });

  it("tags plain page text with sparse line markers", () => {
    expect(pageToDeepTextLineTaggedText("A\nB\nC\nD\nE")).toBe(
      ['<line id="1">A</line>', "B", "C", "D", '<line id="5">E</line>'].join("\n"),
    );
  });

  it("parses clean text and line marker offsets from tagged line text", () => {
    expect(parseDeepTextLineMarkers('hello <line id="3">A</line>\n<line id="4">B</line>')).toEqual({
      cleanText: "hello A\nB",
      lineMarkers: [
        { offset: 6, id: 3 },
        { offset: 8, id: 4 },
      ],
    });
  });
});
