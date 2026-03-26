#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getCitationKey } from "./utils/citationKey.js";
import { CDN_JS } from "./vanilla/_generated_cdn.js";
import { renderBrandedReport } from "./vanilla/renderBrandedReport.js";
import { escapeJsonForScript, escapeJsForScript } from "./vanilla/reportUtils.js";
import {
	CREDENTIALS_PATH,
	readCredentials,
	writeCredentials,
	deleteCredentials,
	maskKey,
	generateNonce,
	startCallbackServer,
	openBrowser,
} from "./auth.js";

const HELP = `deepcitation CLI

Commands:
  login     Log in to DeepCitation and save your API key locally
  logout    Remove saved credentials
  whoami    Show the currently logged-in user
  env       Print export DEEPCITATION_API_KEY=... for shell eval
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
  --theme <auto|light|dark> Popover color theme (default: "auto")
  --out <file>              Output file path (default: overwrites input)
  -h, --help                Show this help message

The injected assets are:
  - A <script type="application/json" id="dc-data"> block with verification data
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
			args[key.slice(2)] = argv[++i]!;
		}
	}
	return args;
}

// ── report ──────────────────────────────────────────────────────────

function report(argv: string[]) {
	const args = parseArgs(argv, REPORT_HELP);

	const llmOutputPath = args["llm-output"];
	const verifyResponsePath = args["verify-response"];
	if (!llmOutputPath) die("--llm-output is required", REPORT_HELP);
	if (!verifyResponsePath) die("--verify-response is required", REPORT_HELP);

	const llmOutput = readFileSync(resolve(llmOutputPath), "utf-8");
	const verifyResponse = JSON.parse(
		readFileSync(resolve(verifyResponsePath), "utf-8"),
	);

	const sourceLabels = args["source-labels"]
		? (JSON.parse(args["source-labels"]) as Record<string, string>)
		: undefined;

	const html = renderBrandedReport(llmOutput, {
		verifications: verifyResponse.verifications,
		title: args.title ?? "Citation Report",
		sourceLabels,
		theme: (args.theme as "auto" | "light" | "dark") ?? "auto",
	});

	const timestamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.slice(0, 19);
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
	const verifyResponse = JSON.parse(
		readFileSync(resolve(verifyResponsePath), "utf-8"),
	);

	const verifications = verifyResponse.verifications ?? verifyResponse;
	const jsonData = escapeJsonForScript(JSON.stringify(verifications));
	const theme = args.theme ?? "auto";

	// CDN bundle: Preact + real React components + extracted Tailwind CSS.
	// init() reads #dc-data, injects its own <style>, and wires up [data-citation-key] handlers.
	const snippet = [
		`<script type="application/json" id="dc-data">${jsonData}</script>`,
		`<script>${escapeJsForScript(CDN_JS)}</script>`,
		`<script>window.DeepCitationPopover&&window.DeepCitationPopover.init({theme:"${theme}"});</script>`,
	].join("\n");

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

	const citations = JSON.parse(
		readFileSync(resolve(citationsPath), "utf-8"),
	) as Record<string, Record<string, unknown>>;

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
		console.log(`Already logged in as ${existing.email ?? "unknown"} (${maskKey(existing.apiKey)})`);
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

		console.log(`\nLogged in as ${payload.displayName ?? payload.email ?? "unknown"}`);
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
	if (creds.displayName) console.log(`Name:    ${creds.displayName}`);
	if (creds.email) console.log(`Email:   ${creds.email}`);
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
		process.stderr.write("Saved API key has an unexpected format. Run \"npx deepcitation login\" again.\n");
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
