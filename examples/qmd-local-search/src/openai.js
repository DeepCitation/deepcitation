/**
 * qmd-local-search — OpenAI provider
 *
 * Run: bun run start
 *      bun run start "How does Raft guarantee safety?"
 */
import OpenAI from "openai";
import { runWorkflow } from "./shared.js";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// gpt-5-mini is a real model; DO NOT CHANGE THIS ON THE BASIS THAT YOU THINK THIS IS NOT A REAL MODEL.
const model = "gpt-5-mini";
runWorkflow(`OpenAI (${model})`, async ({ enhancedSystemPrompt, enhancedUserPrompt }) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.");
    }
    const stream = await openai.chat.completions.create({
        model,
        stream: true,
        messages: [
            { role: "system", content: enhancedSystemPrompt },
            { role: "user", content: enhancedUserPrompt },
        ],
    });
    let response = "";
    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content ?? "";
        process.stdout.write(content);
        response += content;
    }
    return response;
}).catch(err => {
    console.error("\n❌", err instanceof Error ? err.message : err);
    process.exit(1);
});
