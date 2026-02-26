/**
 * DeepCitation Basic Example - Raw API (curl/fetch)
 *
 * This example demonstrates the complete 5-step workflow using raw API calls
 * instead of the DeepCitation client. This is useful for:
 * - Understanding the underlying API
 * - Integrating with other languages
 * - Custom implementations
 *
 * IMPORTANT: The LLM response contains a <<<CITATION_DATA>>>...<<<END_CITATION_DATA>>> block
 * that must be stripped before showing to users. Use extractVisibleText() for this.
 *
 * Run: npm run start:curl
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

// Get current directory for loading sample file
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
async function prepareAttachments(
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
      verifiedPageNumber?: number;
      verifiedMatchSnippet?: string;
      verificationImageBase64?: string;
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

async function main() {
  console.log(`🔍 DeepCitation Basic Example - Raw API/curl (${model})\n`);
  console.log("This example uses fetch/curl instead of the DeepCitation client.\n");

  // ============================================
  // STEP 1: PRE-PROMPT
  // Upload documents via raw API call
  // ============================================

  console.log("📄 Step 1: Uploading document via raw API call...\n");

  // Load the sample chart image from shared assets
  const sampleDocument = readFileSync(resolve(__dirname, "../../assets/john-doe-50-m-chart.jpg"));

  // Upload using raw fetch call
  console.log(`   POST ${DEEPCITATION_BASE_URL}/prepareAttachments`);
  console.log("   Headers: Authorization: Bearer dc_live_***");
  console.log("   Body: FormData with file\n");

  const { attachmentId, deepTextPromptPortion } = await prepareAttachments(sampleDocument, "john-doe-50-m-chart.jpg");

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

  // Parse citations from LLM output
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
  // Verify via raw API call
  // ============================================

  console.log("🔍 Step 4: Verifying citations via raw API call...\n");

  // Show the raw API call being made
  console.log(`   POST ${DEEPCITATION_BASE_URL}/verifyCitations`);
  console.log("   Headers: Authorization: Bearer dc_live_***");
  console.log("   Body: { data: { attachmentId, citations, outputImageFormat } }\n");

  const verificationResult = await verifyCitations(attachmentId, parsedCitations);

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
      console.log(`  📄 Page: ${verification.verifiedPageNumber ?? "N/A"}`);

      if (verification.verifiedMatchSnippet) {
        console.log(
          `  🔍 Found: "${verification.verifiedMatchSnippet.slice(0, 100)}${verification.verifiedMatchSnippet.length > 100 ? "..." : ""}"`,
        );
      }

      if (verification.verificationImageBase64) {
        const imgSize = Math.round(verification.verificationImageBase64.length / 1024);
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

  // Show equivalent curl commands
  console.log("\n" + "═".repeat(60));
  console.log("📋 Equivalent curl commands:\n");
  console.log("# Step 1: Upload file");
  console.log(`curl -X POST "${DEEPCITATION_BASE_URL}/prepareAttachments" \\`);
  console.log('  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \\');
  console.log('  -F "file=@john-doe-50-m-chart.jpg"\n');
  console.log("# Step 3: Verify citations");
  console.log(`curl -X POST "${DEEPCITATION_BASE_URL}/verifyCitations" \\`);
  console.log('  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log("  -d '{");
  console.log('    "data": {');
  console.log(`      "attachmentId": "${attachmentId}",`);
  console.log('      "citations": { "1": { "fullPhrase": "...", "pageNumber": 1 } },');
  console.log('      "outputImageFormat": "avif"');
  console.log("    }");
  console.log("  }'");
}

main().catch(console.error);
