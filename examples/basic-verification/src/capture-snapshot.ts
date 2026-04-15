/**
 * One-shot snapshot capture for popover/animation debugging.
 *
 * Replays a fixture raw LLM output against a freshly-uploaded source
 * document so real `verifyAttachment` output (with pageImages, evidence
 * images, attachments) gets captured to a snapshot JSON that `template.ts`
 * can re-render instantly.
 *
 * Usage:
 *   bun run src/capture-snapshot.ts                        # openai + PPT1.pdf
 *   bun run src/capture-snapshot.ts anthropic
 *   bun run src/capture-snapshot.ts gemini
 *
 * Prerequisite: DEEPCITATION_API_KEY in .env
 */

import "dotenv/config";
import { DeepCitation } from "deepcitation/client";
import { getAllCitationsFromLlmOutput, type CitationRecord } from "deepcitation";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "../fixtures");
const OUT = resolve(__dirname, "../output");
const PDF = resolve(__dirname, "../../assets/PPT1.pdf");

const provider = process.argv[2] ?? "openai";
const fixturePath = resolve(FIXTURES, `${provider}-raw-llm-output.txt`);
if (!existsSync(fixturePath)) {
  console.error(`❌ Fixture not found: ${fixturePath}`);
  process.exit(1);
}
if (!existsSync(PDF)) {
  console.error(`❌ Source PDF not found: ${PDF}`);
  process.exit(1);
}

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

console.log(`📤 Uploading PPT1.pdf…`);
const t0 = Date.now();
const buffer = readFileSync(PDF);
const blob = new Blob([new Uint8Array(buffer)]);
const upload = await dc.uploadFile(blob, { filename: "PPT1.pdf" });
if (upload.status === "error") {
  console.error(`❌ Upload failed:`, upload);
  process.exit(1);
}
console.log(`   attachmentId=${upload.attachmentId}  (${Date.now() - t0}ms)`);

const llmResponse = readFileSync(fixturePath, "utf-8");
const parsedCitations: CitationRecord = getAllCitationsFromLlmOutput(llmResponse);
const citationCount = Object.keys(parsedCitations).length;
console.log(`📑 Parsed ${citationCount} citations from fixture`);

// Re-key citations onto the fresh attachmentId. The fixture was captured
// against an older attachmentId; verifyAttachment needs them to reference
// the one we just uploaded.
const rekeyed: CitationRecord = {};
for (const [hash, c] of Object.entries(parsedCitations)) {
  rekeyed[hash] = { ...c, attachmentId: upload.attachmentId };
}

console.log(`🔍 Verifying…`);
const t1 = Date.now();
const result = await dc.verifyAttachment(upload.attachmentId, rekeyed);
console.log(`   ${Object.keys(result.verifications).length} verifications  (${Date.now() - t1}ms)`);

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const safeName = `${provider}-PPT1`;
const snapshotPath = resolve(OUT, `${safeName}-snapshot.json`);
writeFileSync(
  snapshotPath,
  JSON.stringify(
    {
      llmResponse,
      verifications: result.verifications,
      attachments: result.attachments,
      title: `${provider} / PPT1.pdf`,
    },
    null,
    2,
  ),
);

console.log(`\n✅ ${snapshotPath}`);
console.log(`   Next:  bun run template ${safeName}`);
