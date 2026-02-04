# Integration Guide - Implementing DeepCitation in Your Codebase

> **Note**: If you're contributing to the DeepCitation repository itself, see [AGENTS.md](./AGENTS.md).
> This guide is for external developers integrating DeepCitation into their applications.

> **Important**: The product name is **DeepCitation** (not "DeepCite"). Always use "DeepCitation" when referring to the product, package, or API.

This guide provides step-by-step instructions for AI code agents (Claude, Cursor, GitHub Copilot, etc.) to implement DeepCitation in any codebase.

---

## ⚠️ FIRST: Install the Package

**Before doing anything else, install the DeepCitation package:**

```bash
npm install @deepcitation/deepcitation-js
# or
pnpm add @deepcitation/deepcitation-js
# or
yarn add @deepcitation/deepcitation-js
# or
bun add @deepcitation/deepcitation-js
```

**AI Agents**: Run this installation command in the project directory before proceeding with any integration steps. The package provides all the types, functions, and React components you need.

---

## Agent Behavior Guidelines

> **CRITICAL: Use Our Exports - Do NOT Create Your Own Types or Helpers**
>
> DeepCitation exports all the types, interfaces, and helper functions you need. **Never define your own versions** of `Citation`, `Verification`, `CitationRecord`, `VerificationRecord`, or any other types. Import them from the package.
>
> ```typescript
> // ✅ CORRECT - Import our types
> import type { Citation, Verification, CitationRecord, VerificationRecord } from "@deepcitation/deepcitation-js";
>
> // ❌ WRONG - Never define your own types
> interface Citation { ... }  // DON'T DO THIS
> type VerificationResult = { ... }  // DON'T DO THIS
> ```

**DO:**
- **Import all types from `@deepcitation/deepcitation-js`** - We export everything you need
- **Import React components from `@deepcitation/deepcitation-js/react`** - Pre-built, tested components
- Use only methods documented in this file
- Use only URLs listed in the [Real URLs](#appendix-a-real-urls) appendix
- Follow the exact code patterns shown in examples
- Use `extractVisibleText()` before displaying LLM output to users

**DON'T:**
- **Never create your own `Citation`, `Verification`, or other type definitions** - Use our exports
- **Never write your own citation parsing logic** - Use `getAllCitationsFromLlmOutput()`
- **Never write your own status checking logic** - Use `getCitationStatus()`
- Never fabricate URLs or API endpoints not listed here
- Never invent methods not documented (e.g., `deepcitation.someUndocumentedMethod()`)
- Never show raw `llmOutput` to users (it contains `<<<CITATION_DATA>>>` blocks)
- Never hardcode API keys in source code

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

## Use Our Exports - Don't Reinvent the Wheel

DeepCitation provides **everything you need** - types, parsing functions, status helpers, and React components. Import and use them directly.

### Required Imports Pattern

Every integration should start with these imports:

```typescript
// Functions you'll use
import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
  extractVisibleText,
  getCitationStatus,
} from "@deepcitation/deepcitation-js";

// Types you'll need - IMPORT THESE, don't create your own!
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

### Common Mistakes to Avoid

| ❌ Wrong | ✅ Correct |
|----------|------------|
| `interface Citation { ... }` | `import type { Citation } from "@deepcitation/deepcitation-js"` |
| `type Verification = { status: string }` | `import type { Verification } from "@deepcitation/deepcitation-js"` |
| `const isVerified = v.status === "found"` | `const { isVerified } = getCitationStatus(v)` |
| `citations.length` (it's not an array!) | `Object.keys(citations).length` |
| Writing custom cite tag parsers | `getAllCitationsFromLlmOutput(llmOutput)` |

See the [Key Imports Reference](#key-imports-reference-must-use) section for the complete list of exports.

---

## Critical Warning: Citation Data Block

The LLM output contains a `<<<CITATION_DATA>>>` block that **MUST BE STRIPPED** before showing to users.

**WRONG** - User sees raw citation data:
```
Revenue grew 23% in Q4.<cite n="1" />

<<<CITATION_DATA>>>
{"1":{"pageNumber":1,"lineId":"5","fullPhrase":"Revenue grew 23% in Q4"}}
<<<END_CITATION_DATA>>>
```

**CORRECT** - Use `extractVisibleText()`:
```
Revenue grew 23% in Q4.<cite n="1" />
```

**Always use:**
```typescript
import { extractVisibleText } from "@deepcitation/deepcitation-js";

const visibleText = extractVisibleText(llmOutput);
// Show visibleText to users, NOT llmOutput
```

---

## Quick Start (Complete Example)

This is a complete, runnable example. Copy this to get started:

```typescript
// Import functions
import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
  extractVisibleText,
  getCitationStatus,
  replaceCitations,
} from "@deepcitation/deepcitation-js";

