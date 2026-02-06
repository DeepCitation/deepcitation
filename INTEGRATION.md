# Integration Guide - Implementing DeepCitation in Your Codebase

> **Note**: If you're contributing to the DeepCitation repository itself, see [AGENTS.md](./AGENTS.md).
> This guide is for external developers integrating DeepCitation into their applications.

> **Important**: The product name is **DeepCitation** (not "DeepCite"). Always use "DeepCitation" when referring to the product, package, or API.

This guide provides step-by-step instructions for AI code agents (Claude, Cursor, GitHub Copilot, etc.) to implement DeepCitation in any codebase. Follow the phases in order — each phase has a checklist and a **GATE** that must be satisfied before proceeding.

---

## ⚠️ FIRST: Install the Package

**Before doing anything else, install the DeepCitation package (use `@latest` to get the most recent version):**

```bash
npm install @deepcitation/deepcitation-js@latest
# or
pnpm add @deepcitation/deepcitation-js@latest
# or
yarn add @deepcitation/deepcitation-js@latest
# or
bun add @deepcitation/deepcitation-js@latest
```

**AI Agents**: Run this installation command in the project directory before proceeding with any integration steps. Always use `@latest` to ensure you get the most recent version with all features and bug fixes. The package provides all the types, functions, and React components you need.

---

## Golden Rules

These rules apply to **every phase**. Violating any of them is a bug.

