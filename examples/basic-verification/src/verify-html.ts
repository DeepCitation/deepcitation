/**
 * Playwright verification: opens each fixture HTML and checks
 * that citations rendered correctly.
 *
 * Run:
 *   bun run src/fixture-to-html.ts        # generate HTML first
 *   bun run src/verify-html.ts            # verify with browser
 */

import { chromium } from "playwright-core";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../output");

const expectedMinCitations: Record<string, number> = {
  openai: 18,
  anthropic: 7,
  gemini: 4,
};

interface TestResult {
  provider: string;
  pass: boolean;
  citationSpans: number;
  nonEmptySpans: number;
  dcDataEntries: number;
  keyMapEntries: number;
  popoverInit: boolean;
  spansDcMatch: number;
  consoleErrors: string[];
  errors: string[];
}

async function verifyProvider(provider: string): Promise<TestResult> {
  const htmlPath = resolve(outDir, `${provider}-fixture-verified.html`);
  const result: TestResult = {
    provider,
    pass: true,
    citationSpans: 0,
    nonEmptySpans: 0,
    dcDataEntries: 0,
    keyMapEntries: 0,
    popoverInit: false,
    spansDcMatch: 0,
    consoleErrors: [],
    errors: [],
  };

  if (!existsSync(htmlPath)) {
    result.pass = false;
    result.errors.push(`HTML file not found: ${htmlPath}`);
    return result;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Capture console errors/warnings
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      result.consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    result.consoleErrors.push(`[pageerror] ${err.message}`);
  });

  try {
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });

    // Give CDN JS time to initialize
    await page.waitForTimeout(1000);

    // 1. Count citation spans
    result.citationSpans = await page.locator("[data-citation-key]").count();
    if (result.citationSpans < expectedMinCitations[provider]) {
      result.errors.push(
        `Only ${result.citationSpans} citation spans, expected ≥${expectedMinCitations[provider]}`,
      );
      result.pass = false;
    }

    // 2. Check non-empty spans
    const spans = page.locator("[data-citation-key]");
    for (let i = 0; i < result.citationSpans; i++) {
      const text = await spans.nth(i).textContent();
      if (text && text.trim().length > 0) result.nonEmptySpans++;
    }
    if (result.nonEmptySpans < result.citationSpans * 0.5) {
      result.errors.push(
        `Only ${result.nonEmptySpans}/${result.citationSpans} spans have text (need >50%)`,
      );
      result.pass = false;
    }

    // 3. Check dc-data + dc-key-map + span matching
    const jsonResult = await page.evaluate(() => {
      const dcDataEl = document.getElementById("dc-data");
      const keyMapEl = document.getElementById("dc-key-map");
      const dcData = dcDataEl ? JSON.parse(dcDataEl.textContent || "{}") : {};
      const keyMap = keyMapEl ? JSON.parse(keyMapEl.textContent || "{}") : {};

      const citationSpans = document.querySelectorAll("[data-citation-key]");
      let matched = 0;
      const unmatched: string[] = [];
      citationSpans.forEach((span) => {
        const key = span.getAttribute("data-citation-key");
        if (key && dcData[key]) matched++;
        else if (key) unmatched.push(key.slice(0, 8));
      });

      return {
        dcDataCount: Object.keys(dcData).length,
        keyMapCount: Object.keys(keyMap).length,
        matched,
        unmatched,
      };
    });

    result.dcDataEntries = jsonResult.dcDataCount;
    result.keyMapEntries = jsonResult.keyMapCount;
    result.spansDcMatch = jsonResult.matched;

    if (jsonResult.dcDataCount === 0) {
      result.errors.push("dc-data is empty");
      result.pass = false;
    }
    if (jsonResult.keyMapCount === 0) {
      result.errors.push("dc-key-map is empty");
      result.pass = false;
    }
    if (jsonResult.matched !== result.citationSpans) {
      result.errors.push(
        `${jsonResult.matched}/${result.citationSpans} spans match dc-data (unmatched: ${jsonResult.unmatched.join(", ")})`,
      );
      result.pass = false;
    }

    // 4. Check CDN popover — check multiple possible locations
    result.popoverInit = await page.evaluate(() => {
      return (
        typeof (window as any).DeepCitationPopover !== "undefined" ||
        typeof (window as any).DeepCitation !== "undefined" ||
        document.querySelector(".dc-popover") !== null ||
        document.querySelector("[data-dc-initialized]") !== null
      );
    });
    // Popover init is a soft check — CDN may have different init patterns
    if (!result.popoverInit) {
      result.errors.push("DeepCitationPopover not detected (soft warning)");
      // Don't fail the test for this — core rendering is what matters
    }
  } finally {
    await browser.close();
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log("🔍 Verifying fixture HTML reports with Playwright\n");

  const providers = ["openai", "anthropic", "gemini"];
  const results: TestResult[] = [];
  let allPass = true;

  for (const provider of providers) {
    const result = await verifyProvider(provider);
    results.push(result);
    if (!result.pass) allPass = false;

    const status = result.pass ? "✅" : "❌";
    console.log(`${status} ${provider}:`);
    console.log(`   citation spans:  ${result.citationSpans} (min: ${expectedMinCitations[provider]})`);
    console.log(`   with text:       ${result.nonEmptySpans}/${result.citationSpans}`);
    console.log(`   dc-data entries: ${result.dcDataEntries}`);
    console.log(`   dc-key-map:      ${result.keyMapEntries}`);
    console.log(`   spans↔dc-data:   ${result.spansDcMatch}/${result.citationSpans}`);
    console.log(`   popover init:    ${result.popoverInit}`);
    if (result.consoleErrors.length) {
      console.log(`   console errors:`);
      for (const e of result.consoleErrors.slice(0, 5)) console.log(`     ${e}`);
    }
    if (result.errors.length) {
      for (const e of result.errors) console.log(`   ⚠️  ${e}`);
    }
    console.log();
  }

  // Summary table
  console.log("┌───────────┬───────┬───────┬──────────┬─────────┬─────────┐");
  console.log("│ Provider  │ Pass  │ Spans │ With Text│ dc-data │ Matched │");
  console.log("├───────────┼───────┼───────┼──────────┼─────────┼─────────┤");
  for (const r of results) {
    const pass = r.pass ? "✅" : "❌";
    console.log(
      `│ ${r.provider.padEnd(9)} │ ${pass.padEnd(5)} │ ${String(r.citationSpans).padEnd(5)} │ ${String(r.nonEmptySpans).padEnd(8)} │ ${String(r.dcDataEntries).padEnd(7)} │ ${String(r.spansDcMatch + "/" + r.citationSpans).padEnd(7)} │`,
    );
  }
  console.log("└───────────┴───────┴───────┴──────────┴─────────┴─────────┘");

  if (!allPass) {
    console.log("\n❌ Some checks failed — see errors above.");
    process.exit(1);
  } else {
    console.log("\n✅ All checks passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
