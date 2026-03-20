# Next.js AI SDK Example

A complete chat application built with Next.js, Vercel AI SDK, and DeepCitation. A sample paper is pre-loaded so you can try it immediately — or upload your own documents. Every AI citation is verified in real-time.

## Features

- **Bundled sample paper** (Attention Is All You Need) with sample questions for instant demo
- **Streaming responses** with Vercel AI SDK
- **Real-time citation verification** as responses complete
- **Visual proof panel** showing verification status for each citation
- **Document upload** with drag-and-drop support (replaces sample)
- **Rate limiting** for safe public deployment
- **Responsive chat UI** with Tailwind CSS

## Screenshot

```
+-----------------------------------------+----------------------+
| DeepCitation Chat                       | Citation Verification|
|                                         |                      |
| +-------------------------------------+| Verification Rate    |
| | AI: Revenue grew by 23% in 2024     || 85%                  |
| |     [1] [2]                         ||                      |
| |                                     || Citation [1]         |
| |     2/2 citations verified          ||   found - Page 3     |
| +-------------------------------------+|                      |
|                                         | Citation [2]         |
| [Attention Is All You Need.pdf Sample]  |   found - Page 5     |
| [Ask a question...]                     |                      |
+-----------------------------------------+----------------------+
```

## Quick Start

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# Run development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Required API Keys

1. **DeepCitation API Key** (free): [deepcitation.com/signup](https://deepcitation.com/signup)
2. **OpenAI API Key**: [platform.openai.com](https://platform.openai.com)

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts              # Streaming chat with AI SDK + rate limiting
│   │   ├── upload/route.ts            # Document upload endpoint
│   │   ├── verify/route.ts            # Citation verification + rate limiting
│   │   └── corpus/
│   │       ├── init/route.ts          # Pre-resolve bundled corpus attachment
│   │       └── [filename]/route.ts    # Serve/redirect to corpus PDF
│   ├── globals.css                    # Tailwind + citation styles
│   ├── layout.tsx                     # Root layout
│   └── page.tsx                       # Main chat page
├── components/
│   ├── ChatMessage.tsx                # Message bubble with citations
│   ├── FileUpload.tsx                 # Document upload button
│   └── VerificationPanel.tsx          # Side panel with verification details
└── lib/
    ├── corpus.ts                      # Sample source definition + questions
    ├── corpusAttachment.ts            # Server-side attachment resolution with caching
    └── rateLimit.ts                   # Per-IP daily rate limiting
```

## How It Works

### 1. Bundled Corpus

On page load, the client calls `GET /api/corpus/init` which resolves the sample PDF attachment server-side (with env-var caching for fast cold starts). The `fileDataPart` and `deepTextPromptPortion` are sent to the client so it can pass them through `useChat`'s body — same flow as a user-uploaded file.

### 2. Document Upload

When a user uploads a document, it replaces the sample. The file is sent to DeepCitation for processing:

```typescript
// src/app/api/upload/route.ts
const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([
  { file: buffer, filename: file.name },
]);
```

### 3. Streaming Response

The AI SDK streams the response in real-time:

```typescript
// src/app/api/chat/route.ts
const result = streamText({
  model: openai("gpt-5-mini"),
  system: enhancedSystemPrompt,
  messages: enhancedMessages,
});

return result.toTextStreamResponse();
```

### 4. Citation Verification

After streaming completes, citations are verified:

```typescript
// src/app/page.tsx
const res = await fetch("/api/verify", {
  method: "POST",
  body: JSON.stringify({ llmOutput: content, attachmentId }),
});
```

### 5. Visual Proof

The VerificationPanel shows detailed status for each citation:

- Verified (green) - Found at expected location
- Partial (yellow) - Found with discrepancies
- Missed (red) - Not found in document
- Pending (gray) - Still verifying

## Rate Limiting

The demo includes per-IP daily rate limiting (5 queries/user, 100 global). To disable for local development:

```env
RATE_LIMIT_DISABLED=true
```

## Customization

### Using Anthropic Instead of OpenAI

```typescript
// src/app/api/chat/route.ts
import { anthropic } from "@ai-sdk/anthropic";

const result = streamText({
  model: anthropic("claude-sonnet-4-20250514"),
  // ...
});
```

## API Routes

### GET /api/corpus/init

Pre-resolve the bundled sample PDF attachment.

### GET /api/corpus/[filename]

Redirects to the corpus PDF URL.

### POST /api/upload

Upload a document for processing.

### POST /api/chat

Stream a chat response (AI SDK format). Rate-limited.

### POST /api/verify

Verify citations in a response. Rate-limited.

## Next Steps

- See the [basic-verification example](../basic-verification) for a simpler integration
- Read the [full documentation](https://docs.deepcitation.com/) for advanced patterns
- Explore [React components](../../README.md#react-components) from the main package