> **1. Import, never define** — All types come from `@deepcitation/deepcitation-js`. Never create your own `Citation`, `Verification`, `CitationRecord`, `VerificationRecord`, or any other type.
>
> ```typescript
> // ✅ CORRECT
> import type { Citation, Verification, CitationRecord, VerificationRecord } from "@deepcitation/deepcitation-js";
>
> // ❌ WRONG — never do this
> interface Citation { ... }
> type VerificationResult = { ... }
> ```
>
> **2. Strip before display** — Always use `extractVisibleText()` before showing LLM output to users. Raw output contains `<<<CITATION_DATA>>>` blocks that users must never see.
>
> **3. Use our helpers** — Call `getCitationStatus(verification)` for status checks, `getAllCitationsFromLlmOutput()` for parsing, `replaceCitations()` for text display. Never write your own versions.
>
> **4. CitationRecord is an object, not an array** — `getAllCitationsFromLlmOutput()` returns `Record<string, Citation>`. Use `Object.keys(citations).length`, not `.length`.
>
> **5. Never fabricate URLs** — Only use URLs listed in [Appendix A: Real URLs](#appendix-a-real-urls).

**Common mistakes at a glance:**

| ❌ Wrong | ✅ Correct |
|----------|------------|
| `interface Citation { ... }` | `import type { Citation } from "@deepcitation/deepcitation-js"` |
| `type Verification = { status: string }` | `import type { Verification } from "@deepcitation/deepcitation-js"` |
| `const isVerified = v.status === "found"` | `const { isVerified } = getCitationStatus(v)` |
| `citations.length` (it's not an array!) | `Object.keys(citations).length` |
| Writing custom cite tag parsers | `getAllCitationsFromLlmOutput(llmOutput)` |
| Showing raw `llmOutput` to users | `extractVisibleText(llmOutput)` |

---

## Is DeepCitation Right for You?

**Use DeepCitation if you need:**
- Verifiable citations from documents (PDFs, images, URLs)
- Visual proof images showing where citations were found
- LLM responses with inline citation markers

**Don't use DeepCitation if:**
- You just need basic Q&A without citation verification
- You're building offline-only applications (requires API)
- You need custom citation format templates (APA, MLA, etc.)

---

## Quick Start (Complete Example)

This is a complete, runnable example. Copy this to get started:

```typescript
// Phase 0: Imports — use our types, don't define your own!
import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
  extractVisibleText,
  getCitationStatus,
  replaceCitations,
} from "@deepcitation/deepcitation-js";

import type {
  CitationRecord,
  VerificationRecord,
  FileDataPart,
} from "@deepcitation/deepcitation-js";

import OpenAI from "openai";
import { readFileSync } from "fs";

async function analyzeDocument(filePath: string, question: string) {
  // Phase 0: Initialize clients
  const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  // Phase 1: Upload document
  const document = readFileSync(filePath);
  const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
    { file: document, filename: filePath },
  ]);
  const attachmentId: string = fileDataParts[0].attachmentId;

  // Phase 2: Wrap prompts and call LLM
  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt: "You are a helpful assistant. Cite your sources.",
    userPrompt: question,
    deepTextPromptPortion,
  });

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: enhancedSystemPrompt },
      { role: "user", content: enhancedUserPrompt },
    ],
  });
  const llmOutput: string = response.choices[0].message.content!;

  // Phase 3: Parse citations and extract visible text
  const citations: CitationRecord = getAllCitationsFromLlmOutput(llmOutput);
  const visibleText: string = extractVisibleText(llmOutput);

  // Phase 4: Pre-verification display (clean markdown, no cite tags)
  const preVerifiedDisplay = replaceCitations(visibleText, {
    leaveAnchorTextBehind: true,
  });
  // Show preVerifiedDisplay to user while verification runs...

  // Phase 5: Verify citations
  const result = await deepcitation.verifyAttachment(attachmentId, citations);
  const verifications: VerificationRecord = result.verifications;

  // Phase 6: Post-verification display (with status indicators)
  const verifiedDisplay = replaceCitations(visibleText, {
    verifications,
    showVerificationStatus: true,
  });

  // Summary using getCitationStatus() — don't write your own status logic!
  const entries = Object.values(verifications);
  const verified = entries.filter((v) => getCitationStatus(v).isVerified).length;

  return {
    response: verifiedDisplay,
    summary: { total: entries.length, verified },
  };
}
```

---

## Core Workflow Overview

```
Phase 0    Phase 1         Phase 2          Phase 3           Phase 4              Phase 5         Phase 6
SETUP  →  PREPARE     →  PROMPT & LLM  →  PARSE &       →  DISPLAY           →  VERIFY      →  DISPLAY
          SOURCES                          EXTRACT           (pre-verification)                    (post-verification)
          ─────────      ─────────        ──────────        ─────────────────     ──────────      ──────────────────
          Upload docs    Wrap prompts     Parse citations   Clean text for UI     Verify against  Show ✓ ⚠ ✗
          Get IDs        Call LLM         Strip data block  Pending spinners      source docs     Proof images
```

---

## Phase 0: Setup (One-Time)

### Checklist

- [ ] Install `@deepcitation/deepcitation-js@latest`
- [ ] Set `DEEPCITATION_API_KEY` in `.env` (must start with `sk-dc-`)
- [ ] Initialize the DeepCitation client
- [ ] Set up imports (functions + types from our package)

### Environment Variables

```bash
# .env
DEEPCITATION_API_KEY=sk-dc-your-key-here
```

Get your API key at [deepcitation.com/signup](https://deepcitation.com/signup)

### Client Initialization

```typescript
import { DeepCitation } from "@deepcitation/deepcitation-js";

const deepcitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY!,
});
```

### Required Imports

Every integration should start with these imports:

```typescript
// Functions
import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
  extractVisibleText,
  getCitationStatus,
  replaceCitations,
} from "@deepcitation/deepcitation-js";

// Types — ALWAYS import, NEVER recreate (see Golden Rules)
import type {
  Citation,
  Verification,
  CitationRecord,
  VerificationRecord,
  FileDataPart,
} from "@deepcitation/deepcitation-js";

// React components (if using React)
import { CitationComponent } from "@deepcitation/deepcitation-js/react";
```

### GATE

✅ Imports resolve without errors. `new DeepCitation(...)` instantiates without throwing. Proceed to Phase 1.

---

## Phase 1: Prepare Sources

### Checklist

- [ ] Choose source type (files, URLs, or multiple documents)
- [ ] Upload via `prepareFiles()` or `prepareUrl()`
- [ ] Save `attachmentId` (needed in Phase 5 for verification)
- [ ] Save `deepTextPromptPortion` (needed in Phase 2 for prompt wrapping)

### For Files (PDFs, Images) — Fast (<1 second)

```typescript
import { readFileSync } from "fs";

const document = readFileSync("./document.pdf");
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
  { file: document, filename: "document.pdf" },
]);

// Save for later phases
const attachmentId = fileDataParts[0].attachmentId;
```

### For URLs — Slower (~30 seconds)

```typescript
const { attachmentId, deepTextPromptPortion, metadata } = await deepcitation.prepareUrl({
  url: "https://example.com/article",
});

console.log(`Processed: ${metadata.filename}, ${metadata.pageCount} pages`);
```

> **Security Warning**: If accepting user-provided URLs, validate them to prevent SSRF attacks:
> - Block internal IPs: `localhost`, `127.0.0.1`, `192.168.*`, `10.*`, `172.16-31.*`
> - Block private hostnames and cloud metadata endpoints
> - Validate URL scheme is `http` or `https` only

### For Multiple Documents

```typescript
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
  { file: doc1, filename: "report.pdf" },
  { file: doc2, filename: "chart.png" },
  { file: doc3, filename: "data.xlsx" },
]);

// All documents are combined in deepTextPromptPortion
// Each document gets its own attachmentId in fileDataParts
// fileDataParts[0].attachmentId → report.pdf
// fileDataParts[1].attachmentId → chart.png
// fileDataParts[2].attachmentId → data.xlsx
```

<details>
<summary>⚠️ Unsafe Fast Mode for URLs (trusted sources only)</summary>

```typescript
// UNSAFE: Fast (<1s) but vulnerable to hidden text and prompt injection
// Only use for URLs you control!
const result = await deepcitation.prepareUrl({
  url: "https://your-trusted-site.com/article",
  unsafeFastUrlOutput: true,
});
```

**Risks of unsafe fast mode:**
- Hidden text in HTML can be injected into prompts
- Fine print and invisible content may be included
- Malicious sites could inject prompt attacks

</details>

<details>
<summary>Optional: Compress prompt IDs for large documents</summary>

When documents produce very long `deepTextPromptPortion` strings, you can compress the attachment IDs to save tokens:

```typescript
import { compressPromptIds, decompressPromptIds } from "@deepcitation/deepcitation-js";

// Compress before wrapping prompts
const { compressed, prefixMap } = compressPromptIds(
  deepTextPromptPortion,
  [attachmentId]
);

// Use `compressed` in place of `deepTextPromptPortion` in Phase 2
// Save `prefixMap` — you'll need it to decompress the LLM output in Phase 3

// In Phase 3, decompress before parsing:
const decompressedOutput = decompressPromptIds(llmOutput, prefixMap);
const citations = getAllCitationsFromLlmOutput(decompressedOutput as string);
```

</details>

### GATE

✅ You have `attachmentId` (string) and `deepTextPromptPortion` (string or string[]). Proceed to Phase 2.

---

## Phase 2: Prompt & Call LLM

### Checklist

- [ ] Wrap prompts with `wrapCitationPrompt()`
- [ ] Call your LLM with the enhanced prompts
- [ ] Collect the complete response as `llmOutput`
- [ ] If streaming: buffer the full response before moving to Phase 3 (the `<<<CITATION_DATA>>>` block arrives at the end)

### Wrap Prompts

```typescript
import { wrapCitationPrompt } from "@deepcitation/deepcitation-js";

const systemPrompt = "You are a helpful assistant...";
const userPrompt = "Summarize this document";

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt,
  deepTextPromptPortion, // from Phase 1
});
```

The wrapping places citation instructions at the start of the system prompt (high priority) and a brief reminder at the end (recency effect). The document content is prepended to the user prompt.

### Call Your LLM

**OpenAI:**

```typescript
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await openai.chat.completions.create({
  model: "gpt-5-mini",
  messages: [
    { role: "system", content: enhancedSystemPrompt },
    {
      role: "user",
      content: [
        // Include original file for vision models
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
        },
        { type: "text", text: enhancedUserPrompt },
      ],
    },
  ],
});

const llmOutput = response.choices[0].message.content;
```

<details>
<summary>Other LLM Providers</summary>

#### Anthropic Claude

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await anthropic.messages.create({
  model: "claude-3-5-haiku-20241022",
  max_tokens: 4096,
  system: enhancedSystemPrompt,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
        },
        { type: "text", text: enhancedUserPrompt },
      ],
    },
  ],
});

