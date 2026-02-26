# Integration Guide

> **Note**: This guide was streamlined in v0.1. For complete working examples,
> see the [`examples/`](./examples) directory.

> For contributors: see [AGENTS.md](./AGENTS.md). This guide is for external developers.

> **Important**: The product name is **DeepCitation** (not "DeepCite"). Always use "DeepCitation" when referring to the product, package, or API.

This guide follows a **3-step workflow**:

1. **Prepare Sources** — Upload documents, get `attachmentId` + `deepTextPromptPortion`
2. **Enhance Prompts & Call LLM** — Wrap prompts with citation instructions, call your LLM
3. **Display Results** — Parse citations, verify against sources, render with status indicators

---

## Install

```bash
npm install deepcitation@latest
```

---

## Golden Rules

These rules apply to **every step**. Violating any of them is a bug.

> **1. Import, never define** — All types come from `deepcitation`. Never create your own `Citation`, `Verification`, `CitationRecord`, `VerificationRecord`, or any other type.
>
> ```typescript
> // CORRECT
> import type { Citation, Verification, CitationRecord, VerificationRecord } from "deepcitation";
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
> **5. Never fabricate URLs** — Only use URLs listed in [Appendix D: URLs & File Formats](#appendix-d-urls--file-formats).

**Common mistakes at a glance:**

| Wrong | Correct |
|-------|---------|
| `interface Citation { ... }` | `import type { Citation } from "deepcitation"` |
| `type Verification = { status: string }` | `import type { Verification } from "deepcitation"` |
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
} from "deepcitation";
import type { CitationRecord, VerificationRecord } from "deepcitation";
import OpenAI from "openai";
import { readFileSync } from "fs";

async function analyzeDocument(filePath: string, question: string) {
  const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  // Step 1: Prepare source
  const document = readFileSync(filePath);
  const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareAttachments([
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
import { parseCitation } from "deepcitation";
import type { Citation, Verification } from "deepcitation";
import {
  CitationComponent,
  CitationDrawer,
  CitationDrawerTrigger,
  generateCitationKey,
  groupCitationsBySource,
  type CitationDrawerItem,
} from "deepcitation/react";

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

### 1.1 Set Up the Client

```bash
# .env
DEEPCITATION_API_KEY=sk-dc-your-key-here
```

Get your API key at [deepcitation.com/signup](https://deepcitation.com/signup). Keys start with `sk-dc-`.

```typescript
import { DeepCitation } from "deepcitation";

const deepcitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY!,
});
```

### 1.2 Upload Files

```typescript
import { readFileSync } from "fs";

const document = readFileSync("./document.pdf");
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareAttachments([
  { file: document, filename: "document.pdf" },
]);

const attachmentId = fileDataParts[0].attachmentId;
```

### 1.3 Prepare URLs

```typescript
const { attachmentId, deepTextPromptPortion, metadata } = await deepcitation.prepareUrl({
  url: "https://example.com/article",
});
```

> **Security**: If accepting user-provided URLs, validate them to prevent SSRF attacks — block internal IPs, private hostnames, and cloud metadata endpoints. Validate URL scheme is `http` or `https` only.

### 1.4 Multiple Documents

```typescript
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareAttachments([
  { file: doc1, filename: "report.pdf" },
  { file: doc2, filename: "chart.png" },
]);

// All documents are combined in deepTextPromptPortion
// Each document gets its own attachmentId in fileDataParts
```

### Supported File Formats

| Type | Formats | Processing Time |
|------|---------|-----------------|
| **Images** | JPG, PNG, TIFF, WebP, HEIC | <1 second |
| **Documents** | PDF (text & scanned) | <1 second |
| **Office** | DOCX, XLSX, PPTX | ~30 seconds |
| **Web** | HTML, public URLs | ~30 seconds |

---

## Step 2: Enhance Prompts & Call LLM

### 2.1 Wrap Prompts

```typescript
import { wrapCitationPrompt } from "deepcitation";

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a helpful assistant...",
  userPrompt: "Summarize this document",
  deepTextPromptPortion, // from Step 1
});
```

### 2.2 Call Your LLM

```typescript
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await openai.chat.completions.create({
  model: "gpt-5-mini",
  messages: [
    { role: "system", content: enhancedSystemPrompt },
    { role: "user", content: enhancedUserPrompt },
  ],
});

const llmOutput = response.choices[0].message.content;
```

> For Anthropic Claude and Google Gemini examples, see [Appendix B](#appendix-b-other-llm-providers).

### 2.3 Streaming Note

If streaming the LLM response, the `<<<CITATION_DATA>>>` block arrives at the **end** of the response. Buffer the complete response before parsing citations. See [`examples/nextjs-ai-sdk/`](./examples/nextjs-ai-sdk) and [`examples/agui-chat/`](./examples/agui-chat) for complete streaming implementations.

---

## Step 3: Parse, Verify & Display

### 3.1 Parse & Verify

```typescript
import {
  getAllCitationsFromLlmOutput,
  extractVisibleText,
  getCitationStatus,
} from "deepcitation";
import type { CitationRecord, VerificationRecord } from "deepcitation";

// Parse citations — returns CitationRecord (OBJECT, NOT array!)
const citations: CitationRecord = getAllCitationsFromLlmOutput(llmOutput);
const visibleText: string = extractVisibleText(llmOutput);

if (Object.keys(citations).length === 0) {
  // LLM didn't include citations — display response as-is
  return { response: visibleText, verifications: {} };
}

