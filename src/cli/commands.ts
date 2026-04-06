/**
 * CLI command handlers extracted for testability.
 *
 * Each command function accepts its argv slice and performs the command logic.
 * All functions are exported so Tier 2 tests can call them directly with
 * mocked dependencies (auth, client, fs) instead of requiring subprocess tests.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { createInterface } from "node:readline";
import {
  type CallbackPayload,
  CREDENTIALS_PATH,
  deleteCredentials,
  generateNonce,
  IS_AI_AGENT,
  IS_COWORK,
  maskKey,
  openBrowser,
  type ResolvedAuth,
  resolveAuth,
  sourceLabel,
  startCallbackServer,
  writeCredentials,
} from "../auth.js";
import { DeepCitation } from "../client/DeepCitation.js";
import type { UrlSource } from "../client/types.js";
import {
  citationDataToCitation,
  extractVisibleText,
  getCitationMarkerIds,
  parseCitationData,
} from "../parsing/citationParser.js";
import {
  CITATION_DATA_END_DELIMITER,
  CITATION_DATA_START_DELIMITER,
  type CitationData,
} from "../prompts/citationPrompts.js";
import type { AttachmentAssets } from "../types/index.js";
import { getCitationKey } from "../utils/citationKey.js";
import { sanitizeForLog } from "../utils/logSafety.js";
import { normalizeCitationsFile } from "../utils/normalizeCitations.js";
import { detectProxyUrl } from "../utils/proxy.js";
import { safeExec, safeReplace, safeTest } from "../utils/regexSafety.js";
import { validateCitationData } from "../utils/validateCitationData.js";
import { CDN_JS } from "../vanilla/_generated_cdn.js";
import {
  escapeJsForScript,
  escapeJsonForScript,
  injectCdnRuntime,
  reattachPageImages,
  stripExistingInjection,
} from "../vanilla/reportUtils.js";
import { extractMarkersFromBody, findAnchorWithFallback, getAllLines, toCompactPageId } from "./cite.js";
import { die, extractApiKey, isValidApiKeyFormat, parseArgs } from "./cliUtils.js";
import { findSummaryForMarkdown, hydrateCitations, parseSummaryToLineMap } from "./hydrate.js";

// Re-export so cli.ts and tests can import from the single commands module
export { HYDRATE_HELP, hydrate } from "./hydrate.js";
export { MERGE_HELP, merge } from "./merge.js";

import {
  AUDIENCE_PRESETS,
  type AudiencePreset,
  buildCdnComparisonShowcaseHtml,
  markdownToHtml,
  type ReportStyle,
} from "./markdownToHtml.js";
import { createCoworkFetch, createProxyFetch } from "./proxy.js";

// ── help strings ──────────────────────────────────────────────────

export const HELP = `deepcitation CLI

Commands:
  auth      Authenticate (or show current status if already logged in)
  prepare   Prepare a file or URL for citation verification
  verify    Verify citations (--markdown, --html, or --citations)
  billing   Open the billing dashboard

Run "deepcitation <command> --help" for command-specific options.
`;

export const INJECT_HELP = `Usage: deepcitation inject [options]

Inject DeepCitation verification data and interactive popover runtime into an
existing HTML file. Adds the verification JSON, CSS, and runtime script so that
any elements with data-citation-key attributes become interactive.

Options:
  --html <file>             Path to existing HTML file to augment
  --verify-response <file>  Path to verify-response.json from /verifyCitations
  --key-map <file>          Path to key mapping JSON (human-readable → hashed keys)
  --theme <auto|light|dark> Popover color theme (default: "auto")
  --indicator <icon|dot|none> Status indicator style (default: "icon")
  --out <file>              Output file path (default: overwrites input)
  -h, --help                Show this help message

The injected assets are:
  - A <script type="application/json" id="dc-data"> block with verification data
  - (Optional) A <script type="application/json" id="dc-key-map"> block that maps
    human-readable data-cite attributes to hashed data-citation-key values
  - DeepCitation popover CSS
  - The vanilla runtime JS that wires up [data-citation-key] click handlers

Examples:
  deepcitation inject --html dashboard.html --verify-response verify.json
  deepcitation inject --html report.html --verify-response verify.json --out report-verified.html
`;

export const SHOWCASE_HELP = `Usage: deepcitation showcase [options]

Build a local CDN comparison demo page from the markdownToHtml fixture used by
the repo's smoke tests.

Options:
  --out <file>   Output HTML path (default: .deepcitation/cdn-comparison-showcase.html)
  -h, --help     Show this help message

Examples:
  deepcitation showcase
  deepcitation showcase --out /tmp/cdn-comparison-showcase.html
`;

export const PREPARE_HELP = `Usage: deepcitation prepare <file-or-url> [options]

Prepare a file or URL for citation verification. Uploads the source to the
DeepCitation API and saves the response JSON (attachmentId + deepTextPages).
The response now also includes deepTextPages as the canonical raw page array.

Arguments:
  <file-or-url>             Local file path or URL to prepare

Options:
  --out <file>              Output JSON path (default: .deepcitation/prepare-{name}.json)
  --text                    Print attachmentId and deepTextPages to stdout
  --unsafe-fast             Use fast mode for URLs (skips rendering, vulnerable to hidden text)
  --skip-cache              Force a fresh fetch/conversion, bypassing the URL cache
  -h, --help                Show this help message

Examples:
  deepcitation prepare report.pdf
  deepcitation prepare report.pdf --text
  deepcitation prepare https://example.com/article --out .deepcitation/prepare-article.json
  deepcitation prepare scan.jpg
  deepcitation prepare https://example.com/article --skip-cache
`;

export const VERIFY_HELP = `Usage: deepcitation verify [options]

Verify citations against prepared attachments.

Mode 1 — Markdown (--markdown):
  Convert markdown with [N] markers and <<<CITATION_DATA>>> block to a styled
  verification report. Handles markdown→HTML, data-cite wrapping, keygen,
  annotation, API verification, and CDN runtime injection in one shot.

Mode 2 — HTML (--html):
  Parse HTML with [N] markers and <<<CITATION_DATA>>> block, generate keys,
  annotate HTML, verify against sources, and inject popover runtime.

Mode 3 — Citations only (--citations):
  Verify a pre-built citations JSON file. Groups by attachmentId and merges
  responses into a single output file.

Options:
  --markdown <file>         Path to markdown file with citations (recommended)
  --html <file>             Path to HTML file with citations
  --citations <file>        Path to citations JSON (citations-only mode)
  --style <plain|report>    HTML output style (default: "report", --markdown only)
  --audience <preset>       Audience preset: general, executive, technical, legal, medical (default: "general")
  --title <text>            Report title (default: first H1 in markdown, or "Verification Report")
  --summary <file>          Summary file for auto-hydrating compact citations (--markdown only)
  --out <file>              Output path (default: {stem}-verified.html in CWD)
  --theme <auto|light|dark> Popover color theme (default: "auto")
  --indicator <indicator>   Indicator variant: icon, dot, none (default: "icon")
  --image-format <format>   Evidence image format: avif, png, jpeg, webp (default: avif)
  --prompt                  Print the citation format spec to stdout and exit
  -h, --help                Show this help message

Examples:
  deepcitation verify --markdown .deepcitation/draft-report.md
  deepcitation verify --markdown report.md --style plain
  deepcitation verify --markdown report.md --audience executive --theme dark
  deepcitation verify --html report.html --out verified.html
  deepcitation verify --prompt
  deepcitation verify --citations .deepcitation/citations-keyed.json
`;

export const KEYGEN_HELP = `Usage: deepcitation keygen [options]

Compute deterministic citation keys for a citations JSON file. Uses the same
SHA-1 based algorithm as the DeepCitation API so data-citation-key attributes
match the verification response keys.

Options:
  --citations <file>   Path to citations JSON (object keyed by any label)
  --out <file>         Write re-keyed JSON (original labels → hashed keys). If omitted, prints mapping to stdout.
  -h, --help           Show this help message

Input format: { "my-label": { "fullPhrase": "...", "anchorText": "...", "pageNumber": 1, "lineIds": [1] } }
Output: { "my-label": "a3f7b2c1d8e9f012", ... } (mapping) or re-keyed citations file (with --out)

Examples:
  deepcitation keygen --citations .deepcitation/citations.json
  deepcitation keygen --citations .deepcitation/citations.json --out .deepcitation/citations-keyed.json
`;

export const GET_HELP = `Usage: deepcitation get <attachmentId> [options]

Fetch full attachment metadata by ID. Returns pages, verifications,
deep text items, and optional page texts.

Arguments:
  <attachmentId>            The attachment ID to query

Options:
  --out <file>              Output JSON path (default: stdout)
  --deep-text               Include deepTextPages in output
  --page-texts              Include raw per-page text arrays
  -h, --help                Show this help message

Examples:
  deepcitation get abc123
  deepcitation get abc123 --out .deepcitation/attachment.json
  deepcitation get abc123 --deep-text --page-texts --out attachment-full.json
`;

// ── constants ──────────────────────────────────────────────────────

const ALLOWED_THEMES = ["auto", "light", "dark"] as const;
const ALLOWED_INDICATORS = ["icon", "dot", "none"] as const;

// ── helpers ───────────────────────────────────────────────────────

const DEFAULT_API_URL = "https://api.deepcitation.com";

/** Print diagnostic when all citations return not_found. */
function printAllNotFoundHint(): void {
  console.error(
    `\nAll citations returned not_found. Common causes:\n` +
      `  1. anchor_text is not verbatim from the source (paraphrased or too long)\n` +
      `  2. page_id format is wrong — must be page_number_N_index_I from the tag name\n` +
      `  3. The attachment was re-prepared — attachmentId has changed\n` +
      `\nFix the citation data and re-run "deepcitation verify --markdown <draft.md>".`,
  );
}

