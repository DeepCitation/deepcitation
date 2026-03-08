/**
 * DeepCitation Basic Example - Google Gemini
 *
 * This example shows the complete 5-step DeepCitation workflow using Gemini.
 * Only the LLM call (Step 2) is provider-specific — see shared.ts for the
 * full workflow: upload → wrap prompts → parse → verify → display.
 *
 * Supports images (vision), PDFs (text-only), and URLs (text-only).
 *
 * Run: bun run start:gemini
 * Run single source: SOURCE=0 bun run start:gemini
 */

import { type Part, GoogleGenerativeAI } from "@google/generative-ai";
import { runWorkflow } from "./shared.js";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

const model = "gemini-2.0-flash-lite";

runWorkflow(`Google Gemini (${model})`, async ({ enhancedSystemPrompt, enhancedUserPrompt, imageBase64 }) => {
  const geminiModel = genAI.getGenerativeModel({ model });

  const parts: Part[] = [];

  // Include image for vision when available (image sources only)
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
  }

  parts.push({ text: enhancedUserPrompt });

  const result = await geminiModel.generateContentStream({
    systemInstruction: enhancedSystemPrompt,
    contents: [{ role: "user", parts }],
  });

  let response = "";
  for await (const chunk of result.stream) {
    const text = chunk.text();
    process.stdout.write(text);
    response += text;
  }
  return response;
}).catch(console.error);
