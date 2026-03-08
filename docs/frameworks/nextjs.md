---
layout: default
title: Next.js App Router
parent: Frameworks
nav_order: 2
description: "DeepCitation + Next.js App Router: server components, streaming, and use client boundaries"
commit_sha: "cc9c7aa"
stale_after_commits: 15
watch_paths:
  - src/react/Citation.tsx
  - src/react/index.ts
  - src/index.ts
  - src/client/DeepCitation.ts
  - examples/nextjs-ai-sdk
---

# DeepCitation + Next.js App Router

In your Next.js App Router app, DeepCitation runs entirely server-side until the final render step. This guide answers the architectural questions up front, then walks through three complete integration patterns.

---

## "use client" Boundary Map

This is the question most developers hit first. Here's the complete split:

| Import | Where it runs | Why |
|:-------|:-------------|:----|
| `DeepCitation` (class) | Server only | Makes network calls to DC API; never expose API key to client |
| `prepareAttachments()` | Server only (Route Handler or Server Action) | Uploads files to DC API |
| `wrapCitationPrompt()` | Server only | Runs during prompt construction, same process as the LLM call |
| `getAllCitationsFromLlmOutput()` | Server only (Route Handler) | Called after streaming completes |
| `verifyAttachment()` | Server only (Route Handler) | Makes DC API call |
| `validateUploadFile()` | Server only | File validation before upload |
| `CitationComponent` | Client only (`"use client"`) | Uses React state/hooks, renders interactive popover |
| `CitationDrawer` | Client only (`"use client"`) | Interactive drawer with animation |
| `CitationDrawerTrigger` | Client only (`"use client"`) | Trigger button for the drawer |
| `parseCitation()` | Either | Pure function, no side effects |
| `getCitationKey()` | Either | Pure function, no side effects (import from `"deepcitation"`) |

{: .important }
`DeepCitation` uses your `DEEPCITATION_API_KEY`. Never import it in a file with `"use client"` — the key would be bundled into the browser.

---

## Pattern 1: Route Handlers (Recommended)

The most common pattern: three Route Handlers handle upload, streaming, and verification. The client uses `useChat` from `@ai-sdk/react` to stream and triggers verification when streaming ends.

