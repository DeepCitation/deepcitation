/**
 * DeepCitation Basic Example - OpenAI
 *
 * This example demonstrates the complete 5-step workflow:
 * 1. Pre-Prompt: Upload documents and enhance prompts
 * 2. Call LLM: Get response from OpenAI with citations
 * 3. Parse & Extract: Parse citations and extract visible text (strip citation data block)
 * 4. Verify: Verify citations against attachments
 * 5. Display: Show verification results
 *
 * IMPORTANT: The LLM response contains a <<<CITATION_DATA>>>...<<<END_CITATION_DATA>>> block
 * that must be stripped before showing to users. Use extractVisibleText() for this.
 *
 * Run: npm run start:openai
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
import OpenAI from "openai";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// Get current directory for loading sample file
const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize clients
const deepcitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY!,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const model = "gpt-5-mini";

async function main() {
  console.log(`🔍 DeepCitation Basic Example - OpenAI (${model})\n`);

  // ============================================
  // STEP 1: PRE-PROMPT
  // Upload documents and prepare citation-enhanced prompts
  // ============================================

  console.log("📄 Step 1: Uploading document and preparing prompts...\n");

  // Load the sample chart image from shared assets
  const sampleDocument = readFileSync(resolve(__dirname, "../../assets/john-doe-50-m-chart.jpg"));

  // Upload documents to DeepCitation
  const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareAttachments([
    { file: sampleDocument, filename: "john-doe-50-m-chart.jpg" },
  ]);

  // DeepCitation assigns a 20-character alphanumeric attachmentId - save this to use for verification
  const attachmentId = fileDataParts[0].attachmentId;

  console.log("✅ Document uploaded successfully");
  console.log(`   Attachment ID: ${attachmentId}\n`);

  // Wrap your prompts with citation instructions
  // These can be overridden via environment variables
  const systemPrompt =
    process.env.SYSTEM_PROMPT ||
    `You are a helpful assistant. Answer questions about the
provided documents accurately and cite your sources.`;

  const userQuestion = process.env.USER_PROMPT || "Summarize the key information shown in this document.";

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

  console.log("📝 LLM Response (raw with citations):");
  console.log("─".repeat(50));

  // Stream the response
  const stream = await openai.chat.completions.create({
    model,
    stream: true,
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

  let llmResponse = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(content);
    llmResponse += content;
  }
  console.log("\n" + "─".repeat(50) + "\n");

  // ============================================
  // STEP 3: PARSE CITATIONS & EXTRACT VISIBLE TEXT
  // The LLM response contains a <<<CITATION_DATA>>> block that must be stripped
  // ============================================

  console.log("🔍 Step 3: Parsing citations and extracting visible text...\n");

  // Option A: Let DeepCitation parse and verify automatically (recommended)
  // const verificationResult = await deepcitation.verify({
  //   llmOutput: llmResponse,
  // });

  // Option B: Parse citations yourself first (more control, privacy-conscious)
  // This allows you to inspect/filter citations before sending to DeepCitation
  const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);
  const citationCount = Object.keys(parsedCitations).length;

  // IMPORTANT: Extract visible text to strip the <<<CITATION_DATA>>> block
  // The citation data block is for parsing only - users should NEVER see it
  const visibleText = extractVisibleText(llmResponse);

  console.log(`📋 Parsed ${citationCount} citation(s) from LLM output`);
  for (const [key, citation] of Object.entries(parsedCitations)) {
    console.log(`   [${key}]: "${citation.fullPhrase?.slice(0, 50)}..."`);
  }
  console.log();

  console.log("📖 Visible Text (citation data block stripped):");
  console.log("─".repeat(50));
  console.log(visibleText);
  console.log("─".repeat(50) + "\n");

  // Skip verification if no citations were parsed
  if (citationCount === 0) {
    console.log("⚠️  No citations found in the LLM response.\n");
    return;
  }

  // ============================================
  // STEP 4: VERIFY CITATIONS
  // Verify all citations against attachments
  // ============================================

  console.log("🔍 Step 4: Verifying citations against source document...\n");

  const verificationResult = await deepcitation.verifyAttachment(attachmentId, parsedCitations);

  // ============================================
  // STEP 5: DISPLAY RESULTS
  // Show verification status for each citation
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

      // Original citation from LLM
      const originalCitation = parsedCitations[key];
      if (originalCitation?.fullPhrase) {
        console.log(
          `  📝 Claimed: "${originalCitation.fullPhrase.slice(0, 100)}${originalCitation.fullPhrase.length > 100 ? "..." : ""}"`,
        );
      }

      // Verification details
      console.log(`  📊 Status: ${statusIndicator} ${verification.status}`);
      console.log(`  📄 Page: ${verification.document?.verifiedPageNumber ?? "N/A"}`);

      if (verification.verifiedMatchSnippet) {
        console.log(
          `  🔍 Found: "${verification.verifiedMatchSnippet.slice(0, 100)}${verification.verifiedMatchSnippet.length > 100 ? "..." : ""}"`,
        );
      }

      if (verification.document?.verificationImageSrc) {
        const imgSize = Math.round(verification.document?.verificationImageSrc.length / 1024);
        console.log(`  🖼️  Proof image: Yes (${imgSize}KB)`);
      } else {
        console.log(`  🖼️  Proof image: No`);
      }

      console.log();
    }
    console.log(`${"═".repeat(60)}\n`);
  }

  // Show clean response (without citation tags, with verification status)
  // Note: We use visibleText (not llmResponse) because the citation data block is already stripped
  console.log("📖 Clean Response (for display, with verification status):");
  console.log("─".repeat(50));
  console.log(
    replaceCitations(visibleText, {
      verifications: verificationResult.verifications,
      showVerificationStatus: true,
    }),
  );
  console.log("─".repeat(50) + "\n");

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

main().catch(console.error);