const llmOutput = response.content[0].text;
```

#### Google Gemini

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

const result = await model.generateContent([
  { text: enhancedSystemPrompt },
  { text: enhancedUserPrompt },
]);

const llmOutput = result.response.text();
```

#### Vercel AI SDK (Next.js)

```typescript
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

const result = streamText({
  model: openai("gpt-5-mini"),
  system: enhancedSystemPrompt,
  messages: modelMessages,
});

return result.toTextStreamResponse();
```

</details>

### GATE

✅ You have the **complete** `llmOutput` string (not a partial stream). Proceed to Phase 3.

---

## Phase 3: Parse & Extract

### Checklist

- [ ] Parse citations: `getAllCitationsFromLlmOutput(llmOutput)` → returns `CitationRecord` (an **object**, NOT an array)
- [ ] Extract visible text: `extractVisibleText(llmOutput)` → strips the `<<<CITATION_DATA>>>` block
- [ ] Handle "no citations" case gracefully
- [ ] If you used prompt compression in Phase 1, **decompress BEFORE parsing**: `decompressPromptIds(llmOutput, prefixMap)` — this must be the first step

### Parse Citations

```typescript
import { getAllCitationsFromLlmOutput, extractVisibleText } from "@deepcitation/deepcitation-js";
import type { CitationRecord, Citation } from "@deepcitation/deepcitation-js";

// Parse citations — returns CitationRecord (OBJECT, NOT array!)
const citations: CitationRecord = getAllCitationsFromLlmOutput(llmOutput);

// CRITICAL: Strip the <<<CITATION_DATA>>> block before display
const visibleText: string = extractVisibleText(llmOutput);

// Use Object.keys().length, NOT .length
console.log(`Found ${Object.keys(citations).length} citations`);

// Access individual citations
for (const [key, citation] of Object.entries(citations)) {
  const c: Citation = citation;
  console.log(`Citation ${c.citationNumber}: ${c.anchorText}`);
}
```

### Handle No Citations

```typescript
const citations = getAllCitationsFromLlmOutput(llmOutput);

// citations is an object — use Object.keys().length!
if (Object.keys(citations).length === 0) {
  // LLM didn't include citations — display response as-is
  const visibleText = extractVisibleText(llmOutput);
  return { response: visibleText, verifications: {} };
}

// Proceed to Phase 4...
```

### Why `extractVisibleText()` is Critical

The raw LLM output looks like this — users must **never** see the data block:

```
Revenue grew 23% in Q4.<cite n="1" />

<<<CITATION_DATA>>>
{"1":{"pageId":"page_number_1_index_0","lineId":"5","fullPhrase":"Revenue grew 23% in Q4"}}
<<<END_CITATION_DATA>>>
```

After `extractVisibleText()`:
```
Revenue grew 23% in Q4.<cite n="1" />
```

### GATE

✅ You have `citations` (`CitationRecord`) and `visibleText` (string with data block stripped). **NEVER show raw `llmOutput` to users.** Proceed to Phase 4.

---

## Phase 4: Display (Pre-Verification)

> This phase handles what to show users **during streaming** or **before verification completes**. Verification can take a few seconds — users shouldn't see raw `<cite>` tags while they wait.

### Checklist

- [ ] Choose a pre-verification display strategy (see decision table below)
- [ ] Apply it to `visibleText` (from Phase 3)
- [ ] Ensure no raw `<cite>` tags or `<<<CITATION_DATA>>>` blocks are visible to users

### Decision: Pre-Verification Display Strategy

| Strategy | Code | Output Example | When to Use |
|----------|------|----------------|-------------|
| **Clean text** (strip everything) | `replaceCitations(visibleText, {})` | `"Revenue grew 23% in Q4."` | Simplest — no trace of citations |
| **Anchor text visible** | `replaceCitations(visibleText, { leaveAnchorTextBehind: true })` | `"Revenue grew 23% in Q4. Revenue Growth"` | When you want cited phrases to remain inline |
| **React pending state** | `<CitationComponent citation={c} verification={null} />` | Shows spinner ◌ | Interactive UI with loading indicators |

### Markdown / Text Display

```typescript
import { replaceCitations } from "@deepcitation/deepcitation-js";

// Option A: Strip all citation tags — clean text, no trace of citations
const cleanText = replaceCitations(visibleText, {});
// "Revenue grew 23% in Q4."

// Option B: Keep anchor text visible, remove cite tags
const withAnchors = replaceCitations(visibleText, { leaveAnchorTextBehind: true });
// "Revenue grew 23% Revenue Growth in Q4."
```

