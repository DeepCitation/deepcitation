# Integration Guide - Implementing DeepCitation in Your Codebase

> **Note**: If you're contributing to the DeepCitation repository itself, see [AGENTS.md](./AGENTS.md).
> This guide is for external developers integrating DeepCitation into their applications.

> **Important**: The product name is **DeepCitation** (not "DeepCite"). Always use "DeepCitation" when referring to the product, package, or API.

This guide follows a **3-step workflow**:

1. **Prepare Sources** — Upload documents, get `attachmentId` + `deepTextPromptPortion`
2. **Enhance Prompts & Call LLM** — Wrap prompts with citation instructions, call your LLM
3. **Display Results** — Parse citations, verify against sources, render with status indicators

---

## Install

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

These rules apply to **every step**. Violating any of them is a bug.

> **1. Import, never define** — All types come from `@deepcitation/deepcitation-js`. Never create your own `Citation`, `Verification`, `CitationRecord`, `VerificationRecord`, or any other type.
>
> ```typescript
> // CORRECT
> import type { Citation, Verification, CitationRecord, VerificationRecord } from "@deepcitation/deepcitation-js";
>
> // WRONG — never do this
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
> **5. Never fabricate URLs** — Only use URLs listed in [Appendix G: Real URLs](#appendix-g-real-urls).

**Common mistakes at a glance:**

| Wrong | Correct |
|-------|---------|
| `interface Citation { ... }` | `import type { Citation } from "@deepcitation/deepcitation-js"` |
| `type Verification = { status: string }` | `import type { Verification } from "@deepcitation/deepcitation-js"` |
| `const isVerified = v.status === "found"` | `const { isVerified } = getCitationStatus(v)` |
| `citations.length` (it's not an array!) | `Object.keys(citations).length` |
| Writing custom cite tag parsers | `getAllCitationsFromLlmOutput(llmOutput)` |
| Showing raw `llmOutput` to users | `extractVisibleText(llmOutput)` |

---

## Quick Start

A complete, minimal example. Copy this to get started.

### Server Side

```typescript
import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
  extractVisibleText,
  getCitationStatus,
} from "@deepcitation/deepcitation-js";
import type { CitationRecord, VerificationRecord } from "@deepcitation/deepcitation-js";
import OpenAI from "openai";
import { readFileSync } from "fs";

async function analyzeDocument(filePath: string, question: string) {
  const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  // Step 1: Prepare source
  const document = readFileSync(filePath);
  const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
    { file: document, filename: filePath },
  ]);
  const attachmentId = fileDataParts[0].attachmentId;

  // Step 2: Enhance prompts & call LLM
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
  const llmOutput = response.choices[0].message.content!;

  // Step 3: Parse, verify, display
  const citations: CitationRecord = getAllCitationsFromLlmOutput(llmOutput);
  const visibleText = extractVisibleText(llmOutput);

  if (Object.keys(citations).length === 0) {
    return { response: visibleText, citations: {}, verifications: {} };
  }

  const result = await deepcitation.verifyAttachment(attachmentId, citations, {
    outputImageFormat: "avif",
    generateProofUrls: true,
    proofConfig: { access: "signed", signedUrlExpiry: "7d", imageFormat: "png" },
  });

  return { response: visibleText, citations, verifications: result.verifications };
}
```

### React Client Side

```tsx
import { useState } from "react";
import { parseCitation } from "@deepcitation/deepcitation-js";
import type { Citation, Verification } from "@deepcitation/deepcitation-js";
import {
  CitationComponent,
  CitationDrawer,
  CitationDrawerTrigger,
  generateCitationKey,
  groupCitationsBySource,
  type CitationDrawerItem,
} from "@deepcitation/deepcitation-js/react";

