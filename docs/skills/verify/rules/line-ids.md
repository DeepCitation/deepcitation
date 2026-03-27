# Line IDs and Page Numbers

`lineIds` and `pageNumber` come from the `deepTextPromptPortion` returned by the prepare step.

## How line IDs work

The `deepTextPromptPortion` uses `<line id="N">` tags to mark lines. These IDs are **sparse and non-sequential** because the API uses them to handle columns, tables, and non-linear text layouts. You can count lines between tagged IDs, but always use our `<line id="N">` values — do not invent your own IDs.

## Example

```
<page_number_1_index_0>
<line id="1">Company Overview</line>
Founded in 2015 as a healthcare technology startup   ← untagged
Headquarters: San Francisco, CA                      ← untagged
<line id="4">Total employees: 1,200</line>
...
<page_number_2_index_1>
<line id="20">Revenue grew 45% year-over-year to $2.3B</line>
Operating margin improved to 18.5%                   ← untagged
<line id="22">Net income: $415M, up from $290M</line>
```

For "Founded in 2015": between `<line id="1">` and `<line id="4">`. Use the nearest tagged line — `lineIds: [1]` or `[4]`.

For "Operating margin improved to 18.5%": between `<line id="20">` and `<line id="22">`. Use `lineIds: [20]` or `[22]`.

## How to find the right lineId

1. Read the `deepTextPromptPortion` from `.deepcitation/prepare-*.json`
2. Search for your citation text
3. Use the nearest `<line id="N">` tag. If the text spans multiple tagged lines, include all of them.
4. For `pageNumber`, use N from the enclosing `<page_number_N_index_I>` tag (use N, not I)

## Why this matters

The line IDs encode spatial position (columns, tables). Providing an incorrect ID causes the API to fall back to page-level search, resulting in `partial_text_found` instead of `found`.