### React Display

```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

// Render with null verification — shows pending spinner
<CitationComponent
  citation={citation}
  verification={null}
/>
```

### Streaming Pattern

During streaming, buffer the response and show clean text progressively:

```typescript
let fullResponse = "";

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || "";
  fullResponse += content;

  // Show clean text (strip any partial cite tags)
  const visibleSoFar = extractVisibleText(fullResponse);
  const cleanSoFar = replaceCitations(visibleSoFar, {});
  updateUI(cleanSoFar);
}

// CRITICAL: Wait for stream to fully complete before parsing citations!
// The <<<CITATION_DATA>>> block arrives at the END of the response.
// After stream completes — proceed to Phase 3 parse, then Phase 5 verify
```

### GATE

✅ You have displayable text with no raw `<cite>` tags or `<<<CITATION_DATA>>>` blocks. Users see clean, readable content. Proceed to Phase 5.

---

## Phase 5: Verify Citations

### Checklist

- [ ] Verify citations against source documents using `verifyAttachment()` or `verify()`
- [ ] Extract `verifications` from the result (`VerificationRecord`)
- [ ] Use `getCitationStatus(verification)` for status checks — **never check status strings directly**

### Verify

**Option A: Manual parsing (more control)**

```typescript
import type { VerificationRecord, Verification } from "@deepcitation/deepcitation-js";

const result = await deepcitation.verifyAttachment(attachmentId, citations, {
  outputImageFormat: "avif", // or "png", "jpeg"
});

const verifications: VerificationRecord = result.verifications;
```

**Option B: Automatic parsing (simpler)**

```typescript
const result = await deepcitation.verify({
  llmOutput: llmOutput,
});

const verifications: VerificationRecord = result.verifications;
```

### Check Status

```typescript
import { getCitationStatus } from "@deepcitation/deepcitation-js";

// ❌ WRONG — don't check status strings directly
// if (verification.status === "found") { ... }

// ✅ CORRECT — use getCitationStatus()
for (const [key, verification] of Object.entries(verifications)) {
  const status = getCitationStatus(verification);

  if (status.isVerified && !status.isPartialMatch) {
    console.log(`Citation ${key}: ✅ Fully verified`);
  } else if (status.isVerified && status.isPartialMatch) {
    console.log(`Citation ${key}: ⚠️ Partial match`);
  } else if (status.isMiss) {
    console.log(`Citation ${key}: ❌ Not found`);
  } else if (status.isPending) {
    console.log(`Citation ${key}: ⏳ Pending`);
  }
}
```

<details>
<summary>Multi-document verification</summary>

When citations span multiple documents, group them by attachment ID before verifying:

```typescript
import { groupCitationsByAttachmentId } from "@deepcitation/deepcitation-js";

// Group citations by their attachment ID
const grouped = groupCitationsByAttachmentId(citations);

// Verify each attachment separately
const allVerifications: VerificationRecord = {};

for (const [attId, attCitations] of grouped.entries()) {
  const result = await deepcitation.verifyAttachment(attId, attCitations, {
    outputImageFormat: "avif",
  });
  Object.assign(allVerifications, result.verifications);
}
```

</details>

<details>
<summary>Error handling</summary>

```typescript
try {
  const result = await deepcitation.verifyAttachment(attachmentId, citations);
} catch (error: any) {
  const message = error?.message || "Unknown error";

  if (message.includes("Invalid or expired API key")) {
    // API key issue — check DEEPCITATION_API_KEY
    console.error("Invalid API key. Get a new one at https://deepcitation.com/dashboard");
  } else if (message.includes("Attachment not found")) {
    // attachmentId expired or invalid — re-upload document
    console.error("Attachment expired. Re-upload the document.");
  } else {
    // Network or other error — retry with backoff
    console.error("Verification failed:", message);
  }
}
```

</details>

### GATE

