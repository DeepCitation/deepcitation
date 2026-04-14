/**
 * Shared workflow for DeepCitation basic examples.
 *
 * Each provider example only needs to implement the LLM streaming call.
 * This module handles the common steps: upload, prompt wrapping, parsing,
 * verification, and result display.
 *
 * Supports three source types:
 * - **image**: Upload an image file (LLM receives base64 for vision)
 * - **pdf**: Upload a PDF file (LLM receives extracted text only)
 * - **url**: Fetch & convert a URL (LLM receives extracted text only)
 */

import "dotenv/config";
import { DeepCitation } from "deepcitation/client";
import {
  type AttachmentAssets,
  type CitationRecord,
  extractVisibleText,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
  getVerificationTextIndicator,
  replaceCitationMarkers,
} from "deepcitation";
import { wrapCitationPrompt } from "deepcitation/prompts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

import { generateHtmlReport } from "./html-report.js";

// Get current directory for loading sample files
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Source definitions ─────────────────────────────────────────────────────

export type Source =
  | { type: "image"; path: string; filename: string; label: string }
  | { type: "pdf"; path: string; filename: string; label: string }
  | { type: "url"; url: string; label: string };

/**
 * Pre-filled sources that exercise every supported input type.
 * Override by setting SOURCE=<index> (0-based) to run a single source.
 */
export const SOURCES: Source[] = [
  // Local files
  {
    type: "image",
    path: resolve(__dirname, "../../assets/john-doe-50-m-chart.jpg"),
    filename: "john-doe-50-m-chart.jpg",
    label: "Medical chart image",
  },
  {
    type: "pdf",
    path: resolve(__dirname, "../../assets/PPT1.pdf"),
    filename: "PPT1.pdf",
    label: "PDF presentation",
  },
  {
    type: "url",
    url: "https://arxiv.org/html/2509.04664v1",
    label: "arXiv HTML paper",
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Callback that each provider implements to stream LLM output.
 * Should write chunks to stdout and return the full concatenated response.
 *
 * `imageBase64` is only provided for image sources (vision APIs).
 * For PDF/URL sources the LLM receives the extracted text via the enhanced prompts.
 */
export type StreamLlmFn = (params: {
  enhancedSystemPrompt: string;
  enhancedUserPrompt: string;
  imageBase64?: string;
}) => Promise<string>;

// ─── Interactive menu ───────────────────────────────────────────────────────

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (answer) => { rl.close(); res(answer.trim()); }));
}

export async function promptSourceSelection(): Promise<Source> {
  console.log("\nChoose a source to verify:\n");
  console.log("  [1] 🖼️  Image  — Medical chart (john-doe-50-m-chart.jpg)");
  console.log("  [2] 📄 PDF    — Presentation (PPT1.pdf)");
  console.log("  [3] 🔗 URL    — arXiv HTML paper (2509.04664v1)");
  console.log("  [4] 🔗 Custom — Enter your own URL");
  console.log();

  const choice = await ask("Enter choice [1-4]: ");

  switch (choice) {
    case "1": return SOURCES[0];
    case "2": return SOURCES[1];
    case "3": return SOURCES[2];
    case "4": {
      const url = await ask("Enter URL: ");
      if (!url) throw new Error("No URL provided.");
      return { type: "url", url, label: "Custom URL" };
    }
    default:
      throw new Error(`Invalid choice: "${choice}". Expected 1-4.`);
  }
}

// ─── Step result types ─────────────────────────────────────────────────────

export interface Step1Result {
  attachmentId: string;
  deepTextPages: string[];
  imageBase64?: string;
  sourceLabel: string;
}

