---
layout: default
title: Curl Guide
parent: Getting Started
nav_order: 1
description: "Direct API usage with curl examples"
---

# Curl Guide

Use curl for quick testing or when you prefer direct API calls without an SDK.

---

## 1. Upload a Document

Upload a PDF or image file to extract text for your LLM prompt:

```bash
# Upload a PDF file
curl -X POST "https://api.deepcitation.com/prepareAttachments" \
  -H "Authorization: Bearer dc_live_YOUR_API_KEY" \
  -F "file=@document.pdf"
```

For images (auto-OCR):

```bash
# Upload an image for OCR
curl -X POST "https://api.deepcitation.com/prepareAttachments" \
  -H "Authorization: Bearer dc_live_YOUR_API_KEY" \
  -F "file=@scanned-invoice.jpg"
```

---

## 2. Verify Citations

After your LLM generates a response, verify citations against the source:

```bash
# Verify citations
curl -X POST "https://api.deepcitation.com/verifyCitations" \
  -H "Authorization: Bearer dc_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "attachmentId": "YOUR_ATTACHMENT_ID",
      "citations": {
        "1": {
          "fullPhrase": "Revenue increased by 25%",
          "pageNumber": 1
        },
        "2": {
          "fullPhrase": "Operating costs decreased",
          "value": "costs decreased"
        }
      },
      "outputImageFormat": "avif"
    }
  }'
```

{: .note }
Store the `attachmentId` in your database alongside the file reference. This lets you verify citations against the same document later without re-uploading. Attachments are retained for 30 days.

---

## Full Workflow Script

Complete bash script for the entire DeepCitation workflow:

```bash
#!/bin/bash
# Full DeepCitation workflow with curl

API_KEY="dc_live_YOUR_API_KEY"
BASE_URL="https://api.deepcitation.com"

# Step 1: Upload file
echo "Uploading document..."
UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/prepareAttachments" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@document.pdf")

# Extract IDs from response
ATTACHMENT_ID=$(echo $UPLOAD_RESPONSE | jq -r '.attachmentId')
PROMPT_CONTENT=$(echo $UPLOAD_RESPONSE | jq -r '.deepTextPromptPortion')

echo "Attachment ID: $ATTACHMENT_ID"
echo "Prompt content ready for LLM"

# Step 2: [Your LLM call here - use $PROMPT_CONTENT in your prompt]
# LLM_RESPONSE=$(call_your_llm "$PROMPT_CONTENT")

# Step 3: Verify citations from LLM response
echo "Verifying citations..."
VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/verifyCitations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"attachmentId\": \"$ATTACHMENT_ID\",
      \"citations\": {
        \"1\": {
          \"fullPhrase\": \"exact quote from document\",
          \"pageNumber\": 1
        }
      },
      \"outputImageFormat\": \"avif\"
    }
  }")

# Check results
echo $VERIFY_RESPONSE | jq '.verifications'
```

---

## Parsing Responses with jq

Useful jq commands for processing API responses:

```bash
# Get just the status of each citation
curl -s ... | jq '.verifications | to_entries[] | {key: .key, status: .value.searchState.status}'

# Check if all citations were found
curl -s ... | jq '[.verifications[].searchState.status] | all(. == "found")'

# Extract verification images
curl -s ... | jq '.verifications | to_entries[] | {key: .key, image: .value.verificationImageBase64}'

# Get page numbers where citations were found
curl -s ... | jq '.verifications | to_entries[] | {key: .key, page: .value.pageNumber}'
```

---

## Quick Reference

| Item | Value |
|:-----|:------|
| **Base URL** | `https://api.deepcitation.com` |
| **Auth Header** | `Authorization: Bearer dc_live_xxx` |
| **Content-Type** | `application/json` (for verify) |
| **Endpoints** | `POST /prepareAttachments`, `POST /verifyCitations` |
| **File Types** | PDFs, Images, Office Docs, URLs |
| **Image Formats** | `avif` (default, smallest), `jpeg`, `png` |
| **File Retention** | 30 days |
