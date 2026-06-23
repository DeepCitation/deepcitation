const DEEP_TEXT_PAGE_ID_RE = /^page_number_(\d+)_index_(\d+)$/i;
const DEEP_TEXT_PAGE_ID_SEARCH_RE = /page_number_\d+_index_\d+/i;
const DEEP_TEXT_PAGE_TAG_RE = /<\/?page_number_\d+_index_\d+[^>]*>/gi;
const DEEP_TEXT_PAGE_BLOCK_RE = /<(page_number_\d+_index_\d+)[^>]*>([\s\S]*?)<\/\1>/gi;
const DEEP_TEXT_LINE_TAG_RE = /<line\s+id=["']?(\d+)["']?\s*>/i;
const DEEP_TEXT_LINE_TAG_GLOBAL_RE = /<\/?line(?:\s+id=["']?(\d+)["']?)?\s*>/gi;
const DEEP_TEXT_COMPACT_PAGE_ID_RE = /^(\d+)_(\d+)$/;
const DEEP_TEXT_LOOSE_PAGE_ID_RE = /page[_a-z]{0,30}(\d+)_index_(\d+)/i;

export const DEEP_TEXT_PAGE_ID_FORMAT = "page_number_PAGE_index_INDEX";
export const DEEP_TEXT_PAGE_ID_EXAMPLE = "page_number_1_index_0";
export const DEEP_TEXT_PAGE_ID_FROM_KEYS_DESCRIPTION = `Use only a DeepText page_id copied from provided page keys in the ${DEEP_TEXT_PAGE_ID_FORMAT} format, for example <${DEEP_TEXT_PAGE_ID_EXAMPLE}>. Do not infer page_id from page text.`;
export const DEEP_TEXT_PAGE_NUMBER_FROM_PAGE_ID_DESCRIPTION = `Derive this from a provided DeepText page_id in the ${DEEP_TEXT_PAGE_ID_FORMAT} format and return only the one-based page number.`;
export const DEEP_TEXT_PAGE_ID_SCHEMA_DESCRIPTION = `Canonical DeepText page_id in ${DEEP_TEXT_PAGE_ID_FORMAT} format, for example ${DEEP_TEXT_PAGE_ID_EXAMPLE}.`;
export const DEEP_TEXT_COMPACT_PAGE_ID_SCHEMA_DESCRIPTION =
  "Compact DeepText page_id in N_I format, where N is the one-based page number and I is the zero-based page index copied from the page tag.";
export const DEEP_TEXT_LINE_ID_SCHEMA_DESCRIPTION =
  "Use DeepText line_id values copied from source line metadata for the same page. Do not invent or renumber line IDs.";
export const DEEP_TEXT_FIRST_LINE_ID_SCHEMA_DESCRIPTION =
  "Use the first DeepText line_id from the supporting source line metadata.";
export const DEEP_TEXT_INCLUSIVE_LINE_IDS_SCHEMA_DESCRIPTION =
  "Use inclusive DeepText line_id values for the exact source text span, copied from source line metadata.";
export const DEEP_TEXT_LINE_RANGE_START_DESCRIPTION =
  "Optional DeepText line_id lower bound within each selected page. Use with page_start/page_end when zooming into exact citation evidence.";
export const DEEP_TEXT_LINE_RANGE_END_DESCRIPTION =
  "Optional DeepText line_id upper bound within each selected page. Use with line_start to return a narrow citation evidence range.";

export interface DeepTextPageIdParts {
  pageNumber: number;
  pageIndex: number;
}

export interface NormalizedDeepTextPageId {
  pageNumber?: number;
  pageIndex?: number;
  startPageId?: string;
}

export interface DeepTextPageBlock extends DeepTextPageIdParts {
  pageId: string;
  content: string;
}

export interface DeepTextParsedLine {
  lineId: number;
  text: string;
}

export interface DeepTextLineMarker {
  offset: number;
  id: number;
}

export interface DeepTextLineMarkerParseResult {
  cleanText: string;
  lineMarkers: DeepTextLineMarker[];
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.floor(parsed);
}

function normalizeNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.floor(parsed);
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatDeepTextPageId(pageNumber: unknown): string | undefined {
  const normalized = normalizePositiveInteger(pageNumber);
  if (normalized === undefined) return undefined;
  return `page_number_${normalized}_index_${normalized - 1}`;
}

export function formatRequiredDeepTextPageId(pageNumber: unknown): string {
  const pageId = formatDeepTextPageId(pageNumber);
  if (!pageId) throw new Error(`Invalid DeepText page number: ${String(pageNumber)}`);
  return pageId;
}

export function parseDeepTextPageId(value: unknown): DeepTextPageIdParts | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(DEEP_TEXT_PAGE_ID_RE);
  if (!match) return undefined;
  const pageNumber = normalizePositiveInteger(match[1]);
  const pageIndex = normalizeNonNegativeInteger(match[2]);
  if (pageNumber === undefined || pageIndex === undefined) return undefined;
  return { pageNumber, pageIndex };
}

export function normalizeDeepTextPageId(value: unknown): NormalizedDeepTextPageId {
  if (typeof value !== "string") return { pageNumber: undefined, startPageId: undefined };

  const compactMatch = value.match(DEEP_TEXT_COMPACT_PAGE_ID_RE);
  if (compactMatch) {
    let pageNumber = normalizeNonNegativeInteger(compactMatch[1]);
    const pageIndex = normalizeNonNegativeInteger(compactMatch[2]);
    if (pageNumber === undefined || pageIndex === undefined) return { pageNumber: undefined, startPageId: undefined };
    if (pageNumber === 0 && pageIndex === 0) pageNumber = 1;
    return {
      pageNumber,
      pageIndex,
      startPageId: `page_number_${pageNumber}_index_${pageIndex}`,
    };
  }

  const looseMatch = value.match(DEEP_TEXT_LOOSE_PAGE_ID_RE);
  if (looseMatch) {
    let pageNumber = normalizeNonNegativeInteger(looseMatch[1]);
    const pageIndex = normalizeNonNegativeInteger(looseMatch[2]);
    if (pageNumber === undefined || pageIndex === undefined) return { pageNumber: undefined, startPageId: undefined };
    if (pageNumber === 0 && pageIndex === 0) pageNumber = 1;
    return {
      pageNumber,
      pageIndex,
      startPageId: `page_number_${pageNumber}_index_${pageIndex}`,
    };
  }

  const exact = parseDeepTextPageId(value);
  if (exact) {
    return {
      pageNumber: exact.pageNumber,
      pageIndex: exact.pageIndex,
      startPageId: `page_number_${exact.pageNumber}_index_${exact.pageIndex}`,
    };
  }

  return { pageNumber: undefined, startPageId: undefined };
}

export function parseDeepTextPageNumber(value: unknown): number | undefined {
  const numeric = normalizePositiveInteger(value);
  if (numeric !== undefined) return numeric;
  const exact = parseDeepTextPageId(value)?.pageNumber;
  if (exact !== undefined) return exact;
  if (typeof value !== "string") return undefined;
  return parseDeepTextPageId(value.match(DEEP_TEXT_PAGE_ID_SEARCH_RE)?.[0])?.pageNumber;
}

export function stripDeepTextPageTags(value: string): string {
  return value.replace(DEEP_TEXT_PAGE_TAG_RE, "").trim();
}

export function normalizeDeepTextLineIds(value: unknown, options?: { sort?: boolean }): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const item of value) {
    const lineId = normalizePositiveInteger(item);
    if (lineId === undefined || seen.has(lineId)) continue;
    seen.add(lineId);
    normalized.push(lineId);
  }
  if (options?.sort) normalized.sort((a, b) => a - b);
  return normalized;
}