/** Write verified HTML output and print summary to stderr. */
function writeVerifiedOutput(outPath: string, content: string): void {
  writeFileSync(outPath, content);
  console.error(`\nVerified report saved to: ${outPath}`);
  console.error(`(The .deepcitation/ folder contains intermediate artifacts and can be safely deleted.)`);
  console.log(outPath);
}

/** Resolve auth or auto-trigger browser login. */
export async function requireAuth(): Promise<ResolvedAuth> {
  const auth = resolveAuth();
  if (auth) return auth;

  console.error("DeepCitation — not logged in. Opening browser to authenticate...\n");
  const baseUrl = resolveBaseUrl();
  await login(["--browser"], baseUrl);

  // Re-check after login completes
  const afterLogin = resolveAuth();
  if (!afterLogin) {
    console.error("Login did not complete. You can also set DEEPCITATION_API_KEY manually.");
    console.error(`  Get a key: ${baseUrl}/cli-auth?manual=true`);
    process.exit(1);
  }
  return afterLogin;
}

/** Create a DeepCitation client with automatic proxy detection. */
export async function createClient(apiKey: string): Promise<DeepCitation> {
  const proxyUrl = detectProxyUrl(DEFAULT_API_URL);

  if (proxyUrl) {
    // Redact user:password@ from proxy URL before logging
    const safeProxy = sanitizeForLog(proxyUrl.replace(/\/\/[^@]+@/, "//***@"));
    console.error(`Using proxy: ${safeProxy}`);

    // In Cowork, globalThis.fetch does NOT transparently proxy — use undici's
    // EnvHttpProxyAgent which reads HTTP_PROXY/HTTPS_PROXY from env vars.
    if (IS_COWORK) {
      console.error("Cowork session — using undici EnvHttpProxyAgent.");
      const coworkFetch = await createCoworkFetch();
      return new DeepCitation({ apiKey, fetch: coworkFetch });
    }

    return new DeepCitation({ apiKey, fetch: createProxyFetch(proxyUrl) });
  }

  return new DeepCitation({ apiKey });
}

/**
 * Resolve BASE_URL from DC_LOGIN_URL env var (or default).
 * Validates that it's a proper HTTP/HTTPS URL.
 */
export function resolveBaseUrl(): string {
  const raw = process.env.DC_LOGIN_URL || "https://deepcitation.com";
  try {
    if (!["http:", "https:"].includes(new URL(raw).protocol)) throw new Error("non-http");
    return raw;
  } catch {
    die(`DC_LOGIN_URL is not a valid HTTP/HTTPS URL: ${sanitizeForLog(raw)}`, HELP);
  }
}

export function saveApiKey(key: string, source: string): void {
  if (!isValidApiKeyFormat(key)) {
    die(
      `Invalid API key format${source ? ` (${source})` : ""}. Keys start with 'sk-dc-' and are at least 20 characters.`,
      HELP,
    );
  }
  writeCredentials({ version: 1, apiKey: key, createdAt: new Date().toISOString() });
  console.error(`Credentials saved to ${CREDENTIALS_PATH}`);
}

/**
 * While the browser OAuth flow is pending, also accept a key pasted
 * directly into the terminal. Putting stdin into flowing mode also
 * prevents typed characters from leaking into the shell after exit.
 */
export function readKeyFromStdin(): { promise: Promise<string | null>; close: () => void } {
  // Note: we intentionally do NOT gate on process.stdin.isTTY here.
  // Git Bash (mintty) on Windows reports isTTY=false even for interactive
  // terminals because mintty uses pipes, not Windows Console handles.
  // The readline works fine on both real TTYs and mintty pipes.
  // If stdin is truly non-interactive (CI, piped empty), readline will get
  // 'close' immediately and resolve null — same effective behavior.
  let resolveKey: (v: string | null) => void;
  const promise = new Promise<string | null>(res => {
    resolveKey = res;
  });
  let done = false;
  // No `output` → terminal defaults to false → kernel handles echo/editing.
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line: string) => {
    if (done) return;
    const key = extractApiKey(line);
    if (key) {
      done = true;
      rl.close();
      resolveKey(key);
    } else if (line.trim()) {
      process.stderr.write("Invalid key format (expected sk-dc-...). Try again: ");
    }
  });
  rl.on("close", () => {
    if (!done) {
      done = true;
      resolveKey(null);
    }
  });
  return {
    promise,
    close: () => {
      if (!done) {
        done = true;
        rl.close();
        resolveKey(null);
      }
    },
  };
}

// ── command handlers ──────────────────────────────────────────────

