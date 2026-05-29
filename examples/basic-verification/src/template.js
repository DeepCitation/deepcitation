/**
 * Fast static-HTML renderer for popover/animation debugging.
 *
 * Loads a snapshot JSON produced by the step-runner and re-renders the
 * verified HTML via renderVerifiedHtml() — the same code path as production.
 * Use this to iterate on Popover/Citation animation code without re-running
 * the LLM or verification API on every change.
 *
 * Usage:
 *   bun run template                              # newest snapshot in output/
 *   bun run template <safeName>                   # e.g. Medical_chart_image
 *   bun run template path/to/foo-snapshot.json    # explicit path
 *   bun run template <name> --md=hand-edited.md   # substitute visible text
 *
 * Prerequisite — produce a snapshot by running the step pipeline once:
 *   bun run steps:openai 0
 */
import { extractVisibleText, getAllCitationsFromLlmOutput, renderVerifiedHtml, } from "deepcitation";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(__dirname, "../output");
function fail(msg) {
    console.error(`❌ ${msg}`);
    process.exit(1);
}
function findNewestSnapshot() {
    if (!existsSync(DEFAULT_OUT))
        fail(`Output directory does not exist: ${DEFAULT_OUT}`);
    const candidates = readdirSync(DEFAULT_OUT)
        .filter((f) => f.endsWith("-snapshot.json"))
        .map((f) => {
        const path = resolve(DEFAULT_OUT, f);
        return { path, mtime: statSync(path).mtimeMs };
    })
        .sort((a, b) => b.mtime - a.mtime);
    if (candidates.length === 0) {
        fail(`No *-snapshot.json files in ${DEFAULT_OUT}.\n   Run the step pipeline first:  bun run steps:openai 0`);
    }
    return candidates[0].path;
}
function parseArgs() {
    let mdOverride;
    let positional;
    for (const arg of process.argv.slice(2)) {
        if (arg.startsWith("--md="))
            mdOverride = arg.slice(5);
        else if (!positional)
            positional = arg;
    }
    let snapshotPath;
    if (!positional) {
        snapshotPath = findNewestSnapshot();
    }
    else if (existsSync(positional) && positional.endsWith(".json")) {
        snapshotPath = resolve(positional);
    }
    else {
        snapshotPath = resolve(DEFAULT_OUT, `${positional}-snapshot.json`);
    }
    return { snapshotPath, mdOverride };
}
const { snapshotPath, mdOverride } = parseArgs();
if (!existsSync(snapshotPath)) {
    fail(`Snapshot not found: ${snapshotPath}\n   Run the step pipeline first:  bun run steps:openai 0`);
}
const t0 = Date.now();
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
if (!snapshot.llmResponse)
    fail(`Snapshot has no llmResponse field: ${snapshotPath}`);
const parsedCitations = getAllCitationsFromLlmOutput(snapshot.llmResponse);
const visibleText = mdOverride
    ? readFileSync(resolve(mdOverride), "utf-8")
    : extractVisibleText(snapshot.llmResponse);
const safeName = basename(snapshotPath).replace(/-snapshot\.json$/, "");
const title = snapshot.title ?? safeName.replace(/_/g, " ");
const html = renderVerifiedHtml(visibleText, parsedCitations, snapshot.verifications, snapshot.attachments, { title });
const htmlPath = resolve(DEFAULT_OUT, `${safeName}-template.html`);
writeFileSync(htmlPath, html);
// Dump the extracted visible text as a sibling .md on first render so it can
// be hand-edited and fed back in via --md=<path>.
const mdPath = resolve(DEFAULT_OUT, `${safeName}.md`);
if (!existsSync(mdPath))
    writeFileSync(mdPath, visibleText);
const elapsed = Date.now() - t0;
const citationCount = Object.keys(parsedCitations).length;
console.log(`✅ ${safeName}  (${elapsed}ms, ${citationCount} citations)`);
console.log(`   html:  ${htmlPath}`);
console.log(`   md:    ${mdPath}`);
console.log(`\n   file://${htmlPath}`);
