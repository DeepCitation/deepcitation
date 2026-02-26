# Integration Guide

> **Note**: This guide was streamlined in v0.1. For complete working examples,
> see the [`examples/`](./examples) directory.

> For contributors: see [AGENTS.md](./AGENTS.md). This guide is for external developers.

> **Important**: The product name is **DeepCitation** (not "DeepCite"). Always use "DeepCitation" when referring to the product, package, or API.

This guide follows a **3-section workflow**:

1. **[Install & Setup](#section-1-install--setup)** — Install, import types, initialize client, prepare sources, configure proof images
2. **[Server Side](#section-2-server-side)** — Wrap prompts, call your LLM, verify citations, optionally persist results
3. **[Display with CitationComponent](#section-3-display-with-citationcomponent)** — Parse `<cite>` tags, generate citation keys, render inline with verification status (streaming and post-stream)

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
  const attachmentId = fileDataParts[0].attachmentId; // 20-char alphanumeric ID

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
    generateProofUrls: true,
    proofConfig: { access: "signed", signedUrlExpiry: "7d", imageFormat: "avif" },
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

## Section 1: Install & Setup

### 1.1 Install

```bash
npm install deepcitation@latest
```

React components are included in the same package — import from `deepcitation/react`. No separate install needed.

### 1.2 Import Types

Always import types from `deepcitation`. Never define your own.

```typescript
import type {
  Citation,
  Verification,
  CitationRecord,     // Record<string, Citation> — NOT an array
  VerificationRecord, // Record<string, Verification>
} from "deepcitation";
```

**Key type facts:**

- `CitationRecord = Record<string, Citation>` — keyed by citation key (16-char hash), not an array
- Check emptiness with `Object.keys(citations).length === 0`, never `.length`
- `generateCitationKey(citation)` from `deepcitation/react` produces the same key that indexes `CitationRecord` and `VerificationRecord`

### 1.3 Initialize Client

```typescript
// .env
// DEEPCITATION_API_KEY=sk-dc-your-key-here

import { DeepCitation } from "deepcitation";

const deepcitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY!,
});
```

Get your API key at [deepcitation.com/signup](https://deepcitation.com/signup). Keys start with `sk-dc-`.

### 1.4 Prepare Sources

Upload documents to get an `attachmentId` (a **20-character alphanumeric ID**) and `deepTextPromptPortion` (structured text content used to enhance LLM prompts). Save `attachmentId` — you'll need it for verification.

**Files:**

```typescript
import { readFileSync } from "fs";

const document = readFileSync("./document.pdf");
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareAttachments([
  { file: document, filename: "document.pdf" },
  { file: imageBuffer, filename: "chart.png" }, // multiple files supported
]);

// Save attachmentId for verification (valid for 24 hours)
const attachmentId = fileDataParts[0].attachmentId; // e.g. "a1b2c3d4e5f6g7h8i9j0"
```

**URLs:**

```typescript
const { attachmentId, deepTextPromptPortion, metadata } = await deepcitation.prepareUrl({
  url: "https://example.com/article",
});
```

> **Security**: If accepting user-provided URLs, validate them to prevent SSRF attacks — block internal IPs, private hostnames, and cloud metadata endpoints. Only allow `http` or `https` schemes.

**Supported formats:**

| Type | Formats | Processing Time |
|------|---------|-----------------|
| **Images** | JPG, PNG, TIFF, WebP, HEIC | <1 second |
| **Documents** | PDF (text & scanned) | <1 second |
| **Office** | DOCX, XLSX, PPTX | ~30 seconds |
| **Web** | HTML, public URLs | ~30 seconds |

### 1.5 Proof Image Options (Optional)

By default, proof images are returned as base64 strings in `verification.document.verificationImageSrc` — self-contained, no external CDN required.

For production, configure URL-based delivery:

```typescript
const result = await deepcitation.verifyAttachment(attachmentId, citations, {
  generateProofUrls: true,
  proofConfig: {
    access: "signed",      // "signed" | "workspace" | "public"
    signedUrlExpiry: "7d", // Only for access: "signed". Options: "1h" | "24h" | "7d" | "30d" | "90d" | "1y"
    imageFormat: "avif",   // "png" | "jpeg" | "avif" | "webp"
    includeBase64: false,  // Set true to also include base64 alongside URLs
  },
});
```

| Access Mode | Description |
|-------------|-------------|
| `"signed"` | Time-limited signed URLs (most secure) |
| `"workspace"` | URLs accessible to your workspace members |
| `"public"` | Publicly accessible URLs (no auth) |

---

## Section 2: Server Side

### 2.1 Wrap Prompts

```typescript
import { wrapCitationPrompt } from "deepcitation";

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a helpful assistant...",
  userPrompt: "Summarize this document",
  deepTextPromptPortion, // from Section 1 — prepareAttachments or prepareUrl
});
```

### 2.2 Call Your LLM

Send the enhanced prompts to any LLM as you normally would.

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

const llmOutput = response.choices[0].message.content!;
```

See [Appendix B](#appendix-b-other-llm-providers) for Anthropic Claude and Google Gemini.

### 2.3 Verify Citations

**Simple API** — pass `llmOutput` directly (recommended for most cases):

```typescript
import { extractVisibleText } from "deepcitation";

const visibleText = extractVisibleText(llmOutput); // Always strip before display

const result = await deepcitation.verify({
  llmOutput,
  fileDataParts, // required if Zero Data Retention is enabled
});
const verifications: VerificationRecord = result.verifications;
```

**Explicit API** — parse first, then verify (use when you need to inspect or filter citations):

```typescript
import { getAllCitationsFromLlmOutput, extractVisibleText } from "deepcitation";
import type { CitationRecord, VerificationRecord } from "deepcitation";

const citations: CitationRecord = getAllCitationsFromLlmOutput(llmOutput);
const visibleText = extractVisibleText(llmOutput);

if (Object.keys(citations).length === 0) {
  return { response: visibleText, verifications: {} };
}

const result = await deepcitation.verifyAttachment(attachmentId, citations, {
  generateProofUrls: true,
  proofConfig: { access: "signed", signedUrlExpiry: "7d", imageFormat: "avif" },
});
const verifications: VerificationRecord = result.verifications;
```

### 2.4 Persist Results (Optional)

Store `visibleText` and `verifications` in your database to serve clients without re-verifying:

```typescript
// Store after verification
await db.messages.insert({
  id: messageId,
  userId,
  text: visibleText,          // The <<<CITATION_DATA>>> block has been stripped
  citations: citations,        // CitationRecord for client-side rendering
  verifications: verifications, // VerificationRecord — status + proof per citation
  createdAt: new Date(),
});

// Retrieve and send to client — no re-verification needed
const message = await db.messages.findById(messageId);
return {
  text: message.text,
  citations: message.citations,
  verifications: message.verifications,
};
```

---

## Section 3: Display with CitationComponent

### 3.1 How CitationKey Works

Every `<cite>` tag in the LLM output has a deterministic **citation key** — a 16-character hash of its content. This same key is used in both `CitationRecord` and `VerificationRecord`, making it the bridge between parsed citations and verification results.

```typescript
import { parseCitation } from "deepcitation";
import { generateCitationKey } from "deepcitation/react";

// Parse a single <cite ... /> tag from the LLM output
const { citation } = parseCitation(citeTag);

// Generate the key — same algorithm used internally, always deterministic
const key = generateCitationKey(citation); // e.g. "a3f7b2c1d8e9f012"

// Look up the verification result using the key
const verification = verifications[key] ?? null;
```

`generateCitationKey()` is the **canonical** key function. Import it from `deepcitation/react`. Never compute keys manually.

### 3.2 Post-Stream (Full Response)

Use when you have the complete LLM response — either non-streaming or after buffering a stream.

```tsx
import { CitationComponent, generateCitationKey } from "deepcitation/react";
import { parseCitation } from "deepcitation";
import type { CitationRecord, VerificationRecord } from "deepcitation";

function MessageWithCitations({
  text,
  citations,
  verifications,
}: {
  text: string;          // visibleText — already stripped of <<<CITATION_DATA>>>
  citations: CitationRecord;
  verifications: VerificationRecord;
}) {
  // Split on <cite> self-closing tags and render each with its verification
  const parts = text.split(/(<cite\s+[^>]*\/>)/g);

  return (
    <p>
      {parts.map((part, i) => {
        if (part.startsWith("<cite")) {
          const { citation } = parseCitation(part);
          const key = generateCitationKey(citation);
          return (
            <CitationComponent
              key={i}
              citation={citations[key] ?? citation}   // fall back to parsed citation
              verification={verifications[key] ?? null}
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}
```

### 3.3 During Streaming

The `<<<CITATION_DATA>>>` block arrives at the **end** of the stream. Buffer the complete response before parsing citations, but you can show incrementally-visible text while streaming.

```tsx
import { extractVisibleText, getAllCitationsFromLlmOutput } from "deepcitation";

// Stream the LLM response
let fullResponse = "";

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content ?? "";
  fullResponse += delta;

  // Show visible text as it arrives — extractVisibleText safely handles partial responses
  // (strips the <<<CITATION_DATA>>> block if/when it appears)
  setDisplayText(extractVisibleText(fullResponse));
}

// Stream complete — now parse all citations and verify
const citations = getAllCitationsFromLlmOutput(fullResponse);
const visibleText = extractVisibleText(fullResponse);

if (Object.keys(citations).length > 0) {
  const result = await deepcitation.verifyAttachment(attachmentId, citations, {
    generateProofUrls: true,
    proofConfig: { access: "signed", signedUrlExpiry: "7d", imageFormat: "avif" },
  });
  // Re-render using the pattern from Section 3.2
  setVerifications(result.verifications);
  setCitations(citations);
}
setDisplayText(visibleText);
```

See [`examples/nextjs-ai-sdk/`](./examples/nextjs-ai-sdk) and [`examples/agui-chat/`](./examples/agui-chat) for complete streaming implementations.

### 3.4 Other Display Options

| Display Path | Function / Import | Use Case |
|-------------|-------------------|----------|
| **Text with indicators** | `replaceCitations(visibleText, { verifications })` | Non-React apps, plain text |
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
