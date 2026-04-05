/**
 * Converts fixture raw LLM output files into HTML reports.
 *
 * Usage:
 *   bun run src/fixture-to-html.ts                  # all fixtures
 *   bun run src/fixture-to-html.ts openai            # single provider
 *
 * This bypasses the LLM call and API verification, using the fixture data
 * directly. Verification entries are stubbed so the CDN popover can render.
 */

import {
  extractVisibleText,
  getAllCitationsFromLlmOutput,
} from "deepcitation";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// CLI internals — direct source imports (monorepo-only, not public API)
import { markdownToHtml } from "../../../src/cli/markdownToHtml.js";
import {
  escapeJsonForScript,
  escapeJsForScript,
  stripExistingInjection,
} from "../../../src/vanilla/reportUtils.js";
import { CDN_JS } from "../../../src/vanilla/_generated_cdn.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../fixtures");
const outDir = resolve(__dirname, "../output");

const PROVIDERS = ["openai", "anthropic", "gemini"] as const;

/**
 * Normalize `[N]` markers so they always appear AFTER their anchor text.
 *
 * LLMs produce three styles:
 *   - OpenAI:    `anchor text [N]`          → already correct
 *   - Anthropic: `[N] anchor text`          → needs reordering
 *   - Gemini:    `text [N, M] more text`    → needs expansion + reordering
 *
 * wrapCitationMarkers expects `anchor text [N]` — this function normalizes
 * all styles to that format before markdownToHtml processes them.
 */
// Max prefix length for fuzzy anchor matching — long enough to be unique,
// short enough to tolerate LLM paraphrasing at the tail end.
const ANCHOR_MATCH_PREFIX = 40;

export function normalizeNumericMarkers(
  text: string,
  anchorMap: Record<string, string>,
): string {
  // Step 1: Expand grouped markers  [1, 5] → [1][5]
  text = text.replace(/\[(\d+(?:\s*,\s*\d+)+)\]/g, (_, group: string) => {
    return group
      .split(",")
      .map((n) => `[${n.trim()}]`)
      .join("");
  });

  // Step 2: For each citation, ensure [N] follows its anchor text.
  // Process in descending order so index shifts from earlier edits
  // don't affect later ones.
  const entries = Object.entries(anchorMap).sort(
    ([a], [b]) => Number(b) - Number(a),
  );

  for (const [num, anchor] of entries) {
    const markerRe = new RegExp(`\\[${num}\\]`);
    const markerMatch = markerRe.exec(text);
    if (!markerMatch) continue;

    const markerPos = markerMatch.index;
    const anchorIdx = text.toLowerCase().indexOf(anchor.slice(0, ANCHOR_MATCH_PREFIX).toLowerCase());
    if (anchorIdx < 0) continue;

    const anchorEnd = anchorIdx + anchor.length;

    // If marker already follows the anchor (within a small gap), leave it
    if (markerPos >= anchorEnd && markerPos <= anchorEnd + 5) continue;

    // Remove marker from current position
    text =
      text.slice(0, markerMatch.index) +
      text.slice(markerMatch.index + markerMatch[0].length);

    // Recalculate anchor position after removal (may have shifted)
    const newAnchorIdx = text.toLowerCase().indexOf(anchor.slice(0, ANCHOR_MATCH_PREFIX).toLowerCase());
    if (newAnchorIdx < 0) continue;
    const insertPos = newAnchorIdx + anchor.length;
    text = text.slice(0, insertPos) + ` [${num}]` + text.slice(insertPos);
  }

  return text;
}

