/**
 * DeepCitation URL Example - Interactive TUI
 *
 * This example demonstrates citation verification from web URLs:
 * 1. Prompts for a URL and prepares it for citation verification
 * 2. Prompts for a question about the URL content
 * 3. Gets answer from OpenAI with citations
 * 4. Verifies and displays citations with status
 *
 * Note: URLs and Office files take ~30s to process vs. <1s for images/PDFs.
 *
 * Run: npm run start (or bun run src/url.ts)
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
} from "@deepcitation/deepcitation-js";
import OpenAI from "openai";
import * as readline from "readline";

// Initialize clients
const deepcitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY!,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const model = "gpt-5-mini";

// Create readline interface for TUI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  DeepCitation URL Example - Interactive TUI (${model})`);
  console.log(`${"=".repeat(60)}\n`);

  // ============================================
  // STEP 1: Get URL and prepare for citation
  // ============================================

  const url = await prompt("Enter a URL to analyze: ");

  if (!url) {
    console.log("\nNo URL provided. Exiting.");
    rl.close();
    return;
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    console.log("\nInvalid URL format. Please provide a valid URL.");
    rl.close();
    return;
  }

  // Ask about fast mode
  const fastModeInput = await prompt(
    "Use unsafe fast mode? (y/N) [Fast but vulnerable to hidden text/prompt injection]: ",
  );
  const unsafeFastUrlOutput = fastModeInput.toLowerCase() === "y";

  if (unsafeFastUrlOutput) {
    console.log(`\nPreparing URL (UNSAFE fast mode - <1s)...`);
    console.log(`WARNING: Vulnerable to hidden text, fine print, and prompt injection!`);
  } else {
    console.log(`\nPreparing URL for citation verification...`);
    console.log(`(URLs take ~30s to process vs. <1s for images/PDFs)`);
  }

  let attachmentId: string;
  let deepTextPromptPortion: string;

  try {
    // Single call to prepare URL - handles conversion and text extraction
    const result = await deepcitation.prepareUrl({ url, unsafeFastUrlOutput });

    attachmentId = result.attachmentId;
    deepTextPromptPortion = result.deepTextPromptPortion;

    console.log(`  Filename: ${result.metadata.filename}`);
    console.log(`  Pages: ${result.metadata.pageCount}`);
    console.log(`  Text size: ${Math.round(result.metadata.textByteSize / 1024)}KB`);
    if (result.processingTimeMs) {
      console.log(`  Processing time: ${(result.processingTimeMs / 1000).toFixed(1)}s`);
    }
  } catch (error) {
    console.error(`\nFailed to process URL: ${error instanceof Error ? error.message : error}`);
    rl.close();
    return;
  }

  // ============================================
  // STEP 2: Get question from user
  // ============================================

  console.log("");
  const userQuestion = await prompt("Enter your question about this content: ");

  if (!userQuestion) {
    console.log("\nNo question provided. Exiting.");
    rl.close();
    return;
  }

  // ============================================
  // STEP 3: Prepare prompts and call LLM
  // ============================================

  const systemPrompt =
    process.env.SYSTEM_PROMPT ||
    `You are a helpful assistant. Answer questions based on the provided web content accurately and cite your sources.`;

  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt,
    userPrompt: userQuestion,
    deepTextPromptPortion,
  });

  console.log(`\nQuerying ${model}...\n`);
  console.log("Response:");
  console.log("-".repeat(50));

  // Stream the response
  const stream = await openai.chat.completions.create({
    model,
    stream: true,
    messages: [
      { role: "system", content: enhancedSystemPrompt },
      { role: "user", content: enhancedUserPrompt },
    ],
  });

  let llmResponse = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(content);
    llmResponse += content;
  }
  console.log("\n" + "-".repeat(50));

  // ============================================
  // STEP 4: Parse citations and extract visible text
  // ============================================

  console.log("\nParsing citations and extracting visible text...\n");

  const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);
  const citationCount = Object.keys(parsedCitations).length;

  // IMPORTANT: Extract visible text to strip the <<<CITATION_DATA>>> block
  // The citation data block is for parsing only - users should NEVER see it
  const visibleText = extractVisibleText(llmResponse);

  if (citationCount === 0) {
    console.log("No citations found in the response.\n");
    console.log("Clean Response:");
    console.log("-".repeat(50));
    console.log(visibleText);
    console.log("-".repeat(50));
    rl.close();
    return;
  }

  // ============================================
  // STEP 5: Verify citations
  // ============================================

  console.log(`Found ${citationCount} citation(s). Verifying...\n`);

  const verificationResult = await deepcitation.verifyAttachment(attachmentId, parsedCitations);

  // ============================================
  // STEP 6: Display verification results
  // ============================================

  console.log("Verification Results:");
  console.log("=".repeat(60));

  const verifications = Object.entries(verificationResult.verifications);

  for (const [key, verification] of verifications) {
    const statusIndicator = getVerificationTextIndicator(verification);
    const originalCitation = parsedCitations[key];

    console.log(`\nCitation [${key}]: ${statusIndicator} ${verification.status}`);
    console.log("-".repeat(50));

    if (originalCitation?.fullPhrase) {
      const phrase = originalCitation.fullPhrase;
      console.log(`  Claimed: "${phrase.slice(0, 80)}${phrase.length > 80 ? "..." : ""}"`);
    }

    console.log(`  Status: ${statusIndicator} ${verification.status}`);
    console.log(`  Page: ${verification.verifiedPageNumber ?? "N/A"}`);

    if (verification.verifiedMatchSnippet) {
      const snippet = verification.verifiedMatchSnippet;
      console.log(`  Found: "${snippet.slice(0, 80)}${snippet.length > 80 ? "..." : ""}"`);
    }

    if (verification.verificationImageBase64) {
      const imgSize = Math.round(verification.verificationImageBase64.length / 1024);
      console.log(`  Proof image: Yes (${imgSize}KB)`);
    }
  }

  console.log("\n" + "=".repeat(60));

  // Show clean response with verification indicators
  // Note: We use visibleText (not llmResponse) because the citation data block is already stripped
  console.log("\nClean Response (with verification status):");
  console.log("-".repeat(50));
  console.log(
    replaceCitations(visibleText, {
      verifications: verificationResult.verifications,
      showVerificationStatus: true,
    }),
  );
  console.log("-".repeat(50));

  // Summary statistics
  const verified = verifications.filter(([, v]) => getCitationStatus(v).isVerified).length;
  const partial = verifications.filter(([, v]) => getCitationStatus(v).isPartialMatch).length;
  const missed = verifications.filter(([, v]) => getCitationStatus(v).isMiss).length;

  console.log("\nSummary:");
  console.log(`  Total citations: ${verifications.length}`);
  if (verifications.length > 0) {
    console.log(`  Verified: ${verified} (${((verified / verifications.length) * 100).toFixed(0)}%)`);
    console.log(`  Partial: ${partial} (${((partial / verifications.length) * 100).toFixed(0)}%)`);
    console.log(`  Not found: ${missed}`);
  }

  console.log("");
  rl.close();
}

main().catch(err => {
  console.error("Error:", err);
  rl.close();
  process.exit(1);
});
