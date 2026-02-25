# AG-UI Protocol Example + INTEGRATION.md Simplification

## Overview

Create a new `examples/agui-chat/` that demonstrates DeepCitation citation verification over the [AG-UI protocol](https://docs.ag-ui.com/) SSE event stream. Also simplify INTEGRATION.md from ~1600 lines to ~350-400 lines.

**Prerequisite**: Complete `plans/nextjs-ai-sdk-improvements.md` first — fixes from that plan carry into files copied here.

## Part 1: `examples/agui-chat/`

### Architecture

The key difference from `nextjs-ai-sdk`: chat streaming and citation verification happen over a **single SSE stream** using AG-UI protocol events, instead of two separate HTTP requests (`/api/chat` + `/api/verify`).

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

### Frontend Approach: Direct `@ag-ui/client` (NOT CopilotKit)

Uses `@ag-ui/client`'s `HttpAgent` directly with a custom React hook that subscribes to the RxJS Observable returned by `HttpAgent.run()`.

**Why not CopilotKit**:
- The example showcases the AG-UI protocol itself, not CopilotKit
- No extra proxy layer — the Next.js API route IS the AG-UI agent
- Fewer dependencies, more educational
- Developers see the raw SSE events

### File Structure

```
examples/agui-chat/
├── .env.example
├── README.md
├── next.config.js
├── package.json
├── postcss.config.js               # same as nextjs-ai-sdk
├── tsconfig.json                    # same as nextjs-ai-sdk
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── agent/route.ts       # ★ NEW — AG-UI SSE endpoint (core)
    │   │   └── upload/route.ts      # copied from nextjs-ai-sdk (with improvements)
    │   ├── globals.css              # copied from nextjs-ai-sdk
    │   ├── layout.tsx               # new (minimal root layout)
    │   ├── page.tsx                 # ★ adapted — uses useAgentChat instead of useChat
    │   ├── error.tsx                # copied from nextjs-ai-sdk
    │   ├── global-error.tsx         # copied from nextjs-ai-sdk
    │   └── not-found.tsx            # copied from nextjs-ai-sdk
    ├── components/
    │   ├── ChatMessage.tsx          # ★ adapted — simpler message interface
    │   ├── FileUpload.tsx           # copied from nextjs-ai-sdk
    │   └── VerificationPanel.tsx    # copied from nextjs-ai-sdk (with type fixes)
    ├── hooks/
    │   └── useAgentChat.ts          # ★ NEW — React hook wrapping @ag-ui/client
    ├── lib/
    │   └── agui-events.ts           # ★ NEW — AG-UI event builder helpers
    └── utils/
        └── citationDrawerAdapter.ts # copied from nextjs-ai-sdk
```

★ = new or significantly adapted files (5 total)

### Dependencies

```json
{
  "dependencies": {
    "@ag-ui/client": "^0.0.45",
    "@ag-ui/core": "^0.0.45",
    "@ag-ui/encoder": "^0.0.45",
    "deepcitation": "latest",
    "next": "^16.1.1",
    "openai": "^6.16.0",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.18",
    "@types/node": "^25.0.7",
    "@types/react": "^19.2.8",
    "@types/react-dom": "^19.2.3",
    "postcss": "^8.5.6",
    "tailwindcss": "^4.1.18",
    "typescript": "^5.9.3"
  }
}
```

### Key New File: `/api/agent/route.ts`

The heart of the example. Merges `nextjs-ai-sdk`'s `/api/chat` + `/api/verify` into one SSE stream.

**Flow**:
1. Parse request body: `{ threadId, runId, messages, state: { fileDataParts, provider } }`
2. `EventEncoder` from `@ag-ui/encoder` formats each event as `data: <JSON>\n\n`
3. Emit `RUN_STARTED`
4. Build `deepTextPromptPortion` from uploaded documents — this is the extracted text content from `prepareAttachment()` responses, stored in client state as part of `fileDataParts`. It is a DeepCitation-specific field, not an AG-UI convention.
5. Call `wrapCitationPrompt(deepTextPromptPortion, userMessage)`
6. Emit `TEXT_MESSAGE_START`
7. Stream OpenAI `gpt-5-mini` response, emit `TEXT_MESSAGE_CONTENT` per token chunk
8. Emit `TEXT_MESSAGE_END`
9. If documents uploaded and DeepCitation configured:
   - Emit `STATE_DELTA` with `[{ op: "replace", path: "/verificationStatus", value: "verifying" }]`
   - Call `getAllCitationsFromLlmOutput(fullResponse)`
   - Call `dc.verifyAttachment(attachmentId, citations, { ... })`
     > **Security**: When processing URLs in state or fileDataParts, use `isDomainMatch()` from `deepcitation` for domain validation — **never** use `.includes()` for domain checks (vulnerable to subdomain spoofing per CLAUDE.md).
   - Compute summary (verified/missed/pending counts via `getCitationStatus()`)
   - Emit `STATE_SNAPSHOT` with `{ citations, verifications, summary, verificationStatus: "complete" }`
10. Emit `RUN_FINISHED`
11. On error: emit `RUN_ERROR` with sanitized message (use `sanitizeForLog()` from `src/utils/logSafety.ts` — raw errors may contain stack traces or sensitive paths)

Uses `ReadableStream` + `TextEncoder` for Next.js App Router compatibility (not Express `res.write()`).

**Async completion pattern** — The stream must NOT close until both LLM streaming and async verification finish. This is the most complex part of the implementation:

```typescript
// Pseudo-code for the ReadableStream controller:
const stream = new ReadableStream({
  async start(controller) {
    try {
      // Phase 1: Stream LLM tokens
      for await (const chunk of llmStream) {
        controller.enqueue(encode(textMessageContent(messageId, chunk)));
      }
      controller.enqueue(encode(textMessageEnd(messageId)));

      // Phase 2: Async verification (stream stays open)
      if (hasDocuments) {
        controller.enqueue(encode(stateDelta([
          { op: "replace", path: "/verificationStatus", value: "verifying" }
        ])));
        const { citations, verifications } = await verify(fullResponse);
        controller.enqueue(encode(stateSnapshot({ citations, verifications, summary })));
      }

      controller.enqueue(encode(runFinished(threadId, runId)));
      controller.close();
    } catch (err) {
      controller.enqueue(encode(runError(sanitizeForLog(err.message))));
      controller.close();
    }
  },
  cancel() {
    // Client disconnected — abort any in-progress verification
    abortController.abort();
  }
});
```

> **Key detail**: The `cancel()` callback handles client disconnection. If the frontend disconnects mid-verification, the abort signal propagates to stop async operations and prevent resource leaks.

### Key New File: `hooks/useAgentChat.ts`

Custom React hook consuming the AG-UI SSE stream via `@ag-ui/client`.

Must be client-only — file must include `'use client'` directive for Next.js App Router.

**Interface**:
```typescript
function useAgentChat(options: {
  agentUrl: string;
  fileDataParts: FileDataPart[];
  provider: string;
}): {
  messages: Message[];        // { id, role, content }
  isLoading: boolean;
  isVerifying: boolean;
  error: Error | null;
  messageVerifications: Record<string, VerificationResult>;
  sendMessage: (content: string) => void;
  retry: (messageId: string) => void;  // Retry failed verifications (aligns with #3 in improvements plan)
  cancel: () => void;                   // Cancel in-progress request (aborts stream + verification)
}
```

**Event handling in `subscribe.next`**:
| AG-UI Event | Hook Action |
|-------------|-------------|
| `TEXT_MESSAGE_START` | Add empty assistant message to state |
| `TEXT_MESSAGE_CONTENT` | Append delta to current message content |
| `TEXT_MESSAGE_END` | Set `isLoading = false` |
| `STATE_DELTA` (verifying) | Set `isVerifying = true` |
| `STATE_SNAPSHOT` | Store verification results keyed by messageId, set `isVerifying = false` |
| `RUN_ERROR` | Set error state, clear loading flags |

### Key New File: `lib/agui-events.ts`

Thin builder functions for readability in the route handler:

```typescript
import { EventType } from "@ag-ui/core";

export function runStarted(threadId: string, runId: string) { ... }
export function textMessageStart(messageId: string) { ... }
export function textMessageContent(messageId: string, delta: string) { ... }
export function textMessageEnd(messageId: string) { ... }
export function stateSnapshot(snapshot: Record<string, unknown>) { ... }
export function stateDelta(delta: Array<{ op: string; path: string; value: unknown }>) { ... }
export function runFinished(threadId: string, runId: string) { ... }
export function runError(message: string) { ... }
```

### Adapted `ChatMessage.tsx`

Simplified message interface — no AI SDK `parts` array:

```typescript
interface ChatMessageProps {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
  };
  citations?: Record<string, Citation>;
  verifications?: Record<string, Verification>;
  summary?: { total: number; verified: number; missed: number; pending: number };
  drawerItems?: CitationDrawerItem[];
}
```

Content derivation simplifies to `message.content` instead of the parts-parsing logic.

### Adapted `page.tsx`

Same layout structure as nextjs-ai-sdk but:
- Uses `useAgentChat({ agentUrl: "/api/agent", fileDataParts, provider: "openai" })` instead of `useChat`
- No separate `/api/verify` fetch — verifications arrive through the same hook via `STATE_SNAPSHOT`
- No model switcher (focused on AG-UI protocol, not multi-model)
- Submit handler: `sendMessage(input.trim())` instead of AI SDK's `handleSubmit`

### SSE Wire Format

Each event formatted by `EventEncoder.encode()`:
```
data: {"type":"RUN_STARTED","threadId":"thread-1","runId":"run-1"}

data: {"type":"TEXT_MESSAGE_START","messageId":"msg-run-1","role":"assistant"}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-run-1","delta":"Revenue "}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-run-1","delta":"grew by 23%"}

data: {"type":"TEXT_MESSAGE_END","messageId":"msg-run-1"}

data: {"type":"STATE_DELTA","delta":[{"op":"replace","path":"/verificationStatus","value":"verifying"}]}

data: {"type":"STATE_SNAPSHOT","snapshot":{"citations":{...},"verifications":{...},"summary":{...}}}

data: {"type":"RUN_FINISHED","threadId":"thread-1","runId":"run-1"}

```

### `.env.example`

```bash
# Get your free API key at https://deepcitation.com/signup
DEEPCITATION_API_KEY=sk-dc-your_api_key_here

# OpenAI API key
OPENAI_API_KEY=sk-your-openai-key
```

Simpler than nextjs-ai-sdk (no Gemini — this example focuses on the AG-UI protocol, not multi-model switching).

### `README.md`

Pattern: Same structure as `examples/nextjs-ai-sdk/README.md`

Contents:
- Title: "AG-UI Chat Example"
- Description: Chat app using AG-UI protocol for agent-user interaction with DeepCitation verification
- Features: AG-UI SSE events, real-time streaming, citation verification via STATE_SNAPSHOT
- Architecture diagram (the ASCII art above)
- Quick Start (npm install, .env setup, npm run dev)
- Project Structure
- How It Works section explaining the 7-event sequence
- API Routes documentation (`/api/agent`, `/api/upload`)
- Comparison with nextjs-ai-sdk approach

### Update `examples/README.md`

Add row to the table:

```markdown
| [**agui-chat**](./agui-chat) | AG-UI protocol chat with SSE streaming | AG-UI integration, protocol-level control |
```

---

## Part 2: Simplify INTEGRATION.md

### Problem

Current INTEGRATION.md is ~1600 lines. It tries to be both tutorial and exhaustive reference. It contains complete Next.js route implementations that duplicate the examples, and exhaustive display variant documentation that belongs in TSDoc.

### Target: ~350-400 lines

### What to Keep (as-is or lightly trimmed)

| Section | Current Lines | Target Lines | Notes |
|---------|--------------|--------------|-------|
| Install | ~30 | ~5 | Trim boilerplate |
| Golden Rules | ~35 | ~30 | Essential — prevents common bugs |
| Quick Start | ~75 | ~75 | The core of the doc, keep as-is |
| Appendix A: Status Reference | ~40 | ~40 | Compact, frequently referenced |
| Appendix G: Real URLs | ~20 | ~10 | Already short |
| Appendix H: File Formats | ~10 | ~10 | Already short |

### What to Condense

| Section | Current Lines | Target Lines | How |
|---------|--------------|--------------|-----|
| Step 1: Prepare Sources | ~115 | ~40 | Cut multi-doc edge cases, collapse `<details>` blocks |
| Step 2: Enhance Prompts | ~75 | ~25 | Single OpenAI example, note for other providers |
| Step 3: Display Results | ~680 | ~80 | Keep parse+verify+React, table for rest |
| Appendix C: LLM Providers | ~50 | ~15 | Condensed Anthropic + Gemini snippets |
| Appendix E: Troubleshooting | ~80 | ~30 | Top 5 issues only |

### What to Remove Entirely

| Section | Lines Saved | Reason |
|---------|------------|--------|
| Appendix B: Complete Import Reference | ~100 | Duplicates IDE autocomplete and TSDoc |
| Appendix D: Next.js API Route Patterns | ~140 | Exact duplicate of nextjs-ai-sdk example code. Replace with: "See `examples/nextjs-ai-sdk/`" |
| Appendix F: Production Checklist | ~50 | Too detailed for integration guide. Collapse to 3-line note |
| Steps 3.3-3.7 exhaustive display variants | ~500 | Replace with 10-line reference table linking to TSDoc/examples |

### New Structure

```markdown
# Integration Guide

> **Note**: This guide was streamlined in v2.x. For complete working examples,
> see the [`examples/`](../examples) directory.

> For contributors: see AGENTS.md. This guide is for external developers.

## Install

## Golden Rules

## Quick Start (server + React)

## Step 1: Prepare Sources
  - 1.1 Set up client
  - 1.2 Upload files
  - 1.3 Prepare URLs
  - 1.4 Multiple documents

## Step 2: Enhance Prompts & Call LLM
  - 2.1 Wrap prompts
  - 2.2 Call your LLM
  - 2.3 Streaming note (link to examples)

## Step 3: Parse, Verify & Display
  - 3.1 Parse & verify
  - 3.2 React: CitationComponent + CitationDrawer
  - 3.3 Other display options (table with 1-line per variant + link)

## Appendix A: Verification Status Reference
## Appendix B: Other LLM Providers
## Appendix C: Troubleshooting
## Appendix D: URLs & File Formats
```

### Guiding Principle

The current doc is both tutorial and reference. The simplified version is **tutorial-first**: show the happy path quickly, then link to reference material.

Every section after Quick Start should ask: *"Does this add information the Quick Start doesn't already cover?"* If no, cut it. If yes, keep only the new information.

---

## Canonical Locations (for CLAUDE.md)

New symbols introduced by this plan. Add to CLAUDE.md's canonical locations table during implementation:

| Symbol | Canonical file | Notes |
|--------|---------------|-------|
| `runStarted()` | `examples/agui-chat/src/lib/agui-events.ts` | AG-UI event builder |
| `textMessageStart()` | `examples/agui-chat/src/lib/agui-events.ts` | AG-UI event builder |
| `textMessageContent()` | `examples/agui-chat/src/lib/agui-events.ts` | AG-UI event builder |
| `textMessageEnd()` | `examples/agui-chat/src/lib/agui-events.ts` | AG-UI event builder |
| `stateSnapshot()` | `examples/agui-chat/src/lib/agui-events.ts` | AG-UI event builder |
| `stateDelta()` | `examples/agui-chat/src/lib/agui-events.ts` | AG-UI event builder |
| `runFinished()` | `examples/agui-chat/src/lib/agui-events.ts` | AG-UI event builder |
| `runError()` | `examples/agui-chat/src/lib/agui-events.ts` | AG-UI event builder |
| `useAgentChat()` | `examples/agui-chat/src/hooks/useAgentChat.ts` | React hook wrapping @ag-ui/client |

> **Note**: These are example-local symbols, not library exports. They belong in CLAUDE.md only if the pattern is later promoted to the main package (e.g., `src/agui/`).

---

## Implementation Order

1. Copy shared files from (now-improved) nextjs-ai-sdk
2. Create agui-chat skeleton (package.json, configs, .env.example)
3. Implement `lib/agui-events.ts` (event helpers)
4. Implement `/api/agent/route.ts` (core AG-UI SSE endpoint)
5. Implement `hooks/useAgentChat.ts` (React hook with @ag-ui/client)
6. Adapt `components/ChatMessage.tsx` (simpler message interface)
7. Implement `app/page.tsx` and `app/layout.tsx`
8. Write `README.md` with architecture diagram
9. Update `examples/README.md` table
10. Simplify `INTEGRATION.md`

## Potential Challenges

1. **`@ag-ui/encoder` + Next.js App Router**: Encoder returns strings, needs `TextEncoder` conversion for `ReadableStream`. Should work, but needs testing.

2. **`@ag-ui/client` HttpAgent in browser**: Sends POST, expects SSE response. Library handles `response.body.getReader()` internally via Observable. Needs verification in Next.js client component.

3. **RxJS bundle size**: `@ag-ui/client` depends on it already, so no extra weight. Worth noting in README that client bundle is larger than nextjs-ai-sdk.

4. **STATE_SNAPSHOT vs STATE_DELTA**: For verification results (arrive all at once), `STATE_SNAPSHOT` is correct. `STATE_DELTA` used only for the intermediate "verifying" status signal.

5. **SSE connection recovery**: If the connection drops mid-stream, `@ag-ui/client`'s Observable terminates with an error. The `useAgentChat` hook should surface this via the `error` state and allow retry via `retry(messageId)`. Automatic reconnection is out of scope for Phase 1 — document expected behavior when users lose connectivity during verification.

6. **Observable cleanup on disconnect**: The `ReadableStream.cancel()` callback (see pseudo-code above) must abort in-progress verification. On the client side, `useAgentChat` must unsubscribe from the Observable on component unmount to prevent state updates after unmount.

## Verification

**AG-UI example**:
1. `cd examples/agui-chat && npm install && npm run dev`
2. Open http://localhost:3000
3. Upload a PDF, ask a question
4. Verify in Browser DevTools Network tab (EventStream): events arrive as `RUN_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT (many) → TEXT_MESSAGE_END → STATE_DELTA → STATE_SNAPSHOT → RUN_FINISHED`
5. Verify streaming text appears token-by-token
6. Verify "Verifying..." state appears after stream ends
7. Verify citation components render with status indicators
8. Verify VerificationPanel shows summary

**State size note**: Each message's verification state is roughly ~10 citations x 2KB per citation = ~20KB. After 50+ messages in a long conversation, state can reach ~1MB. This is acceptable for Phase 1 but worth noting in the README as a known limitation for very long sessions.

**INTEGRATION.md**:
1. Line count < 400
2. All essential information preserved (Golden Rules, Quick Start, core workflow)
3. No broken internal links
4. Every removed section has either a link to its new home or was truly redundant