export function parseDeepTextLineTag(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  return normalizePositiveInteger(value.match(DEEP_TEXT_LINE_TAG_RE)?.[1]);
}

export function hasDeepTextLineTags(value: unknown): boolean {
  return typeof value === "string" && DEEP_TEXT_LINE_TAG_RE.test(value);
}

export function stripDeepTextLineTags(value: string): string {
  return value.replace(DEEP_TEXT_LINE_TAG_GLOBAL_RE, "").trim();
}

export function stripDeepTextTags(value: string): string {
  return stripDeepTextLineTags(stripDeepTextPageTags(value));
}

export function parseDeepTextPageLines(pageText: string): DeepTextParsedLine[] {
  const lines: DeepTextParsedLine[] = [];
  let currentLineId: number | undefined;

  pageText.split(/\r?\n/).forEach((rawLine, index) => {
    const explicitLineId = parseDeepTextLineTag(rawLine);
    if (explicitLineId !== undefined) currentLineId = explicitLineId;
    else if (currentLineId !== undefined) currentLineId += 1;
    else currentLineId = index + 1;

    const text = stripDeepTextTags(rawLine);
    if (text && currentLineId !== undefined) lines.push({ lineId: currentLineId, text });
  });

  return lines;
}

export function parseDeepTextLineMarkers(raw: string): DeepTextLineMarkerParseResult {
  const lineMarkers: DeepTextLineMarker[] = [];
  let cleanText = "";
  let lastIndex = 0;

  for (const match of raw.matchAll(DEEP_TEXT_LINE_TAG_GLOBAL_RE)) {
    cleanText += raw.slice(lastIndex, match.index);
    const lineId = normalizePositiveInteger(match[1]);
    if (lineId !== undefined) lineMarkers.push({ offset: cleanText.length, id: lineId });
    lastIndex = match.index! + match[0].length;
  }
  cleanText += raw.slice(lastIndex);

  return { cleanText, lineMarkers };
}

export function extractDeepTextPageBlocks(value: string): DeepTextPageBlock[] {
  const blocks: DeepTextPageBlock[] = [];
  for (const match of value.matchAll(DEEP_TEXT_PAGE_BLOCK_RE)) {
    const pageId = match[1];
    const parts = parseDeepTextPageId(pageId);
    if (!pageId || !parts) continue;
    blocks.push({
      pageId,
      pageNumber: parts.pageNumber,
      pageIndex: parts.pageIndex,
      content: (match[2] ?? "").trim(),
    });
  }
  return blocks;
}

export function formatDeepTextLineTag(lineId: unknown): string | undefined {
  const normalized = normalizePositiveInteger(lineId);
  if (normalized === undefined) return undefined;
  return `<line id="${normalized}">`;
}

export function wrapDeepTextLine(lineId: unknown, text: string): string | undefined {
  const openTag = formatDeepTextLineTag(lineId);
  if (!openTag) return undefined;
  return `${openTag}${escapeXmlText(text)}</line>`;
}

export function wrapDeepTextPage(pageNumber: unknown, pageText: string): string | undefined {
  const pageId = formatDeepTextPageId(pageNumber);
  if (!pageId) return undefined;
  return `<${pageId}>\n${pageText}\n</${pageId}>`;
}

export function pageToDeepTextLineTaggedText(page: string): string {
  const cleanPage = stripDeepTextLineTags(stripDeepTextPageTags(page));
  const lines = cleanPage
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) return "";

  const lastIndex = lines.length - 1;
  return lines
    .map((line, index) => {
      const lineNumber = index + 1;
      if (index === 0 || index === lastIndex || lineNumber % 5 === 0) {
        return wrapDeepTextLine(lineNumber, line) ?? line;
      }
      return line;
    })
    .join("\n");
}
