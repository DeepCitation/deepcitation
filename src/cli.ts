#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { connect as tlsConnect } from "node:tls";
import {
  CREDENTIALS_PATH,
  deleteCredentials,
  generateNonce,
  openBrowser,
  readCredentials,
  startCallbackServer,
  writeCredentials,
} from "./auth.js";
import { AUDIENCE_PRESETS, type AudiencePreset, markdownToHtml, type ReportStyle } from "./cli/markdownToHtml.js";
import { DeepCitation } from "./client/DeepCitation.js";
import { citationDataToCitation, parseCitationData } from "./parsing/citationParser.js";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER } from "./prompts/citationPrompts.js";
import { getCitationKey } from "./utils/citationKey.js";
import { sanitizeForLog } from "./utils/logSafety.js";
import { normalizeCitationsFile } from "./utils/normalizeCitations.js";
import { decodeChunked, detectProxyUrl } from "./utils/proxy.js";
import { validateCitationData } from "./utils/validateCitationData.js";
import { CDN_JS } from "./vanilla/_generated_cdn.js";
import { escapeJsForScript, escapeJsonForScript, stripExistingInjection } from "./vanilla/reportUtils.js";

// ── proxy support ──────────────────────────────────────────────────

/**
 * Create a proxy-aware fetch that tunnels HTTPS through an HTTP CONNECT proxy.
 * Uses only Node.js built-in modules (no external dependencies).
 */
function createProxyFetch(proxyUrl: string): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const proxy = new URL(proxyUrl);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const targetHost = url.hostname;
    const targetPort = url.port || (url.protocol === "https:" ? "443" : "80");

    if (url.protocol !== "https:") {
      // For non-HTTPS, just use global fetch (proxy env var may work for plain HTTP)
      return globalThis.fetch(input, init);
    }

    // Establish CONNECT tunnel through the proxy
    const socket = await new Promise<import("node:net").Socket>((res, rej) => {
      const req = httpRequest({
        host: proxy.hostname,
        port: Number(proxy.port) || 3128,
        method: "CONNECT",
        path: `${targetHost}:${targetPort}`,
      });
      req.on("connect", (_res, socket) => {
        if (_res.statusCode === 200) {
          res(socket);
        } else {
          socket.destroy();
          rej(new Error(`Proxy CONNECT failed with status ${_res.statusCode}`));
        }
      });
      req.on("error", rej);
      req.end();
    });

    // Upgrade to TLS over the tunnel
    const tlsSocket = tlsConnect({ socket, servername: targetHost });
    await new Promise<void>((res, rej) => {
      tlsSocket.on("secureConnect", res);
      tlsSocket.on("error", err => {
        socket.destroy();
        rej(err);
      });
    });

    // Build raw HTTP request over TLS tunnel
    const method = (init?.method ?? "GET").replace(/[\r\n]/g, "");
    const headers = new Headers(init?.headers);
    if (!headers.has("host")) headers.set("host", targetHost);

    let bodyBuffer: Buffer | undefined;
    if (init?.body) {
      if (init.body instanceof ArrayBuffer) {
        bodyBuffer = Buffer.from(init.body);
      } else if (Buffer.isBuffer(init.body)) {
        bodyBuffer = init.body;
      } else if (typeof init.body === "string") {
        bodyBuffer = Buffer.from(init.body);
      } else if (init.body instanceof FormData) {
        // For FormData, fall back to undici or global fetch with dispatcher.
        // Clean up the TLS socket we already opened — sendViaUndiciProxy creates its own connection.
        tlsSocket.destroy();
        return sendViaUndiciProxy(proxyUrl, input, init);
      } else {
        // ReadableStream or other — collect into buffer
        const chunks: Uint8Array[] = [];
        const reader = (init.body as ReadableStream<Uint8Array>).getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        bodyBuffer = Buffer.concat(chunks);
      }
    }

    if (bodyBuffer && !headers.has("content-length")) {
      headers.set("content-length", String(bodyBuffer.byteLength));
    }

    // Serialize request
    let head = `${method} ${url.pathname}${url.search} HTTP/1.1\r\n`;
    headers.forEach((v, k) => {
      head += `${k}: ${v}\r\n`;
    });
    head += "\r\n";

    tlsSocket.write(head);
    if (bodyBuffer) tlsSocket.write(bodyBuffer);

    // Parse response — keep body as Buffer to avoid corrupting binary data
    return new Promise<Response>((res, rej) => {
      const chunks: Buffer[] = [];
      tlsSocket.on("data", (chunk: Buffer) => chunks.push(chunk));
      tlsSocket.on("end", () => {
        const raw = Buffer.concat(chunks);
        const separator = Buffer.from("\r\n\r\n");
        const headerEnd = raw.indexOf(separator);
        if (headerEnd === -1) {
          rej(new Error("Invalid HTTP response from proxy tunnel"));
          return;
        }
        const headerSection = raw.subarray(0, headerEnd).toString("ascii");
        const bodyBuf = raw.subarray(headerEnd + 4);
        const [statusLine, ...headerLines] = headerSection.split("\r\n");
        const statusMatch = statusLine.match(/^HTTP\/[\d.]+ (\d+)/);
        const status = statusMatch ? Number(statusMatch[1]) : 0;
        const responseHeaders = new Headers();
        for (const line of headerLines) {
          const sep = line.indexOf(":");
          if (sep > 0) responseHeaders.append(line.slice(0, sep).trim(), line.slice(sep + 1).trim());
        }

        // Handle chunked transfer encoding
        const responseBody = responseHeaders.get("transfer-encoding")?.includes("chunked")
          ? decodeChunked(bodyBuf)
          : bodyBuf;

        // Pass ArrayBuffer (BodyInit-compatible) to avoid corrupting binary responses
        const ab = responseBody.buffer.slice(
          responseBody.byteOffset,
          responseBody.byteOffset + responseBody.byteLength,
        ) as ArrayBuffer;
        res(new Response(ab, { status, headers: responseHeaders }));
        tlsSocket.destroy();
      });
      tlsSocket.on("error", err => {
        tlsSocket.destroy();
        rej(err);
      });
    });
  };
}

