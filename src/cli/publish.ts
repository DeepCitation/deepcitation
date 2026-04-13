/**
 * `deepcitation publish` — upload a verified HTML + `verify-response.json`
 * pair to the DeepCitation hosted reports endpoint.
 *
 * Two entry points share the guards in `publishInMemory`:
 *   - The standalone `publish` subcommand (this file's default export),
 *     which reads the two files from disk.
 *   - The `verify --pub` one-shot flag in `commands.ts`, which hands the
 *     freshly verified HTML + JSON straight from memory.
 *
 * Opt-in only. Default visibility is `unlisted` (the random ID is the
 * secret). `public` must be explicit.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type {
  PublishVerificationReportOptions,
  VerificationReport,
  VerificationReportVisibility,
} from "../client/types.js";
import { sanitizeForLog } from "../utils/logSafety.js";
import { die, normalizeShortFlags, parseArgs } from "./cliUtils.js";
import { createClient, requireAuth } from "./commands.js";
import { runCitationLintChecks } from "./lint.js";

export const PUBLISH_HELP = `Usage: deepcitation publish --html <file> --vr <file> [options]

Upload an already-verified HTML report and its companion verify-response.json
to the DeepCitation hosted reports endpoint. Returns a share URL.

This is opt-in only: publish never runs implicitly from any other command.
Default visibility is "unlisted" (random ID acts as the secret). "public"
requires --vis public.

Options:
  --html <file>             Path to the verified HTML produced by \`verify\`
  --vr, --verify-response <file>
                            Path to verify-response.json (sibling of the HTML)
  --vis, --visibility <v>   private | unlisted | public (default: unlisted)
  --title <text>            Optional human-readable title
  --attachment-id <id>      Optional source attachmentId to link back
  --lint                    Run citation-syntax lint on the HTML before upload
  -d, --dry-run             Do not POST; print what would be uploaded and exit
  -h, --help                Show this help message

Size limits (enforced locally to avoid a server round-trip):
  HTML  ≤ 5 MB
  JSON  ≤ 2 MB

Examples:
  deepcitation publish --html report-verified.html --vr report-verify-response.json
  deepcitation publish --html r.html --vr r.json --vis public --title "Q2 report"
  deepcitation publish --html r.html --vr r.json --lint
  deepcitation publish --html r.html --vr r.json --dry-run
`;

export const MAX_HTML_BYTES = 5 * 1024 * 1024;
export const MAX_JSON_BYTES = 2 * 1024 * 1024;

export const ALLOWED_VISIBILITIES: readonly VerificationReportVisibility[] = ["private", "unlisted", "public"];

/**
 * Reject HTML that contains a literal DeepCitation API key. Uploading a
 * key — even to an unlisted share URL — is a one-way leak: anyone who
 * guesses the ID can pull the key out. Fail closed before the POST.
 */
export const API_KEY_LEAK_RE = /sk-dc-[a-zA-Z0-9]{14,}/;

/**
 * Publish an in-memory HTML + verify-response.json pair. Shared by the
 * standalone `publish` subcommand and the one-shot `verify --pub` flag.
 *
 * Enforces the same fail-closed guards regardless of entry point:
 * size caps, API-key leak scan, JSON parse check. Writes a publish
 * receipt into `.deepcitation/publish-<id>.json` on success.
 */
