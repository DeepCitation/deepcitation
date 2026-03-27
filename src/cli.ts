#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  CREDENTIALS_PATH,
  deleteCredentials,
  generateNonce,
  maskKey,
  openBrowser,
  readCredentials,
  startCallbackServer,
  writeCredentials,
} from "./auth.js";
import { DeepCitation } from "./client/DeepCitation.js";
import { getCitationKey } from "./utils/citationKey.js";
import { sanitizeForLog } from "./utils/logSafety.js";
import { CDN_JS } from "./vanilla/_generated_cdn.js";
import { escapeJsForScript, escapeJsonForScript } from "./vanilla/reportUtils.js";

const HELP = `deepcitation CLI

Commands:
  login     Log in to DeepCitation (browser flow, --key <key>, or DEEPCITATION_API_KEY)
  logout    Remove saved credentials
  whoami    Show the currently logged-in user
  env       Print export DEEPCITATION_API_KEY=... for shell eval
  prepare   Prepare a file or URL for citation verification
  verify    Verify citations against prepared attachments
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

// ── prepare ─────────────────────────────────────────────────────────

const PREPARE_HELP = `Usage: deepcitation prepare <file-or-url> [options]

Prepare a file or URL for citation verification. Uploads the source to the
DeepCitation API and saves the response JSON (attachmentId + deepTextPromptPortion).

Arguments:
  <file-or-url>             Local file path or URL to prepare

Options:
  --out <file>              Output JSON path (default: .deepcitation/prepare-{name}.json)
  --unsafe-fast             Use fast mode for URLs (skips rendering, vulnerable to hidden text)
  -h, --help                Show this help message

Examples:
  deepcitation prepare report.pdf
  deepcitation prepare https://example.com/article --out .deepcitation/prepare-article.json
  deepcitation prepare scan.jpg
`;

async function prepare(argv: string[]) {
  // Extract boolean flags before parseArgs (which only handles --key value pairs)
  const unsafeFast = argv.includes("--unsafe-fast");
  const filteredArgv = argv.filter(a => a !== "--unsafe-fast");

  const args = parseArgs(filteredArgv, PREPARE_HELP);

  // The positional argument is the first non-flag arg
  const positional = filteredArgv.find(a => !a.startsWith("--"));
  if (!positional) die("A file path or URL is required", PREPARE_HELP);

  const apiKey = process.env.DEEPCITATION_API_KEY ?? readCredentials()?.apiKey;
  if (!apiKey) die('DEEPCITATION_API_KEY not set. Run "deepcitation login" or set the env var.', PREPARE_HELP);

  const dc = new DeepCitation({ apiKey });

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
  console.log(outPath);
}

// ── verify ──────────────────────────────────────────────────────────

const VERIFY_HELP = `Usage: deepcitation verify [options]

Verify citations against prepared attachments. Groups citations by attachmentId,
sends one request per group, and merges all responses into a single output file.

Options:
  --citations <file>        Path to citations JSON (keyed or raw)
  --out <file>              Output path (default: .deepcitation/verify-response.json)
  --image-format <format>   Evidence image format: avif, png, jpeg, webp (default: avif)
  -h, --help                Show this help message

Examples:
  deepcitation verify --citations .deepcitation/citations-keyed.json
  deepcitation verify --citations .deepcitation/citations-keyed.json --out .deepcitation/verify-response.json
`;

async function verify(argv: string[]) {
  const args = parseArgs(argv, VERIFY_HELP);

  const citationsPath = args.citations;
  if (!citationsPath) die("--citations is required", VERIFY_HELP);

  const apiKey = process.env.DEEPCITATION_API_KEY ?? readCredentials()?.apiKey;
  if (!apiKey) die('DEEPCITATION_API_KEY not set. Run "deepcitation login" or set the env var.', VERIFY_HELP);

  const dc = new DeepCitation({ apiKey });

  const allowedFormats = ["avif", "png", "jpeg", "webp"] as const;
  const imageFormat = (args["image-format"] ?? "avif") as (typeof allowedFormats)[number];
  if (!allowedFormats.includes(imageFormat)) {
    die(`Invalid --image-format "${sanitizeForLog(imageFormat)}". Allowed: ${allowedFormats.join(", ")}`, VERIFY_HELP);
  }

  const citations = JSON.parse(readFileSync(resolve(citationsPath), "utf-8")) as Record<
    string,
    Record<string, unknown>
  >;

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

  // CDN bundle: Preact + real React components + extracted Tailwind CSS.
  // init() reads #dc-data + optional #dc-key-map, injects its own <style>,
  // resolves data-cite → data-citation-key, and wires up click handlers.
  const snippet = [
    `<script type="application/json" id="dc-data">${jsonData}</script>`,
    keyMapSnippet,
    `<script>${escapeJsForScript(CDN_JS)}</script>`,
    `<script>window.DeepCitationPopover&&window.DeepCitationPopover.init({theme:${JSON.stringify(theme)}});</script>`,
  ]
    .filter(Boolean)
    .join("\n");

  let output = html;

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

  const citations = JSON.parse(readFileSync(resolve(citationsPath), "utf-8")) as Record<
    string,
    Record<string, unknown>
  >;

  const mapping: Record<string, string> = {};
  const rekeyed: Record<string, Record<string, unknown>> = {};

  for (const [label, citation] of Object.entries(citations)) {
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

// ── login ─────────────────────────────────────────────────────────

const BASE_URL = "https://deepcitation.com";

function saveApiKey(key: string, source: string): void {
  if (!key || !key.startsWith("sk-dc-") || key.length < 20) {
    die(
      `Invalid API key format${source ? ` (${source})` : ""}. Keys start with 'sk-dc-' and are at least 20 characters.`,
      HELP,
    );
  }
  writeCredentials({ version: 1, apiKey: key, createdAt: new Date().toISOString() });
  console.log(`API key: ${maskKey(key)}`);
  console.log(`Saved to ${CREDENTIALS_PATH}`);
}

async function login(argv: string[]) {
  const keyIdx = argv.indexOf("--key");
  if (keyIdx !== -1) {
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
    console.log(`Already logged in as ${sanitizeForLog(existing.email ?? "unknown")} (${maskKey(existing.apiKey)})`);
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

    console.log(`\nLogged in as ${sanitizeForLog(payload.displayName ?? payload.email ?? "unknown")}`);
    console.log(`API key: ${maskKey(payload.apiKey)}`);
    console.log(`Saved to ${CREDENTIALS_PATH}`);
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
  if (creds.displayName) console.log(`Name:    ${sanitizeForLog(creds.displayName)}`);
  if (creds.email) console.log(`Email:   ${sanitizeForLog(creds.email)}`);
  console.log(`API key: ${maskKey(creds.apiKey)}`);
}

function env() {
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
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    });
    break;
  case "verify":
    verify(rest).catch(err => {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
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
  case "env":
    env();
    break;
  default:
    die(`Unknown command: ${command}`, HELP);
}