This pattern is used in the [nextjs-ai-sdk example](https://github.com/DeepCitation/deepcitation/tree/main/examples/nextjs-ai-sdk).

### File Structure

```
app/
├── api/
│   ├── upload/route.ts      ← prepareAttachments() lives here
│   ├── chat/route.ts        ← wrapCitationPrompt() + streamText() live here
│   └── verify/route.ts      ← getAllCitationsFromLlmOutput() + verifyAttachment() live here
├── page.tsx                 ← "use client" — useChat, state, CitationComponent
└── components/
    └── ChatMessage.tsx      ← "use client" — CitationComponent rendering
```

### `/app/api/upload/route.ts`

```typescript
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

  // Validate file size, MIME type, and magic bytes before uploading
  const uploadError = validateUploadFile(file.size, file.type, new Uint8Array(arrayBuffer));
  if (uploadError) {
    return NextResponse.json({ error: uploadError }, { status: 400 });
  }

  const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([
    { file: buffer, filename: file.name },
  ]);

  // Return both — client stores fileDataPart for verification tracking,
  // deepTextPromptPortion for injecting into subsequent LLM prompts.
  return NextResponse.json({
    fileDataPart: fileDataParts[0],
    deepTextPromptPortion,
  });
}
```

### `/app/api/chat/route.ts`

```typescript
import { openai } from "@ai-sdk/openai";
import { wrapCitationPrompt } from "deepcitation";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, deepTextPromptPortions = [] } = await req.json();

  const uiMessages = messages as UIMessage[];
  const lastUserMessage = uiMessages.findLast(m => m.role === "user");
  const lastUserContent =
    lastUserMessage?.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map(p => p.text)
      .join("") ?? "";

  const hasDocuments = deepTextPromptPortions.length > 0;

  const { enhancedSystemPrompt, enhancedUserPrompt } = hasDocuments
    ? wrapCitationPrompt({
        systemPrompt: "You are a helpful assistant that cites sources.",
        userPrompt: lastUserContent,
        deepTextPromptPortion: deepTextPromptPortions,
      })
    : {
        enhancedSystemPrompt: "You are a helpful assistant.",
        enhancedUserPrompt: lastUserContent,
      };

  // Inject the enhanced user message before converting to model format
  const enhancedMessages = uiMessages.map((m, i) => {
    if (i === uiMessages.length - 1 && m.role === "user" && hasDocuments) {
      return { ...m, parts: [{ type: "text" as const, text: enhancedUserPrompt }] };
    }
    return m;
  });

  const modelMessages = await convertToModelMessages(enhancedMessages);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: enhancedSystemPrompt,
    messages: modelMessages,
  });

  return result.toTextStreamResponse();
}
```

### `/app/api/verify/route.ts`

```typescript
import { DeepCitation, getAllCitationsFromLlmOutput } from "deepcitation";
import { type NextRequest, NextResponse } from "next/server";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

export async function POST(req: NextRequest) {
  const { llmOutput, attachmentId } = await req.json();

  // Citation extraction happens server-side — client sends raw LLM output
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

### `/app/page.tsx` — Streaming + Verification Wiring

```typescript
"use client";

import { useChat } from "@ai-sdk/react";
import type { Citation, FileDataPart, Verification } from "deepcitation";
import { useEffect, useEffectEvent, useRef, useState } from "react";

export default function Home() {
  const [fileDataParts, setFileDataParts] = useState<FileDataPart[]>([]);
  const [deepTextPromptPortions, setDeepTextPromptPortions] = useState<string[]>([]);
  const [messageVerifications, setMessageVerifications] = useState<
    Record<string, { citations: Record<string, Citation>; verifications: Record<string, Verification> }>
  >({});
  const [isVerifying, setIsVerifying] = useState(false);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    streamProtocol: "text",
    body: { deepTextPromptPortions },
  });

  // Stable event handler — not affected by stale closure over isLoading/messages
  const onVerifyMessage = useEffectEvent((messageId: string, content: string) => {
    if (!content || fileDataParts.length === 0) return;

    setIsVerifying(true);
    fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llmOutput: content,
        attachmentId: fileDataParts[0].attachmentId,
      }),
    })
      .then(res => res.json())
      .then(data => setMessageVerifications(prev => ({ ...prev, [messageId]: data })))
      .finally(() => setIsVerifying(false));
  });

  // Trigger verification when streaming transitions from loading → done
  const prevIsLoadingRef = useRef(false);
  useEffect(() => {
    if (prevIsLoadingRef.current && !isLoading) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant" && !messageVerifications[lastMsg.id]) {
        const content =
          lastMsg.content ||
          lastMsg.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map(p => p.text)
            .join("") ||
          "";
        onVerifyMessage(lastMsg.id, content);
      }
    }
    prevIsLoadingRef.current = isLoading;
  }, [isLoading, messages, messageVerifications]);

  const handleFileUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) {
      setFileDataParts(prev => [...prev, data.fileDataPart]);
      setDeepTextPromptPortions(prev => [...prev, data.deepTextPromptPortion]);
    }
  };

  // ... render messages with CitationComponent (see Pattern 1 — Client Rendering below)
}
```

---

## Pattern 2: Streaming + When to Verify

A common question: **does `verifyAttachment()` work on partial (mid-stream) responses?**

**No — verification requires the complete LLM output.** The LLM writes `<cite>` tags that may span multiple streamed chunks. Calling `getAllCitationsFromLlmOutput()` on a partial response will miss citations whose tags haven't fully arrived yet.

The correct pattern (used in the example above) is:

```
Stream begins (isLoading: true)
  → tokens arrive, render incrementally
Stream ends (isLoading: false)
  → collect full message content
  → call /api/verify with complete text
  → citations appear once verified
