---
layout: default
title: Prompts
parent: Getting Started
nav_order: 3
description: "How DeepCitation instructs LLMs to produce verifiable citations"
commit_sha: "2b04ace"
stale_after_commits: 20
watch_paths:
  - src/prompts/citationPrompts.ts
  - INTEGRATION.md
---

# Prompts

DeepCitation uses prompt wrapping to teach any LLM how to produce structured, verifiable citations. This page explains what happens inside `wrapCitationPrompt` and `wrapSystemCitationPrompt` — the interstitial between preparing your attachments and verifying citations.

---

## Where Prompts Fit in the Workflow

```
prepareAttachments()          wrapCitationPrompt()         yourLLM.chat()          verifyCitations()
       |                             |                          |                        |
  Extract text              Inject citation format         LLM produces [N]        Verify against
  from documents            instructions + file text       markers + JSON block    source documents
       |                             |                          |                        |
   Section 1.4 ──────────────> Section 2.1 ──────────────> Section 2.2 ──────────> Section 2.3
```

The prompt step bridges document preparation and LLM generation. Without it, the LLM has no instructions for how to format citations that DeepCitation can parse and verify.

---

## The Numeric JSON Pattern

DeepCitation uses a **Numeric JSON Pattern** where the LLM places lightweight `[N]` markers inline and outputs a structured JSON block at the end of the response.

### Why this pattern?

| Concern | How the pattern addresses it |
|:--------|:-----------------------------|
| **Streaming latency** | `[N]` markers are tiny — no mid-sentence pausing for hidden metadata |
| **Token efficiency** | ~40% fewer tokens per citation vs. inline XML/metadata approaches |
| **Robustness** | `JSON.parse` handles escaping naturally, avoiding quote-escaping issues |
| **Parseability** | Delimiters (`<<<CITATION_DATA>>>`) are unambiguous in any LLM output |

### What the LLM produces

```
The company reported strong growth [1]. Revenue increased in Q4 [2].

<<<CITATION_DATA>>>
{
  "abc123": [
    {"id": 1, "reasoning": "...", "source_context": "...", "source_match": "...", "page_id": "...", "line_ids": [12]},
    {"id": 2, "reasoning": "...", "source_context": "...", "source_match": "...", "page_id": "...", "line_ids": [5]}
  ]
}
<<<END_CITATION_DATA>>>
```

The JSON is grouped by `attachment_id` (the key returned from `prepareAttachments`), so multi-document responses stay organized.

---

## API

### `wrapCitationPrompt(options)`

The recommended function for most integrations. Wraps both the system and user prompts.

```typescript
import { wrapCitationPrompt } from "deepcitation";

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a helpful assistant.",
  userPrompt: "Summarize this document.",
  deepTextPages,           // from prepareAttachments() — raw page text (preferred)
  isAudioVideo: false,     // set true for audio/video content with timestamps
});
```

**What it does internally:**

1. Prepends full citation format instructions to your system prompt (high priority position)
2. Appends a brief citation reminder to the end of the system prompt (recency effect)
3. If `deepTextPages` is provided, renders the raw pages into prompt text and prepends that content to the user prompt with a reminder. For multi-file workflows, pass a map of `attachmentId -> page array` so each attachment stays explicit.

### Example output

After calling `wrapCitationPrompt()`, the `enhancedSystemPrompt` will contain your original system prompt with citation instructions prepended and a reminder appended:

```
<citation-instructions priority="critical">
## REQUIRED: Citation Format

### In-Text Markers
For every claim, value, or fact from attachments, place a sequential
integer marker like [1], [2], [3] at the end of the claim...

### Citation Data Block
At the END of your response, append a citation block. Group citations
by attachment_id to avoid repetition.

### Format
<<<CITATION_DATA>>>
{
  "attachment_id_here": [
    {"id": 1, "reasoning": "why", "source_context": "quote",
     "source_match": "key", "page_id": "page_number_2_index_1",
     "line_ids": [12]}
  ]
}
<<<END_CITATION_DATA>>>
...
</citation-instructions>

You are a helpful assistant.    ← your original system prompt

<citation-reminder>
Remember: use [N] markers for every claim and include the
<<<CITATION_DATA>>> block at the end.
</citation-reminder>
```

The `enhancedUserPrompt` will have the file text from `deepTextPages` prepended before your user message.

### `wrapSystemCitationPrompt(options)`

Wraps only the system prompt. Use this when you manage user prompt construction yourself.

```typescript
import { wrapSystemCitationPrompt } from "deepcitation";

const enhancedSystemPrompt = wrapSystemCitationPrompt({
  systemPrompt: "You are a helpful assistant.",
  isAudioVideo: false,
});
```

---

## Prompt Architecture

### Why wrap, not append?

The wrapping strategy places instructions at the **start** and a reminder at the **end** of the system prompt. This is intentional:

1. **Recency effect (RE2)** — LLMs exhibit recency bias where instructions closer to the end of the context window have stronger influence. The reminder at the end reinforces citation requirements right before generation begins.

2. **Priority positioning** — Prepending ensures citation instructions aren't lost in the middle of large system prompts, where they might be deprioritized.

### Chain-of-thought attribute ordering

The citation JSON fields are ordered to encourage the model to think step by step:

```
attachment_id -> reasoning -> source_context -> source_match -> page_id -> line_ids
```

- `reasoning` comes first so the model articulates **why** before specifying **what**
- `source_context` comes before `source_match` so the model produces the complete verbatim quote first, then extracts the anchor — ensuring `source_match` is always a valid substring of `source_context`

