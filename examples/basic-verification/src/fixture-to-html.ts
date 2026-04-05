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
  buildCitationMaps,
  injectCdnRuntime,
  normalizeNumericMarkers,
  replaceCitationMarkers,
} from "../../../src/vanilla/reportUtils.js";


const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../fixtures");
const outDir = resolve(__dirname, "../output");

export const PROVIDERS = ["openai", "anthropic", "gemini"] as const;

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
  const { anchorMap, keyMap } = buildCitationMaps(parsedCitations);

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

  // ── Step 4: Replace data-cite="N" → data-citation-key="hash" ──────
  html = replaceCitationMarkers(html, parsedCitations);

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

  const injected = injectCdnRuntime(html, stubVerifications, keyMap);
  html = injected.html;

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