export async function prepare(argv: string[], _fmtNetErr: (err: unknown) => string) {
  // Extract boolean flags before parseArgs (which only handles --key value pairs)
  const unsafeFast = argv.includes("--unsafe-fast");
  const text = argv.includes("--text") || argv.includes("--summary");
  const skipCache = argv.includes("--skip-cache");
  const filteredArgv = argv.filter(a => a !== "--unsafe-fast" && a !== "--text" && a !== "--summary" && a !== "--skip-cache");

  const args = parseArgs(filteredArgv, PREPARE_HELP);

  // The positional argument is the first non-flag arg
  const positional = filteredArgv.find(a => !a.startsWith("--"));
  if (!positional) die("A file path or URL is required", PREPARE_HELP);

  const { apiKey } = await requireAuth();

  const dc = await createClient(apiKey);

  const isUrl = positional.startsWith("http://") || positional.startsWith("https://");

  if (isUrl && positional.startsWith("http://") && !positional.startsWith("http://localhost")) {
    console.error("Warning: using http:// URL — content will be fetched over plaintext.");
  }

  let result;
  let label: string;

  if (isUrl) {
    label = new URL(positional).hostname.replace(/^www\./, "");
    console.error(unsafeFast ? `Preparing URL (fast mode)...` : `Preparing URL (this may take ~30s)...`);
    result = await dc.prepareUrl({ url: positional, unsafeFastUrlOutput: unsafeFast, skipCache });
  } else {
    const filePath = resolve(positional);
    if (!existsSync(filePath)) die(`File not found: ${positional}`, PREPARE_HELP);
    label = basename(filePath).replace(/\.[^.]+$/, "");
    console.error(`Preparing file: ${basename(filePath)}...`);
    const buffer = readFileSync(filePath);
    result = await dc.uploadFile(buffer, { filename: basename(filePath) });
  }

  const outDir = resolve(".deepcitation");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const outPath = resolve(args.out ?? `.deepcitation/prepare-${label}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.error(`  Attachment ID: ${sanitizeForLog(result.attachmentId)}`);
  console.error(`  Pages: ${result.metadata.pageCount}`);
  console.error(`  Text: ${Math.round(result.metadata.textByteSize / 1024)}KB`);
  if (result.processingTimeMs) {
    console.error(`  Time: ${(result.processingTimeMs / 1000).toFixed(1)}s`);
  }
  console.error(`  Saved: ${outPath}`);

  if (text) {
    // Print attachmentId and deepTextPages as JSON to stdout so agents
    // can consume them with jq or JSON.parse (no extra Read call).
    console.log(
      JSON.stringify({
        attachmentId: result.attachmentId,
        deepTextPages: result.deepTextPages,
      }),
    );
  } else {
    console.log(outPath);
  }
}

export async function verify(
  argv: string[],
  fmtNetErr: (err: unknown) => string,
  resolveSpecPath?: () => string | null,
) {
  // Handle --prompt before parseArgs (it's a boolean flag, not a key-value pair)
  if (argv.includes("--prompt")) {
    if (resolveSpecPath) {
      const specPath = resolveSpecPath();
      if (!specPath) {
        console.error(
          `Error: Citation format spec not found.\n` +
            `Expected location: <deepcitation-package>/docs/prompts/citation-format.md\n` +
            `Make sure the deepcitation package is installed with its docs directory.`,
        );
        process.exit(1);
      }
      process.stdout.write(readFileSync(specPath, "utf-8"));
    } else {
      // Fallback: caller didn't provide spec resolver
      console.error("Error: --prompt requires the CLI entry point to provide a spec path resolver.");
      process.exit(1);
    }
    return;
  }

  const args = parseArgs(argv, VERIFY_HELP);

  // Dispatch to markdown mode if --markdown is provided
  if (args.markdown) {
    return verifyMarkdown(argv, fmtNetErr);
  }

  // Dispatch to one-shot HTML mode if --html is provided
  if (args.html) {
    return verifyHtml(argv, fmtNetErr);
  }

  const citationsPath = args.citations;
  if (!citationsPath) die("--html or --citations is required", VERIFY_HELP);

  const { apiKey } = await requireAuth();

  const dc = await createClient(apiKey);

  const allowedFormats = ["avif", "png", "jpeg", "webp"] as const;
  const imageFormat = (args["image-format"] ?? "avif") as (typeof allowedFormats)[number];
  if (!allowedFormats.includes(imageFormat)) {
    die(`Invalid --image-format "${sanitizeForLog(imageFormat)}". Allowed: ${allowedFormats.join(", ")}`, VERIFY_HELP);
  }

  const raw = JSON.parse(readFileSync(resolve(citationsPath), "utf-8")) as Record<string, unknown>;
  const citations = normalizeCitationsFile(raw);

  // Validate all citations have attachmentId
  const missing = Object.entries(citations).filter(([, c]) => !(c.attachmentId as string));
  if (missing.length > 0) {
    die(
      `${missing.length} citation(s) missing attachmentId: ${missing
        .map(([k]) => k)
        .slice(0, 5)
        .join(", ")}`,
      VERIFY_HELP,
    );
  }

  // Group citations by attachmentId
  const groups = new Map<string, Record<string, Record<string, unknown>>>();
  for (const [key, citation] of Object.entries(citations)) {
    const aid = citation.attachmentId as string;
    if (!groups.has(aid)) groups.set(aid, {});
    const group = groups.get(aid);
    if (group) group[key] = citation;
  }

  console.error(`Verifying ${Object.keys(citations).length} citations across ${groups.size} attachment(s)...`);

  // Verify each group and merge
  const merged: Record<string, unknown> = {};
  for (const [attachmentId, groupCitations] of Array.from(groups.entries())) {
    console.error(`  ${sanitizeForLog(attachmentId)}: ${Object.keys(groupCitations).length} citations...`);
    const result = await dc.verifyAttachment(
      attachmentId,
      // Cast: CLI reads citations from JSON files as Record<string, Record<string, unknown>>,
      // but verifyAttachment expects its own typed CitationMap. The shapes match at runtime.
      groupCitations as unknown as Parameters<typeof dc.verifyAttachment>[1],
      { outputImageFormat: imageFormat },
    );
    Object.assign(merged, result.verifications);
  }

  const output = { verifications: merged };
  const outPath = resolve(args.out ?? ".deepcitation/verify-response.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  const found = Object.values(merged).filter((v: unknown) => (v as Record<string, string>).status === "found").length;
  const total = Object.keys(merged).length;
  console.error(`  Done: ${found}/${total} found`);
  if (found === 0 && total > 0) printAllNotFoundHint();
  console.log(outPath);
}

export function inject(argv: string[]) {
  const args = parseArgs(argv, INJECT_HELP);

  const htmlPath = args.html;
  const verifyResponsePath = args["verify-response"];
  if (!htmlPath) die("--html is required", INJECT_HELP);
  if (!verifyResponsePath) die("--verify-response is required", INJECT_HELP);

  const raw = readFileSync(resolve(htmlPath), "utf-8");
  const html = extractVisibleText(raw);
  const verifyResponse = JSON.parse(readFileSync(resolve(verifyResponsePath), "utf-8"));

  const verifications = verifyResponse.verifications ?? verifyResponse;
  const jsonData = escapeJsonForScript(JSON.stringify(verifications));
  const theme = args.theme ?? "auto";
  if (!ALLOWED_THEMES.includes(theme as (typeof ALLOWED_THEMES)[number])) {
    die(`--theme must be ${ALLOWED_THEMES.join(", ")}`, INJECT_HELP);
  }

  const indicator = (args.indicator ?? "icon") as (typeof ALLOWED_INDICATORS)[number];
  if (args.indicator && !ALLOWED_INDICATORS.includes(indicator)) {
    die(
      `Invalid --indicator "${sanitizeForLog(args.indicator)}". Allowed: ${ALLOWED_INDICATORS.join(", ")}`,
      INJECT_HELP,
    );
  }

  // Optional key map: resolves human-readable data-cite attrs to hashed data-citation-key
  const keyMapPath = args["key-map"];
  let keyMapSnippet = "";
  if (keyMapPath) {
    const raw = readFileSync(resolve(keyMapPath), "utf-8").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      die(`--key-map file is not valid JSON: ${sanitizeForLog(keyMapPath)}`, INJECT_HELP);
    }
    keyMapSnippet = `<script type="application/json" id="dc-key-map">${escapeJsonForScript(JSON.stringify(parsed))}</script>`;
  }

  // Build init options
  const initParts = [`theme:${JSON.stringify(theme)}`];
  if (indicator !== "icon") initParts.push(`indicatorVariant:${JSON.stringify(indicator)}`);

  // CDN bundle: Preact + real React components + extracted Tailwind CSS.
  // init() reads #dc-data + optional #dc-key-map, injects its own <style>,
  // resolves data-cite → data-citation-key, and wires up click handlers.
  const snippet = [
    `<script type="application/json" id="dc-data">${jsonData}</script>`,
    keyMapSnippet,
    `<script>${escapeJsForScript(CDN_JS)}</script>`,
    `<script>window.DeepCitationPopover&&window.DeepCitationPopover.init({${initParts.join(",")}});</script>`,
  ]
    .filter(Boolean)
    .join("\n");

  // Strip existing injection to prevent duplicate CDN bundles
  const stripped = stripExistingInjection(html);
  if (stripped.hadExisting) {
    console.error("Warning: stripped existing DeepCitation injection before re-injecting.");
  }

  // ── Auto-fix display-label mismatches ────────────────────────────
  // When an annotated element's visible text differs from its anchorText
  // and no data-dc-display-label is set, automatically add the attribute.
  // The CDN reads data-dc-display-label at click time so the popover
  // trigger shows the visible text rather than the full anchorText.
  const autoFixLog: string[] = [];
  const elementRe = /<([a-zA-Z][a-zA-Z0-9]*)[^>]*\sdata-citation-key="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g;
  const fixedHtml = stripped.html.replace(elementRe, (fullMatch, _tag, hashedKey, rest, content) => {
    // Skip if data-dc-display-label is already set
    if (/data-dc-display-label=/.test(rest) || /data-dc-display-label=/.test(fullMatch)) return fullMatch;
    const anchorText: string | undefined = (
      verifications[hashedKey] as { citation?: { anchorText?: string } } | undefined
    )?.citation?.anchorText;
    if (!anchorText) return fullMatch;
    // Strip inner HTML tags to get approximate visible text.
    // Loop until stable to handle nested fragments like <scr<script>ipt>.
    let visibleText = content as string;
    let prev: string;
    do {
      prev = visibleText;
      visibleText = visibleText.replace(/<[^>]+>/g, "");
    } while (visibleText !== prev);
    visibleText = visibleText.trim();
    if (!visibleText || visibleText.length > 80) return fullMatch;
    // Auto-fix if visible text does not appear inside anchorText (case-insensitive)
    if (!anchorText.toLowerCase().includes(visibleText.toLowerCase())) {
      const escaped = visibleText.replace(/"/g, "&quot;");
      autoFixLog.push(
        `  [${hashedKey.slice(0, 8)}…] displayLabel="${visibleText}" anchorText="${anchorText.slice(0, 60)}${anchorText.length > 60 ? "…" : ""}"`,
      );
      // Insert data-dc-display-label right after the opening tag name
      return fullMatch.replace(
        `data-citation-key="${hashedKey}"`,
        `data-citation-key="${hashedKey}" data-dc-display-label="${escaped}"`,
      );
    }
    return fullMatch;
  });
  if (autoFixLog.length > 0) {
    console.error(
      `Auto-set display label on ${autoFixLog.length} element(s) where visible text differs from anchorText:\n` +
        autoFixLog.join("\n"),
    );
  }

  let output = fixedHtml;

  if (output.includes("</body>")) {
    output = output.replace("</body>", () => `${snippet}\n</body>`);
  } else if (output.includes("</html>")) {
    output = output.replace("</html>", () => `${snippet}\n</html>`);
  } else {
    output = `${output}\n${snippet}`;
  }

  let outPath: string;
  if (args.out) {
    outPath = resolve(args.out);
  } else {
    const stem = basename(htmlPath, extname(htmlPath))
      .replace(/-annotated$/, "")
      .replace(/-draft$/, "");
    outPath = resolve(dirname(htmlPath), `${stem}-verified.html`);
  }
  writeVerifiedOutput(outPath, output);
}

export function showcase(argv: string[]) {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(SHOWCASE_HELP);
    return;
  }

  const args = parseArgs(argv, SHOWCASE_HELP);
  const outPath = resolve(args.out ?? ".deepcitation/cdn-comparison-showcase.html");
  const outputDir = dirname(outPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  writeFileSync(outPath, buildCdnComparisonShowcaseHtml());
  console.error(`Showcase saved to: ${outPath}`);
  console.log(outPath);
}

export function keygen(argv: string[]) {
  const args = parseArgs(argv, KEYGEN_HELP);

  const citationsPath = args.citations;
  if (!citationsPath) die("--citations is required", KEYGEN_HELP);

  const raw = JSON.parse(readFileSync(resolve(citationsPath), "utf-8")) as Record<string, unknown>;
  const citations = normalizeCitationsFile(raw);

  const mapping: Record<string, string> = {};
  const rekeyed: Record<string, Record<string, unknown>> = {};

  for (const [label, citation] of Object.entries(citations)) {
    // Cast: JSON-parsed citation record → typed Citation for hashing. Shapes match at runtime.
    const key = getCitationKey(citation as unknown as Parameters<typeof getCitationKey>[0]);
    mapping[label] = key;
    rekeyed[key] = citation;
  }

  if (args.out) {
    writeFileSync(resolve(args.out), JSON.stringify(rekeyed, null, 2));
    // Also print mapping to stderr for reference
    for (const [label, key] of Object.entries(mapping)) {
      process.stderr.write(`${label} → ${key}\n`);
    }
    console.log(resolve(args.out));
  } else {
    console.log(JSON.stringify(mapping, null, 2));
  }
}

/**
 * Scan .deepcitation/prepare-*.json files and return a map of attachmentId → { url, domain }
 * for any URL-sourced attachments. Used to populate sourceUrl in report headers,
 * set citation type to "url", and provide domain/favicon metadata for the popover.
 */
function loadUrlSourceMap(): Map<string, UrlSource> {
  const map = new Map<string, UrlSource>();
  const prepareDir = resolve(".deepcitation");
  if (!existsSync(prepareDir)) return map;
  try {
    const files = readdirSync(prepareDir).filter(f => f.startsWith("prepare-") && f.endsWith(".json"));
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(resolve(prepareDir, file), "utf-8")) as Record<string, unknown>;
        const attachmentId = data.attachmentId as string | undefined;
        const urlSource = data.urlSource as { url?: string; domain?: string } | undefined;
        if (attachmentId && urlSource?.url) {
          map.set(attachmentId, { url: urlSource.url, domain: urlSource.domain ?? "" });
        }
      } catch {
        // skip unreadable/malformed prepare files
      }
    }
  } catch {
    // skip if .deepcitation is unreadable
  }
  return map;
}

export async function verifyMarkdown(argv: string[], fmtNetErr: (err: unknown) => string) {
  const args = parseArgs(argv, VERIFY_HELP);
  const mdPath = args.markdown;
  if (!mdPath) die("--markdown is required", VERIFY_HELP);

  const resolved = resolve(mdPath);
  if (!existsSync(resolved)) die(`File not found: ${sanitizeForLog(mdPath)}`, VERIFY_HELP);

  const raw = readFileSync(resolved, "utf-8");
  const style = (args.style ?? "report") as ReportStyle;
  if (!["plain", "report"].includes(style)) die('--style must be "plain" or "report"', VERIFY_HELP);

  const audience = (args.audience ?? "general") as AudiencePreset;
  if (!AUDIENCE_PRESETS.includes(audience))
    die(`--audience must be one of: ${AUDIENCE_PRESETS.join(", ")}`, VERIFY_HELP);

  // --citations: load citation data from a separate JSON file.
  // Assemble a combined string and parse through existing parseCitationData
  // so all downstream logic (compact key expansion, hydration, validation) works unchanged.
  const citationsFlag = args.citations as string | undefined;
  let parsed: ReturnType<typeof parseCitationData>;
  if (citationsFlag) {
    const resolvedCitations = resolve(citationsFlag);
    if (!existsSync(resolvedCitations)) die(`Citations file not found: ${sanitizeForLog(citationsFlag)}`, VERIFY_HELP);
    const citationsJson = readFileSync(resolvedCitations, "utf-8");
    const combined = `${raw}\n\n${CITATION_DATA_START_DELIMITER}\n${citationsJson}\n${CITATION_DATA_END_DELIMITER}\n`;
    parsed = parseCitationData(combined);
  } else {
    parsed = parseCitationData(raw);
  }

  // Priority: <<<CITATION_DATA>>> block wins when present (agent provides
  // deterministic page_id + line_ids). Fall back to auto-gen from body markers
  // + heuristic search only when no CITATION_DATA block exists.
  if (!parsed.success || parsed.citations.length === 0) {
    const markers = extractMarkersFromBody(raw);
    if (markers.length > 0) {
      const summaryPath = args.summary ? resolve(args.summary as string) : findSummaryForMarkdown(resolved);
      if (summaryPath && existsSync(summaryPath)) {
        const summaryContent = readFileSync(summaryPath, "utf-8");
        let attachmentId = "unknown";
        try {
          attachmentId = (JSON.parse(summaryContent) as { attachmentId?: string }).attachmentId ?? "unknown";
        } catch {
          /* use "unknown" */
        }

        const lineMap = parseSummaryToLineMap(summaryContent);
        const allLines = getAllLines(lineMap);
        const citations: CitationData[] = [];

        for (const { id, displayLabel, anchorHint } of markers) {
          const searchTerm = anchorHint ?? displayLabel;
          const found = findAnchorWithFallback(searchTerm, allLines);
          if (!found) {
            console.error(`  Citation ${id} ("${displayLabel}"): not found in evidence`);
            continue;
          }
          const { lineId, pageId, verbatimAnchor } = found;
          const anchorText = anchorHint?.trim() || verbatimAnchor;
          citations.push({
            id,
            anchor_text: anchorText,
            page_id: toCompactPageId(pageId),
            line_ids: [lineId],
            attachment_id: attachmentId,
            display_label: displayLabel.toLowerCase() !== anchorText.toLowerCase() ? displayLabel : undefined,
          });
        }

        if (citations.length > 0) {
          parsed = {
            visibleText: raw,
            citations,
            citationMap: new Map(citations.map(c => [c.id, c])),
            success: true,
          };
          console.error(`Auto-generated ${citations.length} citation(s) from body markers via heuristic search`);
        }
      }
    }
  }

  if (!parsed.success || parsed.citations.length === 0) {
    die(
      "No citations found — ensure body has **bold** [N] or [label](cite:N) markers and a summary exists in .deepcitation/",
      VERIFY_HELP,
    );
  }

  // Auto-hydrate: if compact citations are detected (missing full_phrase but have line_ids),
  // fill in full_phrase from the summary file before proceeding.
  const needsHydration = parsed.citations.some(c => !c.full_phrase && c.line_ids?.length);
  if (needsHydration) {
    const summaryPath = args.summary ? resolve(args.summary as string) : findSummaryForMarkdown(resolved);
    if (summaryPath && existsSync(summaryPath)) {
      console.error(`Auto-hydrating citations from summary: ${summaryPath}`);
      try {
        const { hydrated, misses } = hydrateCitations({
          summaryContent: readFileSync(summaryPath, "utf-8"),
          citations: parsed.citations,
          warnOnMiss: true,
        });
        console.error(`  Hydrated ${hydrated} citation(s)` + (misses.length ? `; ${misses.length} miss(es)` : ""));
      } catch (err) {
        console.error(`  Warning: failed to parse summary file — ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (needsHydration) {
      console.error("Warning: citations missing full_phrase — pass --summary for auto-hydration");
    }
  }

  console.error(`Parsed ${parsed.citations.length} citation(s) from markdown.`);

  // Detect & fix line-ID-as-marker confusion: agents sometimes use evidence
  // line numbers (e.g. [40]) as [N] markers instead of sequential citation IDs.
  // When this happens, remap markers in visibleText to the correct citation IDs.
  const citationIds = new Set(parsed.citations.map(c => c.id));
  const markerIds = new Set(getCitationMarkerIds(parsed.visibleText));

  const unmatchedMarkers = [...markerIds].filter(id => !citationIds.has(id));
  if (unmatchedMarkers.length > 0) {
    // Build lineId → citationId lookup
    const lineToCtId = new Map<number, number>();
    for (const cd of parsed.citations) {
      for (const lid of cd.line_ids ?? []) lineToCtId.set(lid, cd.id);
    }
    const remap = new Map<number, number>();
    for (const markerId of unmatchedMarkers) {
      const ctId = lineToCtId.get(markerId);
      if (ctId !== undefined) remap.set(markerId, ctId);
    }
    if (remap.size > 0) {
      console.error(`Remapping ${remap.size} line-ID marker(s) to citation IDs.`);
      // Replace markers largest-first to avoid [1] matching inside [10]
      const sorted = [...remap.entries()].sort((a, b) => b[0] - a[0]);
      for (const [from, to] of sorted) {
        // Remap both old [N] and new (cite:N) formats in a single scan
        parsed.visibleText = parsed.visibleText.replace(new RegExp(`\\[${from}\\]|\\(cite:${from}\\)`, "g"), m =>
          m.startsWith("[") ? `[${to}]` : `(cite:${to})`,
        );
      }
    }
    // Strip range markers like [20-21] that can't be remapped
    parsed.visibleText = parsed.visibleText.replace(/\[\d+-\d+\]/g, "");
  }

  // Extract display labels from body: [label](cite:N) where label differs from anchorText.
  // The compact JSON only carries k (anchorText); the body label is for readers and may
  // deliberately differ (e.g. "pro rata distribution" body, "pro rata" k). Populating
  // display_label here causes verifyHtml to inject data-dc-display-label so the popover
  // can show the "Displayed as" disclaimer.
  {
    const bodyRe = /\[([^\]]+)\]\(cite:(\d+)\)/g;
    let bm: RegExpExecArray | null;
    while ((bm = safeExec(bodyRe, parsed.visibleText)) !== null) {
      const label = bm[1].trim();
      const id = parseInt(bm[2], 10);
      const cd = parsed.citations.find(c => c.id === id);
      if (cd && !cd.display_label && label.toLowerCase() !== (cd.anchor_text ?? "").toLowerCase()) {
        cd.display_label = label;
      }
    }
  }

  // Build anchor map: citation ID → anchorText, so markdownToHtml can wrap
  // just the anchor phrase instead of the whole preceding clause.
  const anchorMap: Record<string, string> = {};
  for (const cd of parsed.citations) {
    const anchor = cd.anchor_text;
    if (anchor && cd.id) anchorMap[String(cd.id)] = anchor;
  }

  const title = args.title as string | undefined;

  // Resolve source URL from prepare JSONs (URL-sourced documents only)
  const urlSourceMap = loadUrlSourceMap();
  const attachmentIds = [
    ...new Set(parsed.citations.map(cd => cd.attachment_id).filter((id): id is string => typeof id === "string")),
  ];
  const sourceUrl = attachmentIds.map(id => urlSourceMap.get(id)?.url).find(Boolean);

  const html = markdownToHtml(parsed.visibleText, {
    style,
    audience,
    title,
    anchorMap,
    citationCount: parsed.citations.length,
    cowork: IS_COWORK,
    sourceUrl,
  });

  // Re-attach citation data so verifyHtml pipeline can process it
  const citationJson = JSON.stringify(parsed.citations);
  const htmlWithCitations = `${html}\n\n${CITATION_DATA_START_DELIMITER}\n${citationJson}\n${CITATION_DATA_END_DELIMITER}`;

  // Forward to verifyHtml with pre-loaded content — no temp file needed
  const stripFlags = new Set(["--markdown", "--style", "--audience", "--title", "--citations", "--summary"]);
  const forwardArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (stripFlags.has(argv[i])) {
      // Skip the flag's value too (only if the next token is a value, not another flag).
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) i++;
      continue;
    }
    forwardArgs.push(argv[i]);
  }
  // Default output: CWD with a clean name (not alongside the draft in .deepcitation/)
  if (!args.out) {
    const stem = basename(resolved, extname(resolved));
    forwardArgs.push("--out", resolve(process.cwd(), `${stem}-verified.html`));
  }

  return verifyHtml(forwardArgs, fmtNetErr, htmlWithCitations);
}

