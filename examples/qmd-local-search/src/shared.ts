/**
 * qmd-local-search — core pipeline
 *
 * Flow:
 *   1. Boot a @tobilu/qmd store over ./corpus/md
 *   2. update() + embed() on first run (cached in .qmd-index.sqlite)
 *   3. store.search({ query }) → top-N markdown hits
 *   4. Map each hit's source file to corpus/pdf/<stem>.pdf (dedup)
 *   5. dc.prepareAttachments(pdfs) → fileDataParts + deepTextPagesByAttachmentId
 *   6. wrapCitationPrompt(...) → enhanced system/user prompts
 *   7. streamLlm(prompts) → raw LLM output with <cite .../> tags
 *   8. dc.verify({ llmOutput }, citations) — one call, multi-attachment
 *   9. generateHtmlReport → self-contained HTML with CDN popover runtime
 */

import "dotenv/config";
import { createStore, type HybridQueryResult, type QMDStore } from "@tobilu/qmd";
import { DeepCitation } from "deepcitation/client";
import {
  type AttachmentAssets,
  extractVisibleText,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
  groupCitationsByAttachmentId,
  replaceCitationMarkers,
} from "deepcitation";
import { wrapCitationPrompt } from "deepcitation/prompts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { generateHtmlReport } from "./html-report.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Paths ──────────────────────────────────────────────────────────────────

const EXAMPLE_ROOT = resolve(__dirname, "..");
const MD_CORPUS = resolve(EXAMPLE_ROOT, "corpus/md");
const PDF_CORPUS = resolve(EXAMPLE_ROOT, "corpus/pdf");
const QMD_DB_PATH = resolve(EXAMPLE_ROOT, ".qmd-index.sqlite");
const DEFAULT_OUT_DIR = resolve(EXAMPLE_ROOT, "output");

const SAMPLE_QUESTIONS = [
  "How does Raft guarantee that committed log entries survive leader changes?",
  "What languages and images were included on the Voyager Golden Record?",
  "Why does cold proofing make sourdough taste more sour?",
  // Hallucination bait: the corpus has facts on this, but the LLM will almost always
  // over-claim (wrong count, wrong attribution). DeepCitation will flag the miss.
  "How many distinct languages and greetings appear on the Voyager Golden Record, and who chose them?",
];

// ─── Types ──────────────────────────────────────────────────────────────────

export type StreamLlmFn = (params: {
  enhancedSystemPrompt: string;
  enhancedUserPrompt: string;
}) => Promise<string>;

interface PreparedAttachment {
  attachmentId: string;
  filename: string;
  deepTextPages: string[];
}

// ─── qmd store (lazy singleton) ─────────────────────────────────────────────

let storePromise: Promise<QMDStore> | null = null;

async function getStore(): Promise<QMDStore> {
  storePromise ??= (async () => {
    console.log(`📂 Opening qmd store at ${QMD_DB_PATH}`);
    const store = await createStore({
      dbPath: QMD_DB_PATH,
      config: {
        collections: {
          corpus: { path: MD_CORPUS, pattern: "**/*.md" },
        },
      },
    });

    console.log("🔎 Scanning corpus/md for changes…");
    const updateResult = await store.update();
    console.log(
      `   indexed=${updateResult.indexed} updated=${updateResult.updated} unchanged=${updateResult.unchanged}`,
    );

    if (updateResult.needsEmbedding > 0) {
      console.log(`🧠 Embedding ${updateResult.needsEmbedding} doc(s) (first run downloads a GGUF model)…`);
      await store.embed({
        onProgress: ({ chunksEmbedded, totalChunks }) => {
          process.stdout.write(`   embedding ${chunksEmbedded}/${totalChunks}\r`);
        },
      });
      process.stdout.write("\n");
    } else {
      console.log("🧠 Embeddings up-to-date — skipping");
    }

    return store;
  })();

  return storePromise;
}

// ─── md → pdf mapping ───────────────────────────────────────────────────────

function mdFileToPdfPath(mdFile: string): string {
  const stem = basename(mdFile).replace(/\.md$/i, "");
  return resolve(PDF_CORPUS, `${stem}.pdf`);
}

function dedupeHits(hits: HybridQueryResult[]): HybridQueryResult[] {
  const seen = new Set<string>();
  const out: HybridQueryResult[] = [];
  for (const hit of hits) {
    if (seen.has(hit.file)) continue;
    seen.add(hit.file);
    out.push(hit);
  }
  return out;
}

// ─── DeepCitation upload ────────────────────────────────────────────────────

