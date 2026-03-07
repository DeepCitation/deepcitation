---
layout: default
title: Vercel AI SDK
parent: Frameworks
nav_order: 3
description: "DeepCitation + Vercel AI SDK: streamText, useChat, and citation verification"
commit_sha: "cc9c7aa"
stale_after_commits: 15
watch_paths:
  - src/react/Citation.tsx
  - src/react/index.ts
  - src/index.ts
  - src/client/DeepCitation.ts
---

# DeepCitation + Vercel AI SDK

If you're already using `useChat` and `streamText`, adding DeepCitation requires three changes: an upload endpoint, citation-enhanced prompt wrapping in the chat handler, and a post-stream verification call on the client.

{: .note }
This guide assumes you have a working `useChat` / `streamText` setup. If you're starting from scratch, see the [Next.js guide]({{ site.baseurl }}/frameworks/nextjs) for the full setup including routing and component structure.

---

## Prerequisites

```bash
npm install deepcitation ai @ai-sdk/openai @ai-sdk/react
```

---

## How DeepCitation Integrates with streamText

`streamText` streams tokens to the client. Citation verification must happen **after** streaming ends — `<cite>` tags in the LLM's response may span multiple chunks, so you need the complete output before calling `getAllCitationsFromLlmOutput()`.

The integration model is:

```
useChat → POST /api/chat → streamText (tokens stream to client)
                                    ↓  (streaming ends)
                         client detects isLoading: true → false
                                    ↓
                         POST /api/verify (complete llmOutput)
                                    ↓
                         verifyAttachment() → citations + proofs
```

---

## Step 1: Document Upload Endpoint

Create `/api/upload/route.ts` to handle file uploads. This runs `prepareAttachments()` and returns both the `fileDataPart` (for tracking which attachment to verify against) and `deepTextPromptPortion` (the document content to inject into your prompt).

```typescript
// app/api/upload/route.ts
import { DeepCitation, validateUploadFile } from "deepcitation";
import { type NextRequest, NextResponse } from "next/server";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Validate before uploading
  const validationError = validateUploadFile(file.size, file.type, new Uint8Array(arrayBuffer));
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([
    { file: buffer, filename: file.name },
  ]);

  return NextResponse.json({
    fileDataPart: fileDataParts[0],    // Contains attachmentId for verification
    deepTextPromptPortion,             // Document text formatted for DC prompting
  });
}
```

## Step 2: Enhanced Chat Handler

In your existing `streamText` handler, intercept the last user message and wrap it with citation instructions when documents are present. The client passes `deepTextPromptPortions` in the request body.

```typescript
// app/api/chat/route.ts
import { openai } from "@ai-sdk/openai";
import { wrapCitationPrompt } from "deepcitation";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  const {
    messages,
    deepTextPromptPortions = [],  // Added: accumulated per-upload prompt portions
  } = await req.json();

  const uiMessages = messages as UIMessage[];
  const hasDocuments = deepTextPromptPortions.length > 0;

  // Extract the latest user message text
  const lastUserMessage = uiMessages.findLast(m => m.role === "user");
  const lastUserContent =
    lastUserMessage?.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map(p => p.text)
      .join("") ?? "";

  // Wrap with citation instructions only when documents are uploaded
  const { enhancedSystemPrompt, enhancedUserPrompt } = hasDocuments
    ? wrapCitationPrompt({
        systemPrompt: "You are a helpful assistant that answers questions based on provided documents.",
        userPrompt: lastUserContent,
        deepTextPromptPortion: deepTextPromptPortions,
      })
    : {
        enhancedSystemPrompt: "You are a helpful assistant.",
        enhancedUserPrompt: lastUserContent,
      };

  // Replace the last user message with the enhanced version
  const enhancedMessages = uiMessages.map((m, i) =>
    i === uiMessages.length - 1 && m.role === "user" && hasDocuments
      ? { ...m, parts: [{ type: "text" as const, text: enhancedUserPrompt }] }
      : m,
  );

  const modelMessages = await convertToModelMessages(enhancedMessages);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: enhancedSystemPrompt,
    messages: modelMessages,
  });

  return result.toTextStreamResponse();
}
```

## Step 3: Verification Endpoint

```typescript
// app/api/verify/route.ts
import { DeepCitation, getAllCitationsFromLlmOutput } from "deepcitation";
import { type NextRequest, NextResponse } from "next/server";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

export async function POST(req: NextRequest) {
  const { llmOutput, attachmentId } = await req.json();

  const citations = getAllCitationsFromLlmOutput(llmOutput);

  if (Object.keys(citations).length === 0) {
    return NextResponse.json({ citations: {}, verifications: {} });
  }

  const { verifications } = await dc.verifyAttachment(attachmentId, citations, {
    outputImageFormat: "avif",
  });

  return NextResponse.json({ citations, verifications });
}
```

## Step 4: Client — useChat + Post-Stream Verification

Wire the client so that: (1) uploads accumulate `deepTextPromptPortions` which get sent with each chat request, and (2) verification fires when `isLoading` transitions from `true` to `false`.

