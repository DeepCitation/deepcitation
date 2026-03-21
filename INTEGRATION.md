# Integration Guide

> **Note**: This guide was streamlined in v0.1. For complete working examples,
> see the [`examples/`](./examples) directory.

> For contributors: see [AGENTS.md](./AGENTS.md). This guide is for external developers.

> **Important**: The product name is **DeepCitation** (not "DeepCite"). Always use "DeepCitation" when referring to the product, package, or API.

### Breaking Changes (v0.3)

- **`parseCitationResponse().format`** now returns `"numeric" | "none"` (previously `"deferred" | "xml" | "none"`). Update any code that checks for `"deferred"` or `"xml"` — use `"numeric"` instead.
- **`deferredCitationToCitation()`** renamed to **`citationDataToCitation()`**.

---

This guide follows a **3-section workflow**:

1. **[Install & Setup](#section-1-install--setup)** — Install, import types, initialize client, prepare sources, configure proof images
2. **[Server Side](#section-2-server-side)** — Wrap prompts, call your LLM, verify citations, optionally persist results
3. **[Display with CitationComponent](#section-3-display-with-citationcomponent)** — Parse `[N]` markers, generate citation keys, render inline with verification status (streaming and post-stream)

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
> **3. Use our helpers** — Call `getCitationStatus(verification)` for status checks, `getAllCitationsFromLlmOutput()` for parsing, `replaceCitationMarkers()` for text display. Never write your own versions.
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

## Quick Reference: Common Use Cases

Pick your use case, copy the recipe.

### Recipe 1 — Strip citations, show clean text

**"I just want to display the LLM response without any citation noise"**

```typescript
import { stripCitations } from "deepcitation";

// Strips [N] markers and the <<<CITATION_DATA>>> block, returns clean text
const cleanText = stripCitations(llmResponse);
```

### Recipe 2 — Keep [N] numbers, add references section

**"I want [1], [2] markers in text and a references section at the bottom"**

```typescript
import { extractVisibleText, renderCitationsAsMarkdown } from "deepcitation";

// Numeric format: text already has [N] markers after stripping the data block
const text = extractVisibleText(llmResponse);

// Render [N] markers as bracket-style references with optional footnote section
const { markdown, references } = renderCitationsAsMarkdown(llmResponse, { variant: "brackets" });
```

### Recipe 3 — Render React `<CitationComponent>` inline

**"I want interactive citation chips/popovers inline in my React UI"**

Use `parseCitationResponse()` with a remark plugin so markdown formatting (bold, lists, headers) is never broken by citation markers:

```tsx
import { CitationComponent } from "deepcitation/react";
import { parseCitationResponse } from "deepcitation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CONTINUE, visit } from "unist-util-visit";

// Remark plugin — replaces [N] text with custom AST nodes
function remarkCitationMarkers() {
  return (tree: any) => {
    visit(tree, "text", (node: any, index: any, parent: any) => {
      if (index == null || !parent || !node.value) return;
      const parts = node.value.split(/(\[\d+\])/g);
      if (parts.length <= 1) return;
      const newNodes = parts.filter(Boolean).map((part: string) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (m) return { type: "citation-marker", data: { hName: "citation-marker", hProperties: { n: m[1] } } };
        return { type: "text", value: part };
      });
      parent.children.splice(index, 1, ...newNodes);
      return [CONTINUE, index + newNodes.length];
    });
  };
}

const result = parseCitationResponse(llmOutput);

<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkCitationMarkers]}
  components={{
    "citation-marker": ({ n }) => {
      const key = result.markerMap[Number(n)];
      const citation = key ? result.citations[key] : null;
      if (!key || !citation) return <sup>[{n}]</sup>;
      return <CitationComponent citation={citation} verification={verifications[key] ?? null} />;
    },
  }}
>
  {result.visibleText}
</ReactMarkdown>
```

See [Section 3.2](#32-post-stream-full-response) for the full post-stream pattern and [`examples/`](./examples) for complete working implementations.

### Recipe 4 — Customize colors, radius, and font

**"I want citations to match my brand"**

```css
/* CSS — override any --dc-* token */
:root {
  --dc-primary: #6366f1;
  --dc-verified: #059669;
  --dc-verified-bg: #ecfdf5;
  --dc-radius-lg: 0.75rem;
  --dc-font-family: Georgia, serif;
}
```

Or use the React component:

```tsx
import { DeepCitationTheme } from "deepcitation/react";

<DeepCitationTheme
  theme={{ primary: "#6366f1", verified: "#059669", radiusLg: "0.75rem" }}
  darkTheme={{ primary: "#818cf8", verified: "#34d399" }}
/>
```

See [Section 1.1c](#11c-customize-styles-optional) for the full token list and scoped theming.

### Recipe 5 — Verify and show status indicators

**"I want checkmarks/X marks next to citations after verification"**

```typescript
import { extractVisibleText, parseCitationData, replaceCitationMarkers } from "deepcitation";

const { visibleText, citationMap } = parseCitationData(llmResponse);
const display = replaceCitationMarkers(visibleText, {
  citationMap,
  verifications,
  showVerificationStatus: true,
});
// Result: "Revenue grew 45% [1☑️] in Q4 [2✅]."
```

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
import { useState, useMemo } from "react";
import { parseCitationResponse } from "deepcitation";
import type { Verification } from "deepcitation";
import {
  CitationComponent,
  CitationDrawer,
  CitationDrawerTrigger,
  groupCitationsBySource,
  type CitationDrawerItem,
} from "deepcitation/react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CONTINUE, visit } from "unist-util-visit";

// Remark plugin — replaces [N] in text nodes with custom AST nodes,
// keeping markdown formatting (bold, lists, etc.) intact.
const MARKER_RE = /(\[\d+\])/g;
function remarkCitationMarkers() {
  return (tree: any) => {
    visit(tree, "text", (node: any, index: any, parent: any) => {
      if (index == null || !parent || !node.value) return;
      const parts = node.value.split(MARKER_RE);
      if (parts.length <= 1) return;
      const newNodes = parts.filter(Boolean).map((part: string) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (m) return { type: "citation-marker", data: { hName: "citation-marker", hProperties: { n: m[1] } } };
        return { type: "text", value: part };
      });
      parent.children.splice(index, 1, ...newNodes);
      return [CONTINUE, index + newNodes.length];
    });
  };
}

function MessageWithCitations({
  llmOutput,
  verifications,
}: {
  llmOutput: string;
  verifications: Record<string, Verification>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const result = useMemo(() => parseCitationResponse(llmOutput), [llmOutput]);
  const citations = result.citations;

  // Build drawer items
  const drawerItems: CitationDrawerItem[] = Object.entries(citations).map(
    ([citationKey, citation]) => ({
      citationKey,
      citation,
      verification: verifications[citationKey] ?? null,
    }),
  );
  const citationGroups = groupCitationsBySource(drawerItems);

  // Render markdown with inline citation components
  const plugins = useMemo(() => [remarkGfm, remarkCitationMarkers], []);
  const components = useMemo(() => ({
    // @ts-expect-error — custom element injected by remarkCitationMarkers
    "citation-marker": ({ n }: { n: string }) => {
      const key = result.markerMap[Number(n)];
      const citation = key ? citations[key] : null;
      if (!key || !citation) return <sup>[{n}]</sup>;
      return <CitationComponent citation={citation} verification={verifications[key] ?? null} />;
    },
  }), [result.markerMap, citations, verifications]);

  return (
    <div>
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {result.visibleText}
      </ReactMarkdown>
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

> **Theming**: Citation components use `--dc-*` CSS custom properties for all colors, border radius, and font. Override them in CSS or use `<DeepCitationTheme>` from `deepcitation/react` for declarative theming. See [Section 1.1c](#11c-customize-styles-optional) and [Appendix E](#appendix-e-design-tokens).

---

## Section 1: Install & Setup

### 1.1 Install

```bash
npm install deepcitation@latest
```

React components are included in the same package — import from `deepcitation/react`. No separate install needed.

### 1.1b Import Styles

If you use React components from `deepcitation/react`, you must import the stylesheet.

**With Tailwind CSS v4** — add to your main CSS file (e.g. `globals.css`):

```css
@import "tailwindcss";
@import "deepcitation/tailwind.css";
```

**Without Tailwind** — import the pre-built stylesheet in your JS/TS entry point:

```typescript
import "deepcitation/styles.css";
```

### 1.1c Customize Styles (Optional)

All DeepCitation components use `--dc-*` CSS custom properties for colors, border radius, and font. Override any token to match your brand — no build tool required.

**CSS (global):**

```css
:root {
  --dc-primary: #6366f1;        /* accent: tabs, links, active states */
  --dc-verified: #059669;       /* success indicator */
  --dc-verified-bg: #ecfdf5;    /* success chip background */
  --dc-radius-lg: 0.75rem;      /* container corner radius */
  --dc-font-family: Georgia, serif;
}
.dark {
  --dc-primary: #818cf8;
  --dc-verified: #34d399;
  --dc-verified-bg: rgba(34, 197, 94, 0.1);
}
```

**React component (declarative):**

```tsx
import { DeepCitationTheme } from "deepcitation/react";

// Place once at the top of your app — injects a <style> block
<DeepCitationTheme
  theme={{
    primary: "#6366f1",
    verified: "#059669",
    verifiedBg: "#ecfdf5",
    radiusLg: "0.75rem",
    fontFamily: "Georgia, serif",
  }}
  darkTheme={{
    primary: "#818cf8",
    verified: "#34d399",
    verifiedBg: "rgba(34, 197, 94, 0.1)",
  }}
/>
```

**Scoped theming (per-instance):**

```tsx
<DeepCitationTheme scoped theme={{ primary: "#ec4899" }}>
  <CitationComponent citation={citation} verification={verification} />
</DeepCitationTheme>
```

When `scoped` is true, tokens are set on a wrapper `<div>` and only affect its children — useful for theming individual citations differently.

All `--dc-*` tokens are accepted as camelCase props on `DeepCitationTheme` (e.g., `mutedForeground`, `verifiedBg`, `radiusLg`, `fontFamily`). See [Appendix E](#appendix-e-design-tokens) for the full token reference.

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
- `getCitationKey(citation)` from `deepcitation` produces the same key that indexes `CitationRecord` and `VerificationRecord`

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

// Save attachmentId for verification
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

Every citation in the LLM output has a deterministic **citation key** — a 16-character hash of its content. This same key is used in both `CitationRecord` and `VerificationRecord`, making it the bridge between parsed citations and verification results.

```typescript
import { getCitationKey } from "deepcitation";

// Generate the key — same algorithm used internally, always deterministic
const key = getCitationKey(citation); // e.g. "a3f7b2c1d8e9f012"

// Look up the verification result using the key
const verification = verifications[key] ?? null;
```

`getCitationKey()` is the **canonical** key function. Import it from `deepcitation`. Never compute keys manually.

### 3.2 Post-Stream (Full Response)

Use when you have the complete LLM response — either non-streaming or after buffering a stream.

Render the entire text through a single `ReactMarkdown` pass with a remark plugin that replaces `[N]` markers inline. This keeps markdown formatting (bold, lists, headers) intact — the old approach of splitting text on markers broke any formatting that spanned across a citation.

```tsx
import { CitationComponent } from "deepcitation/react";
import { parseCitationResponse } from "deepcitation";
import type { VerificationRecord } from "deepcitation";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CONTINUE, visit } from "unist-util-visit";

// See Recipe 3 above for the remarkCitationMarkers plugin implementation.

function MessageWithCitations({
  llmOutput,
  verifications,
}: {
  llmOutput: string;     // full LLM output with <<<CITATION_DATA>>> block
  verifications: VerificationRecord;
}) {
  const result = parseCitationResponse(llmOutput);
  // result.format is "numeric" | "none"

  const components: Components = {
    // @ts-expect-error — custom element injected by remarkCitationMarkers
    "citation-marker": ({ n }: { n: string }) => {
      const key = result.markerMap[Number(n)];
      const citation = key ? result.citations[key] : null;
      if (!key || !citation) return <sup>[{n}]</sup>;
      return <CitationComponent citation={citation} verification={verifications[key] ?? null} />;
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkCitationMarkers]} components={components}>
      {result.visibleText}
    </ReactMarkdown>
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
| **Numeric markers with indicators** | `replaceCitationMarkers(text, { verifications, showVerificationStatus: true })` | Non-React apps, `[N]` marker format |
| **Rich Markdown** | `renderCitationsAsMarkdown(llmOutput, verifications)` | Markdown renderers |
| **Slack** | `import { renderCitationsForSlack } from "deepcitation/slack"` | Slack bot output |
| **GitHub** | `import { renderCitationsForGitHub } from "deepcitation/github"` | GitHub comments/PRs |
| **HTML** | `import { renderCitationsAsHtml } from "deepcitation/html"` | Emails, embeds |
| **Terminal** | `import { renderCitationsForTerminal } from "deepcitation/terminal"` | CLI tools |

All renderers accept `(llmOutput, verifications, options?)` and return formatted strings.

#### Numeric markers with verification (OpenAI example)

```typescript
import { extractVisibleText, getAllCitationsFromLlmOutput, replaceCitationMarkers } from "deepcitation";

// After streaming the LLM response:
const citations = getAllCitationsFromLlmOutput(llmResponse);
const visibleText = extractVisibleText(llmResponse);
const { verifications } = await deepcitation.verifyAttachment(attachmentId, citations);

// Display with verification indicators: [1☑️] [2❌] [3✅]
const display = replaceCitationMarkers(visibleText, {
  verifications,
  showVerificationStatus: true,
});
```

See [`examples/basic-verification/`](./examples/basic-verification) for a complete working example with OpenAI, Anthropic, and Google providers.

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
- Get a new key at [deepcitation.com/keys](https://deepcitation.com/keys)
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
- https://deepcitation.com/keys — Manage API keys
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

---

## Appendix E: Design Tokens

DeepCitation components are fully themeable via `--dc-*` CSS custom properties. Override any token in `:root` (light) and `.dark` (dark mode) to match your brand. All tokens are also available as camelCase props on the `<DeepCitationTheme>` React component (imported from `deepcitation/react`).

### Surface & Text

| Token | Light | Dark | `<DeepCitationTheme>` prop |
|-------|-------|------|---------------------------|
| `--dc-background` | `#ffffff` | `#27272a` | `background` |
| `--dc-muted` | `#f4f4f5` | `#3f3f46` | `muted` |
| `--dc-foreground` | `#18181b` | `#fafafa` | `foreground` |
| `--dc-muted-foreground` | `#71717a` | `#a1a1aa` | `mutedForeground` |
| `--dc-subtle-foreground` | `#a1a1aa` | `#71717a` | `subtleForeground` |
| `--dc-border` | `#e4e4e7` | `#3f3f46` | `border` |
| `--dc-ring` | `#3b82f6` | `#3b82f6` | `ring` |

### Primary Accent

| Token | Light | Dark | `<DeepCitationTheme>` prop |
|-------|-------|------|---------------------------|
| `--dc-primary` | `#3b82f6` | `#60a5fa` | `primary` |
| `--dc-primary-foreground` | `#ffffff` | `#ffffff` | `primaryForeground` |

### Status Indicator Colors

| Token | Light | Dark | `<DeepCitationTheme>` prop |
|-------|-------|------|---------------------------|
| `--dc-verified` | `#10b981` | `#34d399` | `verified` |
| `--dc-partial` | `#f59e0b` | `#fbbf24` | `partial` |
| `--dc-destructive` | `#ef4444` | `#f87171` | `destructive` |
| `--dc-pending` | `#a1a1aa` | `#71717a` | `pending` |

### Status Tint Backgrounds

Each status has background, border, and hover tokens for full chip/banner control:

| Token | Light | Dark | `<DeepCitationTheme>` prop |
|-------|-------|------|---------------------------|
| `--dc-verified-bg` | `#f0fdf4` | `rgba(34,197,94,0.1)` | `verifiedBg` |
| `--dc-verified-border` | `#86efac` | `#166534` | `verifiedBorder` |
| `--dc-verified-hover` | `#15803d` | `#bbf7d0` | `verifiedHover` |
| `--dc-partial-bg` | `#fffbeb` | `rgba(245,158,11,0.1)` | `partialBg` |
| `--dc-partial-border` | `#fcd34d` | `#92400e` | `partialBorder` |
| `--dc-partial-hover` | `#b45309` | `#fde68a` | `partialHover` |
| `--dc-destructive-bg` | `#fef2f2` | `rgba(239,68,68,0.1)` | `destructiveBg` |
| `--dc-destructive-border` | `#fca5a5` | `#991b1b` | `destructiveBorder` |
| `--dc-destructive-hover` | `#b91c1c` | `#fecaca` | `destructiveHover` |
| `--dc-pending-bg` | `var(--dc-muted)` | `var(--dc-muted)` | `pendingBg` |
| `--dc-pending-border` | `var(--dc-border)` | `var(--dc-border)` | `pendingBorder` |
| `--dc-pending-hover` | `#71717a` | `#a1a1aa` | `pendingHover` |

### Border Radius

| Token | Default | `<DeepCitationTheme>` prop |
|-------|---------|---------------------------|
| `--dc-radius-sm` | `0.25rem` | `radiusSm` |
| `--dc-radius-md` | `0.375rem` | `radiusMd` |
| `--dc-radius-lg` | `0.5rem` | `radiusLg` |

### Font

| Token | Default | `<DeepCitationTheme>` prop |
|-------|---------|---------------------------|
| `--dc-font-family` | system font stack | `fontFamily` |

`--dc-popover-font` is a backward-compat alias that resolves to `var(--dc-font-family)`.

### Brand Examples

**Warm brand:**
```css
:root {
  --dc-primary: #d97706;
  --dc-verified: #059669;
  --dc-verified-bg: #ecfdf5;
  --dc-partial: #ea580c;
  --dc-partial-bg: #fff7ed;
  --dc-radius-lg: 0.75rem;
  --dc-font-family: Georgia, "Times New Roman", serif;
}
```

**Cool brand:**
```css
:root {
  --dc-primary: #6366f1;
  --dc-verified: #0891b2;
  --dc-verified-bg: #ecfeff;
  --dc-partial: #7c3aed;
  --dc-partial-bg: #f5f3ff;
  --dc-radius-lg: 1rem;
}
```

**Monochrome:**
```css
:root {
  --dc-primary: #525252;
  --dc-verified: #404040;
  --dc-verified-bg: #f5f5f5;
  --dc-partial: #737373;
  --dc-partial-bg: #fafafa;
  --dc-destructive: #525252;
  --dc-destructive-bg: #f5f5f5;
  --dc-radius-lg: 0;
}
```

For the full styling guide, see [`docs/styling.md`](./docs/styling.md). For contributor rules on token usage, see [`BRANDING.md`](./BRANDING.md).