✅ You have `verifications` (`VerificationRecord`) keyed by the same citation key hashes as your `CitationRecord`. See [Verification Status Reference](#verification-status-reference) for detailed status meanings. Proceed to Phase 6.

---

## Phase 6: Display (Post-Verification)

> Now that verifications are available, upgrade the display to show verification status indicators (✓ ⚠ ✗) alongside citations.

### Checklist

- [ ] Choose a post-verification display method (see options below)
- [ ] For markdown/text: use `replaceCitations()` with verifications, or `renderCitationsAsMarkdown()` for richer output
- [ ] For React: use `<CitationComponent>` with the `verification` prop
- [ ] Users see green checks (✅), amber warnings (⚠️), red X (❌), or spinners (⏳) next to citations

### Option A: `replaceCitations()` — Simple Text Indicators

```typescript
import { replaceCitations } from "@deepcitation/deepcitation-js";

const verifiedText = replaceCitations(visibleText, {
  verifications,
  showVerificationStatus: true,
});
// Output: "Revenue grew 23%☑️ in Q4..."
```

### Option B: `renderCitationsAsMarkdown()` — Rich Markdown Output

For more control over citation rendering style:

```typescript
import { renderCitationsAsMarkdown, toMarkdown } from "@deepcitation/deepcitation-js";

// Full structured output
const output = renderCitationsAsMarkdown(visibleText, {
  verifications,
  variant: "inline",           // how citations look
  indicatorStyle: "check",     // which indicator characters
  includeReferences: true,     // append references section
});

// output.markdown  — text with inline indicators
// output.references — references section (if requested)
// output.full — markdown + references combined
// output.citations — array of CitationWithStatus objects

// Or use the simplified shorthand:
const md = toMarkdown(visibleText, {
  verifications,
  variant: "brackets",
  includeReferences: true,
});
```

**Markdown variants:**

| Variant | Example | Description |
|---------|---------|-------------|
| `"inline"` | `Revenue grew 45%✓` | Text with inline indicator (default) |
| `"brackets"` | `[1✓]` | Bracketed citation number |
| `"superscript"` | `¹✓` | Unicode superscript footnote |
| `"footnote"` | `[^1]` | Markdown footnote syntax |
| `"academic"` | `(Source, p.5)✓` | Academic-style reference |

**Indicator styles:**

| Style | Verified | Partial | Not Found | Pending |
|-------|----------|---------|-----------|---------|
| `"check"` (default) | ✓ | ⚠ | ✗ | ◌ |
| `"semantic"` | ✓ | ~ | ✗ | … |
| `"circle"` | ● | ◐ | ○ | ◌ |
| `"word"` | ✓verified | ⚠partial | ✗missed | ◌pending |
| `"none"` | (empty) | (empty) | (empty) | (empty) |

### Option C: React `<CitationComponent>` — Interactive Display

```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";
import "@deepcitation/deepcitation-js/styles.css";

// Basic usage
<CitationComponent
  citation={citation}
  verification={verification}
/>

// With variant and content options
<CitationComponent
  citation={citation}
  verification={verification}
  variant="chip"           // "brackets" | "chip" | "text" | "superscript" | "linter" | "badge"
  content="anchorText"     // "anchorText" | "number" | "indicator" | "source"
/>
```

<details>
<summary>React component variants reference</summary>

| Variant | Example | Best For |
|---------|---------|----------|
| `"linter"` | underlined text | Grammar-check style (default) |
| `"brackets"` | `[1✓]` | Academic, footnote style |
| `"chip"` | pill badge | Modern UI, inline highlights |
| `"superscript"` | `¹✓` | Compact footnotes |
| `"text"` | plain text | Inheriting parent styles |
| `"badge"` | source chip with favicon | ChatGPT-style sources |

</details>

<details>
<summary>Custom React rendering: inline citations in markdown</summary>

When rendering LLM markdown with inline citations in React, split on cite tags and render each one:

```tsx
import { parseCitation, generateCitationKey } from "@deepcitation/deepcitation-js";
import type { Citation, Verification, VerificationRecord } from "@deepcitation/deepcitation-js";
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

function renderWithCitations(text: string, verifications: VerificationRecord) {
  const parts = text.split(/(<cite\s+[^>]*\/>)/g);

  return parts.map((part, index) => {
    if (part.startsWith("<cite")) {
      const { citation }: { citation: Citation } = parseCitation(part);
      const citationKey: string = generateCitationKey(citation);
      const verification: Verification | undefined = verifications[citationKey];

      return (
        <CitationComponent
          key={index}
          citation={citation}
          verification={verification}
        />
      );
    }
    return <span key={index}>{part}</span>;
  });
}
```

</details>

### Complete Display Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STREAMING / PRE-VERIFIED (Phase 4):                                          │
│                                                                              │
│ llmOutput → extractVisibleText() → replaceCitations(visibleText, {})         │
│                                    → clean markdown (no citations)           │
│                                                                              │
│                                 → replaceCitations(visibleText,              │
│                                     { leaveAnchorTextBehind: true })         │
│                                    → markdown with anchor text visible       │
│                                                                              │
│                            React: <CitationComponent verification={null} />  │
│                                    → shows pending spinner ◌                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ POST-VERIFIED (Phase 6):                                                     │
│                                                                              │
│ visibleText → replaceCitations(visibleText,                                  │
│                 { verifications, showVerificationStatus: true })              │
│               → markdown with ☑️⚠✗ indicators                               │
│                                                                              │
│            → renderCitationsAsMarkdown(visibleText,                          │
│                { verifications, variant: "inline" })                         │
│               → structured MarkdownOutput { markdown, references, full }     │
│                                                                              │
│            → toMarkdown(visibleText,                                         │
│                { verifications, variant: "brackets" })                       │
│               → string shorthand                                             │
│                                                                              │
│       React: <CitationComponent citation={c} verification={v} />            │
│               → interactive display with ✓ ⚠ ✗ indicators and popover      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### GATE

✅ You have rendered output with verification indicators (✓ ⚠ ✗ ◌) next to citations. Integration is complete.

---

## Verification Status Reference

### Quick Summary

| Indicator | Meaning | When shown |
|-----------|---------|------------|
| ✅ Green checkmark | Verified | Exact match found at expected location |
| ⚠️ Amber checkmark | Partial match | Found but with caveats (wrong page, partial text, etc.) |
| ❌ Red warning | Not found | Text not found in document |
| ⏳ Spinner | Pending | Verification in progress |

### Detailed Status Values

| Status Value | Indicator | Description | UI Guidance |
|--------------|-----------|-------------|-------------|
| `"found"` | ✅ Green | Exact match at expected location | High confidence, show proof image |
| `"found_phrase_missed_anchor_text"` | ✅ Green | Full phrase found, anchor text highlight missed | Show as verified |
| `"found_anchor_text_only"` | ⚠️ Amber | Only anchor text found, full phrase not matched | Show with caution |
| `"found_on_other_page"` | ⚠️ Amber | Found on different page than expected | Note the actual page |
| `"found_on_other_line"` | ⚠️ Amber | Found on different line than expected | Usually still reliable |
| `"partial_text_found"` | ⚠️ Amber | Only part of the text matched | Show what was found |
| `"first_word_found"` | ⚠️ Amber | Only first word matched (lowest confidence) | Consider not showing |
| `"not_found"` | ❌ Red | Text not found in document | Mark as unverified |
| `"pending"` / `null` | ⏳ Spinner | Verification in progress | Show loading state |

### Status Flags (from `getCitationStatus()`)

| Status Value | `isVerified` | `isPartialMatch` | `isMiss` | `isPending` |
|--------------|--------------|------------------|----------|-------------|
| `"found"` | ✅ true | false | false | false |
| `"found_phrase_missed_anchor_text"` | ✅ true | false | false | false |
| `"found_anchor_text_only"` | ✅ true | ⚠️ true | false | false |
| `"found_on_other_page"` | ✅ true | ⚠️ true | false | false |
| `"found_on_other_line"` | ✅ true | ⚠️ true | false | false |
| `"partial_text_found"` | ✅ true | ⚠️ true | false | false |
| `"first_word_found"` | ✅ true | ⚠️ true | false | false |
| `"not_found"` | false | false | ❌ true | false |
| `"pending"` / `null` | false | false | false | ⏳ true |

---

<details>
<summary>Framework Integration Patterns</summary>

### Next.js API Routes

**Upload route (`/api/upload`):**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { DeepCitation } from "@deepcitation/deepcitation-js";

const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { fileDataParts } = await deepcitation.prepareFiles([
    { file: buffer, filename: file.name },
  ]);

  return NextResponse.json({ fileDataPart: fileDataParts[0] });
}
```

**Chat route (`/api/chat`):**

```typescript
import { wrapCitationPrompt } from "@deepcitation/deepcitation-js";
import type { FileDataPart } from "@deepcitation/deepcitation-js";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { messages, fileDataParts } = await req.json();

  const typedFileDataParts: FileDataPart[] = fileDataParts;

  // Combine deepTextPromptPortion from all files
  const deepTextPromptPortion = typedFileDataParts
    .map((f) => f.deepTextPromptPortion)
    .filter(Boolean);

  const lastUserContent = messages[messages.length - 1].content;

  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt: "You are a helpful assistant.",
    userPrompt: lastUserContent,
    deepTextPromptPortion,
  });

  const result = streamText({
    model: openai("gpt-5-mini"),
    system: enhancedSystemPrompt,
    messages: [{ role: "user", content: enhancedUserPrompt }],
  });

  return result.toTextStreamResponse();
}
```

**Verify route (`/api/verify`):**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { DeepCitation, getAllCitationsFromLlmOutput, getCitationStatus } from "@deepcitation/deepcitation-js";
import type { CitationRecord, VerificationRecord } from "@deepcitation/deepcitation-js";

const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { llmOutput, attachmentId } = await req.json();

    // Input validation
    if (!attachmentId || typeof attachmentId !== "string") {
      return NextResponse.json(
        { error: "Invalid attachmentId", details: "attachmentId is required" },
        { status: 400 }
      );
    }
    if (!llmOutput || typeof llmOutput !== "string") {
      return NextResponse.json(
        { error: "Invalid llmOutput", details: "llmOutput is required" },
        { status: 400 }
      );
    }

    const citations: CitationRecord = getAllCitationsFromLlmOutput(llmOutput);
    const citationCount = Object.keys(citations).length;

    if (citationCount === 0) {
      return NextResponse.json({
        citations: {},
        verifications: {},
        summary: { total: 0, verified: 0, missed: 0, pending: 0 },
      });
    }

    const result = await deepcitation.verifyAttachment(attachmentId, citations, {
      outputImageFormat: "avif",
    });
    const verifications: VerificationRecord = result.verifications;

    // Use getCitationStatus() — don't check status strings manually!
    let verified = 0, missed = 0;
    for (const verification of Object.values(verifications)) {
      const status = getCitationStatus(verification);
      if (status.isVerified) verified++;
      if (status.isMiss) missed++;
    }

    return NextResponse.json({
      citations,
      verifications: result.verifications,
      summary: { total: citationCount, verified, missed, pending: 0 },
    });
  } catch (error: any) {
    if (error?.message?.includes("Invalid or expired API key")) {
      return NextResponse.json(
        { error: "Invalid API key", details: "Check DEEPCITATION_API_KEY" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Verification failed", details: error?.message },
      { status: 500 }
    );
  }
}
```