/**
 * FormData proxy fallback: try undici ProxyAgent (available in Node 22+),
 * or fall back to global fetch if undici isn't importable.
 */
async function sendViaUndiciProxy(proxyUrl: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undici = await import(/* webpackIgnore: true */ "undici" as string);
    const agent = new undici.ProxyAgent(proxyUrl);
    return await globalThis.fetch(input, { ...init, dispatcher: agent } as RequestInit);
  } catch {
    // undici not available — warn and try direct
    console.error("Warning: FormData upload through proxy requires the 'undici' package. Trying direct connection...");
    return globalThis.fetch(input, init);
  }
}

const HELP = `deepcitation CLI

Commands:
  login     Log in to DeepCitation (browser flow, --key <key>, --stdin, or DEEPCITATION_API_KEY)
  logout    Remove saved credentials
  whoami    Show the currently logged-in user
  status    Check auth status (exit 0 if logged in, exit 1 if not — no output)
  env       Print export DEEPCITATION_API_KEY=... for shell eval
  prepare   Prepare a file or URL for citation verification
  verify    Verify citations (--markdown, --html, or --citations)
  inject    Inject DeepCitation verification into an existing HTML file
  keygen    Compute deterministic citation keys from a citations JSON file

Run "deepcitation <command> --help" for command-specific options.
`;

