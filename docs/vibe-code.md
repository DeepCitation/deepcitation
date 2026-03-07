---
layout: default
title: Vibe Code with DeepCitation
nav_order: 6
description: "Copy-paste prompts for AI coding agents to integrate DeepCitation in minutes"
commit_sha: "cc9c7aa"
stale_after_commits: 30
watch_paths:
  - README.md
  - INTEGRATION.md
  - src/index.ts
---

# Vibe Code with DeepCitation

Using Cursor, Claude Code, GitHub Copilot, or another AI coding assistant? Copy one of these prompts and paste it into your agent. You'll have a working integration in minutes.

{: .note }
Every prompt references `llms-full.txt` — the machine-readable API spec agents use. It's more reliable than docs pages and includes all types, method signatures, and examples.

---

## Quick Prompt

Works with any backend stack. The agent fills in the framework-specific wiring.

<div class="dc-prompt-block" id="block-quick">
  <div class="dc-prompt-header">
    <span class="dc-prompt-label">General</span>
    <button class="dc-copy-btn" data-target="quick">Copy</button>
  </div>
  <pre class="dc-prompt-pre" id="pre-quick"></pre>
</div>

---

## Framework-Specific Prompts

### Next.js App Router

<div class="dc-prompt-block" id="block-nextjs">
  <div class="dc-prompt-header">
    <span class="dc-prompt-label">Next.js App Router</span>
    <button class="dc-copy-btn" data-target="nextjs">Copy</button>
  </div>
  <pre class="dc-prompt-pre" id="pre-nextjs"></pre>
</div>

### LangChain

<div class="dc-prompt-block" id="block-langchain">
  <div class="dc-prompt-header">
    <span class="dc-prompt-label">LangChain</span>
    <button class="dc-copy-btn" data-target="langchain">Copy</button>
  </div>
  <pre class="dc-prompt-pre" id="pre-langchain"></pre>
</div>

### Vercel AI SDK

<div class="dc-prompt-block" id="block-vercel">
  <div class="dc-prompt-header">
    <span class="dc-prompt-label">Vercel AI SDK</span>
    <button class="dc-copy-btn" data-target="vercel">Copy</button>
  </div>
  <pre class="dc-prompt-pre" id="pre-vercel"></pre>
</div>

---

## AI Context Files

Add one of these to your project so your agent automatically applies the right patterns on every prompt — not just the first one.

### `.cursor/rules/deepcitation.mdc`

