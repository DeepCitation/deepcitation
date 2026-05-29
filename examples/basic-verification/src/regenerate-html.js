/**
 * Regenerate HTML from a snapshot file (saved by the main workflow).
 *
 * Replays the full pipeline (parse → extractVisibleText → markdownToHtml →
 * inject CDN) using the cached LLM response and verification results.
 * No LLM call or API verification needed.
 *
 * Usage:
 *   bun run src/regenerate-html.ts ../output/john-doe-50-m-chart.jpg-snapshot.json
 *
 * If no snapshot exists, falls back to extracting dc-data from an existing
 * verified HTML file and re-injecting the freshly built CDN bundle.
 */
import { extractVisibleText, getAllCitationsFromLlmOutput, } from "deepcitation";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { generateHtmlReport } from "./html-report.js";
import { injectCdnRuntime } from "../../../src/vanilla/reportUtils.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = resolve(process.argv[2] || "");
if (!inputPath) {
    console.error("Usage: bun run src/regenerate-html.ts <snapshot.json | verified.html>");
    process.exit(1);
}
console.log(`\n📄 Regenerating from: ${inputPath}\n`);
let outPath;
if (inputPath.endsWith("-snapshot.json")) {
    // ── Full pipeline replay from snapshot ──────────────────────────────
    const snapshot = JSON.parse(readFileSync(inputPath, "utf-8"));
    const { llmResponse, verifications, attachments, title } = snapshot;
    const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);
    const visibleText = extractVisibleText(llmResponse);
    console.log(`   Title: ${title}`);
    console.log(`   Citations parsed: ${Object.keys(parsedCitations).length}`);
    console.log(`   Verifications: ${Object.keys(verifications).length}`);
    const html = generateHtmlReport({
        visibleText,
        parsedCitations,
        verifications,
        title,
        attachments,
    });
    outPath = inputPath.replace("-snapshot.json", "-regenerated.html");
    writeFileSync(outPath, html);
}
else if (inputPath.endsWith("-verified.html")) {
    // ── Fallback: re-inject CDN into existing HTML ─────────────────────
    console.log("   ⚠️  No snapshot found, falling back to CDN re-injection");
    console.log("   (Run the workflow once to create a snapshot for full replay)\n");
    const html = readFileSync(inputPath, "utf-8");
    const dcDataMatch = html.match(/<script[^>]+id="dc-data"[^>]*>([\s\S]*?)<\/script>/);
    const keyMapMatch = html.match(/<script[^>]+id="dc-key-map"[^>]*>([\s\S]*?)<\/script>/);
    if (!dcDataMatch) {
        console.error("❌ Could not find dc-data in HTML");
        process.exit(1);
    }
    const dcData = JSON.parse(dcDataMatch[1]);
    const keyMap = keyMapMatch ? JSON.parse(keyMapMatch[1]) : {};
    const beforeDcData = html.substring(0, dcDataMatch.index);
    const result = injectCdnRuntime(beforeDcData, dcData, keyMap);
    outPath = inputPath.replace("-verified.html", "-regenerated.html");
    writeFileSync(outPath, result.html);
}
else {
    console.error("❌ Expected a -snapshot.json or -verified.html file");
    process.exit(1);
}
console.log(`\n   ✅ Written: ${outPath}\n`);
// Open in browser
try {
    const winPath = execFileSync("wslpath", ["-w", outPath], { encoding: "utf-8" }).trim();
    execFileSync("explorer.exe", [winPath], { stdio: "ignore", timeout: 5000 });
}
catch {
    try {
        execFileSync("xdg-open", [outPath], { stdio: "ignore", timeout: 5000 });
    }
    catch {
        try {
            execFileSync("open", [outPath], { stdio: "ignore", timeout: 5000 });
        }
        catch { /* manual open */ }
    }
}