const INJECT_HELP = `Usage: deepcitation inject [options]

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

function die(msg: string, help: string): never {
  console.error(`Error: ${msg}\n\n${help}`);
  process.exit(1);
}

function parseArgs(argv: string[], help: string): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "-h" || key === "--help") {
      console.log(help);
      process.exit(0);
    }
    if (key?.startsWith("--") && i + 1 < argv.length) {
      args[key.slice(2)] = argv[++i] as string;
    }
  }
  return args;
}

const DEFAULT_API_URL = "https://api.deepcitation.com";

/** Create a DeepCitation client with automatic proxy detection. */
function createClient(apiKey: string): DeepCitation {
  const proxyUrl = detectProxyUrl(DEFAULT_API_URL);

  if (proxyUrl) {
    // Redact user:password@ from proxy URL before logging
    const safeProxy = sanitizeForLog(proxyUrl.replace(/\/\/[^@]+@/, "//***@"));
    console.error(`Using proxy: ${safeProxy}`);
    return new DeepCitation({ apiKey, fetch: createProxyFetch(proxyUrl) });
  }

  return new DeepCitation({ apiKey });
}

/** Wrap a network error with actionable hints for the CLI user. */
function formatNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("fetch failed") || msg.includes("ENOTFOUND") || msg.includes("EAI_AGAIN")) {
    const proxyHint =
      process.env.HTTPS_PROXY || process.env.HTTP_PROXY
        ? " Proxy is set but may not be working — check HTTPS_PROXY."
        : " If behind a proxy, set HTTPS_PROXY=http://your-proxy:port";
    return `Network error: ${msg}.${proxyHint}`;
  }
  return msg;
}

// ── prepare ─────────────────────────────────────────────────────────

const PREPARE_HELP = `Usage: deepcitation prepare <file-or-url> [options]

Prepare a file or URL for citation verification. Uploads the source to the
DeepCitation API and saves the response JSON (attachmentId + deepTextPromptPortion).

Arguments:
  <file-or-url>             Local file path or URL to prepare

Options:
  --out <file>              Output JSON path (default: .deepcitation/prepare-{name}.json)
  --summary                 Print attachmentId and deepTextPromptPortion to stdout
  --unsafe-fast             Use fast mode for URLs (skips rendering, vulnerable to hidden text)
  -h, --help                Show this help message

Examples:
  deepcitation prepare report.pdf
  deepcitation prepare report.pdf --summary
  deepcitation prepare https://example.com/article --out .deepcitation/prepare-article.json
  deepcitation prepare scan.jpg
`;

async function prepare(argv: string[]) {
  // Extract boolean flags before parseArgs (which only handles --key value pairs)
  const unsafeFast = argv.includes("--unsafe-fast");
  const summary = argv.includes("--summary");
  const filteredArgv = argv.filter(a => a !== "--unsafe-fast" && a !== "--summary");

  const args = parseArgs(filteredArgv, PREPARE_HELP);

  // The positional argument is the first non-flag arg
  const positional = filteredArgv.find(a => !a.startsWith("--"));
  if (!positional) die("A file path or URL is required", PREPARE_HELP);

  const apiKey = process.env.DEEPCITATION_API_KEY ?? readCredentials()?.apiKey;
  if (!apiKey) die('DEEPCITATION_API_KEY not set. Run "deepcitation login" or set the env var.', PREPARE_HELP);

  const dc = createClient(apiKey);

  const isUrl = positional.startsWith("http://") || positional.startsWith("https://");

  if (isUrl && positional.startsWith("http://") && !positional.startsWith("http://localhost")) {
    console.error("Warning: using http:// URL — content will be fetched over plaintext.");
  }

  let result;
  let label: string;

  if (isUrl) {
    label = new URL(positional).hostname.replace(/^www\./, "");
    console.error(unsafeFast ? `Preparing URL (fast mode)...` : `Preparing URL (this may take ~30s)...`);
    result = await dc.prepareUrl({ url: positional, unsafeFastUrlOutput: unsafeFast });
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

  if (summary) {
    // Print attachmentId and deepTextPromptPortion to stdout so agents
    // can consume them directly from bash output (no extra Read call)
    console.log(`ATTACHMENT_ID=${result.attachmentId}`);
    console.log("--- DEEP_TEXT_PROMPT_PORTION ---");
    console.log(result.deepTextPromptPortion);
    console.log("--- END_DEEP_TEXT_PROMPT_PORTION ---");
  } else {
    console.log(outPath);
  }
}

// ── verify ──────────────────────────────────────────────────────────

const VERIFY_HELP = `Usage: deepcitation verify [options]

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
  --out <file>              Output path (default depends on mode)
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