Create this file in your project (Cursor's Project Rules, not the legacy `.cursorrules`):

<div class="dc-prompt-block" id="block-cursor">
  <div class="dc-prompt-header">
    <span class="dc-prompt-label">.cursor/rules/deepcitation.mdc</span>
    <button class="dc-copy-btn" data-target="cursor">Copy</button>
  </div>
  <pre class="dc-prompt-pre" id="pre-cursor"></pre>
</div>

### `CLAUDE.md`

Add this section to your project's `CLAUDE.md` (Claude Code reads this at session start):

<div class="dc-prompt-block" id="block-claudemd">
  <div class="dc-prompt-header">
    <span class="dc-prompt-label">CLAUDE.md</span>
    <button class="dc-copy-btn" data-target="claudemd">Copy</button>
  </div>
  <pre class="dc-prompt-pre" id="pre-claudemd"></pre>
</div>

---

## Why Negative Constraints?

Without explicit "do not" instructions, agents consistently make the same mistakes. These prompts include negative constraints for every known failure mode:

| Mistake agents make | Correct | Why it breaks without constraint |
|:--------------------|:--------|:---------------------------------|
| `import ... from "@deepcitation/deepcitation-js"` | `"deepcitation"` | Old package name. Import fails at runtime. |
| `import ... from "deepcitation/client"` | `"deepcitation"` | This subpath does not exist. Module not found. |
| `import { CitationComponent } from "deepcitation"` | `"deepcitation/react"` | CitationComponent is React-only, separate subpath. |
| `import { DeepCitation } from "deepcitation"` in `"use client"` | Server/route handler only | Bundles `DEEPCITATION_API_KEY` into the browser. |
| `NEXT_PUBLIC_DEEPCITATION_API_KEY` | `DEEPCITATION_API_KEY` | Exposes key to browser via Next.js env inlining. |
| `if (citations.length === 0)` | `Object.keys(citations).length === 0` | `CitationRecord` is `Record<string, Citation>`, not an array. |
| `verifyAttachment()` called mid-stream | After streaming ends | `<cite>` tags span chunks — partial output misses citations. |
| `require("deepcitation")` | `import ... from "deepcitation"` | ESM-only package. `require()` throws at runtime. |

---

<style>
.dc-prompt-block {
  border: 1px solid var(--border-color, #e1e4e8);
  border-radius: 6px;
  margin: 1rem 0 1.5rem;
  overflow: hidden;
  font-family: inherit;
}
.dc-prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--sidebar-color, #f6f8fa);
  border-bottom: 1px solid var(--border-color, #e1e4e8);
}
.dc-prompt-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--body-text-color, #57606a);
  letter-spacing: 0.02em;
}
.dc-copy-btn {
  padding: 0.25rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 500;
  background: var(--btn-primary-color, #0969da);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.dc-copy-btn:hover { opacity: 0.85; }
.dc-copy-btn:active { opacity: 0.7; }
.dc-prompt-pre {
  margin: 0;
  padding: 1rem;
  font-size: 0.78rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--code-background-color, #f6f8fa);
  color: var(--body-text-color, #24292f);
  max-height: 420px;
  overflow-y: auto;
  border: none;
  border-radius: 0;
  box-shadow: none;
}
</style>

{% raw %}
<script>
var DC_PROMPTS = {

  "quick": [
    "Add DeepCitation citation verification to my app.",
    "",
    "Package:  npm install deepcitation",
    "API docs: https://deepcitation.com/llms-full.txt",
    "API key:  already in .env as DEEPCITATION_API_KEY",
    "",
    "Core 5-step pattern:",
    "  1. const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });",
    "  2. const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([{ file: buffer, filename: 'doc.pdf' }]);",
    "  3. const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({ systemPrompt, userPrompt, deepTextPromptPortion });",
    "  4. // Call your LLM with enhancedSystemPrompt + enhancedUserPrompt as normal",
    "  5. const citations = getAllCitationsFromLlmOutput(llmOutput);",
    "     const { verifications } = await dc.verifyAttachment(fileDataParts[0].attachmentId, citations);",
    "",
    "Server-side imports (Node.js / route handlers — never in browser bundles):",
    "  import { DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput, validateUploadFile } from 'deepcitation';",
    "",
    "Client-side React imports ('use client' files only):",
    "  import { CitationComponent, CitationDrawer, generateCitationKey } from 'deepcitation/react';",
    "",
    "Type note — CitationRecord is an object, not an array:",
    "  Check emptiness with Object.keys(citations).length === 0  (NOT citations.length)",
    "",
    "DO NOT:",
    "  - Use package name @deepcitation/deepcitation-js  (old name, incorrect)",
    "  - Import from 'deepcitation/client'  (this subpath does not exist)",
    "  - Import DeepCitation in a 'use client' file  (exposes API key to browser)",
    "  - Import CitationComponent from 'deepcitation'  (it is in 'deepcitation/react')",
    "  - Use require() syntax  (ESM-only package)",
    "  - Hardcode the API key in source code",
    "  - Treat CitationRecord as an array",
    "  - Call verifyAttachment() on partial/streaming output  (needs complete LLM response)"
  ].join("\n"),

  "nextjs": [
    "Add DeepCitation citation verification to my Next.js App Router app.",
    "",
    "Package:         npm install deepcitation ai @ai-sdk/openai @ai-sdk/react",
    "API docs:        https://deepcitation.com/llms-full.txt",
    "Working example: https://github.com/DeepCitation/deepcitation/tree/main/examples/nextjs-ai-sdk",
    "API key:         already in .env.local as DEEPCITATION_API_KEY  (no NEXT_PUBLIC_ prefix)",
    "",
    "Create three Route Handlers:",
    "",
    "1. app/api/upload/route.ts  (server only)",
    "   import { DeepCitation, validateUploadFile } from 'deepcitation';",
    "   const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });",
    "   Accept multipart/form-data File, call validateUploadFile(), then:",
    "   const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([{ file: buffer, filename }]);",
    "   Return: { fileDataPart: fileDataParts[0], deepTextPromptPortion }",
    "",
    "2. app/api/chat/route.ts  (server only)",
    "   import { wrapCitationPrompt } from 'deepcitation';",
    "   import { streamText, convertToModelMessages } from 'ai';",
    "   Accept: { messages: UIMessage[], deepTextPromptPortions: string[] }",
    "   Call wrapCitationPrompt({ systemPrompt, userPrompt, deepTextPromptPortion: deepTextPromptPortions })",
    "   Replace last user message with enhancedUserPrompt, then streamText().toTextStreamResponse()",
    "",
    "3. app/api/verify/route.ts  (server only)",
    "   import { DeepCitation, getAllCitationsFromLlmOutput } from 'deepcitation';",
    "   Accept: { llmOutput: string, attachmentId: string }",
    "   const citations = getAllCitationsFromLlmOutput(llmOutput);",
    "   const { verifications } = await dc.verifyAttachment(attachmentId, citations);",
    "   Return: { citations, verifications }",
    "",
    "Client-side wiring in app/page.tsx ('use client'):",
    "  - useChat({ streamProtocol: 'text', body: { deepTextPromptPortions } })  from '@ai-sdk/react'",
    "  - Track isLoading with useRef (prevIsLoadingRef); when it transitions true->false, call /api/verify",
    "  - Use useEffectEvent for the verify handler (stable ref, no stale fileDataParts closure)",
    "  - Render citations with CitationComponent from 'deepcitation/react'",
    "",
    "'use client' boundary rules:",
    "  Server only:  DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput, validateUploadFile",
    "  Client only:  CitationComponent, CitationDrawer, CitationDrawerTrigger",
    "  Either side:  parseCitation, generateCitationKey",
    "",
    "DO NOT:",
    "  - Import DeepCitation or wrapCitationPrompt in any 'use client' file",
    "  - Prefix DEEPCITATION_API_KEY with NEXT_PUBLIC_  (server-only key)",
    "  - Call verifyAttachment() on partial/mid-stream output  (needs complete text)",
    "  - Import from 'deepcitation/client'  (this subpath does not exist, use 'deepcitation')",
    "  - Use package name @deepcitation/deepcitation-js  (old name, incorrect)",
    "  - Treat CitationRecord as an array  (use Object.keys(citations).length)"
  ].join("\n"),

  "langchain": [
    "Add DeepCitation citation verification to my LangChain RAG pipeline.",
    "",
    "Package:  npm install deepcitation langchain @langchain/openai @langchain/core",
    "API docs: https://deepcitation.com/llms-full.txt",
    "API key:  already in .env as DEEPCITATION_API_KEY",
    "",
    "Integration pattern (DC wraps around your existing LangChain chain):",
    "",
    "  import { readFileSync } from 'node:fs';",
    "  import { DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput } from 'deepcitation';",
    "  import { ChatOpenAI } from '@langchain/openai';",
    "  import { HumanMessage, SystemMessage } from '@langchain/core/messages';",
    "",
    "  const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });",
    "",
    "  // Step 1: Read source file as raw Buffer",
    "  //   DC needs the original file — NOT a LangChain Document object.",
    "  //   LangChain Document objects contain parsed text without DC's internal line-ID structure.",
    "  const fileBuffer = readFileSync('./document.pdf');",
    "",
    "  // Step 2: Upload to DeepCitation",
    "  const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([",
    "    { file: fileBuffer, filename: 'document.pdf' }",
    "  ]);",
    "",
    "  // Step 3: Wrap prompts with citation instructions",
    "  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({",
    "    systemPrompt: 'You are a research assistant. Cite sources for every claim.',",
    "    userPrompt: question,",
    "    deepTextPromptPortion,",
    "  });",
    "",
    "  // Step 4: Call your LangChain model (no special DC integration needed here)",
    "  const model = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });",
    "  const response = await model.invoke([",
    "    new SystemMessage(enhancedSystemPrompt),",
    "    new HumanMessage(enhancedUserPrompt),",
    "  ]);",
    "",
    "  // Step 5: Verify citations",
    "  const citations = getAllCitationsFromLlmOutput(response.content as string);",
    "  const { verifications } = await dc.verifyAttachment(fileDataParts[0].attachmentId, citations);",
    "",
    "For RunnableSequence:",
    "  DC is a pre-step (prepareAttachments before chain.invoke) and post-step (verifyAttachment after",
    "  chain output). Pass deepTextPromptPortion and attachmentId as chain inputs — they are not",
    "  runnable steps themselves.",
    "",
    "For streaming with LangChain:",
    "  Collect the full stream before verifying. Example:",
    "  const stream = await model.stream([...]);",
    "  let output = '';",
    "  for await (const chunk of stream) { output += chunk.content as string; }",
    "  // Now call getAllCitationsFromLlmOutput(output) and verifyAttachment()",
    "",
    "DO NOT:",
    "  - Pass LangChain Document objects to prepareAttachments  (needs raw Buffer, not parsed text)",
    "  - Use package name @deepcitation/deepcitation-js  (old name, incorrect)",
    "  - Call verifyAttachment on partial/streaming output  (collect full stream first)",
    "  - Import CitationComponent from 'deepcitation'  (it is in 'deepcitation/react')",
    "  - Import from 'deepcitation/client'  (this subpath does not exist)",
    "  - Use require() syntax  (ESM-only package)",
    "  - Treat CitationRecord as an array  (use Object.keys(citations).length, not citations.length)"
  ].join("\n"),

  "vercel": [
    "Add DeepCitation citation verification to my Vercel AI SDK app (useChat + streamText).",
    "",
    "Package:         npm install deepcitation ai @ai-sdk/openai @ai-sdk/react",
    "API docs:        https://deepcitation.com/llms-full.txt",
    "Working example: https://github.com/DeepCitation/deepcitation/tree/main/examples/nextjs-ai-sdk",
    "API key:         already in .env as DEEPCITATION_API_KEY  (no NEXT_PUBLIC_ prefix)",
    "",
    "Three Route Handlers:",
    "",
    "1. /api/upload",
    "   import { DeepCitation, validateUploadFile } from 'deepcitation';",
    "   Accept File as FormData, validate with validateUploadFile(), then:",
    "   const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([{ file: buffer, filename }]);",
    "   Return: { fileDataPart: fileDataParts[0], deepTextPromptPortion }",
    "",
    "2. /api/chat",
    "   import { wrapCitationPrompt } from 'deepcitation';",
    "   import { streamText, convertToModelMessages } from 'ai';",
    "   Accept: { messages: UIMessage[], deepTextPromptPortions: string[] }",
    "   Call wrapCitationPrompt({ systemPrompt, userPrompt, deepTextPromptPortion: deepTextPromptPortions })",
    "   Replace last user message parts with enhancedUserPrompt before convertToModelMessages()",
    "   Return streamText({ model, system: enhancedSystemPrompt, messages }).toTextStreamResponse()",
    "",
    "3. /api/verify",
    "   import { DeepCitation, getAllCitationsFromLlmOutput } from 'deepcitation';",
    "   Accept: { llmOutput: string, attachmentId: string }",
    "   const citations = getAllCitationsFromLlmOutput(llmOutput);",
    "   const { verifications } = await dc.verifyAttachment(attachmentId, citations);",
    "   Return: { citations, verifications }",
    "",
    "Client wiring ('use client'):",
    "  - useChat({ streamProtocol: 'text', body: { deepTextPromptPortions } })  from '@ai-sdk/react'",
    "  - Accumulate fileDataParts and deepTextPromptPortions in useState as files are uploaded",
    "  - Detect stream end: useRef(prevIsLoadingRef), when isLoading transitions true->false:",
    "      get last assistant message content, POST to /api/verify with llmOutput + attachmentId",
    "  - Use useEffectEvent for the verify callback (stable ref, avoids stale fileDataParts in deps)",
    "  - Render inline citations with CitationComponent from 'deepcitation/react'",
    "  - Parse <cite .../> tags using parseCitation() + generateCitationKey() (either side)",
    "",
    "DO NOT:",
    "  - Import DeepCitation in any 'use client' file  (exposes API key to browser)",
    "  - Use NEXT_PUBLIC_DEEPCITATION_API_KEY  (server-only, no NEXT_PUBLIC_ prefix needed)",
    "  - Call verifyAttachment mid-stream  (cite tags span multiple chunks, need complete output)",
    "  - Import from 'deepcitation/client'  (this subpath does not exist, use 'deepcitation')",
    "  - Use package name @deepcitation/deepcitation-js  (old name, incorrect)",
    "  - Treat CitationRecord as an array  (Object.keys(citations).length, not citations.length)"
  ].join("\n"),

  "cursor": [
    "# DeepCitation Citation Verification",
    "",
    "When implementing citation verification in this project, use the DeepCitation SDK.",
    "",
    "Package:      deepcitation  (npm)",
    "API reference: https://deepcitation.com/llms-full.txt",
    "API key:      process.env.DEEPCITATION_API_KEY  (never hardcode, never use NEXT_PUBLIC_ prefix)",
    "",
    "## Correct import paths",
    "",
    "Server-side (route handlers, Node.js scripts):",
    "    import { DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput, validateUploadFile } from 'deepcitation';",
    "",
    "Client-side React ('use client' files):",
    "    import { CitationComponent, CitationDrawer, generateCitationKey } from 'deepcitation/react';",
    "",
    "NEVER import from 'deepcitation/client' — this subpath does not exist.",
    "NEVER import DeepCitation in a 'use client' file — it would expose the API key to the browser.",
    "",
    "## Core pattern",
    "",
    "    // 1. Upload source documents",
    "    const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([{ file: Buffer, filename: string }]);",
    "",
    "    // 2. Enhance prompts",
    "    const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({ systemPrompt, userPrompt, deepTextPromptPortion });",
    "",
    "    // 3. Call your LLM with enhanced prompts (any provider)",
    "",
    "    // 4. Extract citations from complete LLM output",
    "    const citations = getAllCitationsFromLlmOutput(llmOutput);  // CitationRecord = Record<string, Citation>",
    "",
    "    // 5. Verify — only call on COMPLETE output, never mid-stream",
    "    const { verifications } = await dc.verifyAttachment(fileDataParts[0].attachmentId, citations);",
    "",
    "    // 6. Render — client only",
    "    // <CitationComponent citation={citations[key]} verification={verifications[key]} />",
    "",
    "## Type notes",
    "",
    "CitationRecord = Record<string, Citation>  — NOT an array.",
    "Check emptiness: Object.keys(citations).length === 0  (not citations.length)",
    "",
    "## Common mistakes to avoid",
    "",
    "WRONG: @deepcitation/deepcitation-js              CORRECT: deepcitation",
    "WRONG: import from 'deepcitation/client'          CORRECT: import from 'deepcitation'",
    "WRONG: DeepCitation in 'use client' file          CORRECT: server/route handlers only",
    "WRONG: NEXT_PUBLIC_DEEPCITATION_API_KEY           CORRECT: DEEPCITATION_API_KEY",
    "WRONG: citations.length                           CORRECT: Object.keys(citations).length",
    "WRONG: verifyAttachment() on streaming output     CORRECT: wait for complete LLM response"
  ].join("\n"),

  "claudemd": [
    "## DeepCitation Citation Verification",
    "",
    "This project uses the DeepCitation SDK for citation verification.",
    "",
    "**Package**: deepcitation (npm) — NOT @deepcitation/deepcitation-js",
    "**API reference**: https://deepcitation.com/llms-full.txt",
    "**API key**: process.env.DEEPCITATION_API_KEY — never hardcode, never use NEXT_PUBLIC_ prefix",
    "",
    "### Import paths",
    "",
    "Server-side (route handlers, Node.js — never in 'use client' files):",
    "",
    "    import { DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput, validateUploadFile } from 'deepcitation';",
    "",
    "Client-side React ('use client' files only):",
    "",
    "    import { CitationComponent, CitationDrawer, generateCitationKey } from 'deepcitation/react';",
    "",
    "The subpath 'deepcitation/client' does not exist. Always use 'deepcitation' for server imports.",
    "",
    "### Core pattern",
    "",
    "1. dc.prepareAttachments([{ file: Buffer, filename: string }]) -> { fileDataParts, deepTextPromptPortion }",
    "2. wrapCitationPrompt({ systemPrompt, userPrompt, deepTextPromptPortion }) -> { enhancedSystemPrompt, enhancedUserPrompt }",
    "3. LLM call with enhanced prompts",
    "4. getAllCitationsFromLlmOutput(llmOutput) -> CitationRecord (Record<string, Citation>, NOT an array)",
    "5. dc.verifyAttachment(attachmentId, citations) -> { verifications }",
    "   Call only on COMPLETE LLM output — never on partial/mid-stream text",
    "6. CitationComponent renders inline citations — client-side only ('use client')",
    "",
    "### Type safety",
    "",
    "CitationRecord is Record<string, Citation>, not an array.",
    "Use Object.keys(citations).length === 0 to check emptiness — NOT citations.length.",
    "",
    "### Next.js-specific rules",
    "",
    "- DeepCitation class: server only (route handlers, Server Actions)",
    "- wrapCitationPrompt: server only",
    "- getAllCitationsFromLlmOutput: server only (in /api/verify handler)",
    "- CitationComponent, CitationDrawer: client only ('use client')",
    "- parseCitation, generateCitationKey: either side (pure functions)",
    "- DEEPCITATION_API_KEY has no NEXT_PUBLIC_ prefix (server-only env var)"
  ].join("\n")

};

document.addEventListener("DOMContentLoaded", function () {
  Object.keys(DC_PROMPTS).forEach(function (key) {
    var pre = document.getElementById("pre-" + key);
    if (pre) {
      pre.textContent = DC_PROMPTS[key];
    }
  });

  document.querySelectorAll(".dc-copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-target");
      var text = DC_PROMPTS[target];
      if (!text) return;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = "Copied!";
          setTimeout(function () { btn.textContent = "Copy"; }, 2000);
        }).catch(function () {
          fallbackCopy(btn, text);
        });
      } else {
        fallbackCopy(btn, text);
      }
    });
  });
});

function fallbackCopy(btn, text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    btn.textContent = "Copied!";
    setTimeout(function () { btn.textContent = "Copy"; }, 2000);
  } catch (e) {
    btn.textContent = "Copy failed";
    setTimeout(function () { btn.textContent = "Copy"; }, 2000);
  }
  document.body.removeChild(ta);
}
</script>
{% endraw %}
