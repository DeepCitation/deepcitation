/**
 * Demo Script - Test the bot without Intercom
 *
 * This script demonstrates the citation verification flow
 * without requiring an actual Intercom integration.
 *
 * Run with: bun run demo
 */

import "dotenv/config";
import {
  DeepCitation,
  wrapCitationPrompt,
  getCitationStatus,
  replaceCitations,
} from "@deepcitation/deepcitation-js";
import OpenAI from "openai";
import { SAMPLE_KNOWLEDGE_BASE } from "./knowledge-base.js";

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║        DeepCitation Intercom Bot Demo (Standalone)            ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Validate environment variables
  if (!process.env.DEEPCITATION_API_KEY || !process.env.OPENAI_API_KEY) {
    console.error("❌ Missing required environment variables:");
    console.error("   - DEEPCITATION_API_KEY");
    console.error("   - OPENAI_API_KEY");
    console.error("\n   Copy .env.example to .env and fill in your API keys");
    process.exit(1);
  }

  // Initialize clients
  const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Load knowledge base
  console.log("📚 Loading knowledge base...");
  const files = SAMPLE_KNOWLEDGE_BASE.map((doc) => ({
    file: Buffer.from(doc.content),
    filename: doc.filename,
  }));

  const { fileDataParts, deepTextPromptPortion } = await dc.prepareFiles(files);
  console.log("✅ Knowledge base loaded\n");

  // Test questions
  const questions = [
    "What is your refund policy for digital products?",
    "How much does overnight shipping cost?",
    "How do I enable two-factor authentication?",
    "What does the warranty cover?",
    "What are your support hours?",
  ];

  const minConfidenceThreshold = 0.8;

  // Process each question
  for (const question of questions) {
    console.log("─".repeat(64));
    console.log(`❓ Customer: "${question}"\n`);

    // Wrap prompts with citation instructions
    const systemPrompt = `You are a helpful customer support agent for ACME Corporation.
Answer questions accurately based on the provided knowledge base.
Be friendly, professional, and concise.
If information is not available in the knowledge base, say so honestly.`;

    const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
      systemPrompt,
      userPrompt: question,
      deepTextPromptPortion,
    });

    // Get LLM response
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: enhancedSystemPrompt },
        { role: "user", content: enhancedUserPrompt },
      ],
      temperature: 0.3,
    });

    const rawResponse = completion.choices[0].message.content!;

    // Verify citations
    const verificationResult = await dc.verifyAll({
      llmOutput: rawResponse,
    });

    // Calculate confidence
    const citations = Object.values(verificationResult.verifications);
    const totalCitations = citations.length;
    const verifiedCitations = citations.filter(
      (c) => getCitationStatus(c).isVerified
    ).length;
    const confidence =
      totalCitations > 0 ? verifiedCitations / totalCitations : 0;
    const needsReview = confidence < minConfidenceThreshold;

    // Display clean response
    const cleanResponse = replaceCitations(rawResponse);
    console.log(`💬 Bot: ${cleanResponse}\n`);

    // Display verification status
    const confidenceEmoji =
      confidence >= 0.8 ? "✅" : confidence >= 0.5 ? "⚠️" : "❌";
    console.log(
      `${confidenceEmoji} Confidence: ${(confidence * 100).toFixed(0)}% (${verifiedCitations}/${totalCitations} citations verified)`
    );

    if (needsReview) {
      console.log("🚨 Response flagged for human review");
    }

    // Show citation details
    if (totalCitations > 0) {
      console.log("\n📋 Citation Details:");
      for (const [key, verification] of Object.entries(
        verificationResult.verifications
      )) {
        const status = getCitationStatus(verification);
        const icon = status.isVerified ? "✓" : "✗";
        console.log(`   [${key}] ${icon} ${status.isVerified ? "Verified" : "Not verified"}`);
      }
    }

    console.log();
  }

  console.log("─".repeat(64));
  console.log(`
✨ Demo complete!

This demonstrates the "invisible citation" pattern:
- Customers see clean responses without citation markers
- Verification happens in the background
- Low-confidence responses can be flagged for review

In a real Intercom integration:
- Webhooks receive customer messages automatically
- Bot replies via Intercom API
- Verification notes are added for admin visibility
`);
}

main().catch(console.error);