async function verify(argv: string[]) {
  // Handle --prompt before parseArgs (it's a boolean flag, not a key-value pair)
  if (argv.includes("--prompt")) {
    const require = createRequire(import.meta.url);
    const dcRoot = dirname(require.resolve("deepcitation/package.json"));
    const specPath = resolve(dcRoot, "docs/prompts/citation-format.md");
    if (!existsSync(specPath)) {
      console.error(
        `Error: Citation format spec not found at ${specPath}\n` +
          `Expected location: <deepcitation-package>/docs/prompts/citation-format.md\n` +
          `Make sure the deepcitation package is installed with its docs directory.`,
      );
      process.exit(1);
    }
    process.stdout.write(readFileSync(specPath, "utf-8"));
    return;
  }

  const args = parseArgs(argv, VERIFY_HELP);

  // Dispatch to markdown mode if --markdown is provided
  if (args.markdown) {
    return verifyMarkdown(argv);
  }

  // Dispatch to one-shot HTML mode if --html is provided
  if (args.html) {
    return verifyHtml(argv);
  }

  const citationsPath = args.citations;
  if (!citationsPath) die("--html or --citations is required", VERIFY_HELP);

  const apiKey = process.env.DEEPCITATION_API_KEY ?? readCredentials()?.apiKey;
  if (!apiKey) die('DEEPCITATION_API_KEY not set. Run "deepcitation login" or set the env var.', VERIFY_HELP);

  const dc = createClient(apiKey);

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
  console.log(outPath);
}

// ── inject ──────────────────────────────────────────────────────────