function MessageWithCitations({
  text,
  citations,
  verifications,
}: {
  text: string;
  citations: Record<string, Citation>;
  verifications: Record<string, Verification>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Build drawer items
  const drawerItems: CitationDrawerItem[] = Object.entries(citations).map(
    ([citationKey, citation]) => ({
      citationKey,
      citation,
      verification: verifications[citationKey] ?? null,
    }),
  );
  const citationGroups = groupCitationsBySource(drawerItems);

  // Split text on <cite> tags and render CitationComponent for each
  const parts = text.split(/(<cite\s+[^>]*\/>)/g);
  const rendered = parts.map((part, i) => {
    if (part.startsWith("<cite")) {
      const { citation: parsed } = parseCitation(part);
      const key = generateCitationKey(parsed);
      return (
        <CitationComponent
          key={i}
          citation={citations[key] ?? parsed}
          verification={verifications[key] ?? null}
        />
      );
    }
    return <span key={i}>{part}</span>;
  });

  return (
    <div>
      <div>{rendered}</div>
      {citationGroups.length > 0 && (
        <>
          <CitationDrawerTrigger
            citationGroups={citationGroups}
            onClick={() => setDrawerOpen(true)}
            isOpen={drawerOpen}
          />
          {drawerOpen && (
            <CitationDrawer
              isOpen={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              citationGroups={citationGroups}
            />
          )}
        </>
      )}
    </div>
  );
}
```

---

## Step 1: Prepare Sources

Complete these tasks in order:

1. Set `DEEPCITATION_API_KEY` in your `.env` file
2. Initialize the `DeepCitation` client
3. Upload your document(s) or prepare your URL(s)
4. Save `attachmentId` and `deepTextPromptPortion` — you need both in Step 2 and Step 3

### 1.1 Set Up the Client

```bash
# .env
DEEPCITATION_API_KEY=sk-dc-your-key-here
```

Get your API key at [deepcitation.com/signup](https://deepcitation.com/signup). Keys start with `sk-dc-`.

```typescript
import { DeepCitation } from "@deepcitation/deepcitation-js";

const deepcitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY!,
});
```

### 1.2 Upload Files (PDFs, Images) — Fast (<1 second)

```typescript
import { readFileSync } from "fs";

const document = readFileSync("./document.pdf");
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
  { file: document, filename: "document.pdf" },
]);

// Save for later steps
const attachmentId = fileDataParts[0].attachmentId;
// deepTextPromptPortion is used in Step 2
```

### 1.3 Prepare URLs — Slower (~30 seconds)

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

<details>
<summary>Unsafe Fast Mode for URLs (trusted sources only)</summary>

```typescript
// UNSAFE: Fast (<1s) but vulnerable to hidden text and prompt injection
// Only use for URLs you control!
const result = await deepcitation.prepareUrl({
  url: "https://your-trusted-site.com/article",
  unsafeFastUrlOutput: true,
});
```

**Risks**: Hidden text injection, fine print inclusion, prompt injection from malicious sites.

</details>

### 1.4 Multiple Documents

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
<summary>Compress prompt IDs for large documents</summary>

When documents produce very long `deepTextPromptPortion` strings, you can compress the attachment IDs to save tokens:

```typescript
import { compressPromptIds, decompressPromptIds } from "@deepcitation/deepcitation-js";

// Compress before wrapping prompts
const { compressed, prefixMap } = compressPromptIds(
  deepTextPromptPortion,
  [attachmentId]
);

// Use `compressed` in place of `deepTextPromptPortion` in Step 2
// Save `prefixMap` — you'll need it to decompress the LLM output in Step 3

// In Step 3, decompress BEFORE parsing:
const decompressedOutput = decompressPromptIds(llmOutput, prefixMap);
const citations = getAllCitationsFromLlmOutput(decompressedOutput as string);
```

</details>

### Supported File Formats

| Type | Formats | Processing Time |
|------|---------|-----------------|
| **Images** | JPG, PNG, TIFF, WebP, HEIC | <1 second |
| **Documents** | PDF (text & scanned) | <1 second |
| **Office** | DOCX, XLSX, PPTX | ~30 seconds |
| **Web** | HTML, public URLs | ~30 seconds |

**What you should have now:** `attachmentId` (string) and `deepTextPromptPortion` (string or string[]). Proceed to Step 2.

---

## Step 2: Enhance Prompts & Call LLM

Complete these tasks in order:

1. Call `wrapCitationPrompt()` with your system prompt, user prompt, and `deepTextPromptPortion`
2. Call your LLM with `enhancedSystemPrompt` and `enhancedUserPrompt`
3. Collect the complete response as `llmOutput` (if streaming, buffer the full response first — see [Step 3.7](#37-streaming-display-pattern))

### 2.1 Wrap Prompts

```typescript
import { wrapCitationPrompt } from "@deepcitation/deepcitation-js";

