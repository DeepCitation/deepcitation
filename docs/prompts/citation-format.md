# Citation Format Specification

This is the canonical spec for DeepCitation's citation format. Both the SDK prompt (`src/prompts/citationPrompts.ts`) and the `/verify` skill reference this file.

## In-Text Markers

For every claim, value, or fact from attachments, place a sequential integer marker like [1], [2], [3] at the end of the claim. Each distinct piece of information needs its own unique marker number.

## Citation Data Block

At the END of your response, append a citation block. Group citations by `attachmentId` to avoid repetition.

```
<<<CITATION_DATA>>>
{
  "ATTACHMENT_ID": [
    {"id": 1, "reasoning": "why", "fullPhrase": "quote", "anchorText": "key", "pageId": "page_number_2_index_1", "lineIds": [12]}
  ]
}
<<<END_CITATION_DATA>>>
```

## JSON Field Rules

1. **Group key**: The `attachmentId` (exact ID from source document)
2. **id**: Each citation MUST have a unique ID matching its [N] marker. Do NOT reuse the same ID for different citations.
3. **reasoning**: Brief explanation connecting the citation to your claim (think first!)
4. **fullPhrase**: Copy 1–2 sentences VERBATIM from source. Must be significantly longer than anchorText — it provides context. Use proper JSON escaping for quotes.
5. **anchorText**: The short, distinctive phrase from `fullPhrase` that gets highlighted in the evidence and shown as a clickable label. Usually 1–3 words (proper nouns, defined terms, verb phrases). Its job is to anchor WHERE to look — the popover shows WHAT it says. Must be a contiguous verbatim substring of `fullPhrase`.
6. **pageId**: Format `page_number_N_index_I` where N=page number, I=index. Copy exactly from `<page_number_N_index_I>` tags in the source.
7. **lineIds**: Array of line IDs from the source. Copy from `<line id="N">` tags in the text. Include IDs for all relevant lines. These are **sparse** — not every line is tagged. Use the nearest tagged line.

### Shorthand Keys (Optional)

To save tokens: `n`=id, `r`=reasoning, `f`=fullPhrase, `k`=anchorText, `p`=pageId, `l`=lineIds

## Placement Rules

- Place [N] markers **inline, right after the anchor phrase** — not at the end of the sentence
  - GOOD: `"The Discount Rate [2] is applied to the conversion price."`
  - BAD: `"The Discount Rate is applied to the conversion price. [2]"`
- Multiple facts in one sentence get separate inline markers
- One marker per distinct idea, concept, or value
- Use sequential numbering starting from [1] — each citation gets a unique number
- The JSON block MUST appear at the very end of your response

## Example

The company reported [45% year-over-year growth] [1]. Revenue [increased to $2.3 billion] [2] in Q4. The competitor reported [20% growth] [3].

```
<<<CITATION_DATA>>>
{
  "abc123": [
    {"id": 1, "reasoning": "directly states growth metrics", "fullPhrase": "The company achieved 45% year-over-year growth", "anchorText": "45% year-over-year growth", "pageId": "page_number_2_index_1", "lineIds": [12, 13]},
    {"id": 2, "reasoning": "states Q4 revenue figure", "fullPhrase": "Q4 revenue reached $2.3 billion, up from $1.8 billion", "anchorText": "$2.3 billion", "pageId": "page_number_3_index_2", "lineIds": [5, 6, 7]}
  ],
  "def456": [
    {"id": 3, "reasoning": "competitor data", "fullPhrase": "Competitor X reported 20% growth", "anchorText": "20% growth", "pageId": "page_number_1_index_0", "lineIds": [8]}
  ]
}
<<<END_CITATION_DATA>>>
```
