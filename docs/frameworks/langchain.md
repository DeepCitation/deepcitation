---
layout: default
title: LangChain
parent: Frameworks
nav_order: 1
description: "DeepCitation + LangChain: citation verification in your RAG pipeline"
commit_sha: "cc9c7aa"
stale_after_commits: 20
watch_paths:
  - src/index.ts
  - src/client/DeepCitation.ts
  - src/prompts/citationPrompts.ts
---

# DeepCitation + LangChain

Add verifiable citations to any LangChain RAG pipeline. DeepCitation fits as a pre/post step around your existing chain — no restructuring required.

{: .note }
**Target use case:** Backend RAG pipelines (legal, medical, financial AI) where you need deterministic citation verification, not just retrieval similarity scores.

---

## How DC Fits Into a LangChain Pipeline

In a typical LangChain pipeline you load documents, retrieve relevant chunks, and pass context to an LLM. DeepCitation replaces the context-injection step with its own document processing, then verifies the LLM's citations after generation:

```
Standard LangChain:        Load → Retrieve → Prompt → LLM → Output
With DeepCitation:   Load ──────────────────────── DC prepares → Prompt → LLM → Output → DC verifies
```

**Key difference from retrieval:** LangChain retrieval returns chunks by similarity. DeepCitation processes the entire source document with internal line IDs, then verifies that the LLM's citations point to real text at that exact location. You get a proof image, not just a similarity score.

---

## Prerequisites

```bash
npm install deepcitation langchain @langchain/openai
```

```bash
# .env
DEEPCITATION_API_KEY=dc_live_your_key
OPENAI_API_KEY=sk-your-key
```

---

## Complete Pipeline Example

This is a self-contained, runnable pipeline. It loads a PDF, prepares it for citation, runs a LangChain chat model, and verifies the output.

```typescript
import { readFileSync } from "node:fs";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
} from "deepcitation";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

async function answerWithCitations(pdfPath: string, question: string) {
  // 1. Read the source document as a Buffer
  //    DC needs the raw file to extract text with internal line IDs.
  //    LangChain Document objects (from loaders) don't contain this —
  //    you must pass the original file.
  const fileBuffer = readFileSync(pdfPath);

  // 2. Upload to DeepCitation
  //    Returns deepTextPromptPortion: the document content formatted for
  //    citation-aware prompting, and fileDataParts for verification.
  const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([
    { file: fileBuffer, filename: pdfPath.split("/").pop()! },
  ]);

  // 3. Wrap your prompts with citation instructions
  //    This injects the document content + citation format rules into the prompt.
  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt:
      "You are a precise research assistant. Answer questions based only on the provided documents.",
    userPrompt: question,
    deepTextPromptPortion,
  });

  // 4. Call your LangChain model — no special DC integration needed here
  const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });

  const response = await model.invoke([
    new SystemMessage(enhancedSystemPrompt),
    new HumanMessage(enhancedUserPrompt),
  ]);

  const llmOutput = response.content as string;

  // 5. Extract and verify citations
  //    getAllCitationsFromLlmOutput parses <cite> tags from the LLM response.
  //    verifyAttachment checks each citation against the source document.
  const citations = getAllCitationsFromLlmOutput(llmOutput);
  const citationCount = Object.keys(citations).length;

  if (citationCount === 0) {
    return { llmOutput, citations: {}, verifications: {} };
  }

  const { verifications } = await dc.verifyAttachment(
    fileDataParts[0].attachmentId,
    citations,
    { outputImageFormat: "webp" },
  );

  return { llmOutput, citations, verifications };
}

// Usage
const result = await answerWithCitations(
  "./contracts/service-agreement.pdf",
  "What are the termination conditions?",
);

console.log(result.llmOutput);

for (const [key, verification] of Object.entries(result.verifications)) {
  const status = verification.searchState?.status;
  console.log(`[${key}] status=${status}`);

  if (verification.verificationImageBase64) {
    // Save or serve the visual proof image
    console.log(`  proof image available (${verification.verificationImageBase64.length} bytes)`);
  }
}
```

---

## RunnableSequence Integration

If you're building a reusable chain, wrap the DC steps around a `RunnableSequence`. The pre-step (document preparation) runs before the chain and passes attachment context through the chain's input.

