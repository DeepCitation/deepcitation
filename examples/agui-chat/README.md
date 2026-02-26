# AG-UI Chat Example

Chat application using the [AG-UI protocol](https://docs.ag-ui.com/) for agent-user interaction with [DeepCitation](https://deepcitation.com) citation verification.

## Features

- **Single SSE stream** — LLM tokens and verification results flow through one connection
- **AG-UI protocol events** — `RUN_STARTED`, `TEXT_MESSAGE_*`, `STATE_DELTA`, `STATE_SNAPSHOT`, `RUN_FINISHED`
- **Real-time streaming** — Tokens appear as they arrive from the LLM
- **Citation verification** — Automatically verifies citations after streaming completes
- **Visual proof** — Proof images and hosted proof URLs for each citation

## Architecture

```
Browser                         Next.js API Route
──────                         ─────────────────
useAgentChat() ──POST──────▶  /api/agent/route.ts
    │                              │
    │◀── RUN_STARTED ─────────────│
    │◀── TEXT_MESSAGE_START ──────│
    │◀── TEXT_MESSAGE_CONTENT ────│  (repeated — streamed LLM tokens)
    │◀── TEXT_MESSAGE_END ────────│
    │◀── STATE_DELTA ─────────────│  ({ verificationStatus: "verifying" })
    │◀── STATE_SNAPSHOT ──────────│  ({ citations, verifications, summary })
    │◀── RUN_FINISHED ────────────│
```

The key difference from the `nextjs-ai-sdk` example: chat streaming and citation verification happen over a **single SSE stream** using AG-UI protocol events, instead of two separate HTTP requests (`/api/chat` + `/api/verify`).

## Quick Start

```bash
cd examples/agui-chat
npm install
cp .env.example .env
# Add your API keys to .env
npm run dev
# Open http://localhost:3000
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── agent/route.ts       # AG-UI SSE endpoint (core)
│   │   └── upload/route.ts      # File upload endpoint
│   ├── globals.css              # Tailwind + citation styles
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Main chat page
│   ├── error.tsx                # Error boundary
│   ├── global-error.tsx         # Global error boundary
│   └── not-found.tsx            # 404 page
├── components/
│   ├── ChatMessage.tsx          # Message display with inline citations
│   ├── FileUpload.tsx           # Document upload button
│   └── VerificationPanel.tsx    # Side panel with verification results
├── hooks/
│   └── useAgentChat.ts          # React hook wrapping @ag-ui/client
├── lib/
│   └── agui-events.ts           # AG-UI event builder helpers
└── utils/
    └── citationDrawerAdapter.ts # Drawer item conversion
```

## How It Works

### 1. Upload

User uploads a PDF via `/api/upload`. The server calls `dc.prepareAttachments()` and returns a `FileDataPart` containing the `attachmentId` and `deepTextPromptPortion`.

### 2. Chat + Verify (Single Stream)

When the user sends a message, `useAgentChat` opens a POST request to `/api/agent`. The server:

1. Wraps prompts with `wrapCitationPrompt()` using the document text
2. Streams OpenAI `gpt-5-mini` response as `TEXT_MESSAGE_CONTENT` events
3. After streaming completes, extracts citations with `getAllCitationsFromLlmOutput()`
4. Verifies against the source document with `dc.verifyAttachment()`
5. Sends verification results as a `STATE_SNAPSHOT` event

The connection stays open until both LLM streaming and verification finish.

### 3. Display

`ChatMessage` parses `<cite />` tags from the LLM output and renders them as interactive `CitationComponent` elements with verification status indicators.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/agent` | POST | AG-UI SSE endpoint — streams LLM + verification |
| `/api/upload` | POST | Upload documents for verification |

## Comparison with nextjs-ai-sdk

| Aspect | nextjs-ai-sdk | agui-chat |
|--------|--------------|-----------|
| Protocol | AI SDK streaming + REST | AG-UI SSE protocol |
| Endpoints | 3 (`/chat`, `/verify`, `/upload`) | 2 (`/agent`, `/upload`) |
| Verification | Separate client-initiated request | Server-side, same stream |
| Client hook | `useChat` (AI SDK) | `useAgentChat` (custom) |
| Models | OpenAI + Gemini | OpenAI only |
| State sync | Manual (isLoading detection) | AG-UI STATE_DELTA/SNAPSHOT |

## Known Limitations

- **Multi-document verification**: Only the first uploaded document's citations are verified. Citations from additional documents will show as "not found"
- **Bundle size**: `@ag-ui/client` depends on RxJS, which adds to the client bundle
- **Long sessions**: Each message's verification state is ~20KB. After 50+ messages, state can reach ~1MB
- **No auto-reconnect**: If the SSE connection drops mid-stream, the hook surfaces an error. Use the retry button to resend