export async function verifyHtml(argv: string[], _fmtNetErr: (err: unknown) => string, preloadedContent?: string) {
  const args = parseArgs(argv, VERIFY_HELP);
  const htmlPath = args.html;
  if (!htmlPath && !preloadedContent) die("--html is required", VERIFY_HELP);

  const { apiKey } = await requireAuth();

  const dc = await createClient(apiKey);
  // htmlPath is guaranteed set when preloadedContent is absent (die() above exits otherwise)
  const raw = preloadedContent ?? readFileSync(resolve(htmlPath ?? ""), "utf-8");

  // 1. Parse: split HTML from <<<CITATION_DATA>>> block
  const parsed = parseCitationData(raw);
  if (!parsed.success || parsed.citations.length === 0) {
    const src = preloadedContent ? "markdown" : "HTML";
    die(`No valid <<<CITATION_DATA>>> block found in the ${src} file.`, VERIFY_HELP);
  }

  const allowedFormats = ["avif", "png", "jpeg", "webp"] as const;
  const imageFormat = (args["image-format"] ?? "avif") as (typeof allowedFormats)[number];
  if (!allowedFormats.includes(imageFormat)) {
    die(`Invalid --image-format "${sanitizeForLog(imageFormat)}". Allowed: ${allowedFormats.join(", ")}`, VERIFY_HELP);
  }

  const theme = args.theme ?? "auto";
  if (!ALLOWED_THEMES.includes(theme as (typeof ALLOWED_THEMES)[number])) {
    die(`--theme must be ${ALLOWED_THEMES.join(", ")}`, VERIFY_HELP);
  }

  // CDN runtime only supports "text" variant — other variants are React-only.
  // Accept but warn if a non-text variant is requested.
  if (args.variant && args.variant !== "text") {
    console.error(
      `Warning: --variant "${sanitizeForLog(args.variant)}" is only supported in React. CDN output uses "text".`,
    );
  }

  // CDN runtime supports icon, dot, none — "caret" is React-only.
  const indicator = (args.indicator ?? "icon") as (typeof ALLOWED_INDICATORS)[number];
  if (args.indicator && !ALLOWED_INDICATORS.includes(indicator)) {
    die(
      `Invalid --indicator "${sanitizeForLog(args.indicator)}". Allowed: ${ALLOWED_INDICATORS.join(", ")}`,
      VERIFY_HELP,
    );
  }

  // 2. Convert CitationData[] → keyed CitationRecord + build id→hash map
  type CitationType = Parameters<typeof getCitationKey>[0];
  const citationRecord: Record<string, CitationType> = {};
  const idToHash = new Map<number, string>();

  for (const cd of parsed.citations) {
    const citation = citationDataToCitation(cd, cd.id);
    const hash = getCitationKey(citation);
    citationRecord[hash] = citation;
    idToHash.set(cd.id, hash);
  }

  console.error(`Parsed ${parsed.citations.length} citation(s).`);

  // 2b. Validate citation data quality — warnings only, does not block execution
  const validation = validateCitationData(parsed.citations);
  for (const err of validation.errors) {
    console.error(`Error: citation [${err.citationId}] ${err.field} — ${err.message}`);
  }
  for (const warn of validation.warnings) {
    console.error(`Warning: citation [${warn.citationId}] ${warn.field} — ${warn.message}`);
  }

  // 3. Annotate HTML: map data-cite="N" → data-citation-key="hash", strip [N] markers
  //    Also inject data-dc-display-label when display_label is provided in citation data.
  let html = parsed.visibleText;
  const keyMap: Record<string, string> = {};
  for (const [id, hash] of idToHash) {
    const cd = parsed.citations.find(c => c.id === id);
    const label = cd?.display_label;
    const replacement = label
      ? `data-citation-key="${hash}" data-dc-display-label="${label.replace(/"/g, "&quot;")}"`
      : `data-citation-key="${hash}"`;
    const dataCitePattern = new RegExp(`data-cite="${id}"`, "g");
    html = safeReplace(html, dataCitePattern, replacement);
    keyMap[`cite-${id}`] = hash;
  }

  // Strip [N] text markers only for known citation IDs (avoid removing legitimate [42] etc.)
  for (const id of idToHash.keys()) {
    html = safeReplace(html, new RegExp(`\\s*\\[${id}\\]`, "g"), "");
  }

  // Save intermediate artifacts
  const ts = Date.now();
  const outDir = resolve(".deepcitation");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const citationsPath = resolve(`.deepcitation/citations-keyed-${ts}.json`);
  const keyMapPath = resolve(`.deepcitation/key-map-${ts}.json`);
  const annotatedPath = resolve(`.deepcitation/annotated-${ts}.html`);
  const verifyResponsePath = resolve(`.deepcitation/verify-response-${ts}.json`);

  // Build citations JSON in the format verify expects (keyed by hash, with attachmentId)
  const citationsForVerify: Record<string, Record<string, unknown>> = {};
  for (const [hash, citation] of Object.entries(citationRecord)) {
    // Cast: citationRecord values are typed but verify expects Record<string, unknown>
    citationsForVerify[hash] = citation as unknown as Record<string, unknown>;
  }

  writeFileSync(citationsPath, JSON.stringify(citationsForVerify, null, 2));
  writeFileSync(keyMapPath, JSON.stringify(keyMap, null, 2));
  writeFileSync(annotatedPath, html);

  // 4. Verify all citations against the API
  const missing = Object.entries(citationsForVerify).filter(([, c]) => !(c.attachmentId as string));
  if (missing.length > 0) {
    console.error(`Warning: ${missing.length} citation(s) missing attachmentId — these will not be verified.`);
  }

  const verifiable = Object.fromEntries(Object.entries(citationsForVerify).filter(([, c]) => c.attachmentId as string));

  const groups = new Map<string, Record<string, Record<string, unknown>>>();
  for (const [key, citation] of Object.entries(verifiable)) {
    const aid = citation.attachmentId as string;
    if (!groups.has(aid)) groups.set(aid, {});
    const group = groups.get(aid);
    if (group) group[key] = citation;
  }

  console.error(`Verifying ${Object.keys(verifiable).length} citation(s) across ${groups.size} attachment(s)...`);

  const verifyStart = Date.now();
  const merged: Record<string, unknown> = {};
  const mergedAttachments: Record<string, AttachmentAssets> = {};
  for (const [attachmentId, groupCitations] of Array.from(groups.entries())) {
    const result = await dc.verifyAttachment(
      attachmentId,
      // Cast: same as verify command — JSON-parsed citations → typed CitationMap
      groupCitations as unknown as Parameters<typeof dc.verifyAttachment>[1],
      { outputImageFormat: imageFormat },
    );
    Object.assign(merged, result.verifications);
    if (result.attachments) Object.assign(mergedAttachments, result.attachments);
  }

  // Post-process: for URL-sourced documents, populate missing downloadUrl,
  // set the correct citation type ("url"), and add URL metadata so the CDN
  // renders popover headers with UrlCitationComponent (favicon + domain).
  const urlSourceMapForVerify = loadUrlSourceMap();
  for (const v of Object.values(merged) as Record<string, unknown>[]) {
    const aid = v.attachmentId as string | undefined;
    // Fix download button: CDN runtime reads `downloadUrl`; look up from attachment-level assets.
    if (!v.downloadUrl && aid) {
      const od = mergedAttachments[aid]?.originalDownload;
      if (od?.link?.url && safeTest(/^https?:\/\//i, od.link.url)) {
        v.downloadUrl = od.link.url;
      }
    }
    const urlEntry = aid ? urlSourceMapForVerify.get(aid) : undefined;
    if (urlEntry && safeTest(/^https?:\/\//i, urlEntry.url)) {
      v.label = urlEntry.url;
      v.url = {
        ...((v.url as Record<string, unknown>) ?? {}),
        verifiedUrl: urlEntry.url,
        verifiedDomain: urlEntry.domain || undefined,
      };
      v.citation = { ...((v.citation ?? {}) as Record<string, unknown>), type: "url" };
    }
  }

  const verifyOutput = { verifications: merged };
  writeFileSync(verifyResponsePath, JSON.stringify(verifyOutput, null, 2));

  const found = Object.values(merged).filter((v: unknown) => (v as Record<string, string>).status === "found").length;
  const total = Object.keys(merged).length;
  const verifyDurationMs = Date.now() - verifyStart;
  console.error(`  Verified: ${found}/${total} found`);
  if (found === 0 && total > 0) printAllNotFoundHint();

  // 5. Inject CDN runtime (same logic as inject command)
  // Re-attach pageImages in-memory only for CDN script injection below.
  const verifications = verifyOutput.verifications;
  reattachPageImages(verifications, mergedAttachments);

  const injected = injectCdnRuntime(html, verifications, keyMap, { theme, indicatorVariant: indicator });
  if (injected.hadExisting) {
    console.error("Warning: stripped existing DeepCitation injection before re-injecting.");
  }
  const output = injected.html;

  const outPath = resolve(args.out ?? `verified-${ts}.html`);
  writeVerifiedOutput(outPath, output);

  // Write run-metadata for iteration tracking (duration, counts, output path).
  // Token counts and tool-call counts are agent-level metrics captured by the
  // orchestrating session; this file captures what the CLI can measure itself.
  const metaPath = resolve(".deepcitation/run-metadata.json");
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        verify_api_duration_ms: verifyDurationMs,
        citations_total: total,
        citations_found: found,
        out_path: outPath,
      },
      null,
      2,
    ),
  );
  console.error(`Run metadata → ${metaPath}`);
}