### Streaming with Citations

**Important**: During streaming, the `<<<CITATION_DATA>>>` block arrives at the end of the response. You must buffer the full response server-side, then extract visible text before sending to the client.

```typescript
let fullResponse = "";

const stream = await openai.chat.completions.create({
  model: "gpt-5-mini",
  stream: true,
  messages: [...],
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || "";
  fullResponse += content;

  // IMPORTANT: Don't stream raw content directly to users!
  // The <<<CITATION_DATA>>> block arrives at the end and must be stripped.
  //
  // Option A: Buffer everything, send after complete (simpler)
  // Option B: Stream chunks but filter out the citation block (complex)
  //
  // For Option B, you'd need to detect when <<<CITATION_DATA>>> starts
  // and stop streaming at that point.
}

// After streaming completes:
// Phase 3: Parse citations from the full response
const citations = getAllCitationsFromLlmOutput(fullResponse);

// Phase 3: Extract visible text (strips <<<CITATION_DATA>>> block)
const visibleText = extractVisibleText(fullResponse);

// Phase 4: Send visibleText to client (NOT fullResponse!)
// The client should never see the <<<CITATION_DATA>>> block

// Phase 5: Verify citations (can run in background while user reads response)
const result = await deepcitation.verifyAttachment(attachmentId, citations);

// Phase 6: Update UI with verification status when ready
```

</details>

---

<details>
<summary>Troubleshooting</summary>

### Issue: No citations in LLM output

**Symptoms**: LLM response has no `<cite>` tags