const systemPrompt = "You are a helpful assistant...";
const userPrompt = "Summarize this document";

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt,
  deepTextPromptPortion, // from Step 1
});
```

The wrapping places citation instructions at the start of the system prompt (high priority) and a brief reminder at the end (recency effect). The document content is prepended to the user prompt.

### 2.2 Call Your LLM

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

**Vercel AI SDK (Next.js):**

```typescript
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

const result = streamText({
  model: openai("gpt-5-mini"),
  system: enhancedSystemPrompt,
  messages: [{ role: "user", content: enhancedUserPrompt }],
});

return result.toTextStreamResponse();
```

> For Anthropic Claude, Google Gemini, and other providers, see [Appendix C: LLM Provider Examples](#appendix-c-llm-provider-examples).

### 2.3 Streaming Note

> **If you are streaming the LLM response**: The `<<<CITATION_DATA>>>` block arrives at the **end** of the response. You must buffer the complete response before parsing citations. See [Step 3.7: Streaming Display Pattern](#37-streaming-display-pattern) for the full pattern.

**What you should have now:** The complete `llmOutput` string. Proceed to Step 3.

---

## Step 3: Display Results

### 3.0 Choose Your Display Path

**All paths require [Step 3.1 (Parse & Verify)](#31-parse--verify-required-for-all-paths) first.**

| | Your Situation | Go To |
|-|---------------|-------|
| **A** | **React: Full experience** — inline citation indicators in text + citation drawer at bottom | [Step 3.2](#32-react-full-experience-inline-citations--citationdrawer) |
| **B** | **React: Inline only** — just citation indicators in text, no drawer | [Step 3.3](#33-react-inline-citations-only) |
| **C** | **React: Drawer only** — clean text with a citation drawer/panel | [Step 3.4](#34-react-citationdrawer-only) |
| **D** | **Markdown / text** — text with status indicators (for non-React apps) | [Step 3.5](#35-markdown--text-rendering) |
| **E** | **Platform-specific** — Slack, GitHub, HTML email, or terminal output | [Step 3.6](#36-platform-renderers-slack-github-html-terminal) |

**Also read [Step 3.7](#37-streaming-display-pattern) if you are streaming LLM responses.**

---

### 3.1 Parse & Verify (Required for ALL Paths)

Complete these tasks in order:

1. Parse citations from the LLM output
2. Extract visible text (strip the `<<<CITATION_DATA>>>` block)
3. Handle the "no citations" case
4. Verify citations against the source document
5. Use `getCitationStatus()` to check verification results

#### 3.1.1 Parse Citations

```typescript
import {
  getAllCitationsFromLlmOutput,
  extractVisibleText,
} from "@deepcitation/deepcitation-js";
import type { CitationRecord } from "@deepcitation/deepcitation-js";

// Parse citations — returns CitationRecord (OBJECT, NOT array!)
const citations: CitationRecord = getAllCitationsFromLlmOutput(llmOutput);

// CRITICAL: Strip the <<<CITATION_DATA>>> block before display
const visibleText: string = extractVisibleText(llmOutput);

// Use Object.keys().length, NOT .length
console.log(`Found ${Object.keys(citations).length} citations`);
```

**Handle no citations:**

```typescript
if (Object.keys(citations).length === 0) {
  // LLM didn't include citations — display response as-is
  return { response: visibleText, verifications: {} };
}
```

**Why `extractVisibleText()` is critical** — the raw LLM output contains hidden data that users must never see:

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

#### 3.1.2 Verify Citations

Call `verifyAttachment()` to verify citations against the source document. This returns verification results with status indicators and optional proof images.

```typescript
import { DeepCitation, getCitationStatus } from "@deepcitation/deepcitation-js";
import type { VerificationRecord } from "@deepcitation/deepcitation-js";

const result = await deepcitation.verifyAttachment(attachmentId, citations, {
  outputImageFormat: "avif",
  generateProofUrls: true,
  proofConfig: {
    access: "signed",
    signedUrlExpiry: "7d",
    imageFormat: "png",
  },
});

const verifications: VerificationRecord = result.verifications;
```

**Check verification status** — always use `getCitationStatus()`, never check status strings directly:

```typescript
import { getCitationStatus } from "@deepcitation/deepcitation-js";