function inject(argv: string[]) {
  const args = parseArgs(argv, INJECT_HELP);

  const htmlPath = args.html;
  const verifyResponsePath = args["verify-response"];
  if (!htmlPath) die("--html is required", INJECT_HELP);
  if (!verifyResponsePath) die("--verify-response is required", INJECT_HELP);

  const html = readFileSync(resolve(htmlPath), "utf-8");
  const verifyResponse = JSON.parse(readFileSync(resolve(verifyResponsePath), "utf-8"));

  const verifications = verifyResponse.verifications ?? verifyResponse;
  const jsonData = escapeJsonForScript(JSON.stringify(verifications));
  const theme = args.theme ?? "auto";
  if (!["auto", "light", "dark"].includes(theme)) die("--theme must be auto, light, or dark", INJECT_HELP);

  // Indicator variant: icon (default), dot, or none
  const allowedIndicators = ["icon", "dot", "none"] as const;
  const indicator = (args.indicator ?? "icon") as (typeof allowedIndicators)[number];
  if (args.indicator && !allowedIndicators.includes(indicator)) {
    die(
      `Invalid --indicator "${sanitizeForLog(args.indicator)}". Allowed: ${allowedIndicators.join(", ")}`,
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
  let output = stripped.html;

  if (output.includes("</body>")) {
    output = output.replace("</body>", () => `${snippet}\n</body>`);
  } else if (output.includes("</html>")) {
    output = output.replace("</html>", () => `${snippet}\n</html>`);
  } else {
    output = `${output}\n${snippet}`;
  }

  const outPath = resolve(args.out ?? htmlPath);
  writeFileSync(outPath, output);
  console.log(outPath);
}

// ── keygen ─────────────────────────────────────────────────────────

const KEYGEN_HELP = `Usage: deepcitation keygen [options]

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

function keygen(argv: string[]) {
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

// ── verify --markdown (one-shot from markdown) ───────────────────

async function verifyMarkdown(argv: string[]) {
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

  const parsed = parseCitationData(raw);
  if (!parsed.success || parsed.citations.length === 0) {
    die("No valid <<<CITATION_DATA>>> block found in the markdown file.", VERIFY_HELP);
  }

  console.error(`Parsed ${parsed.citations.length} citation(s) from markdown.`);

  const html = markdownToHtml(parsed.visibleText, { style, audience });

  // Re-attach citation data so verifyHtml pipeline can process it
  const citationJson = JSON.stringify(parsed.citations);
  const htmlWithCitations = `${html}\n\n${CITATION_DATA_START_DELIMITER}\n${citationJson}\n${CITATION_DATA_END_DELIMITER}`;

  const ts = Date.now();
  const outDir = resolve(".deepcitation");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const tempHtmlPath = resolve(`.deepcitation/draft-${ts}.html`);
  writeFileSync(tempHtmlPath, htmlWithCitations);

  // Forward to verifyHtml with the converted HTML — strip markdown-only flags
  const stripFlags = new Set(["--markdown", "--style", "--audience"]);
  const forwardArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (stripFlags.has(argv[i])) {
      i++; // skip the flag's value too
      continue;
    }
    forwardArgs.push(argv[i]);
  }
  forwardArgs.push("--html", tempHtmlPath);

  // Set default output name if not specified
  if (!args.out) {
    forwardArgs.push("--out", `.deepcitation/verified-${ts}.html`);
  }

  try {
    return await verifyHtml(forwardArgs);
  } finally {
    try {
      unlinkSync(tempHtmlPath);
    } catch {}
  }
}

// ── verify --html (one-shot) ──────────────────────────────────────

async function verifyHtml(argv: string[]) {
  const args = parseArgs(argv, VERIFY_HELP);
  const htmlPath = args.html;
  if (!htmlPath) die("--html is required", VERIFY_HELP);

  const apiKey = process.env.DEEPCITATION_API_KEY ?? readCredentials()?.apiKey;
  if (!apiKey) die('Not authenticated. Run "deepcitation login" first.', VERIFY_HELP);

  const dc = createClient(apiKey);
  const raw = readFileSync(resolve(htmlPath), "utf-8");

  // 1. Parse: split HTML from <<<CITATION_DATA>>> block
  const parsed = parseCitationData(raw);
  if (!parsed.success || parsed.citations.length === 0) {
    die("No valid <<<CITATION_DATA>>> block found in the HTML file.", VERIFY_HELP);
  }

  const allowedFormats = ["avif", "png", "jpeg", "webp"] as const;
  const imageFormat = (args["image-format"] ?? "avif") as (typeof allowedFormats)[number];
  if (!allowedFormats.includes(imageFormat)) {
    die(`Invalid --image-format "${sanitizeForLog(imageFormat)}". Allowed: ${allowedFormats.join(", ")}`, VERIFY_HELP);
  }

  const theme = args.theme ?? "auto";
  if (!["auto", "light", "dark"].includes(theme)) die("--theme must be auto, light, or dark", VERIFY_HELP);

  // CDN runtime only supports "text" variant — other variants are React-only.
  // Accept but warn if a non-text variant is requested.
  if (args.variant && args.variant !== "text") {
    console.error(
      `Warning: --variant "${sanitizeForLog(args.variant)}" is only supported in React. CDN output uses "text".`,
    );
  }

  // CDN runtime supports icon, dot, none — "caret" is React-only.
  const allowedIndicators = ["icon", "dot", "none"] as const;
  const indicator = (args.indicator ?? "icon") as (typeof allowedIndicators)[number];
  if (args.indicator && !allowedIndicators.includes(indicator)) {
    die(
      `Invalid --indicator "${sanitizeForLog(args.indicator)}". Allowed: ${allowedIndicators.join(", ")}`,
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
  let html = parsed.visibleText;
  const keyMap: Record<string, string> = {};

  for (const [id, hash] of idToHash) {
    const dataCitePattern = new RegExp(`data-cite="${id}"`, "g");
    html = html.replace(dataCitePattern, `data-citation-key="${hash}"`);
    keyMap[`cite-${id}`] = hash;
  }

  // Strip [N] text markers only for known citation IDs (avoid removing legitimate [42] etc.)
  for (const id of idToHash.keys()) {
    html = html.replace(new RegExp(`\\s*\\[${id}\\]`, "g"), "");
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

  const merged: Record<string, unknown> = {};
  for (const [attachmentId, groupCitations] of Array.from(groups.entries())) {
    const result = await dc.verifyAttachment(
      attachmentId,
      // Cast: same as verify command — JSON-parsed citations → typed CitationMap
      groupCitations as unknown as Parameters<typeof dc.verifyAttachment>[1],
      { outputImageFormat: imageFormat },
    );
    Object.assign(merged, result.verifications);
  }

  const verifyOutput = { verifications: merged };
  writeFileSync(verifyResponsePath, JSON.stringify(verifyOutput, null, 2));

  const found = Object.values(merged).filter((v: unknown) => (v as Record<string, string>).status === "found").length;
  const total = Object.keys(merged).length;
  console.error(`  Verified: ${found}/${total} found`);

  // 5. Inject CDN runtime (same logic as inject command)
  const verifications = verifyOutput.verifications;
  const jsonData = escapeJsonForScript(JSON.stringify(verifications));
  const keyMapSnippet = `<script type="application/json" id="dc-key-map">${escapeJsonForScript(JSON.stringify(keyMap))}</script>`;

  const snippet = [
    `<script type="application/json" id="dc-data">${jsonData}</script>`,
    keyMapSnippet,
    `<script>${escapeJsForScript(CDN_JS)}</script>`,
    `<script>window.DeepCitationPopover&&window.DeepCitationPopover.init({${[`theme:${JSON.stringify(theme)}`, ...(indicator !== "icon" ? [`indicatorVariant:${JSON.stringify(indicator)}`] : [])].join(",")}});</script>`,
  ].join("\n");

  // Strip existing injection to prevent duplicate CDN bundles
  const stripped = stripExistingInjection(html);
  if (stripped.hadExisting) {
    console.error("Warning: stripped existing DeepCitation injection before re-injecting.");
  }
  let output = stripped.html;

  if (output.includes("</body>")) {
    output = output.replace("</body>", () => `${snippet}\n</body>`);
  } else if (output.includes("</html>")) {
    output = output.replace("</html>", () => `${snippet}\n</html>`);
  } else {
    output = `${output}\n${snippet}`;
  }

  const outPath = resolve(args.out ?? `.deepcitation/verified-${ts}.html`);
  writeFileSync(outPath, output);
  console.log(outPath);
}

// ── login ─────────────────────────────────────────────────────────

const BASE_URL = process.env.DC_LOGIN_URL || "https://deepcitation.com";

function saveApiKey(key: string, source: string): void {
  if (!key || !key.startsWith("sk-dc-") || key.length < 20) {
    die(
      `Invalid API key format${source ? ` (${source})` : ""}. Keys start with 'sk-dc-' and are at least 20 characters.`,
      HELP,
    );
  }
  writeCredentials({ version: 1, apiKey: key, createdAt: new Date().toISOString() });
  console.log(`Credentials saved to ${CREDENTIALS_PATH}`);
}

async function login(argv: string[]) {
  // --stdin: read key from stdin (avoids key appearing in shell history)
  if (argv.includes("--stdin")) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const key = Buffer.concat(chunks).toString().trim();
    saveApiKey(key, "stdin");
    return;
  }

  const keyIdx = argv.indexOf("--key");
  if (keyIdx !== -1) {
    if (keyIdx + 1 >= argv.length) die("--key requires a value", HELP);
    saveApiKey(argv[keyIdx + 1], "--key flag");
    return;
  }

  const envKey = process.env.DEEPCITATION_API_KEY;
  if (envKey) {
    saveApiKey(envKey, "DEEPCITATION_API_KEY");
    return;
  }

  const existing = readCredentials();
  if (existing) {
    console.log(`Already logged in as ${sanitizeForLog(existing.email ?? "unknown")}.`);
    console.log('Run "deepcitation logout" first to switch accounts.');
    return;
  }

  const nonce = generateNonce();
  const { port, result } = await startCallbackServer(nonce);

  const url = `${BASE_URL}/cli-auth?port=${port}&nonce=${nonce}`;

  console.log("Opening browser to log in...");
  console.log(`If the browser doesn't open, visit:\n  ${url}\n`);
  openBrowser(url);

  console.log("Waiting for authentication...");

  try {
    const payload = await result;
    writeCredentials({
      version: 1,
      apiKey: payload.apiKey,
      email: payload.email,
      displayName: payload.displayName,
      createdAt: new Date().toISOString(),
    });

    console.log(`\nLogged in as ${sanitizeForLog(payload.displayName ?? payload.email ?? "unknown")}.`);
    console.log(`Credentials saved to ${CREDENTIALS_PATH}`);
    console.log(`\nYou're all set! The DeepCitation CLI will use this key automatically.`);
  } catch (err) {
    console.error(`\nLogin failed: ${err instanceof Error ? err.message : err}`);
    console.error(`\nYou can also log in manually at: ${BASE_URL}/cli-auth?manual=true`);
    process.exit(1);
  }
}

function logout() {
  if (deleteCredentials()) {
    console.log(`Logged out. Credentials removed from ${CREDENTIALS_PATH}`);
  } else {
    console.log("No saved credentials found.");
  }
}

function whoami() {
  const creds = readCredentials();
  if (!creds) {
    console.log('Not logged in. Run "deepcitation login" to get started.');
    process.exit(1);
  }
  if (creds.displayName) console.log(`Name:   ${sanitizeForLog(creds.displayName)}`);
  if (creds.email) console.log(`Email:  ${sanitizeForLog(creds.email)}`);
  console.log(`Status: Authenticated`);
}

function env() {
  // If already set in the environment, pass it through (no-op for eval)
  const existing = process.env.DEEPCITATION_API_KEY;
  if (existing && /^sk-dc-[A-Za-z0-9]+$/.test(existing)) {
    process.stdout.write(`export DEEPCITATION_API_KEY="${existing}"\n`);
    return;
  }

  const creds = readCredentials();
  if (!creds) {
    process.stderr.write('Not logged in. Run "npx deepcitation login" first.\n');
    process.exit(1);
  }
  // Validate key format before writing into a shell eval context
  if (!/^sk-dc-[A-Za-z0-9]+$/.test(creds.apiKey)) {
    process.stderr.write('Saved API key has an unexpected format. Run "npx deepcitation login" again.\n');
    process.exit(1);
  }
  // stdout only — safe for eval "$(deepcitation env)"
  process.stdout.write(`export DEEPCITATION_API_KEY="${creds.apiKey}"\n`);
}

// ── main ────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "-h" || command === "--help") {
  console.log(HELP);
  process.exit(0);
}

switch (command) {
  case "prepare":
    prepare(rest).catch(err => {
      console.error(`Error: ${formatNetworkError(err)}`);
      process.exit(1);
    });
    break;
  case "verify":
    verify(rest).catch(err => {
      console.error(`Error: ${formatNetworkError(err)}`);
      process.exit(1);
    });
    break;
  case "cite":
    // "cite" is an alias for "verify --html" for backwards compatibility
    verify(["--html", ...rest]).catch(err => {
      console.error(`Error: ${formatNetworkError(err)}`);
      process.exit(1);
    });
    break;
  case "inject":
    inject(rest);
    break;
  case "keygen":
    keygen(rest);
    break;
  case "login":
    login(rest);
    break;
  case "logout":
    logout();
    break;
  case "whoami":
    whoami();
    break;
  case "status":
    process.exit(readCredentials() ? 0 : 1);
    break;
  case "env":
    env();
    break;
  default:
    die(`Unknown command: ${command}`, HELP);
}
