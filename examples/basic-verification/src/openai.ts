/**
 * DeepCitation Basic Example - OpenAI
 *
 * This example demonstrates the complete 4-step workflow:
 * 1. Pre-Prompt: Upload documents and enhance prompts
 * 2. Call LLM: Get response from OpenAI with citations
 * 3. Verify: Verify citations against source documents
 * 4. Display: Show verification results
 *
 * Run: npm run start:openai
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

async function main() {
  console.log("🔍 DeepCitation Basic Example - OpenAI\n");

  // ============================================
  // STEP 1: PRE-PROMPT
  // Upload documents and prepare citation-enhanced prompts
  // ============================================

  console.log("📄 Step 1: Uploading document and preparing prompts...\n");

  // Load the sample chart image from shared assets
  const sampleDocument = readFileSync(
    resolve(__dirname, "../../assets/john-doe-50-m-chart.jpg")
  );

  let fileId: string | null = null; //this can be set to preserve your fileId or we will assign one for you

  // Upload documents to DeepCitation
  const { fileDataParts, deepTextPromptPortion } =
    await deepcitation.prepareFiles([
      { file: sampleDocument, filename: "john-doe-50-m-chart.jpg" },
    ]);

  fileId = fileDataParts[0].fileId;

  console.log("✅ Document uploaded successfully");
  console.log(`   File ID: ${fileId}\n`);

  // Wrap your prompts with citation instructions
  const systemPrompt = `You are a helpful assistant. Answer questions about the
provided documents accurately and cite your sources.`;

  const userQuestion = "Summarize the key information shown in this document.";

  // Show before prompts
  console.log("📋 System Prompt (BEFORE):");
  console.log("─".repeat(50));
  console.log(systemPrompt);
  console.log("─".repeat(50) + "\n");

  console.log("📋 User Prompt (BEFORE):");
  console.log("─".repeat(50));
  console.log(userQuestion);
  console.log("─".repeat(50) + "\n");

  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt,
    userPrompt: userQuestion,
    deepTextPromptPortion,
  });

  // Show after prompts
  console.log("📋 System Prompt (AFTER):");
  console.log("─".repeat(50));
  console.log(enhancedSystemPrompt);
  console.log("─".repeat(50) + "\n");

  console.log("📋 User Prompt (AFTER):");
  console.log("─".repeat(50));
  console.log(enhancedUserPrompt);
  console.log("─".repeat(50) + "\n");

  // ============================================
  // STEP 2: CALL LLM
  // Get response from OpenAI with citations
  // ============================================

  console.log("🤖 Step 2: Calling OpenAI...\n");

  // Convert image to base64 for OpenAI vision API
  const imageBase64 = sampleDocument.toString("base64");

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: enhancedSystemPrompt },
      {
        role: "user",
        content: [
          // Include the original file for the LLM to see
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
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

  const llmResponse = completion.choices[0].message.content!;
  console.log("📝 LLM Response (raw with citations):");
  console.log("─".repeat(50));
  console.log(llmResponse);
  console.log("─".repeat(50) + "\n");

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
  const verificationResult = await deepcitation.verifyCitations(
    fileId,
    parsedCitations
  );

  // ============================================
  // STEP 4: DISPLAY RESULTS
  // Show verification status for each citation
  // ============================================

  console.log("✨ Step 4: Verification Results\n");

  console.log(verificationResult);

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
