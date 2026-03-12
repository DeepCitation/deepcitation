/**
 * DeepCitation Basic Example - Anthropic Claude
 *
 * This example shows the complete DeepCitation workflow using Claude.
 * Only the LLM call (Step 2) is provider-specific — see shared.ts for the
 * full workflow: upload → wrap prompts → parse → verify → display.
 *
 * Supports images (vision), PDFs (text-only), and URLs (text-only).
 *
 * Run: bun run start:anthropic
 * Run single source: SOURCE=0 bun run start:anthropic
 */

import Anthropic from "@anthropic-ai/sdk";
import { runWorkflow } from "./shared.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const model = "claude-3-5-haiku-20241022";

runWorkflow(`Anthropic Claude (${model})`, async ({ enhancedSystemPrompt, enhancedUserPrompt, imageBase64 }) => {
  const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  // Include image for vision when available (image sources only)
  if (imageBase64) {
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
    });
  }

  userContent.push({ type: "text", text: enhancedUserPrompt });

  const stream = anthropic.messages.stream({
    model,
    max_tokens: 4096,
    system: enhancedSystemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  let response = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);
      response += event.delta.text;
    }
  }
  return response;
}).catch(console.error);
