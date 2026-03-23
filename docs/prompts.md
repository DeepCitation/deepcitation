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
    {"id": 1, "reasoning": "...", "full_phrase": "...", "anchor_text": "...", "page_id": "...", "line_ids": [12]},
    {"id": 2, "reasoning": "...", "full_phrase": "...", "anchor_text": "...", "page_id": "...", "line_ids": [5]}
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
  deepTextPromptPortion,   // from prepareAttachments() — single string or string[]
  isAudioVideo: false,     // set true for audio/video content with timestamps
});
```

**What it does internally:**

1. Prepends full citation format instructions to your system prompt (high priority position)
2. Appends a brief citation reminder to the end of the system prompt (recency effect)
3. If `deepTextPromptPortion` is provided, prepends the file text to the user prompt with a reminder

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
attachment_id -> reasoning -> full_phrase -> anchor_text -> page_id -> line_ids
```

- `reasoning` comes first so the model articulates **why** before specifying **what**
- `full_phrase` comes before `anchor_text` so the model produces the complete verbatim quote first, then extracts the anchor — ensuring `anchor_text` is always a valid substring of `full_phrase`

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
  deepTextPromptPortion,
  isAudioVideo: true, // timestamps instead of page/line references
});
```

---

## Token-Saving Shorthand

The prompts tell the LLM that shorthand keys are accepted. This is optional — the LLM can use either form and the parser handles both:

| Full key | Shorthand | Example |
|:---------|:----------|:--------|
| `id` | `n` | `"n": 1` |
| `reasoning` | `r` | `"r": "states growth"` |
| `full_phrase` | `f` | `"f": "Revenue grew 45%"` |
| `anchor_text` | `k` | `"k": "45%"` |
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

## Next Steps

- [API Reference]({{ site.baseurl }}/api-reference/) — Full REST API documentation
- [Code Examples]({{ site.baseurl }}/code-examples/) — Integration patterns including prompt wrapping
- [Framework Guides]({{ site.baseurl }}/frameworks/) — LangChain, Next.js, Vercel AI SDK, Express
