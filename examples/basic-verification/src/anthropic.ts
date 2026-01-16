/**
 * DeepCitation Basic Example - Anthropic Claude
 *
 * This example demonstrates the complete 4-step workflow:
 * 1. Pre-Prompt: Upload documents and enhance prompts
 * 2. Call LLM: Get response from Claude with citations
 * 3. Verify: Verify citations against source documents
 * 4. Display: Show verification results
 *
 * Run: npm run start:anthropic
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import {
  DeepCitation,
  wrapCitationPrompt,
  getCitationStatus,
  removeCitations,
  getAllCitationsFromLlmOutput,
} from "@deepcitation/deepcitation-js";

// Get current directory for loading sample file
const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize clients
const deepcitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY!,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const model = "claude-3-5-haiku-20241022";

async function main() {
  console.log(`🔍 DeepCitation Basic Example - Anthropic Claude (${model})\n`);

  // ============================================
  // STEP 1: PRE-PROMPT
  // Upload documents and prepare citation-enhanced prompts
  // ============================================

  console.log("📄 Step 1: Uploading document and preparing prompts...\n");

  // Load the sample chart image from shared assets
  const sampleDocument = readFileSync(
    resolve(__dirname, "../../assets/john-doe-50-m-chart.jpg")
  );

  // Upload documents to DeepCitation
  const { fileDataParts, deepTextPromptPortion } =
    await deepcitation.prepareFiles([
      { file: sampleDocument, filename: "john-doe-50-m-chart.jpg" },
    ]);

  // DeepCitation assigns a 20-character alphanumeric attachmentId - save this to use for verification
  const attachmentId = fileDataParts[0].attachmentId;

  console.log("✅ Document uploaded successfully");
  console.log(`   Attachment ID: ${attachmentId}\n`);

  // Wrap your prompts with citation instructions
  const systemPrompt = `You are a helpful assistant. Answer questions about the
provided documents accurately and cite your sources.`;

  const userQuestion = "Summarize the key information shown in this document.";

  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt,
    userPrompt: userQuestion,
    deepTextPromptPortion,
  });

  // ============================================
  // STEP 2: CALL LLM
  // Get response from Claude with citations
  // ============================================

  console.log("🤖 Step 2: Calling Claude...\n");

  // Convert image to base64 for Claude vision API
  const imageBase64 = sampleDocument.toString("base64");

  console.log("📝 LLM Response (raw with citations):");
  console.log("─".repeat(50));

  // Stream the response
  let llmResponse = "";
  const stream = anthropic.messages.stream({
    model,
    max_tokens: 1024,
    system: enhancedSystemPrompt,
    messages: [
      {
        role: "user",
        content: [
          // Include the original file for the LLM to see
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: imageBase64,
            },
          },
          // Include the enhanced user prompt with deepTextPromptPortion
          {
            type: "text",
            text: enhancedUserPrompt,
          },
        ],
      },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      process.stdout.write(event.delta.text);
      llmResponse += event.delta.text;
    }
  }
  console.log("\n" + "─".repeat(50) + "\n");

  // ============================================
  // STEP 3: VERIFY CITATIONS
  // Verify all citations against source documents
  // ============================================

  console.log("🔍 Step 3: Verifying citations against source document...\n");

  // Option A: Let DeepCitation parse citations automatically (simplest)
  // const verificationResult = await deepcitation.verifyCitationsFromLlmOutput({
  //   llmOutput: llmResponse,
  //   fileDataParts,
  // });

  // Option B: Parse citations yourself first (more control, privacy-conscious)
  // This allows you to inspect/filter citations before sending to DeepCitation
  const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);

  console.log(
    `📋 Parsed ${
      Object.keys(parsedCitations).length
    } citation(s) from LLM output`
  );
  for (const [key, citation] of Object.entries(parsedCitations)) {
    console.log(`   [${key}]: "${citation.fullPhrase?.slice(0, 50)}..."`);
  }
  console.log();

  // Now verify only the parsed citations (raw LLM output is not sent)
  const verificationResult = await deepcitation.verifyCitationsFromLlmOutput(
    { llmOutput: llmResponse, fileDataParts },
    parsedCitations
  );

  // ============================================
  // STEP 4: DISPLAY RESULTS
  // Show verification status for each citation
  // ============================================

  console.log("✨ Step 4: Verification Results\n");

  const verifications = Object.entries(verificationResult.verifications);

  if (verifications.length === 0) {
    console.log("⚠️  No citations found in the response.\n");
  } else {
    console.log(`Found ${verifications.length} citation(s):\n`);

    for (const [key, verification] of verifications) {
      const status = getCitationStatus(verification);
      const statusIcon = status.isVerified
        ? status.isPartialMatch
          ? "⚠️ "
          : "✅"
        : status.isPending
        ? "⏳"
        : "❌";

      console.log(`Citation [${key}]: ${statusIcon}`);
      console.log(`  Status: ${verification.status}`);
      console.log(`  Page: ${verification.verifiedPageNumber ?? "N/A"}`);
      console.log(`  Match: "${verification.verifiedMatchSnippet?.slice(0, 80)}..."`);
      console.log(
        `  Has proof image: ${!!verification.verificationImageBase64}`
      );
      console.log();
    }
  }

  // Show clean response (without citation tags)
  console.log("📖 Clean Response (for display):");
  console.log("─".repeat(50));
  console.log(removeCitations(llmResponse));
  console.log("─".repeat(50) + "\n");

  // Summary statistics
  const verified = verifications.filter(
    ([, h]) => getCitationStatus(h).isVerified
  ).length;
  const missed = verifications.filter(
    ([, h]) => getCitationStatus(h).isMiss
  ).length;

  console.log("📊 Summary:");
  console.log(`   Total citations: ${verifications.length}`);
  if (verifications.length > 0) {
    console.log(
      `   Verified: ${verified} (${(
        (verified / verifications.length) *
        100
      ).toFixed(0)}%)`
    );
    console.log(`   Not found: ${missed}`);
  }
}

main().catch(console.error);