// Import types - ALWAYS use our types, don't define your own!
import type {
  CitationRecord,
  VerificationRecord,
  FileDataPart,
} from "@deepcitation/deepcitation-js";

import OpenAI from "openai";
import { readFileSync } from "fs";

async function analyzeDocument(filePath: string, question: string) {
  // 1. Initialize clients
  const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  // 2. Upload document - FileDataPart[] is our exported type
  const document = readFileSync(filePath);
  const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
    { file: document, filename: filePath },
  ]);
  const attachmentId: string = fileDataParts[0].attachmentId;

  // 3. Wrap prompts with citation instructions
  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt: "You are a helpful assistant. Cite your sources.",
    userPrompt: question,
    deepTextPromptPortion,
  });

  // 4. Call LLM
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: enhancedSystemPrompt },
      { role: "user", content: enhancedUserPrompt },
    ],
  });
  const llmOutput: string = response.choices[0].message.content!;

  // 5. Parse citations and extract visible text
  // CRITICAL: Strip the <<<CITATION_DATA>>> block before showing to users
  // NOTE: CitationRecord is an OBJECT (Record<string, Citation>), NOT an array!
  const citations: CitationRecord = getAllCitationsFromLlmOutput(llmOutput);
  const visibleText: string = extractVisibleText(llmOutput);

  // 6. Verify citations - returns VerificationRecord (Record<string, Verification>)
  const result = await deepcitation.verifyAttachment(attachmentId, citations);
  const verifications: VerificationRecord = result.verifications;

  // 7. Display results (use visibleText, not raw llmOutput)
  const cleanResponse = replaceCitations(visibleText, {
    verifications,
    showVerificationStatus: true,
  });

  // Calculate summary using getCitationStatus() - don't write your own status logic!
  const entries = Object.values(verifications);
  const verified = entries.filter((v) => getCitationStatus(v).isVerified).length;

  return {
    response: cleanResponse,
    summary: { total: entries.length, verified },
  };
}
```

---

## Core Workflow

**The 5-step workflow: Upload → Wrap → LLM → Parse → Verify → Display**

```
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 1: UPLOAD                                                     │
│  Document/URL → prepareFiles() or prepareUrl()                      │
│  Returns: attachmentId + deepTextPromptPortion                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 2: WRAP PROMPTS                                               │
│  systemPrompt + userPrompt + deepTextPromptPortion                  │
│  → wrapCitationPrompt()                                             │
│  Returns: enhancedSystemPrompt + enhancedUserPrompt                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 3: CALL LLM                                                   │
│  Use enhanced prompts with any LLM (OpenAI, Anthropic, Google)      │
│  Returns: llmOutput (contains <<<CITATION_DATA>>> block)            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 4: PARSE & EXTRACT                                            │
│  getAllCitationsFromLlmOutput(llmOutput) → citations                │
│  extractVisibleText(llmOutput) → visibleText (STRIPPED)             │
│  ⚠️  NEVER show raw llmOutput to users!                             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 5: VERIFY                                                     │
│  verifyAttachment(attachmentId, citations)                          │
│  Returns: verifications with status and proof images                │
│  Note: This is async, can run while showing initial response        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 6: DISPLAY                                                    │
│  replaceCitations() for text output                                 │
│  OR CitationComponent for React                                     │
│  Shows: ✅ verified, ⚠️ partial, ❌ not found, ⏳ pending           │
└─────────────────────────────────────────────────────────────────────┘
```

### Why Each Step Exists

| Step | Why It's Needed |
|------|-----------------|
| **Upload** | Converts documents to structured text with page/line IDs that LLMs can reference |
| **Wrap** | Injects citation instructions so the LLM knows how to format citations |
| **Parse** | Extracts citation data from the special `<<<CITATION_DATA>>>` block |
| **Extract** | Removes the citation data block so users see clean text |
| **Verify** | Checks if cited text actually exists in the source document |
| **Display** | Shows verification status (checkmarks, warnings) to users |

---

## Installation & Setup

### Install the package

If you haven't already, install the package (see [FIRST: Install the Package](#️-first-install-the-package) above):

```bash
npm install @deepcitation/deepcitation-js
# or
pnpm add @deepcitation/deepcitation-js
# or
yarn add @deepcitation/deepcitation-js
# or
bun add @deepcitation/deepcitation-js
```

### Environment variables

```bash
# .env
DEEPCITATION_API_KEY=sk-dc-your-key-here
```

Get your API key at [deepcitation.com/signup](https://deepcitation.com/signup)

### Initialize the client

```typescript
import { DeepCitation } from "@deepcitation/deepcitation-js";

const deepcitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY!,
});
```

---

## Step-by-Step Guide

### Step 1: Upload Documents

Upload source documents before calling your LLM. This returns structured text with page/line IDs.

**For files (PDFs, images) - Fast (<1 second):**

```typescript
import { DeepCitation } from "@deepcitation/deepcitation-js";
import { readFileSync } from "fs";

const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

// Load and upload document
const document = readFileSync("./document.pdf");
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
  { file: document, filename: "document.pdf" },
]);

// Save the attachmentId for verification later
const attachmentId = fileDataParts[0].attachmentId;
```

**For URLs - Slower (~30 seconds):**

```typescript
// URLs and Office files require conversion, taking ~30 seconds
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

**For multiple documents:**

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

### Step 2: Wrap Prompts

Add citation instructions to your prompts:

```typescript
import { wrapCitationPrompt } from "@deepcitation/deepcitation-js";

const systemPrompt = "You are a helpful assistant...";
const userPrompt = "Summarize this document";

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt,
  deepTextPromptPortion, // Include the structured document text
});
```

**Position options for citation instructions:**

| Position | When to Use | Description |
|----------|-------------|-------------|
| `'append'` | Short system prompts (default) | Instructions added at end |
| `'prepend'` | Large system prompts | Instructions at start (higher priority) |
| `'wrap'` | Maximum reliability | Instructions at start AND reminder at end |

```typescript
// For large system prompts, prepend instructions for higher priority
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt,
  deepTextPromptPortion,
  position: 'prepend', // or 'wrap' for maximum emphasis
});
```

### Step 3: Call Your LLM

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

### Step 4: Parse Citations & Extract Visible Text

**CRITICAL**: The LLM response contains a `<<<CITATION_DATA>>>` block that must be stripped before showing to users.

> **Use our parsing functions** - Don't write your own citation parser! `getAllCitationsFromLlmOutput()` handles all the complexity.

```typescript
// Import functions AND types from our package
import { getAllCitationsFromLlmOutput, extractVisibleText } from "@deepcitation/deepcitation-js";
import type { CitationRecord, Citation } from "@deepcitation/deepcitation-js";

// Parse citations from LLM output using OUR function
// IMPORTANT: Returns CitationRecord (an object/dictionary), NOT an array!
const citations: CitationRecord = getAllCitationsFromLlmOutput(llmOutput);

// CRITICAL: Extract visible text to strip the citation data block
// The citation data block is for parsing only - users should NEVER see it
const visibleText: string = extractVisibleText(llmOutput);

// Use visibleText for display, not the raw llmOutput
// NOTE: Use Object.keys().length, NOT citations.length (it's not an array!)
console.log(`Found ${Object.keys(citations).length} citations`);

// Access individual citations - they are typed as Citation (our exported type)
for (const [key, citation] of Object.entries(citations)) {
  const c: Citation = citation; // Type is already correct from our exports
  console.log(`Citation ${c.citationNumber}: ${c.anchorText}`);
}
```

**Handling no citations:**

```typescript
const citations = getAllCitationsFromLlmOutput(llmOutput);

// IMPORTANT: citations is an object, NOT an array. Use Object.keys().length!
if (Object.keys(citations).length === 0) {
  // LLM didn't include citations - display response as-is
  const visibleText = extractVisibleText(llmOutput);
  return { response: visibleText, verifications: {} };
}

// Proceed with verification...
```

### Step 5: Verify Citations

Verify citations against the source documents:

> **Use our types**: `VerificationRecord` is `Record<string, Verification>` - import both from our package.

**Option A: Manual parsing (more control)**

```typescript
import type { VerificationRecord, Verification } from "@deepcitation/deepcitation-js";

const result = await deepcitation.verifyAttachment(attachmentId, citations, {
  outputImageFormat: "avif", // or "png", "jpeg"
});

// verifications is VerificationRecord (Record<string, Verification>)
const verifications: VerificationRecord = result.verifications;
```

**Option B: Automatic parsing (simpler)**

```typescript
// Let DeepCitation parse and verify automatically
const result = await deepcitation.verify({
  llmOutput: llmOutput,
});

const verifications: VerificationRecord = result.verifications;
```

**Check verification status - USE `getCitationStatus()`, don't check status strings manually:**