function convertFixture(provider: string) {
  const rawPath = resolve(fixturesDir, `${provider}-raw-llm-output.txt`);
  if (!existsSync(rawPath)) {
    console.log(`⚠️  Skipping ${provider}: no fixture at ${rawPath}`);
    return;
  }

  const llmResponse = readFileSync(rawPath, "utf-8");

  // ── Step 1: Parse citations from <<<CITATION_DATA>>> block ──────────
  const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);
  const citationCount = Object.keys(parsedCitations).length;
  const visibleText = extractVisibleText(llmResponse);

  console.log(`\n📄 ${provider}: ${citationCount} citations parsed`);

  // Debug: show what we got
  for (const [hash, citation] of Object.entries(parsedCitations)) {
    console.log(
      `   [${citation.citationNumber}] hash=${hash.slice(0, 8)}… anchor="${citation.anchorText?.slice(0, 30)}"`,
    );
  }

  // ── Step 2: Build anchorMap + keyMap ────────────────────────────────
  const anchorMap: Record<string, string> = {};
  const keyMap: Record<string, string> = {};
  for (const [hash, citation] of Object.entries(parsedCitations)) {
    const num = citation.citationNumber;
    if (num != null && citation.anchorText) {
      anchorMap[String(num)] = citation.anchorText;
      keyMap[`cite-${num}`] = hash;
    }
  }

  console.log(`   anchorMap keys: [${Object.keys(anchorMap).join(", ")}]`);
  console.log(`   keyMap keys: [${Object.keys(keyMap).join(", ")}]`);

  // ── Step 3: Normalize markers + convert markdown → HTML ─────────────
  const normalizedText = normalizeNumericMarkers(visibleText, anchorMap);
  let html = markdownToHtml(normalizedText, {
    style: "report",
    title: `${provider} fixture`,
    citationCount,
    anchorMap,
  });

  // Count data-cite spans before replacement
  const dataCiteMatches = html.match(/data-cite="/g);
  console.log(`   data-cite spans after markdownToHtml: ${dataCiteMatches?.length ?? 0}`);

  // ── Step 4: Replace data-cite="N" → data-citation-key="hash" ──────
  for (const [hash, citation] of Object.entries(parsedCitations)) {
    const num = citation.citationNumber;
    if (num == null) continue;
    html = html.replace(
      new RegExp(`data-cite="${num}"`, "g"),
      `data-citation-key="${hash}"`,
    );
  }

  // Strip leftover [N] markers
  for (const citation of Object.values(parsedCitations)) {
    const num = citation.citationNumber;
    if (num == null) continue;
    html = html.replace(new RegExp(`\\s*\\[${num}\\]`, "g"), "");
  }

  const dataCitationKeyMatches = html.match(/data-citation-key="/g);
  console.log(`   data-citation-key spans after replacement: ${dataCitationKeyMatches?.length ?? 0}`);

  // ── Step 5: Inject CDN runtime with stub verification data ─────────
  // Build stub verifications so the CDN popover has something to display.
  // In the real flow, verificationResult comes from the API.
  const stubVerifications: Record<string, unknown> = {};
  for (const [hash, citation] of Object.entries(parsedCitations)) {
    stubVerifications[hash] = {
      status: "found",
      label: citation.anchorText || `Citation ${citation.citationNumber}`,
      attachmentId: citation.attachmentId || "fixture",
      verifiedFullPhrase: citation.fullPhrase,
      verifiedAnchorText: citation.anchorText,
      verifiedMatchSnippet: citation.fullPhrase?.slice(0, 80),
      citation: {
        pageNumber: citation.pageNumber,
        lineIds: citation.lineIds,
        fullPhrase: citation.fullPhrase,
        anchorText: citation.anchorText,
      },
      document: {
        verifiedPageNumber: citation.pageNumber,
        verifiedLineIds: citation.lineIds,
      },
    };
  }

  const stripped = stripExistingInjection(html);
  html = stripped.html;

  const cdnSnippet = [
    `<script type="application/json" id="dc-data">${escapeJsonForScript(JSON.stringify(stubVerifications))}</script>`,
    `<script type="application/json" id="dc-key-map">${escapeJsonForScript(JSON.stringify(keyMap))}</script>`,
    `<script>${escapeJsForScript(CDN_JS)}</script>`,
    `<script>window.DeepCitationPopover&&window.DeepCitationPopover.init({theme:"auto"});</script>`,
  ].join("\n");

  // Use function callback to avoid $& expansion in cdnSnippet
  if (html.includes("</body>")) {
    html = html.replace("</body>", () => `${cdnSnippet}\n</body>`);
  } else if (html.includes("</html>")) {
    html = html.replace("</html>", () => `${cdnSnippet}\n</html>`);
  } else {
    html += `\n${cdnSnippet}`;
  }

  // ── Step 6: Write output ───────────────────────────────────────────
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${provider}-fixture-verified.html`);
  writeFileSync(outPath, html);

  console.log(`   ✅ Written: ${outPath}`);
  return outPath;
}

// ── Main ──────────────────────────────────────────────────────────────
const filter = process.argv[2];
const providers = filter
  ? PROVIDERS.filter((p) => p === filter)
  : [...PROVIDERS];

if (providers.length === 0) {
  console.error(`Unknown provider "${filter}". Choose: ${PROVIDERS.join(", ")}`);
  process.exit(1);
}

const outputs: string[] = [];
for (const provider of providers) {
  const path = convertFixture(provider);
  if (path) outputs.push(path);
}

console.log(`\n✅ Generated ${outputs.length} HTML file(s)`);
for (const p of outputs) console.log(`   ${p}`);