export async function publishInMemory(params: {
  html: string;
  verifyResponseJson: string;
  visibility: VerificationReportVisibility;
  title?: string;
  attachmentId?: string;
  /**
   * Optional path of the HTML file the caller wrote to disk alongside
   * this publish. Recorded in the receipt so audit/re-publish tooling
   * can find the original artifact.
   */
  htmlSourcePath?: string;
}): Promise<VerificationReport> {
  const htmlBytes = Buffer.byteLength(params.html, "utf-8");
  const jsonBytes = Buffer.byteLength(params.verifyResponseJson, "utf-8");
  if (htmlBytes > MAX_HTML_BYTES) {
    throw new Error(`HTML exceeds ${MAX_HTML_BYTES} bytes (got ${htmlBytes}). Cannot publish.`);
  }
  if (jsonBytes > MAX_JSON_BYTES) {
    throw new Error(`verify-response.json exceeds ${MAX_JSON_BYTES} bytes (got ${jsonBytes}). Cannot publish.`);
  }
  if (API_KEY_LEAK_RE.test(params.html)) {
    throw new Error(
      "HTML contains a DeepCitation API key (sk-dc-...). Refusing to publish — " +
        "remove the key from the report first. This rule is fail-closed and cannot be bypassed.",
    );
  }
  try {
    JSON.parse(params.verifyResponseJson);
  } catch (err) {
    throw new Error(`verify-response.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { apiKey } = await requireAuth();
  const dc = await createClient(apiKey);

  const options: PublishVerificationReportOptions = {
    visibility: params.visibility,
    ...(params.title ? { title: params.title } : {}),
    ...(params.attachmentId ? { attachmentId: params.attachmentId } : {}),
  };

  const report = await dc.publishVerificationReport(params.html, params.verifyResponseJson, options);

  const receiptDir = resolve(".deepcitation");
  if (!existsSync(receiptDir)) mkdirSync(receiptDir, { recursive: true });
  const receiptPath = resolve(receiptDir, `publish-${report.id}.json`);
  writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        id: report.id,
        shareUrl: report.shareUrl,
        htmlUrl: report.htmlUrl,
        jsonUrl: report.jsonUrl,
        visibility: report.visibility,
        title: report.title,
        createdAt: report.createdAt,
        sources: params.htmlSourcePath
          ? { html: params.htmlSourcePath, htmlName: basename(params.htmlSourcePath) }
          : undefined,
      },
      null,
      2,
    ),
  );

  console.error(`  id:        ${report.id}`);
  console.error(`  shareUrl:  ${report.shareUrl}`);
  console.error(`  receipt:   ${receiptPath}`);
  return report;
}

export function resolveVisibility(value: string | undefined, helpText: string): VerificationReportVisibility {
  if (!value) return "unlisted";
  if (!ALLOWED_VISIBILITIES.includes(value as VerificationReportVisibility)) {
    die(`Invalid --vis "${sanitizeForLog(value)}". Allowed: ${ALLOWED_VISIBILITIES.join(", ")}`, helpText);
  }
  return value as VerificationReportVisibility;
}

export async function publish(argv: string[]): Promise<void> {
  const normalized = normalizeShortFlags(argv);

  // Boolean flags — strip before parseArgs so they don't consume the next token.
  const dryRun = normalized.includes("--dry-run");
  const lintFirst = normalized.includes("--lint");
  const booleans = new Set(["--dry-run", "--lint"]);
  const filteredArgv = normalized.filter(a => !booleans.has(a));

  const args = parseArgs(filteredArgv, PUBLISH_HELP);

  const htmlPath = args.html;
  const jsonPath = args["verify-response"];
  if (!htmlPath) die("--html is required", PUBLISH_HELP);
  if (!jsonPath) die("--vr (--verify-response) is required", PUBLISH_HELP);

  const htmlResolved = resolve(htmlPath);
  const jsonResolved = resolve(jsonPath);
  if (!existsSync(htmlResolved)) die(`HTML file not found: ${sanitizeForLog(htmlPath)}`, PUBLISH_HELP);
  if (!existsSync(jsonResolved)) die(`verify-response.json not found: ${sanitizeForLog(jsonPath)}`, PUBLISH_HELP);

  const htmlBytes = statSync(htmlResolved).size;
  const jsonBytes = statSync(jsonResolved).size;
  if (htmlBytes > MAX_HTML_BYTES) {
    die(`HTML exceeds ${MAX_HTML_BYTES} bytes (got ${htmlBytes}). Cannot publish.`, PUBLISH_HELP);
  }
  if (jsonBytes > MAX_JSON_BYTES) {
    die(`verify-response.json exceeds ${MAX_JSON_BYTES} bytes (got ${jsonBytes}). Cannot publish.`, PUBLISH_HELP);
  }

  const html = readFileSync(htmlResolved, "utf-8");
  const verifyResponseJson = readFileSync(jsonResolved, "utf-8");

  // Fail-closed: never upload an HTML body that has an API key in it.
  if (API_KEY_LEAK_RE.test(html)) {
    die(
      `HTML file contains a DeepCitation API key (sk-dc-...). Refusing to publish — ` +
        `remove the key from the file first. This rule is fail-closed and cannot be bypassed.`,
      PUBLISH_HELP,
    );
  }

  // JSON shape guard — local parse now saves a 400 round-trip later.
  try {
    JSON.parse(verifyResponseJson);
  } catch (err) {
    die(`verify-response.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`, PUBLISH_HELP);
  }

  // Optional citation-syntax pre-check on the HTML body. Uses the same
  // ruleset as `deepcitation lint`, so an agent that passes lint on the
  // draft markdown will pass it on the verified HTML.
  if (lintFirst) {
    const findings = runCitationLintChecks(html);
    const errs = findings.filter(f => f.severity === "ERR");
    if (errs.length > 0) {
      for (const f of errs) {
        const id = f.citationId !== undefined ? ` [${f.citationId}]` : "";
        console.error(`  lint ERR ${f.rule}${id}: ${f.message}`);
      }
      die(`--lint found ${errs.length} citation-syntax error(s); refusing to publish`, PUBLISH_HELP);
    }
    const warns = findings.filter(f => f.severity === "WARN");
    if (warns.length > 0) {
      console.error(`  lint: ${warns.length} warning(s) (not blocking)`);
    } else {
      console.error(`  lint: clean`);
    }
  }

  const visibility = resolveVisibility(args.visibility, PUBLISH_HELP);
  const title = args.title;
  const attachmentId = args["attachment-id"];

  if (dryRun) {
    console.error(`Dry run — not uploading.`);
    console.error(`  html:       ${htmlResolved} (${htmlBytes} bytes)`);
    console.error(`  vr:         ${jsonResolved} (${jsonBytes} bytes)`);
    console.error(`  visibility: ${visibility}`);
    if (title) console.error(`  title:      ${title}`);
    if (attachmentId) console.error(`  attachment: ${attachmentId}`);
    // Structured dry-run payload on stdout so test and agent callers can parse it.
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          htmlPath: htmlResolved,
          verifyResponsePath: jsonResolved,
          htmlBytes,
          jsonBytes,
          visibility,
          title,
          attachmentId,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.error(`Publishing verification report (${visibility})...`);
  try {
    const report = await publishInMemory({
      html,
      verifyResponseJson,
      visibility,
      title,
      attachmentId,
      htmlSourcePath: htmlResolved,
    });
    console.log(report.shareUrl);
  } catch (err) {
    die(err instanceof Error ? err.message : String(err), PUBLISH_HELP);
  }
}
