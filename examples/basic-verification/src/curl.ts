/**
 * DeepCitation Basic Example - Raw API (curl/fetch)
 *
 * This example demonstrates the complete DeepCitation workflow using raw API calls
 * instead of the DeepCitation client. This is useful for:
 * - Understanding the underlying API
 * - Integrating with other languages
 * - Custom implementations
 *
 * Supports images (vision), PDFs (text-only), and URLs (text-only).
 *
 * IMPORTANT: The LLM response contains a <<<CITATION_DATA>>>...<<<END_CITATION_DATA>>> block
 * that must be stripped before showing to users. Use extractVisibleText() for this.
 *
 * Run: bun run start:curl
 * Run single source: SOURCE=0 bun run start:curl
 */

import "dotenv/config";
import {
  extractVisibleText,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
  getVerificationTextIndicator,
  replaceCitations,
  wrapCitationPrompt,
} from "deepcitation";
import { readFileSync } from "fs";
import OpenAI from "openai";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { SOURCES, promptSourceSelection, type Source } from "./shared.js";

// Get current directory for loading sample files
const __dirname = dirname(fileURLToPath(import.meta.url));

// API configuration
const DEEPCITATION_API_KEY = process.env.DEEPCITATION_API_KEY!;
const DEEPCITATION_BASE_URL = process.env.DEEPCITATION_BASE_URL || "https://api.deepcitation.com";

// Initialize OpenAI client (you can use any LLM provider)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const model = "gpt-5-mini";

// ============================================
// RAW API HELPER FUNCTIONS
// These replace the DeepCitation client methods
// ============================================

/**
 * Upload a file to DeepCitation API and get citation context
 * Equivalent to: deepcitation.prepareAttachments()
 */
async function prepareFileAttachment(
  file: Buffer,
  filename: string,
): Promise<{
  attachmentId: string;
  deepTextPromptPortion: string;
}> {
  const formData = new FormData();
  formData.append("file", new Blob([file]), filename);

  const response = await fetch(`${DEEPCITATION_BASE_URL}/prepareAttachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPCITATION_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to prepare file: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return {
    attachmentId: result.attachmentId,
    deepTextPromptPortion: result.deepTextPromptPortion,
  };
}

/**
 * Prepare a URL for citation verification via raw API call
 * Equivalent to: deepcitation.prepareUrl()
 */
async function prepareUrlAttachment(url: string): Promise<{
  attachmentId: string;
  deepTextPromptPortion: string;
}> {
  const response = await fetch(`${DEEPCITATION_BASE_URL}/prepareAttachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPCITATION_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to prepare URL: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return {
    attachmentId: result.attachmentId,
    deepTextPromptPortion: result.deepTextPromptPortion,
  };
}

/**
 * Verify citations against a source document
 * Equivalent to: deepcitation.verifyAttachment()
 */
async function verifyCitations(
  attachmentId: string,
  citations: Record<string, { fullPhrase?: string; pageNumber?: number }>,
): Promise<{
  verifications: Record<
    string,
    {
      status: string;
      verifiedMatchSnippet?: string;
      document?: { verifiedPageNumber?: number };
      evidence?: { src?: string };
    }
  >;
}> {
  const response = await fetch(`${DEEPCITATION_BASE_URL}/verifyCitations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPCITATION_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        attachmentId,
        citations,
        outputImageFormat: "avif",
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to verify citations: ${response.status} - ${error}`);
  }

  return response.json();
}