```typescript
import { RunnableSequence, RunnableLambda } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
  type CitationRecord,
  type VerificationRecord,
} from "deepcitation";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

interface PipelineInput {
  question: string;
  // Passed in from the pre-step (document preparation)
  deepTextPromptPortion: string;
  attachmentId: string;
}

interface PipelineOutput {
  answer: string;
  citations: CitationRecord;
  verifications: VerificationRecord;
}

// The inner chain handles prompt formatting + LLM call
const citationChain = RunnableSequence.from([
  // Enhance the prompt with citation instructions
  new RunnableLambda({
    func: (input: PipelineInput) => {
      const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
        systemPrompt:
          "You are a precise research assistant. Cite sources for every factual claim.",
        userPrompt: input.question,
        deepTextPromptPortion: input.deepTextPromptPortion,
      });
      return {
        system: enhancedSystemPrompt,
        human: enhancedUserPrompt,
        attachmentId: input.attachmentId,
      };
    },
  }),
  // Call the model
  ChatPromptTemplate.fromMessages([
    ["system", "{system}"],
    ["human", "{human}"],
  ]),
  new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 }),
  new StringOutputParser(),
]);

// Full pipeline: prepare → chain → verify
async function runCitationPipeline(
  fileBuffer: Buffer,
  filename: string,
  question: string,
): Promise<PipelineOutput> {
  // Pre-step: prepare DC attachment (runs before the chain)
  const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([
    { file: fileBuffer, filename },
  ]);

  const attachmentId = fileDataParts[0].attachmentId;

  // Run the inner chain
  const answer = await citationChain.invoke({
    question,
    deepTextPromptPortion,
    attachmentId,
  });

  // Post-step: verify citations (runs after the chain)
  const citations = getAllCitationsFromLlmOutput(answer);
  const citationCount = Object.keys(citations).length;

  if (citationCount === 0) {
    return { answer, citations: {}, verifications: {} };
  }

  const { verifications } = await dc.verifyAttachment(attachmentId, citations);

  return { answer, citations, verifications };
}
```

---

## LangChain Documents vs. DeepCitation Attachments

| | LangChain `Document` | DeepCitation attachment |
|:--|:--|:--|
| Created by | `DocumentLoader` | `dc.prepareAttachments()` |
| Contents | `pageContent` (text chunks), `metadata` | Processed text with internal line IDs |
| Used for | Retrieval, embedding, context injection | Citation verification against exact source positions |
| Citation verification | Not supported | Yes — exact text + visual proof |

**Can you pass LangChain `Document` objects directly to DeepCitation?** No. DC needs the raw source file to extract its internal line ID structure. LangChain's document objects contain already-parsed text without the positional metadata DC requires.

**Can you use both in the same pipeline?** Yes. Use LangChain's retriever to find relevant documents, then load those specific files as Buffers and pass to `dc.prepareAttachments()`. The DC-processed documents replace the retrieval context for citation-verified answers.

---

## Multiple Documents

Pass multiple files to `prepareAttachments` in a single call. DeepCitation combines them into one `deepTextPromptPortion` string:

```typescript
import { groupCitationsByAttachmentId } from "deepcitation";

const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([
  { file: contractBuffer, filename: "contract.pdf" },
  { file: invoiceBuffer, filename: "invoice.pdf" },
]);

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a document analyst. Cite sources for every claim.",
  userPrompt: "What are the total costs and payment terms?",
  deepTextPromptPortion, // Both documents combined
});

const model = new ChatOpenAI({ model: "gpt-4o-mini" });
const response = await model.invoke([
  new SystemMessage(enhancedSystemPrompt),
  new HumanMessage(enhancedUserPrompt),
]);

const citations = getAllCitationsFromLlmOutput(response.content as string);

// Citations from multiple docs — verify each attachment separately
const citationsByAttachment = groupCitationsByAttachmentId(citations);

const verificationResults = await Promise.all(
  Array.from(citationsByAttachment.entries()).map(([attachmentId, attachmentCitations]) =>
    dc.verifyAttachment(attachmentId, attachmentCitations),
  ),
);
```

---

## Streaming with LangChain

LangChain supports streaming via `.stream()`. Citation verification requires the **complete** LLM output — collect the stream first, then verify:

```typescript
import { concat } from "@langchain/core/utils/stream";

const model = new ChatOpenAI({ model: "gpt-4o-mini", streaming: true });

// Stream and collect
const stream = await model.stream([
  new SystemMessage(enhancedSystemPrompt),
  new HumanMessage(enhancedUserPrompt),
]);

let gathered;
for await (const chunk of stream) {
  // Forward chunk to your client while collecting
  process.stdout.write(chunk.content as string);
  gathered = gathered !== undefined ? concat(gathered, chunk) : chunk;
}

const llmOutput = gathered!.content as string;

// Now verify the complete output
const citations = getAllCitationsFromLlmOutput(llmOutput);
const { verifications } = await dc.verifyAttachment(attachmentId, citations);
```

---

## Next Steps

- [Next.js App Router guide]({{ site.baseurl }}/frameworks/nextjs) — server/client boundary patterns for React
- [API Reference]({{ site.baseurl }}/api-reference) — full `prepareAttachments` and `verifyAttachment` options
- [Verification Statuses]({{ site.baseurl }}/verification-statuses) — understanding `isVerified`, `isMiss`, `isPartialMatch`