```typescript
"use client";

import { useChat } from "@ai-sdk/react";
import type { Citation, FileDataPart, Verification } from "deepcitation";
import { useEffect, useEffectEvent, useRef, useState } from "react";

export default function Chat() {
  const [fileDataParts, setFileDataParts] = useState<FileDataPart[]>([]);
  const [deepTextPromptPortions, setDeepTextPromptPortions] = useState<string[]>([]);
  const [verifications, setVerifications] = useState<
    Record<string, { citations: Record<string, Citation>; verifications: Record<string, Verification> }>
  >({});

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    streamProtocol: "text",
    body: {
      deepTextPromptPortions,  // Sent with every chat request
    },
  });

  // useEffectEvent: stable reference, always reads latest state.
  // This avoids adding fileDataParts to the useEffect dependency array
  // which would re-trigger verification when files are added.
  const verifyMessage = useEffectEvent((messageId: string, content: string) => {
    if (!content || fileDataParts.length === 0) return;

    fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llmOutput: content,
        attachmentId: fileDataParts[0].attachmentId,
      }),
    })
      .then(res => res.json())
      .then(data => setVerifications(prev => ({ ...prev, [messageId]: data })));
  });

  // Detect streaming end: isLoading true → false
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      const last = messages[messages.length - 1];
      if (last?.role === "assistant" && !verifications[last.id]) {
        const content =
          last.content ||
          last.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map(p => p.text)
            .join("") ||
          "";
        verifyMessage(last.id, content);
      }
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, messages, verifications]);

  // Handle file upload
  const handleFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) return;

    const data = await res.json();
    setFileDataParts(prev => [...prev, data.fileDataPart]);
    setDeepTextPromptPortions(prev => [...prev, data.deepTextPromptPortion]);
  };

  return (
    <div>
      <input type="file" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {messages.map(msg => {
        const v = verifications[msg.id];
        return (
          <div key={msg.id}>
            <strong>{msg.role}:</strong>
            {/* Pass citations and verifications to your message renderer */}
            <MessageContent
              content={msg.content}
              citations={v?.citations}
              verifications={v?.verifications}
            />
          </div>
        );
      })}

      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit" disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}
```

---

## Rendering CitationComponent

Once you have `citations` and `verifications` for a message, replace `<cite>` tags with `CitationComponent`. This must be in a `"use client"` file.

```typescript
"use client";

import { parseCitation, type Citation, type Verification } from "deepcitation";
import { CitationComponent, generateCitationKey } from "deepcitation/react";

function MessageContent({
  content,
  citations = {},
  verifications = {},
}: {
  content: string;
  citations?: Record<string, Citation>;
  verifications?: Record<string, Verification>;
}) {
  const CITE_REGEX = /<cite\s[^>]*\/>/g;
  const parts: React.ReactNode[] = [];
  let last = 0;

  for (const match of content.matchAll(CITE_REGEX)) {
    if (match.index > last) {
      parts.push(<span key={last}>{content.slice(last, match.index)}</span>);
    }

    try {
      const { citation: parsed } = parseCitation(match[0]);
      const key = generateCitationKey(parsed);
      parts.push(
        <CitationComponent
          key={key}
          citation={citations[key] ?? parsed}
          verification={verifications[key]}
        />,
      );
    } catch {
      parts.push(<span key={match.index}>{match[0]}</span>);
    }

    last = match.index + match[0].length;
  }

  if (last < content.length) {
    parts.push(<span key={last}>{content.slice(last)}</span>);
  }

  return <>{parts}</>;
}
```

---

## Using generateText (Non-Streaming)

If you use `generateText` instead of `streamText`, verification happens right after generation — no streaming detection needed:

```typescript
// app/api/chat/route.ts (non-streaming variant)
import { openai } from "@ai-sdk/openai";
import { DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput } from "deepcitation";
import { generateText } from "ai";
import { NextResponse } from "next/server";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

export async function POST(req: Request) {
  const { userPrompt, attachmentId, deepTextPromptPortion } = await req.json();

  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt: "You are a helpful assistant that cites sources.",
    userPrompt,
    deepTextPromptPortion,
  });

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: enhancedSystemPrompt,
    prompt: enhancedUserPrompt,
  });

  // Verify in the same handler — no streaming detection needed
  const citations = getAllCitationsFromLlmOutput(text);
  const { verifications } =
    Object.keys(citations).length > 0
      ? await dc.verifyAttachment(attachmentId, citations)
      : { verifications: {} };

  return NextResponse.json({ text, citations, verifications });
}
```

---

## Multiple File Providers

`wrapCitationPrompt` accepts `deepTextPromptPortion` as either a string or an array of strings. Pass the accumulated array directly:

```typescript
wrapCitationPrompt({
  systemPrompt: "...",
  userPrompt: question,
  deepTextPromptPortion: deepTextPromptPortions, // string[] from multiple uploads
});
```

For verification across multiple attachments, use `groupCitationsByAttachmentId`:

```typescript
import { groupCitationsByAttachmentId } from "deepcitation";

const citationsByAttachment = groupCitationsByAttachmentId(citations);
const results = await Promise.all(
  Array.from(citationsByAttachment.entries()).map(([id, cits]) =>
    dc.verifyAttachment(id, cits),
  ),
);
```

---

## Scaffold This Integration

```bash
npx degit DeepCitation/deepcitation/examples/nextjs-ai-sdk my-app
cd my-app
cp .env.example .env.local
# Set DEEPCITATION_API_KEY and OPENAI_API_KEY in .env.local
npm install && npm run dev
```

---

## Next Steps

- [Next.js App Router guide]({{ site.baseurl }}/frameworks/nextjs) — "use client" boundary table, SSG pattern
- [Components]({{ site.baseurl }}/components) — CitationDrawer for grouped source browsing
- [Error Handling]({{ site.baseurl }}/error-handling) — retry logic, invalid key errors