export const AUTH_HELP = `Usage: deepcitation auth [subcommand] [options]

Authenticate with DeepCitation. With no arguments, shows your current status
or starts browser login if not yet authenticated.

Subcommands:
  logout    Remove saved credentials
  env       Print export DEEPCITATION_API_KEY=... for shell eval

Options:
  --key <key>   Save an API key directly
  --stdin       Read API key from stdin (CI/agents)
  -h, --help    Show this help message

Examples:
  deepcitation auth                   # Check status or log in
  deepcitation auth --key sk-dc-...   # Save a key directly
  deepcitation auth logout            # Remove credentials
  deepcitation auth env               # Print export line for shell eval
`;

export async function auth(argv: string[], baseUrl: string) {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(AUTH_HELP);
    return;
  }

  // Subcommands
  const [sub] = argv;
  if (sub === "logout") return logout();
  if (sub === "env") return env();

  // --key and --stdin pass through to login
  if (argv.includes("--key") || argv.includes("--stdin")) {
    return login(argv, baseUrl);
  }

  // Default: if authed → show status, else → start browser login
  const existing = resolveAuth();
  if (existing) return status();

  // Pass --browser through so login() can bypass the non-interactive guard
  // (Git Bash/mintty reports isTTY=false even for interactive terminals).
  const loginFlags = argv.includes("--browser") ? ["--browser"] : [];
  return login(loginFlags, baseUrl);
}