export interface Step2Result {
  enhancedSystemPrompt: string;
  enhancedUserPrompt: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface Step3Result {
  llmResponse: string;
}

export interface Step4Result {
  parsedCitations: CitationRecord;
  visibleText: string;
  citationCount: number;
}

export interface Step5Result {
  verifications: Record<string, unknown>;
  attachments?: Record<string, AttachmentAssets>;
}

export interface Step6Result {
  htmlPath: string;
  snapshotPath: string;
}

// ─── Step functions (silent — no console output) ───────────────────────────

export async function stepUpload(dc: DeepCitation, source: Source): Promise<Step1Result> {
  const sourceLabel = source.type === "url" ? source.url : "filename" in source ? source.filename : source.label;

  if (source.type === "url") {
    const result = await dc.prepareUrl({ url: source.url });
    return { attachmentId: result.attachmentId, deepTextPages: result.deepTextPages, sourceLabel };
  }

  const fileBuffer = readFileSync(source.path);
  const { fileDataParts, deepTextPagesByAttachmentId } = await dc.prepareAttachments([
    { file: fileBuffer, filename: source.filename },
  ]);

  const attachmentId = fileDataParts[0].attachmentId;
  const deepTextPages = deepTextPagesByAttachmentId[attachmentId] ?? [];

  return {
    attachmentId,
    deepTextPages,
    imageBase64: source.type === "image" ? fileBuffer.toString("base64") : undefined,
    sourceLabel,
  };
}

export function stepWrapPrompts(
  step1: Pick<Step1Result, "attachmentId" | "deepTextPages">,
  opts?: { systemPrompt?: string; userPrompt?: string },
): Step2Result {
  const systemPrompt =
    opts?.systemPrompt ??
    process.env.SYSTEM_PROMPT ??
    `You are a helpful assistant. Answer questions about the
provided documents accurately and cite your sources.`;

  const userPrompt =
    opts?.userPrompt ??
    process.env.USER_PROMPT ??
    "Summarize the key information shown in this document.";

  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt,
    userPrompt,
    deepTextPagesByAttachmentId: { [step1.attachmentId]: step1.deepTextPages },
  });

  return { enhancedSystemPrompt, enhancedUserPrompt, systemPrompt, userPrompt };
}

export async function stepCallLlm(
  streamLlm: StreamLlmFn,
  prompts: Step2Result,
  imageBase64?: string,
): Promise<Step3Result> {
  const llmResponse = await streamLlm({
    enhancedSystemPrompt: prompts.enhancedSystemPrompt,
    enhancedUserPrompt: prompts.enhancedUserPrompt,
    imageBase64,
  });
  return { llmResponse };
}

export function stepParseCitations(llmResponse: string): Step4Result {
  const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);
  const visibleText = extractVisibleText(llmResponse);
  return { parsedCitations, visibleText, citationCount: Object.keys(parsedCitations).length };
}

export async function stepVerify(
  dc: DeepCitation,
  attachmentId: string,
  parsedCitations: CitationRecord,
): Promise<Step5Result> {
  const result = await dc.verifyAttachment(attachmentId, parsedCitations);
  return {
    verifications: result.verifications,
    attachments: result.attachments,
  };
}

export function stepGenerateHtml(
  step4: Step4Result,
  step5: Step5Result,
  sourceLabel: string,
  outDir: string,
): Step6Result {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const html = generateHtmlReport({
    visibleText: step4.visibleText,
    parsedCitations: step4.parsedCitations,
    verifications: step5.verifications,
    title: sourceLabel,
    attachments: step5.attachments,
  });

  const safeName = toSafeName(sourceLabel);
  const htmlPath = resolve(outDir, `${safeName}-verified.html`);
  writeFileSync(htmlPath, html);

  const snapshotPath = resolve(outDir, `${safeName}-snapshot.json`);
  writeFileSync(snapshotPath, JSON.stringify({
    llmResponse: undefined, // caller can override if available
    verifications: step5.verifications,
    attachments: step5.attachments,
    title: sourceLabel,
  }, null, 2));

  return { htmlPath, snapshotPath };
}

export function toSafeName(label: string): string {
  return label.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 50);
}

export const DEFAULT_OUT_DIR = resolve(__dirname, "../../output");

// ─── Workflow (uses step functions with logging) ───────────────────────────

/**
 * Run the full DeepCitation verification workflow for one source.
 */
