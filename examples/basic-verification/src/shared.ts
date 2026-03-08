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
import {
  DeepCitation,
  extractVisibleText,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
  getVerificationTextIndicator,
  replaceCitations,
  wrapCitationPrompt,
} from "deepcitation";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { createInterface } from "readline";
import { fileURLToPath } from "url";

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

  const choice = await ask("Enter choice [1-6]: ");

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

// ─── Workflow ───────────────────────────────────────────────────────────────

/**
 * Run the full 5-step DeepCitation verification workflow for one source.
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

  // ============================================
  // STEP 1: PRE-PROMPT
  // Upload documents and prepare citation-enhanced prompts
  // ============================================

  console.log("📄 Step 1: Uploading document and preparing prompts...\n");

  let attachmentId: string;
  let deepTextPromptPortion: string;
  let imageBase64: string | undefined;

  if (source.type === "url") {
    // URL source — use prepareUrl
    console.log(`   URL: ${source.url}\n`);

    const result = await deepcitation.prepareUrl({ url: source.url });
    attachmentId = result.attachmentId;
    deepTextPromptPortion = result.deepTextPromptPortion;
  } else {
    // File source (image or pdf) — use prepareAttachments
    const fileBuffer = readFileSync(source.path);

    const { fileDataParts, deepTextPromptPortion: dtp } = await deepcitation.prepareAttachments([
      { file: fileBuffer, filename: source.filename },
    ]);

    attachmentId = fileDataParts[0].attachmentId;
    deepTextPromptPortion = dtp;

    // Only pass base64 image data for image sources (vision APIs)
    if (source.type === "image") {
      imageBase64 = fileBuffer.toString("base64");
    }
  }

  console.log("✅ Document uploaded successfully");
  console.log(`   Attachment ID: ${attachmentId}\n`);

  // Wrap your prompts with citation instructions
  const systemPrompt =
    process.env.SYSTEM_PROMPT ||
    `You are a helpful assistant. Answer questions about the
provided documents accurately and cite your sources.`;

  const userQuestion = process.env.USER_PROMPT || "Summarize the key information shown in this document.";

  // Show before prompts
  console.log("📋 System Prompt (BEFORE):");
  console.log(separator);
  console.log(systemPrompt);
  console.log(separator + "\n");

  console.log("📋 User Prompt (BEFORE):");
  console.log(separator);
  console.log(userQuestion);
  console.log(separator + "\n");

  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt,
    userPrompt: userQuestion,
    deepTextPromptPortion,
  });

  // Show after prompts
  console.log("📋 System Prompt (AFTER):");
  console.log(separator);
  console.log(enhancedSystemPrompt);
  console.log(separator + "\n");

  console.log("📋 User Prompt (AFTER):");
  console.log(separator);
  console.log(enhancedUserPrompt);
  console.log(separator + "\n");

  // ============================================
  // STEP 2: CALL LLM
  // Provider-specific streaming call
  // ============================================

  console.log(`🤖 Step 2: Calling ${providerName}...\n`);

  console.log("📝 LLM Response (raw with citations):");
  console.log(separator);

  const llmResponse = await streamLlm({ enhancedSystemPrompt, enhancedUserPrompt, imageBase64 });

  console.log("\n" + separator + "\n");

  // ============================================
  // STEP 3: PARSE CITATIONS & EXTRACT VISIBLE TEXT
  // ============================================

  console.log("🔍 Step 3: Parsing citations and extracting visible text...\n");

  const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);
  const citationCount = Object.keys(parsedCitations).length;

  // IMPORTANT: Extract visible text to strip the <<<CITATION_DATA>>> block
  const visibleText = extractVisibleText(llmResponse);

  console.log(`📋 Parsed ${citationCount} citation(s) from LLM output`);
  for (const [key, citation] of Object.entries(parsedCitations)) {
    console.log(`   [${key}]: "${citation.fullPhrase?.slice(0, 50)}..."`);
  }
  console.log();

  console.log("📖 Visible Text (citation data block stripped):");
  console.log(separator);
  console.log(visibleText);
  console.log(separator + "\n");

  if (citationCount === 0) {
    console.log("⚠️  No citations found in the LLM response.\n");
    return;
  }

  // ============================================
  // STEP 4: VERIFY CITATIONS
  // ============================================

  console.log("🔍 Step 4: Verifying citations against source document...\n");

  const verificationResult = await deepcitation.verifyAttachment(attachmentId, parsedCitations);

  // ============================================
  // STEP 5: DISPLAY RESULTS
  // ============================================

  console.log("✨ Step 5: Verification Results\n");

  const verifications = Object.entries(verificationResult.verifications);

  if (verifications.length === 0) {
    console.log("⚠️  No citations found in the response.\n");
  } else {
    console.log(`Found ${verifications.length} citation(s):\n`);

    for (const [key, verification] of verifications) {
      const statusIndicator = getVerificationTextIndicator(verification);

      console.log(wideSeparator);
      console.log(`Citation [${key}]: ${statusIndicator} ${verification.status}`);
      console.log(wideSubSeparator);

      const fullPhrase = (parsedCitations[key] || verification.citation)?.fullPhrase;
      if (fullPhrase) {
        console.log(
          `  📝 Claimed: "${fullPhrase.slice(0, 100)}${fullPhrase.length > 100 ? "..." : ""}"`,
        );
      } 

      console.log(`  📊 Status: ${statusIndicator} ${verification.status}`);
      console.log(`  📄 Page: ${verification.document?.verifiedPageNumber ?? "N/A"}`);

      if (verification.verifiedMatchSnippet) {
        console.log(
          `  🔍 Found: "${verification.verifiedMatchSnippet.slice(0, 100)}${verification.verifiedMatchSnippet.length > 100 ? "..." : ""}"`,
        );
      } else {
        console.log(` Expected on page ${verification.citation?.pageNumber ?? "N/A"} and ${verification.citation?.lineIds?.length && `${verification.citation?.lineIds?.length > 1 ? "lines" : "line"} ${verification.citation?.lineIds?.join(",")}`}`);
      }


      console.log();
    }
    console.log(wideSeparator + "\n");
  }

  // Clean response
  console.log("📖 Clean Response (for display, with verification status):");
  console.log(separator);
  console.log(
    replaceCitations(visibleText, {
      verifications: verificationResult.verifications,
      showVerificationStatus: true,
    }),
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
}

/**
 * Run the full 5-step DeepCitation verification workflow.
 *
 * Interactive by default — prompts the user to pick a source.
 * Set SOURCE=<index> (0-based) to skip the menu:
 *   SOURCE=0 bun run start:openai   # image
 *   SOURCE=1 bun run start:openai   # pdf
 *   SOURCE=2 bun run start:openai   # url (AI Hallucinations)
 *   SOURCE=all bun run start:openai # run all sources
 */
export async function runWorkflow(providerName: string, streamLlm: StreamLlmFn) {
  console.log(`🔍 DeepCitation Basic Example - ${providerName}\n`);

  const deepcitation = new DeepCitation({
    apiKey: process.env.DEEPCITATION_API_KEY!,
  });

  let sources: Source[];

  if (process.env.SOURCE === "all") {
    // Run all pre-filled sources
    sources = SOURCES;
  } else if (process.env.SOURCE != null) {
    // Run a specific source by index
    const idx = Number(process.env.SOURCE);
    const s = SOURCES[idx];
    if (!s) throw new Error(`Invalid SOURCE=${idx}. Valid range: 0-${SOURCES.length - 1}`);
    sources = [s];
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
