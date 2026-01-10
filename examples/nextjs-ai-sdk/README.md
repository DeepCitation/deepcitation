# Next.js AI SDK Example

A complete chat application built with Next.js, Vercel AI SDK, and DeepCitation. Upload documents, ask questions, and see every AI citation verified in real-time.

## Features

- **Streaming responses** with Vercel AI SDK
- **Real-time citation verification** as responses complete
- **Visual proof panel** showing verification status for each citation
- **Document upload** with drag-and-drop support
- **Responsive chat UI** with Tailwind CSS

## Screenshot

```
┌─────────────────────────────────────┬──────────────────────┐
│ DeepCitation Chat                   │ Citation Verification│
│                                     │                      │
│ ┌─────────────────────────────────┐ │ Verification Rate    │
│ │ AI: Revenue grew by 23% in 2024 │ │ ████████████░░ 85%   │
│ │     [1]✓ [2]✓                   │ │                      │
│ │                                 │ │ ✓ Citation [1]       │
│ │     ✓ 2/2 citations verified    │ │   found • Page 3     │
│ └─────────────────────────────────┘ │                      │
│                                     │ ✓ Citation [2]       │
│ [📎 report.pdf] [Ask a question...] │   found • Page 5     │
└─────────────────────────────────────┴──────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# Run development server
npm run dev
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
│   │   ├── chat/route.ts      # Streaming chat with AI SDK
│   │   ├── upload/route.ts    # Document upload endpoint
│   │   └── verify/route.ts    # Citation verification endpoint
│   ├── globals.css            # Tailwind + citation styles
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Main chat page
├── components/
│   ├── ChatMessage.tsx        # Message bubble with citations
│   ├── CitationBadge.tsx      # Citation status indicator
│   ├── FileUpload.tsx         # Document upload button
│   └── VerificationPanel.tsx  # Side panel with verification details
└── lib/
    └── deepcitation.ts        # DeepCitation client wrapper
```

## How It Works

### 1. Document Upload

When a user uploads a document, it's sent to DeepCitation for processing:

```typescript
// src/app/api/upload/route.ts
const { fileId, deepTextPromptPortion } = await uploadDocument(
  sessionId,
  buffer,
  file.name
);
```

### 2. Enhanced Prompts

Before calling the LLM, prompts are enhanced with citation instructions:

```typescript
// src/lib/deepcitation.ts
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt: question,
  deepTextPromptPortion: deepTextPromptPortion, // Pass file content directly
});
```

### 3. Streaming Response

The AI SDK streams the response in real-time:

```typescript
// src/app/api/chat/route.ts
const result = streamText({
  model: openai("gpt-4o"),
  system: enhancedSystemPrompt,
  messages: enhancedMessages,
});

return result.toDataStreamResponse();
```

### 4. Citation Verification

After streaming completes, citations are verified:

```typescript
// src/app/page.tsx
const res = await fetch("/api/verify", {
  method: "POST",
  body: JSON.stringify({ sessionId, content: message.content }),
});
const data = await res.json();
// data.summary = { total: 3, verified: 3, missed: 0, pending: 0 }
```

### 5. Visual Proof

The VerificationPanel shows detailed status for each citation:

- ✓ Verified (green) - Found at expected location
- ◐ Partial (yellow) - Found with discrepancies
- ✗ Missed (red) - Not found in document
- ○ Pending (gray) - Still verifying

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

### Custom Citation Styling

Edit `src/app/globals.css`:

```css
.citation-verified {
  @apply bg-green-100 text-green-800;
}
```

### Persistent Storage

Replace the in-memory store in `src/lib/deepcitation.ts` with Redis or a database:

```typescript
// Example with Redis
import { Redis } from "@upstash/redis";

const redis = new Redis({ url: "...", token: "..." });

export async function uploadDocument(sessionId: string, ...) {
  // Store in Redis instead of Map
  await redis.set(`files:${sessionId}`, JSON.stringify(fileDataParts));
}
```

## API Routes

### POST /api/upload

Upload a document for processing.

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@document.pdf" \
  -F "sessionId=user123"
```

### POST /api/chat

Stream a chat response (AI SDK format).

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Summarize the document"}], "sessionId": "user123"}'
```

### POST /api/verify

Verify citations in a response.

```bash
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "user123", "content": "Revenue grew 23% <cite.../>"}'
```

## Production Considerations

1. **Session Management**: Use proper session IDs (auth tokens, UUIDs)
2. **File Storage**: Store `fileDataParts` in Redis/DB, not memory
3. **Rate Limiting**: Add rate limits to API routes
4. **Error Handling**: Add proper error boundaries and retry logic
5. **Caching**: Cache verification results for repeated queries

## Next Steps

- See the [basic-verification example](../basic-verification) for a simpler integration
- Check out the [support-bot example](../support-bot) for invisible citations
- Read the [full documentation](https://deepcitation.com/docs) for advanced patterns
- Explore [React components](../../README.md#react-components) from the main package