async function runSingleSource(
  deepcitation: DeepCitation,
  providerName: string,
  source: Source,
  streamLlm: StreamLlmFn,
) {
  const separator = "─".repeat(50);
  const wideSeparator = "═".repeat(60);
  const wideSubSeparator = "─".repeat(60);

  console.log(`\n${"▓".repeat(60)}`);
  console.log(`▓  Source: ${source.label}`);
  console.log(`▓  Type:   ${source.type}`);
  console.log(`${"▓".repeat(60)}\n`);

  // ── Step 1: Upload ──
  console.log("📄 Step 1: Uploading document and preparing prompts...\n");
  if (source.type === "url") console.log(`   URL: ${source.url}\n`);

  const s1 = await stepUpload(deepcitation, source);

  console.log("✅ Document uploaded successfully");
  console.log(`   Attachment ID: ${s1.attachmentId}\n`);

  // ── Step 2: Wrap Prompts ──
  const s2 = stepWrapPrompts(s1);

  console.log("📋 System Prompt (BEFORE):");
  console.log(separator);
  console.log(s2.systemPrompt);
  console.log(separator + "\n");

  console.log("📋 User Prompt (BEFORE):");
  console.log(separator);
  console.log(s2.userPrompt);
  console.log(separator + "\n");

  console.log("📋 System Prompt (AFTER):");
  console.log(separator);
  console.log(s2.enhancedSystemPrompt);
  console.log(separator + "\n");

  console.log("📋 User Prompt (AFTER):");
  console.log(separator);
  console.log(s2.enhancedUserPrompt);
  console.log(separator + "\n");

  // ── Step 3: Call LLM ──
  console.log(`🤖 Step 2: Calling ${providerName}...\n`);
  console.log("📝 LLM Response (raw with citations):");
  console.log(separator);

  const s3 = await stepCallLlm(streamLlm, s2, s1.imageBase64);

  console.log("\n" + separator + "\n");

  // ── Step 4: Parse Citations ──
  console.log("🔍 Step 3: Parsing citations and extracting visible text...\n");

  const s4 = stepParseCitations(s3.llmResponse);

  console.log(`📋 Parsed ${s4.citationCount} citation(s) from LLM output`);
  for (const [key, citation] of Object.entries(s4.parsedCitations)) {
    console.log(`   [${key}]: "${citation.fullPhrase?.slice(0, 50)}..."`);
  }
  console.log();

  console.log("📖 Visible Text (citation data block stripped):");
  console.log(separator);
  console.log(s4.visibleText);
  console.log(separator + "\n");

  if (s4.citationCount === 0) {
    console.log("⚠️  No citations found in the LLM response.\n");
    return;
  }

  // ── Step 5: Verify ──
  console.log("🔍 Step 4: Verifying citations against source document...\n");

  const s5 = await stepVerify(deepcitation, s1.attachmentId, s4.parsedCitations);

  // ── Display Results ──
  console.log("✨ Step 5: Verification Results\n");

  const verifications = Object.entries(s5.verifications) as [string, any][];

  if (verifications.length === 0) {
    console.log("⚠️  No citations found in the response.\n");
  } else {
    console.log(`Found ${verifications.length} citation(s):\n`);

    // verifiedMatchSnippet is the legacy field name (renamed to verifiedSourceContext)
    type LegacyVerification = (typeof verifications)[number][1] & { verifiedMatchSnippet?: string };

    for (const [key, verification] of verifications) {
      const statusIndicator = getVerificationTextIndicator(verification);

      console.log(wideSeparator);
      console.log(`Citation [${key}]: ${statusIndicator} ${verification.status} | Page: ${verification.document?.verifiedPageNumber ?? "N/A"}`);
      console.log(wideSubSeparator);

      const fullPhrase = (s4.parsedCitations[key] || verification.citation)?.fullPhrase;
      if (fullPhrase) {
        console.log(
          `  📝 Claimed: "${fullPhrase.slice(0, 100)}${fullPhrase.length > 100 ? "..." : ""}"`,
        );
      }

      const foundSnippet = verification.verifiedSourceContext
        || (verification as LegacyVerification).verifiedMatchSnippet;
      if (foundSnippet) {
        console.log(
          `  🔍 Found: "${foundSnippet.slice(0, 100)}${foundSnippet.length > 100 ? "..." : ""}"`,
        );
      } else {
        const lineInfo = verification.citation?.lineIds?.length
          ? ` and ${verification.citation.lineIds.length > 1 ? "lines" : "line"} ${verification.citation.lineIds.join(",")}`
          : "";
        console.log(`  Expected on page ${verification.citation?.pageNumber ?? "N/A"}${lineInfo}`);
      }


      console.log();
    }
    console.log(wideSeparator + "\n");
  }

  // Clean response
  console.log("📖 Clean Response (for display):");
  console.log(separator);
  console.log(
    replaceCitationMarkers(s4.visibleText),
  );
  console.log(separator + "\n");

  // Summary statistics
  const verified = verifications.filter(([, h]) => getCitationStatus(h).isVerified).length;
  const partial = verifications.filter(([, h]) => getCitationStatus(h).isPartialMatch).length;
  const missed = verifications.filter(([, h]) => getCitationStatus(h).isMiss).length;

  console.log("📊 Summary:");
  console.log(`   Total citations: ${verifications.length}`);
  if (verifications.length > 0) {
    console.log(`   Verified: ${verified} (${((verified / verifications.length) * 100).toFixed(0)}%)`);
    console.log(`   Partial: ${partial} (${((partial / verifications.length) * 100).toFixed(0)}%)`);
    console.log(`   Not found: ${missed}`);
  }

  // ── Step 6: Generate HTML ──
  console.log("\n📄 Step 6: Generating HTML report...\n");

  const sourceLabel = s1.sourceLabel;
  // Use a provider-specific subdirectory so concurrent runs don't clobber each other
  const providerSlug = providerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const outDir = resolve(DEFAULT_OUT_DIR, providerSlug);
  const s6 = stepGenerateHtml(s4, s5, sourceLabel, outDir);

  // Overwrite snapshot with llmResponse included
  writeFileSync(s6.snapshotPath, JSON.stringify({
    llmResponse: s3.llmResponse,
    verifications: s5.verifications,
    attachments: s5.attachments,
    title: sourceLabel,
  }, null, 2));

  console.log(`   Snapshot: ${s6.snapshotPath}`);
  console.log(`   Written: ${s6.htmlPath}`);
  console.log(`   Citations: ${s4.citationCount}, Verifications: ${Object.keys(s5.verifications).length}`);

  // Open in browser (WSL → Linux → macOS — silent on failure)
  try {
    const winPath = execFileSync("wslpath", ["-w", s6.htmlPath], { encoding: "utf-8" }).trim();
    execFileSync("explorer.exe", [winPath], { stdio: "ignore", timeout: 5000 });
  } catch {
    try { execFileSync("xdg-open", [s6.htmlPath], { stdio: "ignore", timeout: 5000 }); }
    catch { try { execFileSync("open", [s6.htmlPath], { stdio: "ignore", timeout: 5000 }); } catch { /* manual open */ } }
  }

  console.log(`   Open: ${s6.htmlPath}\n`);
}

