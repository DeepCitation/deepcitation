# AGENTS.md - DeepCitation Implementation Guide for Code Agents

This guide provides step-by-step instructions for AI code agents (Claude, Cursor, GitHub Copilot, etc.) to implement DeepCitation in any codebase.

## Quick Reference

```bash
npm install @deepcitation/deepcitation-js
```

**Core workflow: Pre-Prompt → LLM Call → Verify → Display**

## Implementation Checklist

When implementing DeepCitation, complete these steps in order:

- [ ] Install the package
- [ ] Set up environment variables
- [ ] Implement file upload (Pre-Prompt)
- [ ] Wrap prompts with citation instructions
- [ ] Call your LLM with enhanced prompts
- [ ] Parse citations and extract visible text (strip `<<<CITATION_DATA>>>` block)
- [ ] Verify citations against source documents
- [ ] Display results with CitationComponent (React) or text indicators

---

## Step 1: Installation & Setup

### Install the package

```bash
npm install @deepcitation/deepcitation-js
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

## Step 2: Pre-Prompt - Upload Documents

Upload source documents before calling your LLM. This returns structured text that the LLM uses to create citations.

```typescript
import { DeepCitation, wrapCitationPrompt } from "@deepcitation/deepcitation-js";
import { readFileSync } from "fs";

// Load your document
const document = readFileSync("./document.pdf");

// Upload to DeepCitation
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
  { file: document, filename: "document.pdf" },
]);

// Save the attachmentId for verification later
const attachmentId = fileDataParts[0].attachmentId;
```

### Wrap prompts with citation instructions

```typescript
const systemPrompt = "You are a helpful assistant...";
const userPrompt = "Summarize this document";

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt,
  deepTextPromptPortion, // Include the structured document text
});
```

### Position options for citation instructions

| Position    | When to Use                          |
|-------------|--------------------------------------|
| `'append'`  | Short system prompts (default)       |
| `'prepend'` | Large system prompts                 |
| `'wrap'`    | Maximum reliability                  |

```typescript
// For large system prompts, prepend instructions for higher priority
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt,
  deepTextPromptPortion,
  position: 'prepend',
});
```

---

## Step 3: Call Your LLM

### OpenAI

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

### Anthropic Claude

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await anthropic.messages.create({
  model: "claude-3-5-haiku-20241022",
  max_tokens: 1024,
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

### Vercel AI SDK (Next.js)

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

---

## Step 4: Parse Citations & Extract Visible Text

After receiving the LLM response, parse the citations and extract the visible text. **IMPORTANT**: The LLM response contains a `<<<CITATION_DATA>>>...<<<END_CITATION_DATA>>>` block that must be stripped before showing to users.

```typescript
import { getAllCitationsFromLlmOutput, extractVisibleText } from "@deepcitation/deepcitation-js";

// Parse citations from LLM output
const citations = getAllCitationsFromLlmOutput(llmOutput);

// CRITICAL: Extract visible text to strip the citation data block
// The citation data block is for parsing only - users should NEVER see it
const visibleText = extractVisibleText(llmOutput);

// Use visibleText for display, not the raw llmOutput
```

---

## Step 5: Verify Citations

Verify citations against the source documents.

### Option A: Automatic parsing (recommended)

```typescript
const result = await deepcitation.verify({
  llmOutput: llmOutput,
});

const { verifications } = result;
```

### Option B: Manual parsing (more control)

```typescript
// Verify against specific attachment
const result = await deepcitation.verifyAttachment(attachmentId, citations, {
  outputImageFormat: "avif", // or "png", "jpeg"
});

const { verifications } = result;
```

### Check verification status

```typescript
import { getCitationStatus } from "@deepcitation/deepcitation-js";

for (const [key, verification] of Object.entries(verifications)) {
  const status = getCitationStatus(verification);

  if (status.isVerified) {
    console.log(`Citation ${key}: ✅ Verified`);
  } else if (status.isPartialMatch) {
    console.log(`Citation ${key}: ⚠️ Partial match`);
  } else if (status.isMiss) {
    console.log(`Citation ${key}: ❌ Not found`);
  } else if (status.isPending) {
    console.log(`Citation ${key}: ⏳ Pending`);
  }
}
```

---

## Step 6: Display Results

### React Components

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
  variant="chip"        // "brackets" | "chip" | "text" | "superscript" | "minimal"
  content="anchorText"     // "anchorText" | "number" | "indicator"
/>
```