for (const [key, verification] of Object.entries(verifications)) {
  const status = getCitationStatus(verification);

  if (status.isVerified && !status.isPartialMatch) {
    console.log(`Citation ${key}: Fully verified`);
  } else if (status.isVerified && status.isPartialMatch) {
    console.log(`Citation ${key}: Partial match`);
  } else if (status.isMiss) {
    console.log(`Citation ${key}: Not found`);
  } else if (status.isPending) {
    console.log(`Citation ${key}: Pending`);
  }
}
```

**Alternative: Automatic parsing (simpler)**

```typescript
// Parses citations from llmOutput automatically
const result = await deepcitation.verify({
  llmOutput: llmOutput,
});
const verifications: VerificationRecord = result.verifications;
```

<details>
<summary>Multi-document verification</summary>

When citations span multiple documents, group them by attachment ID before verifying:

```typescript
import { groupCitationsByAttachmentId } from "@deepcitation/deepcitation-js";

const grouped = groupCitationsByAttachmentId(citations);

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
    console.error("Invalid API key. Get a new one at https://deepcitation.com/dashboard");
  } else if (message.includes("Attachment not found")) {
    console.error("Attachment expired. Re-upload the document.");
  } else {
    console.error("Verification failed:", message);
  }
}
```

</details>

**What you should have now:** `citations` (`CitationRecord`), `visibleText` (string), and `verifications` (`VerificationRecord`). Now proceed to your chosen display path (3.2–3.6).

---

### 3.2 React: Full Experience (Inline Citations + CitationDrawer)

This is the **recommended** display path for chat applications. It renders inline `CitationComponent` indicators in the text and a `CitationDrawerTrigger` at the bottom that opens a full `CitationDrawer` showing all citations grouped by source.

Complete these tasks in order:

1. Import components from `@deepcitation/deepcitation-js/react`
2. Split `visibleText` on `<cite>` tags and render `CitationComponent` for each
3. Convert citations + verifications into `CitationDrawerItem[]`
4. Group items with `groupCitationsBySource()`
5. Render `CitationDrawerTrigger` at the bottom of the message
6. Render `CitationDrawer` (opened when user clicks the trigger)

#### Imports

```typescript
import { useState } from "react";
import { parseCitation } from "@deepcitation/deepcitation-js";
import type { Citation, Verification } from "@deepcitation/deepcitation-js";
import {
  CitationComponent,
  CitationDrawer,
  CitationDrawerTrigger,
  generateCitationKey,
  groupCitationsBySource,
  type CitationDrawerItem,
} from "@deepcitation/deepcitation-js/react";
```

#### Build Drawer Items

Convert your `citations` and `verifications` records into `CitationDrawerItem[]`:

```typescript
function toDrawerItems(
  citations: Record<string, Citation>,
  verifications: Record<string, Verification>,
): CitationDrawerItem[] {
  return Object.entries(citations).map(([citationKey, citation]) => ({
    citationKey,
    citation,
    verification: verifications[citationKey] ?? null,
  }));
}
```

#### Render Inline Citations

Split the `visibleText` on `<cite>` tags and replace each with a `CitationComponent`:

```tsx
function renderWithCitations(
  text: string,
  citations: Record<string, Citation>,
  verifications: Record<string, Verification>,
): React.ReactNode {
  const parts = text.split(/(<cite\s+[^>]*\/>)/g);

  return parts.map((part, index) => {
    if (part.startsWith("<cite")) {
      try {
        const { citation: parsed } = parseCitation(part);
        const citationKey = generateCitationKey(parsed);
        const citation = citations[citationKey] ?? parsed;
        const verification = verifications[citationKey] ?? null;

        return (
          <CitationComponent
            key={`citation-${index}`}
            citation={citation}
            verification={verification}
          />
        );
      } catch (err) {
        console.warn("Failed to parse citation tag:", part, err);
        return <span key={index}>{part}</span>;
      }
    }
    return <span key={index}>{part}</span>;
  });
}
```

#### Complete Component

```tsx
function ChatMessage({
  text,
  citations,
  verifications,
}: {
  text: string;
  citations: Record<string, Citation>;
  verifications: Record<string, Verification>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const drawerItems = toDrawerItems(citations, verifications);
  const citationGroups = groupCitationsBySource(drawerItems);

  return (
    <div>
      {/* Inline citations */}
      <div>{renderWithCitations(text, citations, verifications)}</div>

      {/* Citation drawer trigger at bottom of message */}
      {citationGroups.length > 0 && (
        <div className="mt-3 pt-2 border-t border-gray-100">
          <CitationDrawerTrigger
            citationGroups={citationGroups}
            onClick={() => setDrawerOpen(true)}
            isOpen={drawerOpen}
          />
        </div>
      )}

      {/* Citation drawer (renders via portal, won't be clipped by overflow) */}
      {drawerOpen && (
        <CitationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          citationGroups={citationGroups}
        />
      )}
    </div>
  );
}
```

#### Pre-Verification (Pending State)

Before verification completes, pass `null` for verifications to show pending spinners:

```tsx
<CitationComponent citation={citation} verification={null} />
```

---

### 3.3 React: Inline Citations Only

Use this if you want citation indicators inline in the text but no drawer at the bottom.

Complete these tasks in order:

1. Import `CitationComponent`, `parseCitation`, `generateCitationKey`
2. Split `visibleText` on `<cite>` tags
3. Render `CitationComponent` for each cite tag

Use the same `renderWithCitations()` function from [Step 3.2](#render-inline-citations), but skip the `CitationDrawerTrigger` and `CitationDrawer` parts.

```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

// Render with citation inline indicators
<div>{renderWithCitations(visibleText, citations, verifications)}</div>
```

#### Variant Options

Customize the visual style of inline citations:

| Variant | Example | Best For |
|---------|---------|----------|
| `"linter"` | underlined text | Grammar-check style (default) |
| `"brackets"` | `[1]` | Academic, footnote style |
| `"chip"` | pill badge | Modern UI, inline highlights |
| `"superscript"` | `^1` | Compact footnotes |
| `"text"` | plain text | Inheriting parent styles |
| `"badge"` | source chip with favicon | ChatGPT-style sources |

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  variant="chip"           // Visual style
  content="anchorText"     // What text to show: "anchorText" | "number" | "indicator" | "source"
/>
```

---

### 3.4 React: CitationDrawer Only

Use this if you want clean text (no inline citation indicators) with a citation drawer at the bottom.

Complete these tasks in order:

1. Strip `<cite>` tags from visible text using `replaceCitations()`
2. Build `CitationDrawerItem[]` from citations and verifications
3. Render `CitationDrawerTrigger` and `CitationDrawer`

```tsx
import { useState } from "react";
import { replaceCitations } from "@deepcitation/deepcitation-js";
import type { Citation, Verification } from "@deepcitation/deepcitation-js";
import {
  CitationDrawer,
  CitationDrawerTrigger,
  groupCitationsBySource,
  type CitationDrawerItem,
} from "@deepcitation/deepcitation-js/react";

function MessageWithDrawer({
  text,
  citations,
  verifications,
}: {
  text: string;
  citations: Record<string, Citation>;
  verifications: Record<string, Verification>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Strip cite tags, keep anchor text readable
  const cleanText = replaceCitations(text, { leaveAnchorTextBehind: true });

  // Build drawer data
  const drawerItems: CitationDrawerItem[] = Object.entries(citations).map(
    ([citationKey, citation]) => ({
      citationKey,
      citation,
      verification: verifications[citationKey] ?? null,
    }),
  );
  const citationGroups = groupCitationsBySource(drawerItems);

  return (
    <div>
      <div>{cleanText}</div>

      {citationGroups.length > 0 && (
        <CitationDrawerTrigger
          citationGroups={citationGroups}
          onClick={() => setDrawerOpen(true)}
          isOpen={drawerOpen}
        />
      )}

      {drawerOpen && (
        <CitationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          citationGroups={citationGroups}
        />
      )}
    </div>
  );
}
```

---

### 3.5 Markdown / Text Rendering

For non-React applications (server-side rendering, CLIs, exported documents).

Complete these tasks in order:

1. Choose a rendering method (see options below)
2. Pass `visibleText` and `verifications` to the renderer
3. Display the output

#### Option A: `replaceCitations()` — Simple Text with Indicators

```typescript
import { replaceCitations } from "@deepcitation/deepcitation-js";

// Strip all citation tags — clean text, no trace of citations
const cleanText = replaceCitations(visibleText, {});
// "Revenue grew 23% in Q4."

// Keep anchor text visible, remove cite tags
const withAnchors = replaceCitations(visibleText, { leaveAnchorTextBehind: true });

// Post-verification: add status indicators
const verifiedText = replaceCitations(visibleText, {
  verifications,
  showVerificationStatus: true,
});
// "Revenue grew 23% in Q4.☑️"
```

#### Option B: `renderCitationsAsMarkdown()` — Rich Markdown

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

// Simplified shorthand:
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

---

### 3.6 Platform Renderers (Slack, GitHub, HTML, Terminal)

For rendering citations on specific platforms. Each renderer is available as a separate import path.

#### Slack

```typescript
import { renderCitationsForSlack } from "@deepcitation/deepcitation-js/slack";

const output = renderCitationsForSlack(visibleText, {
  verifications,
  variant: "brackets",
  proofBaseUrl: "https://proof.deepcitation.com",
  includeSources: true,
});
// output.message: "Revenue grew 23%. <https://proof.deepcitation.com/p/abc123|[1✓]>"
```

#### GitHub Markdown

```typescript
import { renderCitationsForGitHub } from "@deepcitation/deepcitation-js/github";

const output = renderCitationsForGitHub(visibleText, {
  verifications,
  variant: "brackets",
  proofBaseUrl: "https://proof.deepcitation.com",
  includeSources: true,
});
// output.markdown: GitHub-flavored markdown with linked citations
```

#### HTML (Email, Embeds)

```typescript
import { renderCitationsAsHtml } from "@deepcitation/deepcitation-js/html";

const output = renderCitationsAsHtml(visibleText, {
  verifications,
  variant: "brackets",
  proofBaseUrl: "https://proof.deepcitation.com",
  includeStyles: true,
  includeTooltips: true,
});
// output.html: Static HTML with CSS tooltips
```

#### Terminal (ANSI Colors)

```typescript
import { renderCitationsForTerminal } from "@deepcitation/deepcitation-js/terminal";

const output = renderCitationsForTerminal(visibleText, {
  verifications,
  variant: "brackets",
  color: true,
});
// output.text: ANSI-colored terminal output
```

---

### 3.7 Streaming Display Pattern

When streaming LLM responses, the `<<<CITATION_DATA>>>` block arrives at the **end** of the response. You need to handle two phases: showing content during the stream, and upgrading to verified display after the stream completes.

#### Server-Side: Buffer the Full Response

```typescript
let fullResponse = "";

const stream = await openai.chat.completions.create({
  model: "gpt-5-mini",
  stream: true,
  messages: [
    { role: "system", content: enhancedSystemPrompt },
    { role: "user", content: enhancedUserPrompt },
  ],
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || "";
  fullResponse += content;

  // Show clean text during streaming (strip any partial cite tags)
  const visibleSoFar = extractVisibleText(fullResponse);
  const cleanSoFar = replaceCitations(visibleSoFar, {});
  updateUI(cleanSoFar);
}

// Stream complete — now parse citations from the full response
const citations = getAllCitationsFromLlmOutput(fullResponse);
const visibleText = extractVisibleText(fullResponse);

// Verify (can run in background while user reads response)
const result = await deepcitation.verifyAttachment(attachmentId, citations);

// Update UI with verification status
updateUIWithVerifications(visibleText, citations, result.verifications);
```

#### Client-Side: Auto-Verify When Streaming Completes (React)

This is the pattern used by the DeepCitation playground. It detects when the LLM stream finishes, then automatically triggers verification:

```tsx
import { useChat } from "@ai-sdk/react";
import type { Citation, FileDataPart, Verification } from "@deepcitation/deepcitation-js";
import { useEffect, useRef, useState } from "react";

interface MessageVerificationResult {
  citations: Record<string, Citation>;
  verifications: Record<string, Verification>;
  summary: { total: number; verified: number; missed: number; pending: number };
}

function Chat({ fileDataParts }: { fileDataParts: FileDataPart[] }) {
  const [messageVerifications, setMessageVerifications] = useState<
    Record<string, MessageVerificationResult>
  >({});
  const wasLoadingRef = useRef(false);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    streamProtocol: "text",
    body: { fileDataParts },
  });

  // Detect streaming completion (isLoading: true -> false) and auto-verify
  useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = isLoading;

    if (wasLoading && !isLoading) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === "assistant" && !messageVerifications[lastMessage.id]) {
        const messageContent =
          lastMessage.content ||
          lastMessage.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map(p => p.text)
            .join("") ||
          "";

        // Call your /api/verify endpoint
        fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            llmOutput: messageContent,
            attachmentId: fileDataParts[0].attachmentId,
          }),
        })
          .then(res => res.json())
          .then((data: MessageVerificationResult) => {
            setMessageVerifications(prev => ({ ...prev, [lastMessage.id]: data }));
          })
          .catch(err => console.error("Verification failed:", err));
      }
    }
  }, [isLoading, messages, messageVerifications]);

  // Render messages with verification data
  return (
    <div>
      {messages.map(message => {
        const msgVerification = messageVerifications[message.id];
        return (
          <ChatMessage
            key={message.id}
            text={message.content}
            citations={msgVerification?.citations ?? {}}
            verifications={msgVerification?.verifications ?? {}}
          />
        );
      })}
    </div>
  );
}
```

**Key points:**
- During streaming: Show the response text as it arrives (the `useChat` hook handles this)
- Citation tags like `<cite n="1" />` will appear inline during streaming — these are fine to display
- After streaming completes: Call your verify endpoint with the full `llmOutput` and `attachmentId`
- Update state with verification results — `CitationComponent` will automatically switch from pending spinners to status indicators

---

## Appendix A: Verification Status Reference

### Quick Summary

| Indicator | Meaning | When shown |
|-----------|---------|------------|
| Green checkmark | Verified | Exact match found at expected location |
| Amber checkmark | Partial match | Found but with caveats (wrong page, partial text, etc.) |
| Red warning | Not found | Text not found in document |
| Spinner | Pending | Verification in progress |

### Detailed Status Values

| Status Value | Indicator | Description | UI Guidance |
|--------------|-----------|-------------|-------------|
| `"found"` | Green | Exact match at expected location | High confidence, show proof image |
| `"found_phrase_missed_anchor_text"` | Green | Full phrase found, anchor text highlight missed | Show as verified |
| `"found_anchor_text_only"` | Amber | Only anchor text found, full phrase not matched | Show with caution |
| `"found_on_other_page"` | Amber | Found on different page than expected | Note the actual page |
| `"found_on_other_line"` | Amber | Found on different line than expected | Usually still reliable |
| `"partial_text_found"` | Amber | Only part of the text matched | Show what was found |
| `"first_word_found"` | Amber | Only first word matched (lowest confidence) | Consider not showing |
| `"not_found"` | Red | Text not found in document | Mark as unverified |
| `"pending"` / `null` | Spinner | Verification in progress | Show loading state |

### Status Flags (from `getCitationStatus()`)

| Status Value | `isVerified` | `isPartialMatch` | `isMiss` | `isPending` |
|--------------|--------------|------------------|----------|-------------|
| `"found"` | true | false | false | false |
| `"found_phrase_missed_anchor_text"` | true | false | false | false |
| `"found_anchor_text_only"` | true | true | false | false |
| `"found_on_other_page"` | true | true | false | false |
| `"found_on_other_line"` | true | true | false | false |
| `"partial_text_found"` | true | true | false | false |
| `"first_word_found"` | true | true | false | false |
| `"not_found"` | false | false | true | false |
| `"pending"` / `null` | false | false | false | true |

---

## Appendix B: Complete Import Reference

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
  getVerificationTextIndicator,    // Get emoji indicator

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
  CitationDrawer,                  // Full citation drawer (bottom sheet)
  CitationDrawerTrigger,           // Compact trigger bar for CitationDrawer
  groupCitationsBySource,          // Group CitationDrawerItems by source
  SourcesListComponent,            // Render list of all sources
  SourcesTrigger,                  // Trigger button for sources list
  UrlCitationComponent,            // Render URL citations
  DeepCitationIcon,                // Official DeepCitation icon
  generateCitationKey,             // Generate lookup key for a citation
} from "@deepcitation/deepcitation-js/react";
```

### Platform Renderers

```typescript
import { renderCitationsForSlack } from "@deepcitation/deepcitation-js/slack";
import { renderCitationsForGitHub } from "@deepcitation/deepcitation-js/github";
import { renderCitationsAsHtml } from "@deepcitation/deepcitation-js/html";
import { renderCitationsForTerminal } from "@deepcitation/deepcitation-js/terminal";
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