async function uploadAttachments(
  dc: DeepCitation,
  hits: HybridQueryResult[],
): Promise<PreparedAttachment[]> {
  const uploads = hits.map(hit => {
    const pdfPath = mdFileToPdfPath(hit.file);
    if (!existsSync(pdfPath)) {
      throw new Error(
        `Missing parallel PDF for ${hit.file}. Expected ${pdfPath}. Run "bun run build:corpus".`,
      );
    }
    return { file: readFileSync(pdfPath), filename: basename(pdfPath) };
  });

  const { fileDataParts, deepTextPagesByAttachmentId } = await dc.prepareAttachments(uploads);

  return fileDataParts.map((part, i) => ({
    attachmentId: part.attachmentId,
    filename: uploads[i].filename,
    deepTextPages: deepTextPagesByAttachmentId[part.attachmentId] ?? [],
  }));
}

// ─── Interactive prompt ─────────────────────────────────────────────────────

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolvePrompt => {
    rl.question(question, answer => {
      rl.close();
      resolvePrompt(answer.trim());
    });
  });
}

async function promptQuestion(): Promise<string> {
  console.log("\nChoose a question (or type your own):\n");
  SAMPLE_QUESTIONS.forEach((q, i) => console.log(`  [${i + 1}] ${q}`));
  console.log("  [4] Custom — type your own");
  const choice = await ask("\nEnter choice [1-4]: ");

  const idx = Number(choice) - 1;
  if (SAMPLE_QUESTIONS[idx]) return SAMPLE_QUESTIONS[idx];

  const custom = await ask("Your question: ");
  if (!custom) throw new Error("No question provided.");
  return custom;
}

// ─── Workflow ───────────────────────────────────────────────────────────────

export function toSafeName(label: string): string {
  return label.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 50);
}

function openInBrowser(htmlPath: string): void {
  try {
    const winPath = execFileSync("wslpath", ["-w", htmlPath], { encoding: "utf-8" }).trim();
    execFileSync("explorer.exe", [winPath], { stdio: "ignore", timeout: 5000 });
    return;
  } catch {
    /* not WSL */
  }
  try {
    execFileSync("xdg-open", [htmlPath], { stdio: "ignore", timeout: 5000 });
    return;
  } catch {
    /* not linux */
  }
  try {
    execFileSync("open", [htmlPath], { stdio: "ignore", timeout: 5000 });
  } catch {
    /* manual open */
  }
}