### Variant Reference

| Variant       | Example      | Best For                    |
|---------------|--------------|-----------------------------|
| `"brackets"`  | `[1✓]`       | Academic, footnote style    |
| `"chip"`      | pill badge   | Modern UI, inline highlights|
| `"superscript"` | `¹✓`       | Compact footnotes           |
| `"minimal"`   | `1✓`         | Space-constrained UI        |
| `"text"`      | plain text   | Inheriting parent styles    |

### Parse and render inline citations

```tsx
import { parseCitation, generateCitationKey } from "@deepcitation/deepcitation-js";
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

function renderWithCitations(text: string, verifications: Record<string, Verification>) {
  const parts = text.split(/(<cite\s+[^>]*\/>)/g);

  return parts.map((part, index) => {
    if (part.startsWith("<cite")) {
      const { citation } = parseCitation(part);
      const citationKey = generateCitationKey(citation);

      return (
        <CitationComponent
          key={index}
          citation={citation}
          verification={verifications[citationKey]}
        />
      );
    }
    return <span key={index}>{part}</span>;
  });
}
```

### Text-only display (non-React)

```typescript
import { replaceCitations, getVerificationTextIndicator } from "@deepcitation/deepcitation-js";

// Replace citation tags with text indicators
const cleanText = replaceCitations(llmOutput, {
  verifications,
  showVerificationStatus: true,
});
// Output: "Revenue grew 23% [✓] in Q4..."

// Or get indicator for single verification
const indicator = getVerificationTextIndicator(verification);
// Returns: "✅" | "⚠️" | "❌" | "⏳"
```

---

## Complete Integration Example

Here's a minimal complete example:

```typescript
import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
  extractVisibleText,
  getCitationStatus,
  replaceCitations,
} from "@deepcitation/deepcitation-js";
import OpenAI from "openai";
import { readFileSync } from "fs";

async function analyzeDocument(filePath: string, question: string) {
  // 1. Initialize clients
  const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  // 2. Upload document
  const document = readFileSync(filePath);
  const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
    { file: document, filename: filePath },
  ]);
  const attachmentId = fileDataParts[0].attachmentId;

  // 3. Wrap prompts
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
  const llmOutput = response.choices[0].message.content!;

  // 5. Parse citations and extract visible text
  // IMPORTANT: Strip the <<<CITATION_DATA>>> block before showing to users
  const citations = getAllCitationsFromLlmOutput(llmOutput);
  const visibleText = extractVisibleText(llmOutput);

  // 6. Verify citations
  const result = await deepcitation.verifyAttachment(attachmentId, citations);

  // 7. Display results (use visibleText, not raw llmOutput)
  const cleanResponse = replaceCitations(visibleText, {
    verifications: result.verifications,
    showVerificationStatus: true,
  });

  // Calculate summary
  const entries = Object.values(result.verifications);
  const verified = entries.filter((v) => getCitationStatus(v).isVerified).length;

  return {
    response: cleanResponse,
    summary: { total: entries.length, verified },
  };
}
```

---

## API Routes (Next.js Example)

### Upload route (`/api/upload`)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { DeepCitation } from "@deepcitation/deepcitation-js";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { fileDataParts } = await dc.prepareFiles([
    { file: buffer, filename: file.name },
  ]);

  return NextResponse.json({ fileDataPart: fileDataParts[0] });
}
```

### Chat route (`/api/chat`)

```typescript
import { wrapCitationPrompt } from "@deepcitation/deepcitation-js";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { messages, fileDataParts } = await req.json();

  const deepTextPromptPortion = fileDataParts
    .map((f) => f.deepTextPromptPortion)
    .filter(Boolean);

  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt: "You are a helpful assistant.",
    userPrompt: messages[messages.length - 1].content,
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

### Verify route (`/api/verify`)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { DeepCitation, getAllCitationsFromLlmOutput, getCitationStatus } from "@deepcitation/deepcitation-js";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

