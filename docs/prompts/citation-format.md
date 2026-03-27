# Citation Format Specification

This is the canonical spec for DeepCitation's citation format. Both the SDK prompt (`src/prompts/citationPrompts.ts`) and the `/verify` skill reference this file.

## In-Text Markers

For every claim, value, or fact from attachments, place a sequential integer marker like [1], [2], [3] at the end of the claim. Each distinct piece of information needs its own unique marker number.

## Citation Data Block

At the END of your response, append a citation block. Group citations by `attachment_id` to avoid repetition.

```
<<<CITATION_DATA>>>
{
  "ATTACHMENT_ID": [
    {"id": 1, "reasoning": "why", "full_phrase": "quote", "anchor_text": "key", "page_id": "page_number_2_index_1", "line_ids": [12]}
  ]
}
<<<END_CITATION_DATA>>>
```

## JSON Field Rules

1. **Group key**: The `attachment_id` (exact ID from source document)
2. **id**: Each citation MUST have a unique ID matching its [N] marker. Do NOT reuse the same ID for different citations.
3. **reasoning**: Brief explanation connecting the citation to your claim (think first!)
4. **full_phrase**: Copy text VERBATIM from source. Use proper JSON escaping for quotes.
5. **anchor_text**: The 1-3 most important words from `full_phrase`
6. **page_id**: Format `page_number_N_index_I` where N=page number, I=index. Copy exactly from `<page_number_N_index_I>` tags in the source.
7. **line_ids**: Array of line IDs from the source. Copy from `<line id="N">` tags in the text. Include IDs for all relevant lines. These are **sparse** — not every line is tagged. Use the nearest tagged line.

### Shorthand Keys (Optional)

To save tokens: `n`=id, `r`=reasoning, `f`=full_phrase, `k`=anchor_text, `p`=page_id, `l`=line_ids

## Placement Rules

- Place [N] markers inline, typically at the end of a claim
- One marker per distinct idea, concept, or value
- Use sequential numbering starting from [1] — each citation gets a unique number
- The JSON block MUST appear at the very end of your response

## Example

The company reported strong growth [1]. Revenue increased significantly in Q4 [2]. The competitor also grew [3].

```
<<<CITATION_DATA>>>
{
  "abc123": [
    {"id": 1, "reasoning": "directly states growth metrics", "full_phrase": "The company achieved 45% year-over-year growth", "anchor_text": "45% year-over-year growth", "page_id": "page_number_2_index_1", "line_ids": [12, 13]},
    {"id": 2, "reasoning": "states Q4 revenue figure", "full_phrase": "Q4 revenue reached $2.3 billion, up from $1.8 billion", "anchor_text": "$2.3 billion", "page_id": "page_number_3_index_2", "line_ids": [5, 6, 7]}
  ],
  "def456": [
    {"id": 3, "reasoning": "competitor data", "full_phrase": "Competitor X reported 20% growth", "anchor_text": "20% growth", "page_id": "page_number_1_index_0", "line_ids": [8]}
  ]
}
<<<END_CITATION_DATA>>>
```
