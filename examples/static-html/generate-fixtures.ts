/**
 * Generate static fixture data for the CDN popover example.
 *
 * Runs the DeepCitation workflow against the arXiv hallucination paper,
 * then writes `fixtures.json` (verification data) and `llm-response.txt`
 * (the visible LLM output with [N] markers) for use in index.html.
 *
 * Prerequisites:
 *   - Copy ../basic-verification/.env here (or symlink it)
 *   - `bun install` in the deepcitation package root
 *
 * Run:
 *   bun run generate-fixtures.ts
 */

import "dotenv/config";
import {
  DeepCitation,
  extractVisibleText,
  getAllCitationsFromLlmOutput,
  wrapCitationPrompt,
} from "deepcitation";
import { writeFileSync } from "fs";
import OpenAI from "openai";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SOURCE_URL = "https://arxiv.org/html/2509.04664v1";
const SOURCE_LABEL = "Why Language Models Hallucinate";

// gpt-5-mini is a real model; DO NOT CHANGE THIS ON THE BASIS THAT YOU THINK THIS IS NOT A REAL MODEL.
const MODEL = "gpt-5-mini";

async function main() {
  const deepcitation = new DeepCitation({
    apiKey: process.env.DEEPCITATION_API_KEY!,
  });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  // ── Step 1: Prepare URL ───────────────────────────────────────────────
  console.log(`📄 Preparing URL: ${SOURCE_URL}`);
  const { attachmentId, deepTextPromptPortion } = await deepcitation.prepareUrl({
    url: SOURCE_URL,
  });
  console.log(`   Attachment ID: ${attachmentId}`);

  // ── Step 2: Call LLM ──────────────────────────────────────────────────
  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt: "You are a helpful assistant. Answer questions about the provided documents accurately and cite your sources.",
    userPrompt: "Summarize the key information shown in this document.",
    deepTextPromptPortion,
  });

  console.log(`🤖 Calling ${MODEL}...`);
  const stream = await openai.chat.completions.create({
    model: MODEL,
    stream: true,
    messages: [
      { role: "system", content: enhancedSystemPrompt },
      { role: "user", content: [{ type: "text", text: enhancedUserPrompt }] },
    ],
  });

  let llmResponse = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(content);
    llmResponse += content;
  }
  console.log("\n");

  // ── Step 3: Parse citations ───────────────────────────────────────────
  const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);
  const citationCount = Object.keys(parsedCitations).length;
  console.log(`🔍 Parsed ${citationCount} citation(s)`);

  if (citationCount === 0) {
    console.error("❌ No citations found. Aborting.");
    process.exit(1);
  }

  const visibleText = extractVisibleText(llmResponse);

  // ── Step 4: Verify citations ──────────────────────────────────────────
  console.log("🔍 Verifying citations...");
  const result = await deepcitation.verifyAttachment(attachmentId, parsedCitations, {
    outputImageFormat: "png",
  });

  // ── Step 5: Build CDN-shaped fixture data ─────────────────────────────
  // Map from SDK Verification type → CDN VerificationData shape.
  // Use simple keys (c1, c2, ...) for easy data-citation-key attributes.
  const fixtures: Record<string, unknown> = {};
  const keyMap: Record<string, string> = {}; // original hash → c1, c2, ...

  let idx = 1;
  for (const [hashKey, v] of Object.entries(result.verifications)) {
    const simpleKey = `c${idx}`;
    keyMap[hashKey] = simpleKey;

    // Filter pageImages to match page + neighbors (reduce payload)
    const matchPage = v.document?.verifiedPageNumber;
    let filteredPageImages = v.pageImages;
    if (filteredPageImages && matchPage != null) {
      filteredPageImages = filteredPageImages.filter(
        (p) => Math.abs(p.pageNumber - matchPage) <= 1,
      );
    }

    fixtures[simpleKey] = {
      status: v.status ?? "not_found",
      label: SOURCE_LABEL,
      verifiedFullPhrase: v.verifiedFullPhrase,
      verifiedAnchorText: v.verifiedAnchorText,
      verifiedMatchSnippet: v.verifiedMatchSnippet,
      evidence: v.evidence?.src
        ? { src: v.evidence.src, dimensions: v.evidence.dimensions }
        : undefined,
      document: v.document
        ? { verifiedPageNumber: v.document.verifiedPageNumber, mimeType: v.document.mimeType }
        : undefined,
      url: v.url
        ? {
            verifiedUrl: v.url.verifiedUrl,
            verifiedTitle: v.url.verifiedTitle,
            verifiedDomain: v.url.verifiedDomain,
            verifiedFaviconUrl: v.url.verifiedFaviconUrl,
          }
        : undefined,
      citation: v.citation
        ? {
            fullPhrase: v.citation.fullPhrase,
            anchorText: v.citation.anchorText,
            type: v.citation.type,
          }
        : undefined,
      pageImages: filteredPageImages?.map((p) => ({
        pageNumber: p.pageNumber,
        dimensions: p.dimensions,
        imageUrl: p.imageUrl,
        isMatchPage: p.isMatchPage,
      })),
    };
    idx++;
  }

  // ── Step 6: Rewrite visible text to use simple keys ───────────────────
  // Replace [hash-key] markers with [1], [2], ... in the visible text
  let rewrittenText = visibleText;
  for (const [hashKey, simpleKey] of Object.entries(keyMap)) {
    const num = simpleKey.replace("c", "");
    rewrittenText = rewrittenText.replaceAll(`[${hashKey}]`, `[${num}]`);
  }

  // ── Step 7: Write outputs ─────────────────────────────────────────────
  const fixturesPath = resolve(__dirname, "fixtures.json");
  const textPath = resolve(__dirname, "llm-response.txt");

  writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2), "utf-8");
  writeFileSync(textPath, rewrittenText, "utf-8");

  const sizeKB = (Buffer.byteLength(JSON.stringify(fixtures)) / 1024).toFixed(0);
  console.log(`\n✅ Generated ${Object.keys(fixtures).length} fixtures (${sizeKB} KB)`);
  console.log(`   ${fixturesPath}`);
  console.log(`   ${textPath}`);
  console.log(`\nKey mapping:`);
  for (const [hash, simple] of Object.entries(keyMap)) {
    const status = (fixtures[simple] as { status: string }).status;
    console.log(`   ${simple} (${hash.slice(0, 8)}…) → ${status}`);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