**Causes**:
- `deepTextPromptPortion` not included in the prompt
- LLM model doesn't follow citation instructions well

**Solutions**:
1. Verify `deepTextPromptPortion` is passed to `wrapCitationPrompt()`
2. Try a different LLM model
3. Use `CITATION_REMINDER` in additional user prompts for reinforcement

**DON'T**:
- Don't manually write citation instructions (use `wrapCitationPrompt`)
- Don't parse for citation patterns that don't exist in the output

---

### Issue: API key errors

**Symptoms**: "Invalid or expired API key" error

**Causes**:
- `DEEPCITATION_API_KEY` environment variable not set
- API key is incorrect or expired
- API key doesn't start with `sk-dc-`

**Solutions**:
1. Verify `DEEPCITATION_API_KEY` is set in your `.env` file
2. Check that the key starts with `sk-dc-`
3. Get a new key at [deepcitation.com/dashboard](https://deepcitation.com/dashboard)

**DON'T**:
- Don't hardcode API keys in source code
- Don't commit `.env` files to version control

---

### Issue: Verification fails or returns "not found"

**Symptoms**: Citations show ❌ even though content exists in document

**Causes**:
- `attachmentId` doesn't match the uploaded document
- Document was re-uploaded (new attachmentId generated)
- LLM hallucinated content not in the document
- OCR quality issues for scanned documents

**Solutions**:
1. Ensure `attachmentId` matches the uploaded document
2. Check that the cited text actually exists in the source
3. For scanned PDFs, try uploading higher quality scans
4. Partial matches (`⚠️`) indicate content was found but location differs

**DON'T**:
- Don't assume all "not found" results are bugs — LLMs can hallucinate
- Don't reuse `attachmentId` across different documents

---

### Issue: `<<<CITATION_DATA>>>` visible to users

**Symptoms**: Users see raw JSON citation data in the response

**Cause**: Using `llmOutput` directly instead of `extractVisibleText()`

**Solution**:
```typescript
// WRONG
return { response: llmOutput };

// CORRECT
const visibleText = extractVisibleText(llmOutput);
return { response: visibleText };
```

</details>

---

## Production Checklist

Before deploying to production:

- [ ] API key stored in environment variable, not hardcoded
- [ ] Using `extractVisibleText()` before displaying to users
- [ ] Using `replaceCitations()` for text display (not showing raw `<cite>` tags)
- [ ] Error handling for API failures (network, auth, invalid attachment)
- [ ] Handling "no citations" case gracefully
- [ ] Handling verification timeout/errors (show pending state via Phase 4)
- [ ] Input validation for user-provided URLs (prevent SSRF)
- [ ] Caching strategy for attachmentIds (valid for 24 hours)
- [ ] All types imported from `@deepcitation/deepcitation-js`, none defined locally

---

<details>
<summary>Rate Limiting & Caching</summary>

### Caching attachmentIds

`attachmentId` values are valid for **24 hours**. Cache them to avoid re-uploading the same document:

```typescript
// Simple cache example
const attachmentCache = new Map<string, { attachmentId: string; expires: number }>();

async function getAttachmentId(fileHash: string, file: Buffer, filename: string) {
  const cached = attachmentCache.get(fileHash);
  if (cached && cached.expires > Date.now()) {
    return cached.attachmentId;
  }

  const { fileDataParts } = await deepcitation.prepareFiles([{ file, filename }]);
  const attachmentId = fileDataParts[0].attachmentId;

  // Cache for 23 hours (1 hour buffer before expiry)
  attachmentCache.set(fileHash, {
    attachmentId,
    expires: Date.now() + 23 * 60 * 60 * 1000,
  });

  return attachmentId;
}
```

### Rate Limits

Check the [API documentation](https://deepcitation.com/docs/api) for current rate limits. For high-volume applications:
- Implement exponential backoff on 429 errors
- Queue verification requests to stay within limits
- Consider batch verification for multiple citations

</details>

---

## Supported File Formats

| Type | Formats | Processing Time |
|------|---------|-----------------|
| **Images** | JPG, PNG, TIFF, WebP, HEIC | <1 second |
| **Documents** | PDF (text & scanned) | <1 second |
| **Office** | DOCX, XLSX, PPTX | ~30 seconds |
| **Web** | HTML, public URLs | ~30 seconds |

**Note**: For specific file size limits and page limits, check the [full documentation](https://deepcitation.com/docs).

---

<details>
<summary>Key Imports Reference (Complete Listing)</summary>

### Core Functions (from main entry)

```typescript
import {
  // Client
  DeepCitation,                    // Client class for API calls

  // Prompt wrapping
  wrapCitationPrompt,              // Wrap system + user prompts with citation instructions
  wrapSystemCitationPrompt,        // Wrap system prompt only
  CITATION_REMINDER,               // Short reminder text for reinforcement
  CITATION_JSON_OUTPUT_FORMAT,     // JSON schema for structured output LLMs

  // Parsing — use these, don't write your own!
  getAllCitationsFromLlmOutput,    // Parse all citations from LLM response text
  extractVisibleText,              // Strip <<<CITATION_DATA>>> block
  parseCitation,                   // Parse a single <cite> tag
  generateCitationKey,             // Generate lookup key for a citation

  // Status checking — use these, don't write your own!
  getCitationStatus,               // Get status flags (isVerified, isPartialMatch, isMiss, isPending)

  // Display helpers
  replaceCitations,                // Replace <cite> tags with text + indicators
  getVerificationTextIndicator,    // Get emoji indicator (☑️⚠️❌⏳)

  // Markdown rendering
  renderCitationsAsMarkdown,       // Rich markdown with variant/indicator options
  toMarkdown,                      // Simplified string shorthand

  // Prompt compression
  compressPromptIds,               // Compress attachment IDs to save tokens
  decompressPromptIds,             // Decompress back to full IDs

  // Multi-document support
  groupCitationsByAttachmentId,    // Group citations by attachment (returns Map)
  groupCitationsByAttachmentIdObject, // Group citations by attachment (returns Object)
} from "@deepcitation/deepcitation-js";
```

### React Components (from /react)

```typescript
import {
  CitationComponent,               // Render individual citation with status
  SourcesListComponent,            // Render list of all sources
  SourcesTrigger,                  // Trigger button for sources list
  UrlCitationComponent,            // Render URL citations
  DeepCitationIcon,                // Official DeepCitation icon
} from "@deepcitation/deepcitation-js/react";
```

### Types

```typescript
import type {
  // Core types
  Citation,                        // Citation data from LLM
  Verification,                    // Verification result from API
  CitationType,                    // "document" | "url"

  // Record types (object dictionaries, NOT arrays!)
  CitationRecord,                  // Record<string, Citation>
  VerificationRecord,              // Record<string, Verification>

  // Client types
  FileDataPart,                    // Result from prepareFiles()
  UploadFileResponse,              // Response from uploadFile()
  VerifyCitationsResponse,         // Response from verify methods

  // Options types
  WrapCitationPromptOptions,       // Options for wrapCitationPrompt()
  WrapCitationPromptResult,        // Result from wrapCitationPrompt()

  // Status types
  CitationStatus,                  // Status from getCitationStatus()
  ContentMatchStatus,              // Verification match status string
} from "@deepcitation/deepcitation-js";
```

</details>

---

## Appendix A: Real URLs

These are the only legitimate DeepCitation URLs. Do not fabricate others.

**Website:**
- https://deepcitation.com - Homepage
- https://deepcitation.com/signup - Get API key (free)
- https://deepcitation.com/playground - Interactive playground
- https://deepcitation.com/dashboard - Manage API keys
- https://deepcitation.com/docs - Full documentation
- https://deepcitation.com/docs/api - API reference
- https://deepcitation.com/docs/components - React components guide

**API Endpoints:**
- https://api.deepcitation.com/prepareFile - Upload and process attachments
- https://api.deepcitation.com/verifyCitations - Verify citations against source

---

## Appendix B: What DeepCitation Doesn't Do

- **Custom citation format templates** - No APA, MLA, Chicago style formatting
- **Offline/local processing** - Requires API calls (no local-only mode)
- **Real-time document updates** - Documents are processed once at upload
- **Citation style formatting** - Returns verification data, not formatted citations
- **Automatic bibliography generation** - Returns raw citation data only
- **Cross-document verification** - Each citation is verified against one document

---

## Optional: "DeepCitation Enabled" Message Input Indicator

If your chat application has a message input area with feature toggles or mode indicators (similar to Claude, ChatGPT, or Gemini), consider adding a "Deep Citation" option. This helps users understand that citation verification is available or active for their conversation.

**Important**: Match the existing UI patterns in the application. Use the same list item styles, icon sizes, active/enabled indicators, and interaction patterns already present in the message input area.

<details>
<summary>Implementation approaches</summary>

### If the app supports toggleable features

Add "Deep Citation" as a toggleable option in the existing features menu/list:

```tsx
import { DeepCitationIcon } from "@deepcitation/deepcitation-js/react";

// Match the app's existing menu item component and styles
<MenuItem
  icon={<DeepCitationIcon />}  // Our bracket icon [ ]
  label="Deep Citation"
  isActive={deepCitationEnabled}
  onClick={() => setDeepCitationEnabled(!deepCitationEnabled)}
/>
```

### If the app only shows read-only indicators

Display "Deep Citation" as an enabled indicator when documents are uploaded:

```tsx
import { DeepCitationIcon } from "@deepcitation/deepcitation-js/react";

// Show in the app's existing status/indicator area
{hasUploadedDocuments && (
  <StatusIndicator
    icon={<DeepCitationIcon />}
    label="Deep Citation"
    status="enabled"  // Use the app's existing enabled/active styling
  />
)}
```

### Matching the app's style

Study the existing feature toggles/indicators in the message input and replicate:

| Style Element | What to Match |
|---------------|---------------|
| **Icon size** | Same as other feature icons (e.g., `size-4`, `w-5 h-5`) |
| **Label font** | Same font-size, weight, color as other menu items |
| **Active state** | Checkmark ✓, filled dot ●, highlight color, or whatever the app uses |
| **Hover/focus** | Same hover background, focus ring as other items |
| **Spacing** | Same gap between icon and label, same padding |

### Using the DeepCitationIcon

We provide an official `DeepCitationIcon` component — square brackets `[ ]` that represent citations:

```tsx
import { DeepCitationIcon } from "@deepcitation/deepcitation-js/react";

// The icon inherits currentColor and defaults to 1em size
<DeepCitationIcon className="size-4" />
```

### When to show this

- **As a toggle**: When the app allows users to enable/disable features (should be ON by default)
- **As an indicator**: When documents have been uploaded and DeepCitation is processing
- **In a features menu**: Alongside other options like "Web search", "Create image", etc.
- **Default state**: DeepCitation should be enabled by default when you set it up. Users benefit from verifiable citations without needing to manually enable the feature.

This indicator increases user trust by signaling that AI-generated content will include verifiable citations. It's optional and should only be added if it fits naturally with the application's existing UX patterns.

</details>

---

## Resources

- [Full Documentation](https://deepcitation.com/docs)
- [Examples Directory](./examples)
- [API Reference](https://deepcitation.com/docs/api)
- [React Components Guide](https://deepcitation.com/docs/components)
