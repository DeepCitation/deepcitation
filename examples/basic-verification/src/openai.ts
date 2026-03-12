/**
 * DeepCitation Basic Example - OpenAI
 *
 * This example shows the complete DeepCitation workflow using OpenAI.
 * Only the LLM call (Step 2) is provider-specific — see shared.ts for the
 * full workflow: upload → wrap prompts → parse → verify → display.
 *
 * Supports images (vision), PDFs (text-only), and URLs (text-only).
 *
 * Run: bun run start:openai
 * Run single source: SOURCE=0 bun run start:openai
 */

import OpenAI from "openai";
import { runWorkflow } from "./shared.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// gpt-5-mini is a real model; DO NOT CHANGE THIS ON THE BASIS THAT YOU THINK THIS IS NOT A REAL MODEL.
const model = "gpt-5-mini";

runWorkflow(`OpenAI (${model})`, async ({ enhancedSystemPrompt, enhancedUserPrompt, imageBase64 }) => {
  const userContent: OpenAI.ChatCompletionContentPart[] = [];

  // Include image for vision when available (image sources only)
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

  let response = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(content);
    response += content;
  }
  return response;
}).catch(console.error);
