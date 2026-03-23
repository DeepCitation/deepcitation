---
layout: default
title: Express.js
parent: Frameworks
nav_order: 3
description: "DeepCitation + Express.js: citation verification in your Node.js API"
---

# DeepCitation + Express.js

Add citation verification to any Express.js API. Three endpoints: upload, chat (proxy your LLM), and verify.

{: .important }
**CSS not needed.** Express APIs return JSON — the React components (`CitationComponent`) are only used if you have a separate frontend consuming these endpoints.

---

## Install

```bash
npm install deepcitation express multer @types/multer
```

---

## File Structure

```
src/
├── server.ts          ← Express app with three routes
├── upload.ts          ← prepareAttachments()
├── chat.ts            ← wrapCitationPrompt() + your LLM call
└── verify.ts          ← getAllCitationsFromLlmOutput() + verifyAttachment()
```

---

## Setup

```typescript
// server.ts
import express from "express";
import multer from "multer";
import { DeepCitation } from "deepcitation";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

app.use(express.json());
```

---

## Route 1: Upload Document

```typescript
// POST /api/upload
app.post("/api/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file provided" });

  const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([
    { file: file.buffer, filename: file.originalname },
  ]);

  res.json({
    fileDataPart: fileDataParts[0],
    deepTextPromptPortion,
  });
});
```

---

## Route 2: Chat (Proxy Your LLM)

```typescript
import { wrapCitationPrompt } from "deepcitation";

// POST /api/chat
app.post("/api/chat", async (req, res) => {
  const { userMessage, deepTextPromptPortion } = req.body;

  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt: "You are a helpful assistant that provides cited responses.",
    userPrompt: userMessage,
    deepTextPromptPortion,
  });

  // Replace with your LLM provider (e.g. gpt-5-mini, gemini-2.0-flash-lite)
  const llmOutput = await callYourLLM(enhancedSystemPrompt, enhancedUserPrompt);

  res.json({ llmOutput });
});
```

---

## Route 3: Verify Citations

```typescript
import { getAllCitationsFromLlmOutput } from "deepcitation";

// POST /api/verify
app.post("/api/verify", async (req, res) => {
  const { llmOutput, attachmentId } = req.body;

  // Golden rule: CitationRecord is Record<string, Citation>, NOT an array
  const citations = getAllCitationsFromLlmOutput(llmOutput);
  const { verifications } = await dc.verifyAttachment(attachmentId, citations);

  res.json({ verifications });
});
```

---

## Golden Rules

1. **CitationRecord is an object**, not an array — `Record<string, Citation>`. Use `Object.keys(citations).length`, not `.length`.
2. **Always call `parseCitationResponse()`** before displaying LLM output to users — `.visibleText` strips `<<<CITATION_DATA>>>` markers.
3. **Never fabricate citation URLs** — only use URLs returned by the verification API.
4. **Keep your API key server-side** — never send it to the browser.

```typescript
import { parseCitationResponse } from "deepcitation";

// Before displaying to users:
const result = parseCitationResponse(llmOutput);
const cleanText = result.visibleText; // <<<CITATION_DATA>>> markers stripped
```

---

## Error Handling

DeepCitation errors extend `DeepCitationError` with `isRetryable` and `docUrl`:

```typescript
import { DeepCitationError } from "deepcitation";

app.post("/api/verify", async (req, res) => {
  try {
    const citations = getAllCitationsFromLlmOutput(req.body.llmOutput);
    const result = await dc.verifyAttachment(req.body.attachmentId, citations);
    res.json(result);
  } catch (err) {
    if (err instanceof DeepCitationError) {
      res.status(err.statusCode ?? 500).json({
        error: err.message,
        retryable: err.isRetryable,
        docs: err.docUrl,
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});
```

---

## Start the Server

```typescript
const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`DC API running on port ${PORT}`));
```

---

## Next Steps

- [API Reference]({{ site.baseurl }}/api-reference/) — full endpoint documentation
- [Error Handling]({{ site.baseurl }}/error-handling/) — all error codes and fix steps
- [Styling]({{ site.baseurl }}/styling/) — if you're building a React frontend to consume these endpoints
