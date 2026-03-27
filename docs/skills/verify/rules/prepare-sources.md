# Prepare Sources

Upload **every** source file to the DeepCitation API. Every prepared file enables verification of the claims it backs — skipping a file means those claims go unverified.

The response JSON contains the `attachmentId` (needed for verify) and `deepTextPromptPortion` (extracted text with page/line metadata).

```bash
# Prepare a local file (PDF, image, DOCX, XLSX, PPTX, CSV, etc.)
npx -y deepcitation prepare source.pdf

# Prepare a URL (handles rendering + text extraction server-side)
npx -y deepcitation prepare https://example.com/article

# Custom output path
npx -y deepcitation prepare report.pdf --out .deepcitation/prepare-report.json
```

Output is saved to `.deepcitation/prepare-{name}.json` by default. URLs and Office files take ~30s to process vs <1s for images/PDFs.

## What to retain

**Save** each prepare response separately — retain both the `attachmentId` and `deepTextPromptPortion`. The `deepTextPromptPortion` is the **sole source of truth** for `lineIds` and `pageNumber` values — read it before building citations.

Always read the `deepTextPromptPortion` before building citations. Line IDs are **sparse** (not every line is tagged) — see [line-ids.md](./line-ids.md).

## Inaccessible sources

If a URL is inaccessible (DNS failure, 403, auth required), report it clearly and continue with available sources. Do not fabricate citations for sources you couldn't prepare.