// Verify against source document
const result = await deepcitation.verifyAttachment(attachmentId, citations, {
  outputImageFormat: "avif",
  generateProofUrls: true,
  proofConfig: { access: "signed", signedUrlExpiry: "7d", imageFormat: "png" },
});
const verifications: VerificationRecord = result.verifications;

// Check status with getCitationStatus() — never check status strings directly
for (const [key, verification] of Object.entries(verifications)) {
  const status = getCitationStatus(verification);
  if (status.isVerified) console.log(`Citation ${key}: Verified`);
  if (status.isMiss) console.log(`Citation ${key}: Not found`);
}
```

### 3.2 React: CitationComponent + CitationDrawer

See the [Quick Start React example](#react-client-side) above for the recommended pattern. This combines:

- **Inline citations**: Split `visibleText` on `<cite>` tags, render `CitationComponent` for each
- **Citation drawer**: Group items with `groupCitationsBySource()`, render `CitationDrawerTrigger` + `CitationDrawer`

For a complete Next.js implementation, see [`examples/nextjs-ai-sdk/`](./examples/nextjs-ai-sdk).

### 3.3 Other Display Options

| Display Path | Function / Import | Use Case |
|-------------|-------------------|----------|
| **Text with indicators** | `replaceCitations(visibleText, verifications)` | Non-React apps, plain text |
| **Rich Markdown** | `renderCitationsAsMarkdown(llmOutput, verifications)` | Markdown renderers |
| **Slack** | `import { renderCitationsForSlack } from "deepcitation/slack"` | Slack bot output |
| **GitHub** | `import { renderCitationsForGitHub } from "deepcitation/github"` | GitHub comments/PRs |
| **HTML** | `import { renderCitationsAsHtml } from "deepcitation/html"` | Emails, embeds |
| **Terminal** | `import { renderCitationsForTerminal } from "deepcitation/terminal"` | CLI tools |

All renderers accept `(llmOutput, verifications, options?)` and return formatted strings.

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

| Status Value | Indicator | `isVerified` | `isPartialMatch` | `isMiss` | `isPending` |
|--------------|-----------|--------------|------------------|----------|-------------|
| `"found"` | Green | true | false | false | false |
| `"found_phrase_missed_anchor_text"` | Green | true | false | false | false |
| `"found_anchor_text_only"` | Amber | true | true | false | false |
| `"found_on_other_page"` | Amber | true | true | false | false |
| `"found_on_other_line"` | Amber | true | true | false | false |
| `"partial_text_found"` | Amber | true | true | false | false |
| `"first_word_found"` | Amber | true | true | false | false |
| `"not_found"` | Red | false | false | true | false |
| `"pending"` / `null` | Spinner | false | false | false | true |

---

## Appendix B: Other LLM Providers

### Anthropic Claude

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const response = await anthropic.messages.create({
  model: "claude-3-5-haiku-20241022",
  max_tokens: 4096,
  system: enhancedSystemPrompt,
  messages: [{ role: "user", content: enhancedUserPrompt }],
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

## Appendix C: Troubleshooting

### No citations in LLM output

- Verify `deepTextPromptPortion` is passed to `wrapCitationPrompt()`
- Try a different LLM model (some follow citation instructions better)
- Use `CITATION_REMINDER` for reinforcement in multi-turn conversations

### API key errors

- Verify `DEEPCITATION_API_KEY` is set in `.env` (keys start with `sk-dc-`)
- Get a new key at [deepcitation.com/dashboard](https://deepcitation.com/dashboard)
- Never hardcode API keys in source code

### Verification returns "not found"

- Ensure `attachmentId` matches the uploaded document (not re-uploaded)
- LLMs can hallucinate content not in the document — "not found" may be correct
- Partial matches indicate content was found but at a different location

### `<<<CITATION_DATA>>>` visible to users

Always use `extractVisibleText(llmOutput)` before displaying to users. Never show raw `llmOutput` directly.

### Next.js API route patterns

See [`examples/nextjs-ai-sdk/`](./examples/nextjs-ai-sdk) for complete upload, chat, and verify route implementations. See [`examples/agui-chat/`](./examples/agui-chat) for a single-stream AG-UI SSE approach.

---

## Appendix D: URLs & File Formats

### Real URLs

**Website:**
- https://deepcitation.com — Homepage
- https://deepcitation.com/signup — Get API key (free)
- https://deepcitation.com/playground — Interactive playground
- https://deepcitation.com/dashboard — Manage API keys
- https://docs.deepcitation.com/ — Full documentation
- https://docs.deepcitation.com/api — API reference
- https://docs.deepcitation.com/components — React components guide

**API Endpoints:**
- https://api.deepcitation.com/prepareAttachments — Upload and process attachments
- https://api.deepcitation.com/verifyCitations — Verify citations against source

### Supported File Formats

| Type | Formats | Processing Time |
|------|---------|-----------------|
| **Images** | JPG, PNG, TIFF, WebP, HEIC | <1 second |
| **Documents** | PDF (text & scanned) | <1 second |
| **Office** | DOCX, XLSX, PPTX | ~30 seconds |
| **Web** | HTML, public URLs | ~30 seconds |

For file size limits and page limits, check the [full documentation](https://docs.deepcitation.com/).

> **Production note**: `attachmentId` values are valid for **24 hours**. Cache them to avoid re-uploading. Store API keys in environment variables. Implement error handling for API failures. See [`examples/`](./examples) for production-ready patterns.