export async function runWorkflow(providerName: string, streamLlm: StreamLlmFn): Promise<void> {
  console.log(`🔍 DeepCitation + qmd Local Search — ${providerName}\n`);

  if (!process.env.DEEPCITATION_API_KEY) {
    throw new Error("DEEPCITATION_API_KEY is not set. Copy .env.example to .env and add your key.");
  }

  const dc = new DeepCitation({
    apiKey: process.env.DEEPCITATION_API_KEY,
    endUserId: "qmd-local-search",
  });

  const cliArg = process.argv.slice(2).join(" ").trim();
  const question = cliArg || (await promptQuestion());

  console.log(`\n❓ Question: ${question}\n`);

  // ── Step 1: qmd retrieval ─────────────────────────────────────────────
  const store = await getStore();
  console.log("\n🔎 Step 1: qmd hybrid search (BM25 + vector + rerank)…");
  const rawHits = await store.search({
    query: question,
    collection: "corpus",
    limit: 6,
  });
  const hits = dedupeHits(rawHits).slice(0, 3);

  if (hits.length === 0) {
    console.log("⚠️  No qmd hits — try a different question.");
    await store.close();
    return;
  }

  console.log(`   Retrieved ${hits.length} source doc(s):`);
  for (const hit of hits) {
    console.log(`   • ${hit.title} (${basename(hit.file)}) score=${hit.score.toFixed(3)}`);
  }

  // ── Step 2: DeepCitation upload ───────────────────────────────────────
  console.log("\n📤 Step 2: Uploading parallel PDFs to DeepCitation…");
  const prepared = await uploadAttachments(dc, hits);
  for (const item of prepared) {
    console.log(`   ✅ ${item.filename} → ${item.attachmentId}`);
  }

  // ── Step 3: Wrap prompts ──────────────────────────────────────────────
  const systemPrompt =
    "You are a precise research assistant. Answer only from the retrieved documents. Cite every factual claim.";
  const userPrompt = [
    `Question: ${question}`,
    "",
    "Retrieved source summary:",
    hits
      .map(hit => `- ${hit.title} (${basename(hit.file)}, score=${hit.score.toFixed(3)}): ${hit.bestChunk}`)
      .join("\n"),
    "",
    "If the answer is not supported by the retrieved sources, say so plainly.",
  ].join("\n");

  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt,
    userPrompt,
    deepTextPagesByAttachmentId: Object.fromEntries(
      prepared.map(item => [item.attachmentId, item.deepTextPages]),
    ),
  });

  // ── Step 4: Call LLM ──────────────────────────────────────────────────
  console.log(`\n🤖 Step 3: Calling ${providerName}…\n`);
  const separator = "─".repeat(60);
  console.log(separator);
  const llmResponse = await streamLlm({ enhancedSystemPrompt, enhancedUserPrompt });
  console.log(`\n${separator}\n`);

  // ── Step 5: Parse citations ───────────────────────────────────────────
  const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);
  const visibleText = extractVisibleText(llmResponse);
  const citationCount = Object.keys(parsedCitations).length;

  console.log(`🔍 Step 4: Parsed ${citationCount} citation(s) from LLM output`);

  if (citationCount === 0) {
    console.log("⚠️  No citations found in response — nothing to verify.\n");
    await store.close();
    return;
  }

  // ── Step 6: Verify ────────────────────────────────────────────────────
  console.log("\n✨ Step 5: Verifying citations against source PDFs…\n");

  // Group citations by attachmentId and verify each attachment independently.
  // Why: the service's verifyCitations endpoint takes one attachment per request.
  const grouped = groupCitationsByAttachmentId(parsedCitations);
  const mergedVerifications: Record<string, any> = {};
  const mergedAttachments: Record<string, AttachmentAssets> = {};
  for (const [attachmentId, attachmentCitations] of grouped) {
    if (!attachmentId) continue;
    const result = await dc.verifyAttachment(attachmentId, attachmentCitations, {
      outputImageFormat: "avif",
    });
    Object.assign(mergedVerifications, result.verifications);
    if (result.attachments) Object.assign(mergedAttachments, result.attachments);
  }

  const verifications = Object.entries(mergedVerifications) as [string, any][];

  // ── Verification table ─────────────────────────────────────────────────
  // One row per citation: sequential index, truncated claim, status, page.
  // Emoji chars are wide (2 display cols) so we use a fixed label width and
  // a trailing newline to keep the separator clean regardless of terminal.
  const CLAIM_W = 54;
  const rule = `  ${"─".repeat(4)} ${"─".repeat(CLAIM_W)} ${"─".repeat(12)} ${"─".repeat(5)}`;

  console.log(`\n  Verifying ${verifications.length} citation(s):\n`);
  console.log(rule);

  for (let i = 0; i < verifications.length; i++) {
    const [key, verification] = verifications[i];
    const s = getCitationStatus(verification);
    const label = s.isVerified ? "✅ verified " : s.isPartialMatch ? "⚠️  partial " : "❌ not found";
    const page = String(verification.document?.verifiedPageNumber ?? "—").padEnd(5);
    const claimed = parsedCitations[key]?.sourceContext ?? "";
    const claimCol = claimed.length > CLAIM_W ? `${claimed.slice(0, CLAIM_W - 1)}…` : claimed.padEnd(CLAIM_W);
    console.log(`  [${String(i + 1).padStart(2)}] ${claimCol} ${label} p.${page}`);
  }

  console.log(rule);

  // ── Step 7: Summary ───────────────────────────────────────────────────
  const verified = verifications.filter(([, v]) => getCitationStatus(v).isVerified).length;
  const partial = verifications.filter(([, v]) => getCitationStatus(v).isPartialMatch).length;
  const missed = verifications.filter(([, v]) => getCitationStatus(v).isMiss).length;

  console.log(`\n  ✅ ${verified} verified  ⚠️  ${partial} partial  ❌ ${missed} not found\n`);

  console.log("\n📖 Clean response:");
  console.log(separator);
  console.log(replaceCitationMarkers(visibleText));
  console.log(`${separator}\n`);

  // ── Step 8: HTML report ───────────────────────────────────────────────
  console.log("📄 Step 6: Generating HTML report…");
  if (!existsSync(DEFAULT_OUT_DIR)) mkdirSync(DEFAULT_OUT_DIR, { recursive: true });

  const html = generateHtmlReport({
    visibleText,
    parsedCitations,
    verifications: mergedVerifications,
    title: question,
    attachments: mergedAttachments,
  });

  const safeName = toSafeName(question);
  const htmlPath = resolve(DEFAULT_OUT_DIR, `${safeName}-verified.html`);
  writeFileSync(htmlPath, html);
  console.log(`   Written: ${htmlPath}`);

  openInBrowser(htmlPath);
  console.log(`   Open:    ${htmlPath}\n`);

  await store.close();
  console.log("✅ Done.\n");
}