import type {
  CitationDrawerItem,              // Item for CitationDrawer
  CitationDrawerProps,             // Props for CitationDrawer
  SourceCitationGroup,             // Group of citations by source
} from "@deepcitation/deepcitation-js/react";
```

---

## Appendix C: LLM Provider Examples

### Anthropic Claude

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

### Google Gemini

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

---

## Appendix D: Next.js API Route Patterns

### Upload Route (`/api/upload`)

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

### Chat Route (`/api/chat`)

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

### Verify Route (`/api/verify`)

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  DeepCitation,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
} from "@deepcitation/deepcitation-js";
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
      generateProofUrls: true,
      proofConfig: {
        access: "signed",
        signedUrlExpiry: "7d",
        imageFormat: "png",
      },
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
      verifications,
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

---

## Appendix E: Troubleshooting

### Issue: No citations in LLM output

**Symptoms**: LLM response has no `<cite>` tags

**Causes**:
- `deepTextPromptPortion` not included in the prompt
- LLM model doesn't follow citation instructions well

**Solutions**:
1. Verify `deepTextPromptPortion` is passed to `wrapCitationPrompt()`
2. Try a different LLM model
3. Use `CITATION_REMINDER` in additional user prompts for reinforcement

**Don't**:
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

**Don't**:
- Don't hardcode API keys in source code
- Don't commit `.env` files to version control

---

### Issue: Verification fails or returns "not found"

**Symptoms**: Citations show red X even though content exists in document

**Causes**:
- `attachmentId` doesn't match the uploaded document
- Document was re-uploaded (new attachmentId generated)
- LLM hallucinated content not in the document
- OCR quality issues for scanned documents

**Solutions**:
1. Ensure `attachmentId` matches the uploaded document
2. Check that the cited text actually exists in the source
3. For scanned PDFs, try uploading higher quality scans
4. Partial matches indicate content was found but location differs

**Don't**:
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

---

## Appendix F: Production Checklist

Before deploying to production:

- [ ] API key stored in environment variable, not hardcoded
- [ ] Using `extractVisibleText()` before displaying to users
- [ ] Using `replaceCitations()` for text display (not showing raw `<cite>` tags)
- [ ] Error handling for API failures (network, auth, invalid attachment)
- [ ] Handling "no citations" case gracefully
- [ ] Handling verification timeout/errors (show pending state)
- [ ] Input validation for user-provided URLs (prevent SSRF)
- [ ] All types imported from `@deepcitation/deepcitation-js`, none defined locally

### Caching attachmentIds

`attachmentId` values are valid for **24 hours**. Cache them to avoid re-uploading the same document:

```typescript
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