async function runSingleSource(source: Source) {
  const separator = "─".repeat(50);

  console.log(`\n${"▓".repeat(60)}`);
  console.log(`▓  Source: ${source.label}`);
  console.log(`▓  Type:   ${source.type}`);
  console.log(`${"▓".repeat(60)}\n`);

  // ============================================
  // STEP 1: SETUP — Upload via raw API call
  // ============================================

  console.log("📄 Step 1: Uploading document via raw API call...\n");

  let attachmentId: string;
  let deepTextPromptPortion: string;
  let imageBase64: string | undefined;

  if (source.type === "url") {
    console.log(`   POST ${DEEPCITATION_BASE_URL}/prepareAttachments`);
    console.log("   Headers: Authorization: Bearer dc_live_***");
    console.log(`   Body: JSON { url: "${source.url}" }\n`);

    ({ attachmentId, deepTextPromptPortion } = await prepareUrlAttachment(source.url));
  } else {
    const fileBuffer = readFileSync(source.path);

    console.log(`   POST ${DEEPCITATION_BASE_URL}/prepareAttachments`);
    console.log("   Headers: Authorization: Bearer dc_live_***");
    console.log(`   Body: FormData with file (${source.filename})\n`);

    ({ attachmentId, deepTextPromptPortion } = await prepareFileAttachment(fileBuffer, source.filename));

    if (source.type === "image") {
      imageBase64 = fileBuffer.toString("base64");
    }
  }

  console.log("✅ Document uploaded successfully");
  console.log(`   Attachment ID: ${attachmentId}\n`);

  // Wrap prompts
  const systemPrompt =
    process.env.SYSTEM_PROMPT ||
    `You are a helpful assistant. Answer questions about the
provided documents accurately and cite your sources.`;

  const userQuestion = process.env.USER_PROMPT || "Summarize the key information shown in this document.";

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
  // ============================================

  console.log("🤖 Step 2: Calling OpenAI...\n");
  console.log("📝 LLM Response (raw with citations):");
  console.log(separator);

  const userContent: OpenAI.ChatCompletionContentPart[] = [];
  if (imageBase64) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
    });
  }
  userContent.push({ type: "text", text: enhancedUserPrompt });

  const stream = await openai.chat.completions.create({
    model,
    stream: true,
    messages: [
      { role: "system", content: enhancedSystemPrompt },
      { role: "user", content: userContent },
    ],
  });

  let llmResponse = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(content);
    llmResponse += content;
  }
  console.log("\n" + separator + "\n");

  // ============================================
  // STEP 3: PARSE CITATIONS
  // ============================================

  console.log("🔍 Step 3: Parsing citations and extracting visible text...\n");

  const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);
  const citationCount = Object.keys(parsedCitations).length;
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
  // STEP 4: VERIFY CITATIONS via raw API
  // ============================================

  console.log("🔍 Step 4: Verifying citations via raw API call...\n");
  console.log(`   POST ${DEEPCITATION_BASE_URL}/verifyCitations`);
  console.log("   Headers: Authorization: Bearer dc_live_***");
  console.log("   Body: { data: { attachmentId, citations, outputImageFormat } }\n");

  const verificationResult = await verifyCitations(attachmentId, parsedCitations);

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

      console.log(`${"═".repeat(60)}`);
      console.log(`Citation [${key}]: ${statusIndicator} ${verification.status}`);
      console.log(`${"─".repeat(60)}`);

      const originalCitation = parsedCitations[key];
      if (originalCitation?.fullPhrase) {
        console.log(
          `  📝 Claimed: "${originalCitation.fullPhrase.slice(0, 100)}${originalCitation.fullPhrase.length > 100 ? "..." : ""}"`,
        );
      }

      console.log(`  📊 Status: ${statusIndicator} ${verification.status}`);
      console.log(`  📄 Page: ${verification.document?.verifiedPageNumber ?? "N/A"}`);

      if (verification.verifiedMatchSnippet) {
        console.log(
          `  🔍 Found: "${verification.verifiedMatchSnippet.slice(0, 100)}${verification.verifiedMatchSnippet.length > 100 ? "..." : ""}"`,
        );
      }

      if (verification.evidence?.src) {
        const imgSize = Math.round(verification.evidence.src.length / 1024);
        console.log(`  🖼️  Proof image: Yes (${imgSize}KB)`);
      } else {
        console.log(`  🖼️  Proof image: No`);
      }

      console.log();
    }
    console.log(`${"═".repeat(60)}\n`);
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

  // Summary
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

async function main() {
  console.log(`🔍 DeepCitation Basic Example - Raw API/curl (${model})\n`);
  console.log("This example uses fetch/curl instead of the DeepCitation client.\n");

  let sources: Source[];

  if (process.env.SOURCE === "all") {
    sources = SOURCES;
  } else if (process.env.SOURCE != null) {
    const idx = Number(process.env.SOURCE);
    const s = SOURCES[idx];
    if (!s) throw new Error(`Invalid SOURCE=${idx}. Valid range: 0-${SOURCES.length - 1}`);
    sources = [s];
  } else {
    const source = await promptSourceSelection();
    sources = [source];
  }

  console.log(`\n📋 Running ${sources.length} source(s):`);
  for (const [i, s] of sources.entries()) {
    const detail = s.type === "url" ? s.url : "filename" in s ? s.filename : "";
    console.log(`   [${i}] ${s.type.padEnd(5)} — ${s.label} (${detail})`);
  }

  for (const source of sources) {
    await runSingleSource(source);
  }

  // Show equivalent curl commands
  console.log("\n" + "═".repeat(60));
  console.log("📋 Equivalent curl commands:\n");

  console.log("# Upload a file (image or PDF)");
  console.log(`curl -X POST "${DEEPCITATION_BASE_URL}/prepareAttachments" \\`);
  console.log('  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \\');
  console.log('  -F "file=@document.pdf"\n');

  console.log("# Prepare a URL");
  console.log(`curl -X POST "${DEEPCITATION_BASE_URL}/prepareAttachments" \\`);
  console.log('  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{ "url": "https://example.com/article" }\'\n');

  console.log("# Verify citations");
  console.log(`curl -X POST "${DEEPCITATION_BASE_URL}/verifyCitations" \\`);
  console.log('  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log("  -d '{");
  console.log('    "data": {');
  console.log('      "attachmentId": "<ATTACHMENT_ID>",');
  console.log('      "citations": { "1": { "fullPhrase": "...", "pageNumber": 1 } },');
  console.log('      "outputImageFormat": "avif"');
  console.log("    }");
  console.log("  }'");

  console.log("\n✅ All sources processed.\n");
}

main().catch(console.error);
