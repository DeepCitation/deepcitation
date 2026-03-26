---
layout: default
title: AG-UI
parent: Frameworks
nav_order: 7
description: "Using DeepCitation with the AG-UI protocol for SSE streaming"
commit_sha: "80dfecd"
stale_after_commits: 20
watch_paths:
  - src/client/DeepCitation.ts
  - examples/agui-chat/
---

# DeepCitation + AG-UI

Integrate citation verification into AG-UI protocol agents. AG-UI's event-driven SSE streaming pairs naturally with DeepCitation's deferred citation pattern — verification results are sent as `STATE_DELTA` events after the LLM finishes streaming.

{: .note }
A complete, runnable example is available at [agui-chat](https://github.com/DeepCitation/deepcitation/tree/main/examples/agui-chat) ([live demo](https://agui-chat-deepcitation.vercel.app/)).

---

## Install

```bash
npm install deepcitation @ag-ui/core
```

---

## Architecture

```
Client ──SSE──> /api/agent ──> LLM (streaming tokens via TEXT_MESSAGE_CONTENT)
                     │
                     ├── TEXT_MESSAGE_END (LLM done)
                     ├── DeepCitation.verify() (runs after LLM completes)
                     └── STATE_DELTA (verification results pushed to client)
```

The key insight: AG-UI's `STATE_DELTA` events let you push verification results to the client after the LLM finishes streaming, without a separate API call.

---

## Key Integration Pattern

```typescript
import { EventType } from "@ag-ui/core";
import {
  DeepCitation,
  wrapCitationPrompt,
  extractVisibleText,
} from "deepcitation";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// In your AG-UI agent route handler:
export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      // 1. Prepare attachment (cached across requests)
      const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([
        { file: pdfBuffer, filename: "report.pdf" },
      ]);

      // 2. Wrap prompts
      const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
        systemPrompt, userPrompt, deepTextPromptPortion,
      });

      // 3. Stream LLM response via AG-UI events
      send({ type: EventType.RUN_STARTED, threadId, runId });
      send({ type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" });

      let fullResponse = "";
      // ... stream LLM tokens, sending TEXT_MESSAGE_CONTENT events ...
      // ... collect fullResponse ...

      send({ type: EventType.TEXT_MESSAGE_END, messageId });

      // 4. Verify citations and push results as STATE_DELTA
      const { verifications } = await dc.verify({ llmOutput: fullResponse });
      const visibleText = extractVisibleText(fullResponse);

      send({
        type: EventType.STATE_DELTA,
        delta: [
          { op: "replace", path: "/verifications", value: verifications },
          { op: "replace", path: "/visibleText", value: visibleText },
        ],
      });

      send({ type: EventType.RUN_FINISHED, threadId, runId });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
```

---

## Client-Side: Consuming Verification Results

On the client, listen for `STATE_DELTA` events to receive verification results and render `CitationComponent`:

```tsx
import { CitationComponent } from "deepcitation/react";
import type { StateDeltaEvent } from "@ag-ui/core";

// When STATE_DELTA arrives with verifications:
function onStateDelta(delta: StateDeltaEvent["delta"]) {
  for (const op of delta) {
    if (op.path === "/verifications") {
      setVerifications(op.value);
    }
  }
}
```

---

## Next Steps

- [Components]({{ site.baseurl }}/components/) — Display verified citations with React
- [Vercel AI SDK Guide]({{ site.baseurl }}/frameworks/vercel-ai-sdk/) — Alternative streaming approach
- [Error Handling]({{ site.baseurl }}/error-handling/) — Handle verification failures gracefully