```typescript
import { getCitationStatus } from "@deepcitation/deepcitation-js";
import type { Verification, CitationStatus } from "@deepcitation/deepcitation-js";

// ❌ WRONG - Don't check status strings manually
// if (verification.status === "found") { ... }

// ✅ CORRECT - Use getCitationStatus() helper
for (const [key, verification] of Object.entries(verifications)) {
  const status: CitationStatus = getCitationStatus(verification);

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

**Error handling:**

```typescript
try {
  const result = await deepcitation.verifyAttachment(attachmentId, citations);
} catch (error: any) {
  const message = error?.message || "Unknown error";

  if (message.includes("Invalid or expired API key")) {
    // API key issue - check DEEPCITATION_API_KEY
    console.error("Invalid API key. Get a new one at https://deepcitation.com/dashboard");
  } else if (message.includes("Attachment not found")) {
    // attachmentId expired or invalid - re-upload document
    console.error("Attachment expired. Re-upload the document.");
  } else {
    // Network or other error - retry with backoff
    console.error("Verification failed:", message);
  }
}
```

### Step 6: Display Results

**Text output (non-React):**

```typescript
import { replaceCitations, getVerificationTextIndicator } from "@deepcitation/deepcitation-js";

// Replace citation tags with text indicators
const cleanText = replaceCitations(visibleText, {
  verifications,
  showVerificationStatus: true,
});
// Output: "Revenue grew 23% [✅] in Q4..."

// Or get indicator for single verification
const indicator = getVerificationTextIndicator(verification);
// Returns: "✅" | "⚠️" | "❌" | "⏳"
```

**React components:**

```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";
import "@deepcitation/deepcitation-js/react/styles.css";

// Basic usage
<CitationComponent
  citation={citation}
  verification={verification}
/>

// With variant and content options
<CitationComponent
  citation={citation}
  verification={verification}
  variant="chip"           // "brackets" | "chip" | "text" | "superscript" | "minimal" | "linter"
  content="anchorText"     // "anchorText" | "number" | "indicator"
/>
```

<details>
<summary>React Component Variants Reference</summary>

| Variant | Example | Best For |
|---------|---------|----------|
| `"brackets"` | `[1✓]` | Academic, footnote style |
| `"chip"` | pill badge | Modern UI, inline highlights |
| `"superscript"` | `¹✓` | Compact footnotes |
| `"minimal"` | `1✓` | Space-constrained UI |
| `"text"` | plain text | Inheriting parent styles |
| `"linter"` | underlined | Grammar-check style indicators |

**Rendering inline citations in React:**

```tsx
// Import functions from main entry
import { parseCitation, generateCitationKey } from "@deepcitation/deepcitation-js";
// Import types - ALWAYS use our types!
import type { Citation, Verification, VerificationRecord } from "@deepcitation/deepcitation-js";
// Import components from /react
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

