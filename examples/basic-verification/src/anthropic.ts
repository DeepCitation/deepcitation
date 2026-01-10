/**
 * DeepCitation Basic Example - Anthropic Claude
 *
 * This example demonstrates the complete 3-step workflow:
 * 1. Pre-Prompt: Upload documents and enhance prompts
 * 2. Post-Prompt: Verify citations against source documents
 * 3. Display: Show verification results
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

async function main() {
  console.log("🔍 DeepCitation Basic Example - Anthropic Claude\n");

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

  console.log("✅ Document uploaded successfully");
  console.log(`   File ID: ${fileDataParts[0].fileId}\n`);

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
  // STEP 2: CALL LLM & VERIFY
  // Get response from Claude and verify all citations
  // ============================================

  console.log("🤖 Step 2: Calling Claude and verifying citations...\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: enhancedSystemPrompt,
    messages: [{ role: "user", content: enhancedUserPrompt }],
  });

  const llmResponse =
    message.content[0].type === "text" ? message.content[0].text : "";

  console.log("📝 LLM Response (raw with citations):");
  console.log("─".repeat(50));
  console.log(llmResponse);
  console.log("─".repeat(50) + "\n");

  // Verify all citations against the source document
  const verificationResult = await deepcitation.verifyCitationsFromLlmOutput({
    llmOutput: llmResponse,
    fileDataParts,
  });

  // ============================================
  // STEP 3: DISPLAY RESULTS
  // Show verification status for each citation
  // ============================================

  console.log("✨ Step 3: Verification Results\n");

  const highlights = Object.entries(verificationResult.foundHighlights);

  if (highlights.length === 0) {
    console.log("⚠️  No citations found in the response.\n");
  } else {
    console.log(`Found ${highlights.length} citation(s):\n`);

    for (const [key, highlight] of highlights) {
      const status = getCitationStatus(highlight);
      const statusIcon = status.isVerified
        ? status.isPartialMatch
          ? "⚠️ "
          : "✅"
        : status.isPending
        ? "⏳"
        : "❌";

      console.log(`Citation [${key}]: ${statusIcon}`);
      console.log(`  Status: ${highlight.searchState?.status}`);
      console.log(`  Page: ${highlight.pageNumber ?? "N/A"}`);
      console.log(`  Match: "${highlight.matchSnippet?.slice(0, 80)}..."`);
      console.log(`  Has proof image: ${!!highlight.verificationImageBase64}`);
      console.log();
    }
  }

  // Show clean response (without citation tags)
  console.log("📖 Clean Response (for display):");
  console.log("─".repeat(50));
  console.log(removeCitations(llmResponse));
  console.log("─".repeat(50) + "\n");

  // Summary statistics
  const verified = highlights.filter(
    ([, h]) => getCitationStatus(h).isVerified
  ).length;
  const missed = highlights.filter(
    ([, h]) => getCitationStatus(h).isMiss
  ).length;

  console.log("📊 Summary:");
  console.log(`   Total citations: ${highlights.length}`);
  if (highlights.length > 0) {
    console.log(
      `   Verified: ${verified} (${(
        (verified / highlights.length) *
        100
      ).toFixed(0)}%)`
    );
    console.log(`   Not found: ${missed}`);
  }
}

main().catch(console.error);