export async function login(argv: string[], baseUrl: string) {
  // --stdin: read key from stdin (avoids key appearing in shell history)
  if (argv.includes("--stdin")) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const key = extractApiKey(Buffer.concat(chunks).toString());
    if (!key) die("Invalid API key format (stdin). Keys start with 'sk-dc-' and are at least 20 characters.", HELP);
    saveApiKey(key, "stdin");
    return;
  }

  const keyIdx = argv.indexOf("--key");
  if (keyIdx !== -1) {
    if (keyIdx + 1 >= argv.length) die("--key requires a value", HELP);
    saveApiKey(argv[keyIdx + 1], "--key flag");
    return;
  }

  const existing = resolveAuth();
  if (existing) {
    status();
    return;
  }

  // Non-interactive (piped stdin, AI agent, CI) — browser OAuth won't work
  // unless --browser is explicitly passed to force the flow.
  // Git Bash (mintty) on Windows reports isTTY=false even for interactive
  // terminals, so also check for MSYSTEM (set in MINGW32/MINGW64/UCRT64).
  const isInteractive = process.stdin.isTTY || !!process.env.MSYSTEM;
  if (!isInteractive && !argv.includes("--browser")) {
    const manualUrl = `${baseUrl}/cli-auth?manual=true`;
    if (IS_COWORK) {
      console.error("Claude Cowork (cloud session) detected. To set up DeepCitation:\n");
      console.error("1. Add *.deepcitation.com to allowed domains:");
      console.error("   https://claude.ai/settings/capabilities");
      console.error('   → Under "Additional allowed domains", add *.deepcitation.com and press Add.\n');
      console.error("2. Get an API key:");
      console.error(`   ${manualUrl}\n`);
      console.error("3. Save the key — set DEEPCITATION_API_KEY in your Cowork environment settings.");
      console.error("   This persists across sessions automatically.");
      console.error("   Or for this session only: npx deepcitation auth --key <your-key>");
    } else {
      console.error("Non-interactive environment detected (no TTY).\n");
      console.error(`1. Get your API key: ${manualUrl}`);
      console.error("2. Run: npx deepcitation auth --key '<your-key>'");
      console.error("   (This saves the key so all future commands just work.)");
      console.error('   Or: export DEEPCITATION_API_KEY="<your-key>"  (env var for this session)');
      console.error("   Or: npx deepcitation auth  (opens browser for OAuth)");
    }
    process.exit(1);
  }

  const nonce = generateNonce();
  const { port, result, cancel } = await startCallbackServer(nonce);

  const url = `${baseUrl}/cli-auth?port=${port}&nonce=${nonce}`;

  console.error("Opening browser to log in...");
  console.error(`If the browser doesn't open, visit:\n  ${url}\n`);
  openBrowser(url);

  console.error("Waiting for browser authentication...");
  console.error("Your key may be sent automatically. If not, copy it from the browser and paste it here:");

  // Race browser callback vs key pasted directly into the terminal.
  // Creating the readline interface also puts stdin into flowing mode,
  // which prevents any typed characters from leaking into the shell
  // after this process exits (Error 3 fix).
  const { promise: stdinKey, close: closeStdin } = readKeyFromStdin();

  try {
    const winner = await new Promise<{ from: "browser"; payload: CallbackPayload } | { from: "stdin"; key: string }>(
      (resolve, reject) => {
        result.then(
          payload => {
            closeStdin();
            resolve({ from: "browser", payload });
          },
          err => {
            closeStdin();
            reject(err);
          },
        );
        stdinKey.then(key => {
          if (key) {
            cancel();
            resolve({ from: "stdin", key });
          }
          // null means stdin closed without a valid key — keep waiting for browser
        });
      },
    );

    if (winner.from === "browser") {
      writeCredentials({
        version: 1,
        apiKey: winner.payload.apiKey,
        email: winner.payload.email,
        displayName: winner.payload.displayName,
        createdAt: new Date().toISOString(),
      });
      console.error(`\nLogged in as ${sanitizeForLog(winner.payload.displayName ?? winner.payload.email ?? "unknown")}.`);
      console.error(`Credentials saved to ${CREDENTIALS_PATH}`);
      console.error(`\nYou're all set! The DeepCitation CLI will use this key automatically.`);
      process.stdin.destroy();
    } else {
      saveApiKey(winner.key, "terminal paste");
      process.stdin.destroy();
    }
  } catch (err) {
    if ((err as Error).message === "Login cancelled") return;
    console.error(`\nLogin failed: ${err instanceof Error ? err.message : err}`);
    console.error(`\nYou can also log in manually at: ${baseUrl}/cli-auth?manual=true`);
    process.exit(1);
  }
}