```

In `useChat`, detect the transition with a ref:

```typescript
const prevIsLoadingRef = useRef(false);

useEffect(() => {
  if (prevIsLoadingRef.current && !isLoading) {
    // Streaming just finished — safe to verify
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant") {
      triggerVerification(lastMsg);
    }
  }
  prevIsLoadingRef.current = isLoading;
}, [isLoading, messages]);
```

{: .note }
Use `useEffectEvent` for the verification handler so it captures the latest `fileDataParts` without becoming a `useEffect` dependency. This avoids re-triggering verification when `fileDataParts` changes.

---

## Pattern 3: Rendering Citations Client-Side

`CitationComponent` renders an interactive inline citation with a popover showing verification status and a proof image. It's client-only.

In your chat message component:

```typescript
"use client";

import { parseCitation, getCitationKey, type Citation, type Verification } from "deepcitation";
import { CitationComponent } from "deepcitation/react";

// Replace <cite .../> tags in LLM output with CitationComponent
function renderWithCitations(
  content: string,
  citations: Record<string, Citation>,
  verifications: Record<string, Verification>,
): React.ReactNode {
  const parts = content.split(/(<cite\s[^>]*\/>)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (!part.startsWith("<cite")) {
          return <span key={i}>{part}</span>;
        }
        try {
          const { citation: parsed } = parseCitation(part);
          const key = getCitationKey(parsed);
          return (
            <CitationComponent
              key={key}
              citation={citations[key] ?? parsed}
              verification={verifications[key]}
            />
          );
        } catch {
          return <span key={i}>{part}</span>;
        }
      })}
    </>
  );
}
```

---

## Pattern 3: Static / SSG Pre-Verified Citations

For published articles or documentation where citations are pre-verified at build time, run `verifyAttachment()` during the build and embed the results in your page props.

```typescript
// app/articles/[slug]/page.tsx  ← Server Component (no "use client")
import { DeepCitation, getAllCitationsFromLlmOutput } from "deepcitation";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const article = await getArticle(params.slug);

  // Citations verified at render time (SSR) or build time (SSG with generateStaticParams)
  const citations = getAllCitationsFromLlmOutput(article.content);
  const { verifications } = await dc.verifyAttachment(article.attachmentId, citations);

  // Pass pre-verified data to the client component
  return <ArticleContent content={article.content} verifications={verifications} />;
}
```

```typescript
// components/ArticleContent.tsx  ← "use client" for CitationComponent
"use client";

import type { Verification } from "deepcitation";
import { CitationComponent } from "deepcitation/react";

export function ArticleContent({
  content,
  verifications,
}: {
  content: string;
  verifications: Record<string, Verification>;
}) {
  // Render content with inline citations — verifications already computed server-side
  return <div>{renderWithCitations(content, {}, verifications)}</div>;
}
```

**Can `CitationComponent` be server-rendered for SEO?** Not with its interactive popover — the component uses React state and browser APIs. For SEO, render citation text in the Server Component and hydrate the interactive CitationComponent on the client.

---

## Environment Variables

```bash
# .env.local
DEEPCITATION_API_KEY=dc_live_your_key   # Server-only — never prefix with NEXT_PUBLIC_
OPENAI_API_KEY=sk-your-key              # Server-only
```

{: .warning }
Do **not** prefix with `NEXT_PUBLIC_`. DeepCitation calls run server-side only. Exposing the key to the browser would allow anyone to make API calls at your cost.

---

## Scaffold This Integration

Clone the working example directly:

```bash
npx degit DeepCitation/deepcitation/examples/nextjs-ai-sdk my-citation-app
cd my-citation-app
cp .env.example .env.local
# Add your keys to .env.local
npm install && npm run dev
```

---

## Next Steps

- [Vercel AI SDK guide]({{ site.baseurl }}/frameworks/vercel-ai-sdk) — `streamText` middleware patterns
- [Components]({{ site.baseurl }}/components) — full CitationComponent and CitationDrawer API
- [Styling]({{ site.baseurl }}/styling) — CSS customization and theming