/**
 * Run the full DeepCitation verification workflow.
 *
 * Source selection priority (first match wins):
 *   1. URL argument:   bun src/openai.ts https://example.com/doc.pdf
 *   2. Path argument:  bun src/openai.ts /path/to/file.pdf
 *   3. Index argument: bun src/openai.ts 2    (into SOURCES array)
 *   4. "all" argument: bun src/openai.ts all  (run all predefined sources)
 *   5. Interactive:    prompts the user to pick a source (no argument)
 *
 * Predefined SOURCES index reference:
 *   0 = image (medical chart)
 *   1 = pdf   (presentation)
 *   2 = url   (arXiv HTML paper)
 */
export async function runWorkflow(providerName: string, streamLlm: StreamLlmFn) {
  console.log(`🔍 DeepCitation Basic Example - ${providerName}\n`);

  const deepcitation = new DeepCitation({
    apiKey: process.env.DEEPCITATION_API_KEY!,
  });

  // CLI arg takes precedence over env var
  const sourceArg = process.argv[2] ?? process.env.SOURCE;

  let sources: Source[];

  if (sourceArg === "all") {
    // Run all pre-filled sources
    sources = SOURCES;
  } else if (sourceArg != null) {
    const parsedUrl = (() => { try { return new URL(sourceArg); } catch { return null; } })();
    const resolvedPath = resolve(sourceArg);
    if (parsedUrl?.protocol === "http:" || parsedUrl?.protocol === "https:") {
      sources = [{ type: "url", url: sourceArg, label: sourceArg }];
    } else if (existsSync(resolvedPath)) {
      const filename = basename(resolvedPath);
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
      sources = [{ type: isImage ? "image" : "pdf", path: resolvedPath, filename, label: filename }];
    } else {
      const idx = Number(sourceArg);
      const s = SOURCES[idx];
      if (!s) throw new Error(`Invalid source "${sourceArg}". Expected: a URL, a file path, a number 0-${SOURCES.length - 1}, or "all"`);
      sources = [s];
    }
  } else {
    // Interactive menu
    const source = await promptSourceSelection();
    sources = [source];
  }

  console.log(`\n📋 Running ${sources.length} source(s):`);
  for (const [i, s] of sources.entries()) {
    const detail = s.type === "url" ? s.url : "filename" in s ? s.filename : "";
    console.log(`   [${i}] ${s.type.padEnd(5)} — ${s.label} (${detail})`);
  }

  for (const source of sources) {
    await runSingleSource(deepcitation, providerName, source, streamLlm);
  }

  console.log("\n✅ All sources processed.\n");
}