export function logout() {
  const auth = resolveAuth();
  if (!auth) {
    console.log("No saved credentials found.");
    return;
  }
  switch (auth.source.kind) {
    case "credentials":
      if (deleteCredentials()) console.log(`Logged out. Credentials removed from ${CREDENTIALS_PATH}`);
      break;
    case "dotenv":
      console.log(`API key is stored in ${auth.source.path}.`);
      console.log("Remove the DEEPCITATION_API_KEY line from that file to log out.");
      // Also clean up credentials.json if it exists
      deleteCredentials();
      break;
    case "env-var":
      console.log("API key is set via the DEEPCITATION_API_KEY environment variable.");
      console.log("Unset it to log out: unset DEEPCITATION_API_KEY");
      deleteCredentials();
      break;
  }
}

export function whoami() {
  const auth = resolveAuth();
  if (!auth) {
    console.log('Not logged in. Run "npx deepcitation auth" to get started.');
    process.exit(1);
  }
  if (auth.credentials?.displayName) console.log(`Name:   ${sanitizeForLog(auth.credentials.displayName)}`);
  if (auth.credentials?.email) console.log(`Email:  ${sanitizeForLog(auth.credentials.email)}`);
  console.log(`Key:    ${maskKey(auth.apiKey)}`);
  console.log(`Source: ${sourceLabel(auth.source)}`);
}