Check the [API documentation](https://docs.deepcitation.com/api) for current rate limits. For high-volume applications:
- Implement exponential backoff on 429 errors
- Queue verification requests to stay within limits
- Consider batch verification for multiple citations

---

## Appendix G: Real URLs

These are the only legitimate DeepCitation URLs. Do not fabricate others.

**Website:**
- https://deepcitation.com - Homepage
- https://deepcitation.com/signup - Get API key (free)
- https://deepcitation.com/playground - Interactive playground
- https://deepcitation.com/dashboard - Manage API keys
- https://docs.deepcitation.com/ - Full documentation
- https://docs.deepcitation.com/api - API reference
- https://docs.deepcitation.com/components - React components guide

**API Endpoints:**
- https://api.deepcitation.com/prepareFile - Upload and process attachments
- https://api.deepcitation.com/verifyCitations - Verify citations against source

---

## Appendix H: Supported File Formats

| Type | Formats | Processing Time |
|------|---------|-----------------|
| **Images** | JPG, PNG, TIFF, WebP, HEIC | <1 second |
| **Documents** | PDF (text & scanned) | <1 second |
| **Office** | DOCX, XLSX, PPTX | ~30 seconds |
| **Web** | HTML, public URLs | ~30 seconds |

For specific file size limits and page limits, check the [full documentation](https://docs.deepcitation.com/).