export async function POST(req: NextRequest) {
  const { llmOutput, attachmentId } = await req.json();

  const citations = getAllCitationsFromLlmOutput(llmOutput);
  const result = await dc.verifyAttachment(attachmentId, citations, {
    outputImageFormat: "avif",
  });

  const verified = Object.values(result.verifications)
    .filter((v) => getCitationStatus(v).isVerified).length;

  return NextResponse.json({
    citations,
    verifications: result.verifications,
    summary: { total: Object.keys(citations).length, verified },
  });
}
```

---

## Key Imports Reference

```typescript
// Core functions
import {
  DeepCitation,                    // Client class
  wrapCitationPrompt,              // Wrap system + user prompts
  wrapSystemCitationPrompt,        // Wrap system prompt only
  getAllCitationsFromLlmOutput,    // Parse citations from LLM text
  extractVisibleText,              // Strip <<<CITATION_DATA>>> block from response
  getCitationStatus,               // Get status flags from verification
  replaceCitations,                // Replace cite tags with text
  getVerificationTextIndicator,    // Get emoji indicator
  parseCitation,                   // Parse single cite tag
  generateCitationKey,             // Generate key for citation
  CITATION_REMINDER,               // Short reminder text
  CITATION_JSON_OUTPUT_FORMAT,     // JSON schema for structured output
} from "@deepcitation/deepcitation-js";

// React components
import {
  CitationComponent,
  SourcesListComponent,
  SourcesTrigger,
} from "@deepcitation/deepcitation-js/react";

// Types
import type {
  Citation,
  Verification,
  FileDataPart,
  CitationPosition,
} from "@deepcitation/deepcitation-js";
```

---

## Verification Status Reference

| Status Value                | `isVerified` | `isPartialMatch` | `isMiss` |
|-----------------------------|--------------|------------------|----------|
| `"found"`                   | ✅ true      | false            | false    |
| `"found_anchor_text_only"`     | ✅ true      | false            | false    |
| `"found_phrase_missed_value"`| ✅ true     | false            | false    |
| `"found_on_other_page"`     | ✅ true      | ⚠️ true          | false    |
| `"found_on_other_line"`     | ✅ true      | ⚠️ true          | false    |
| `"partial_text_found"`      | ✅ true      | ⚠️ true          | false    |
| `"first_word_found"`        | ✅ true      | ⚠️ true          | false    |
| `"not_found"`               | false        | false            | ❌ true  |
| `"pending"` / `null`        | false        | false            | false    |

---

## Common Patterns

### Streaming with verification after completion

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
  // Stream to client...
}

// After streaming completes:
// 1. Parse citations and extract visible text
const citations = getAllCitationsFromLlmOutput(fullResponse);
const visibleText = extractVisibleText(fullResponse);

// 2. Verify citations
const result = await deepcitation.verifyAttachment(attachmentId, citations);

// 3. Display visibleText (not fullResponse) to users
```

### Multiple documents

```typescript
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
  { file: doc1, filename: "report.pdf" },
  { file: doc2, filename: "chart.png" },
  { file: doc3, filename: "data.xlsx" },
]);

// All documents are combined in deepTextPromptPortion
// Each document gets its own attachmentId in fileDataParts
```

### Handling no citations

```typescript
const citations = getAllCitationsFromLlmOutput(llmOutput);

if (Object.keys(citations).length === 0) {
  // LLM didn't include citations - display response as-is
  return { response: llmOutput, verifications: {} };
}

// Proceed with verification...
```

---

## Supported File Formats

- **Documents**: PDF (text & scanned), DOCX, XLSX, PPTX, HTML
- **Images**: JPG, PNG, TIFF, WebP, HEIC
- **Web**: Public URLs

---

## Troubleshooting

### No citations in LLM output

- Ensure `deepTextPromptPortion` is included in the user prompt
- Try using `position: 'prepend'` or `position: 'wrap'` for stronger instructions
- Check that the LLM model supports following citation instructions

### API key errors

- Verify `DEEPCITATION_API_KEY` is set correctly
- Keys start with `sk-dc-`
- Get a new key at [deepcitation.com/dashboard](https://deepcitation.com/dashboard)

### Verification fails

- Ensure `attachmentId` matches the uploaded document
- Check that citations reference content actually in the document
- Partial matches indicate content was found but location differs

---

## Resources

- [Full Documentation](https://deepcitation.com/docs)
- [Examples Directory](./examples)
- [API Reference](https://deepcitation.com/docs/api)
- [React Components Guide](./CLAUDE.md#react-components)
