#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
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
import { renderBrandedReport } from "./vanilla/renderBrandedReport.js";
import { escapeJsForScript, escapeJsonForScript } from "./vanilla/reportUtils.js";

const HELP = `deepcitation CLI

Commands:
  login     Log in to DeepCitation and save your API key locally
  logout    Remove saved credentials
  whoami    Show the currently logged-in user
  env       Print export DEEPCITATION_API_KEY=... for shell eval
  prepare   Prepare a file or URL for citation verification
  report    Generate a branded DeepCitation HTML verification report
  inject    Inject DeepCitation verification into an existing HTML file
  keygen    Compute deterministic citation keys from a citations JSON file

Run "deepcitation <command> --help" for command-specific options.
`;

const REPORT_HELP = `Usage: deepcitation report [options]

Generate a branded DeepCitation HTML verification report from LLM output.

Options:
  --llm-output <file>       Path to LLM output text file (with <<<CITATION_DATA>>>)
  --verify-response <file>  Path to verify-response.json from /verifyCitations
  --title <string>          Report title (default: "Citation Report")
  --source-labels <json>    JSON object mapping attachmentId → display name
  --theme <auto|light|dark> Color theme (default: "auto")
  --out <dir>               Output directory (default: ".")
  -h, --help                Show this help message

Examples:
  deepcitation report --llm-output out.txt --verify-response verify.json
  deepcitation report --llm-output out.txt --verify-response verify.json --title "Q4 Analysis" --out .deepcitation/
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
  if (!apiKey) die("DEEPCITATION_API_KEY not set. Run \"deepcitation login\" or set the env var.", PREPARE_HELP);

  const dc = new DeepCitation({ apiKey });

  const isUrl = positional.startsWith("http://") || positional.startsWith("https://");

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

  console.error(`  Attachment ID: ${result.attachmentId}`);
  console.error(`  Pages: ${result.metadata.pageCount}`);
  console.error(`  Text: ${Math.round(result.metadata.textByteSize / 1024)}KB`);
  if (result.processingTimeMs) {
    console.error(`  Time: ${(result.processingTimeMs / 1000).toFixed(1)}s`);
  }
  console.log(outPath);
}

// ── report ──────────────────────────────────────────────────────────

function report(argv: string[]) {
  const args = parseArgs(argv, REPORT_HELP);

  const llmOutputPath = args["llm-output"];
  const verifyResponsePath = args["verify-response"];
  if (!llmOutputPath) die("--llm-output is required", REPORT_HELP);
  if (!verifyResponsePath) die("--verify-response is required", REPORT_HELP);

  const llmOutput = readFileSync(resolve(llmOutputPath), "utf-8");
  const verifyResponse = JSON.parse(readFileSync(resolve(verifyResponsePath), "utf-8"));

  if (!verifyResponse.verifications || typeof verifyResponse.verifications !== "object") {
    die("verify-response JSON must contain a 'verifications' object", REPORT_HELP);
  }

  const sourceLabels = args["source-labels"]
    ? (JSON.parse(args["source-labels"]) as Record<string, string>)
    : undefined;

  const html = renderBrandedReport(llmOutput, {
    verifications: verifyResponse.verifications,
    title: args.title ?? "Citation Report",
    sourceLabels,
    theme: (args.theme as "auto" | "light" | "dark") ?? "auto",
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = (args.title ?? "report")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  const outDir = args.out ?? ".";
  const filename = resolve(outDir, `report-${slug}-${timestamp}.html`);

  writeFileSync(filename, html);
  console.log(filename);
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

async function login() {
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
    prepare(rest);
    break;
  case "report":
    report(rest);
    break;
  case "inject":
    inject(rest);
    break;
  case "keygen":
    keygen(rest);
    break;
  case "login":
    login();
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