// Use our VerificationRecord type, not your own Record<string, ...>
function renderWithCitations(text: string, verifications: VerificationRecord) {
  const parts = text.split(/(<cite\s+[^>]*\/>)/g);

  return parts.map((part, index) => {
    if (part.startsWith("<cite")) {
      // parseCitation returns { citation: Citation } - our exported type
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

---

## Framework Integration Patterns

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
// Import functions AND types from our package
import { wrapCitationPrompt } from "@deepcitation/deepcitation-js";
import type { FileDataPart, WrapCitationPromptResult } from "@deepcitation/deepcitation-js";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { messages, fileDataParts } = await req.json();

  // Use our FileDataPart type - don't define your own!
  const typedFileDataParts: FileDataPart[] = fileDataParts;

  // Combine deepTextPromptPortion from all files
  const deepTextPromptPortion = typedFileDataParts
    .map((f) => f.deepTextPromptPortion)
    .filter(Boolean);

  const lastUserContent = messages[messages.length - 1].content;

  // wrapCitationPrompt returns WrapCitationPromptResult - use our type!
  const { enhancedSystemPrompt, enhancedUserPrompt }: WrapCitationPromptResult = wrapCitationPrompt({
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
// Import functions AND types from our package
import { DeepCitation, getAllCitationsFromLlmOutput, getCitationStatus } from "@deepcitation/deepcitation-js";
import type { CitationRecord, VerificationRecord, CitationStatus } from "@deepcitation/deepcitation-js";

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

    // Use our exported types - don't define your own!
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

    // Calculate summary using getCitationStatus() - don't check status strings manually!
    let verified = 0, missed = 0;
    for (const verification of Object.values(verifications)) {
      const status: CitationStatus = getCitationStatus(verification);
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
// 1. Parse citations from the full response
const citations = getAllCitationsFromLlmOutput(fullResponse);

// 2. CRITICAL: Extract visible text (strips <<<CITATION_DATA>>> block)
const visibleText = extractVisibleText(fullResponse);

// 3. Send visibleText to client (NOT fullResponse!)
// The client should never see the <<<CITATION_DATA>>> block

// 4. Verify citations (can run in background while user reads response)
const result = await deepcitation.verifyAttachment(attachmentId, citations);

// 5. Update UI with verification status when ready
```

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

### Status Flags

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

## Troubleshooting

### Issue: No citations in LLM output

**Symptoms**: LLM response has no `<cite>` tags

**Causes**:
- `deepTextPromptPortion` not included in the prompt
- Using `position: 'append'` with a very large system prompt
- LLM model doesn't follow citation instructions well

**Solutions**:
1. Verify `deepTextPromptPortion` is passed to `wrapCitationPrompt()`
2. Try `position: 'prepend'` or `position: 'wrap'` for stronger instructions
3. Try a different LLM model

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
- Don't assume all "not found" results are bugs - LLMs can hallucinate
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

## Production Checklist

Before deploying to production:

- [ ] API key stored in environment variable, not hardcoded
- [ ] Using `extractVisibleText()` before displaying to users
- [ ] Error handling for API failures (network, auth, invalid attachment)
- [ ] Handling "no citations" case gracefully
- [ ] Handling verification timeout/errors (show pending state)
- [ ] Input validation for user-provided URLs (prevent SSRF)
- [ ] Caching strategy for attachmentIds (valid for 24 hours)

---

## Rate Limiting & Caching

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

## Key Imports Reference (MUST USE)

> **IMPORTANT**: All types, interfaces, and helpers shown below are exported by the package. **You MUST import and use these** - do not create your own versions.

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

  // Parsing - USE THESE, don't write your own!
  getAllCitationsFromLlmOutput,    // Parse all citations from LLM response text
  extractVisibleText,              // CRITICAL: Strip <<<CITATION_DATA>>> block
  parseCitation,                   // Parse a single <cite> tag
  generateCitationKey,             // Generate lookup key for a citation

  // Status checking - USE THESE, don't write your own!
  getCitationStatus,               // Get status flags (isVerified, isPartialMatch, isMiss, isPending)

  // Display helpers
  replaceCitations,                // Replace <cite> tags with text + indicators
  getVerificationTextIndicator,    // Get emoji indicator (✅⚠️❌⏳)
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

### Types - MUST IMPORT, DO NOT RECREATE

```typescript
// ⚠️ CRITICAL: Import these types - NEVER define your own versions!
import type {
  // Core types
  Citation,                        // Citation data from LLM - DO NOT RECREATE
  Verification,                    // Verification result from API - DO NOT RECREATE
  CitationType,                    // "document" | "url"

  // Record types (object dictionaries, NOT arrays!)
  CitationRecord,                  // Record<string, Citation> - returned by getAllCitationsFromLlmOutput
  VerificationRecord,              // Record<string, Verification> - returned by verify methods

  // Client types
  FileDataPart,                    // Result from prepareFiles()
  UploadFileResponse,              // Response from uploadFile()
  VerifyCitationsResponse,         // Response from verify methods

  // Options types
  CitationPosition,                // 'append' | 'prepend' | 'wrap'
  WrapCitationPromptOptions,       // Options for wrapCitationPrompt()
  WrapCitationPromptResult,        // Result from wrapCitationPrompt()

  // Status types
  CitationStatus,                  // Status from getCitationStatus()
  ContentMatchStatus,              // Verification match status string
} from "@deepcitation/deepcitation-js";
```

### Why You Must Use Our Types

1. **Type safety**: Our types are kept in sync with the API responses
2. **Consistency**: All examples and documentation use these types
3. **Future compatibility**: Updates to the package will maintain backward compatibility
4. **IDE support**: Better autocomplete and error checking

```typescript
// ❌ WRONG - Don't create your own types
interface MyCitation {
  page: number;
  text: string;
}

// ✅ CORRECT - Import our types
import type { Citation } from "@deepcitation/deepcitation-js";
const citation: Citation = getAllCitationsFromLlmOutput(llmOutput)["key"];
```

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

### Implementation approaches

#### If the app supports toggleable features
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

#### If the app only shows read-only indicators
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

We provide an official `DeepCitationIcon` component - square brackets `[ ]` that represent citations:

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

---

## Resources

- [Full Documentation](https://deepcitation.com/docs)
- [Examples Directory](./examples)
- [API Reference](https://deepcitation.com/docs/api)
- [React Components Guide](https://deepcitation.com/docs/components)