---

## Document vs. Audio/Video Citations

The SDK ships two prompt variants:

| Feature | Document (`CITATION_PROMPT`) | Audio/Video (`AV_CITATION_PROMPT`) |
|:--------|:-----------------------------|:-----------------------------------|
| Source locator | `page_id` + `line_ids` | `timestamps` (`start_time` / `end_time`) |
| Timestamp format | N/A | `HH:MM:SS.SSS` |
| Shorthand keys | `n`, `r`, `f`, `k`, `p`, `l` | `n`, `r`, `f`, `k`, `t` (with `s`, `e`) |
| Toggle | `isAudioVideo: false` (default) | `isAudioVideo: true` |

```typescript
// Audio/video example
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt,
  deepTextPages,
  isAudioVideo: true, // timestamps instead of page/line references
});
```

---

## Format Variants

Beyond the standard document and AV formats, the SDK exports two additional prompt variants for specialized pipelines.

### Compact format — latency-sensitive pipelines

The compact format omits `source_context` (the verbatim quote) and `reasoning` from LLM output entirely. These fields are reconstructed offline from the line IDs after verification. The savings are significant: **~80–135 fewer tokens per citation**.

Use the compact format when:
- You have many citations per response and token budget is tight
- You are running batch pipelines where latency matters more than per-citation explanation
- You will hydrate `source_context` automatically using `deepcitation verify --markdown`

```typescript
import { COMPACT_CITATION_PROMPT, wrapSystemCitationPrompt } from "deepcitation";

// Use the compact prompt directly
const systemPrompt = `${COMPACT_CITATION_PROMPT}\n\nYou are a helpful assistant.`;
```

**Compact LLM output** uses only four fields:

```json
{
  "attachment_id": [
    {"n": 1, "k": "cost of cooling", "p": "2_0", "l": [47]},
    {"n": 2, "k": "Board of Directors", "p": "1_0", "l": [12]}
  ]
}
```

The `source_context` is resolved from the `line_ids` during verification, so the citation still gets a highlighted quote in the popover — the LLM just doesn't have to write it out.

### Compact scenario-2 — annotating pre-existing text

`COMPACT_CITATION_SCENARIO2_PROMPT` is for when the user supplies pre-existing text (a report draft, a form, a summary) and you need to add citation markers to it without rewriting the prose.

Key differences from the standard compact prompt:
- **Text is frozen** — the LLM inserts `[N]` markers but does not rewrite or reorder
- **`k` comes from the source document**, not from the user's text (the user may have paraphrased)
- **High citation density** — every fact gets its own `[N]`

```typescript
import { COMPACT_CITATION_SCENARIO2_PROMPT } from "deepcitation";

// Pass to LLM alongside the user's existing text and the source document
const systemPrompt = `${COMPACT_CITATION_SCENARIO2_PROMPT}\n\nYou are a research assistant.`;
```

---

## Token-Saving Shorthand

The prompts tell the LLM that shorthand keys are accepted. This is optional — the LLM can use either form and the parser handles both:

| Full key | Shorthand | Example |
|:---------|:----------|:--------|
| `id` | `n` | `"n": 1` |
| `reasoning` | `r` | `"r": "states growth"` |
| `source_context` | `f` | `"f": "Revenue grew 45%"` |
| `source_match` | `k` | `"k": "45%"` |
| `page_id` | `p` | `"p": "page_number_2_index_1"` |
| `line_ids` | `l` | `"l": [12, 13]` |
| `timestamps` | `t` | `"t": {"s": "00:05:23.000", "e": "00:05:45.500"}` |

---

## Delimiters

The citation JSON block is wrapped in unambiguous delimiters:

```
<<<CITATION_DATA>>>
{ ... }
<<<END_CITATION_DATA>>>
```

These delimiters are exported as constants for advanced use cases:

```typescript
import { CITATION_DATA_START_DELIMITER, CITATION_DATA_END_DELIMITER } from "deepcitation";
```

{: .warning }
Users must **never** see the `<<<CITATION_DATA>>>` block. Always call `parseCitationResponse(llmOutput)` and use `.visibleText` before displaying LLM output. See [Golden Rules]({{ site.baseurl }}/frameworks/express/#golden-rules).

---

## Why Not Inline XML?

If you've seen citation systems that use inline XML tags (e.g., `<cite source="doc1" line="5">Revenue grew</cite>`), you may wonder why DeepCitation uses deferred JSON instead.

| Concern | Inline XML | Numeric JSON (DeepCitation) |
|:--------|:-----------|:----------------------------|
| **Streaming** | Tags interrupt mid-sentence — the UI must buffer until the closing tag | `[N]` markers are 3-4 characters; the UI renders immediately |
| **Token cost** | ~100+ tokens per citation (repeated attributes) | ~40% fewer tokens (metadata deferred to one block) |
| **Parsing** | Custom parser needed; must handle malformed/nested tags | `JSON.parse` handles escaping natively |
| **Robustness** | Quotes inside attributes cause escaping issues | JSON escaping is well-defined |

The tradeoff is that citation metadata isn't available until the response finishes streaming. In practice, this matches the UX — verification popovers aren't useful until the full response is visible.

---

## Next Steps

- [API Reference]({{ site.baseurl }}/api-reference/) — Full REST API documentation
- [Code Examples]({{ site.baseurl }}/code-examples/) — Integration patterns including prompt wrapping
- [Framework Guides]({{ site.baseurl }}/frameworks/) — LangChain, Next.js, Vercel AI SDK, Express