export function env() {
  const auth = resolveAuth();
  if (!auth) {
    process.stderr.write('Not logged in. Run "npx deepcitation auth" first.\n');
    process.exit(1);
  }
  if (!isValidApiKeyFormat(auth.apiKey)) {
    process.stderr.write('Saved API key has an unexpected format. Run "npx deepcitation auth" again.\n');
    process.exit(1);
  }
  // stdout only — safe for eval "$(deepcitation env)"
  process.stdout.write(`export DEEPCITATION_API_KEY="${auth.apiKey}"\n`);
}

export function status() {
  const auth = resolveAuth();
  if (auth) {
    const parts = [`Authenticated (${maskKey(auth.apiKey)})`];
    parts.push(`Source: ${sourceLabel(auth.source)}`);
    if (auth.credentials?.email) parts.push(`Email: ${sanitizeForLog(auth.credentials.email)}`);
    console.log(parts.join("\n"));
    process.exit(0);
  } else {
    console.log('Not logged in. Run "npx deepcitation auth" or set DEEPCITATION_API_KEY.');
    process.exit(1);
  }
}

export async function openBillingDashboard(billingUrl: string) {
  console.error(`Opening billing dashboard: ${billingUrl}`);
  console.error(`\nHere you can:`);
  console.error(`  • Add a credit card to unlock usage beyond the free tier`);
  console.error(`  • Set a custom monthly spend cap for cost control`);
  console.error(`  • View your usage breakdown and billing history`);
  if (!process.env.DC_NO_BROWSER) await openBrowser(billingUrl);
}

export async function getAttachment(argv: string[]) {
  const deepText = argv.includes("--deep-text");
  const pageTexts = argv.includes("--page-texts");
  const filteredArgv = argv.filter(a => a !== "--deep-text" && a !== "--page-texts");

  const args = parseArgs(filteredArgv, GET_HELP);

  // Find the first positional arg (not a flag, not the value of a key-value flag).
  // Only flags that take a value are listed here — boolean flags were stripped above.
  const KEY_VALUE_FLAGS = new Set(["--out"]);
  let positional: string | undefined;
  for (let i = 0; i < filteredArgv.length; i++) {
    if (filteredArgv[i].startsWith("--")) {
      if (KEY_VALUE_FLAGS.has(filteredArgv[i])) i++; // skip this flag's value
      continue;
    }
    positional = filteredArgv[i];
    break;
  }
  if (!positional) die("An attachment ID is required", GET_HELP);

  const { apiKey } = await requireAuth();

  const dc = await createClient(apiKey);

  console.error(`Fetching attachment ${sanitizeForLog(positional)}...`);
  const result = await dc.getAttachment(positional);

  // Strip large fields unless requested
  const output: Record<string, unknown> = { ...result };
  if (!deepText) {
    delete output.deepTextPages;
  }
  if (!pageTexts) delete output.pageTexts;

  const json = JSON.stringify(output, null, 2);

  if (args.out) {
    const outPath = resolve(args.out);
    const outDir = dirname(outPath);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, json);
    console.error(`  Status: ${result.status}`);
    console.error(`  Pages: ${result.pageCount}`);
    console.error(`  Verifications: ${Object.keys(result.verifications).length}`);
    if (result.deepTextItems) {
      console.error(`  DeepTextItems pages: ${Object.keys(result.deepTextItems).length}`);
    }
    console.error(`  Saved: ${outPath}`);
    console.log(outPath);
  } else {
    process.stdout.write(json + "\n");
  }
}
