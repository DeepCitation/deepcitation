---
layout: default
title: Python / FastAPI
parent: Frameworks
nav_order: 5
description: "Using the DeepCitation REST API from Python"
commit_sha: "80dfecd"
stale_after_commits: 20
watch_paths:
  - src/client/DeepCitation.ts
---

# DeepCitation + Python

DeepCitation doesn't have a Python SDK yet, but the REST API works with any HTTP client. This guide shows the full workflow using `httpx` (or `requests`).

---

## Install

```bash
pip install httpx python-dotenv
```

---

## Full Workflow

```python
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ["DEEPCITATION_API_KEY"]
BASE_URL = "https://api.deepcitation.com"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}


# 1. Upload a document
def prepare_attachment(file_path: str) -> dict:
    with open(file_path, "rb") as f:
        response = httpx.post(
            f"{BASE_URL}/prepareAttachments",
            headers=HEADERS,
            files={"file": (os.path.basename(file_path), f)},
            timeout=60.0,
        )
    response.raise_for_status()
    return response.json()


# 2. Verify citations
def verify_citations(attachment_id: str, citations: dict) -> dict:
    response = httpx.post(
        f"{BASE_URL}/verifyCitations",
        headers={**HEADERS, "Content-Type": "application/json"},
        json={
            "data": {
                "attachmentId": attachment_id,
                "citations": citations,
                "outputImageFormat": "avif",
            }
        },
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()


# Usage
result = prepare_attachment("report.pdf")
attachment_id = result["attachmentId"]
deep_text = result["deepTextPromptPortion"]

# ... call your LLM with deep_text injected into the prompt ...
# ... parse the <<<CITATION_DATA>>> block from the LLM response ...

verifications = verify_citations(attachment_id, parsed_citations)
for key, v in verifications["verifications"].items():
    status = v.get("searchState", {}).get("status", "unknown")
    print(f"Citation {key}: {status}")
```

---

## Prepare a URL

```python
def prepare_url(url: str) -> dict:
    response = httpx.post(
        f"{BASE_URL}/prepareAttachments",
        headers={**HEADERS, "Content-Type": "application/json"},
        json={"url": url},
        timeout=60.0,
    )
    response.raise_for_status()
    return response.json()
```

---

## FastAPI Route Handlers

```python
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
import httpx

app = FastAPI()

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/prepareAttachments",
            headers=HEADERS,
            files={"file": (file.filename, await file.read(), file.content_type)},
            timeout=60.0,
        )
    response.raise_for_status()
    return response.json()


class VerifyRequest(BaseModel):
    attachment_id: str
    citations: dict


@app.post("/verify")
async def verify(request: VerifyRequest):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/verifyCitations",
            headers={**HEADERS, "Content-Type": "application/json"},
            json={
                "data": {
                    "attachmentId": request.attachment_id,
                    "citations": request.citations,
                }
            },
            timeout=30.0,
        )
    response.raise_for_status()
    return response.json()
```

---

## Parsing the Citation Block

The LLM outputs citations in a `<<<CITATION_DATA>>>` block. Here's a minimal parser:

```python
import json
import re

def parse_citations(llm_output: str) -> dict:
    """Extract citations from the <<<CITATION_DATA>>> block."""
    match = re.search(
        r"<<<CITATION_DATA>>>\s*(.*?)\s*<<<END_CITATION_DATA>>>",
        llm_output,
        re.DOTALL,
    )
    if not match:
        return {}

    data = json.loads(match.group(1))
    citations = {}
    for attachment_id, items in data.items():
        for item in items:
            # LLMs may use shorthand keys (n, f, k, p, l) to save tokens
            cid = item.get("id") or item.get("n")
            citations[f"{attachment_id}_{cid}"] = {
                "fullPhrase": item.get("full_phrase") or item.get("f", ""),
                "anchorText": item.get("anchor_text") or item.get("k", ""),
                "pageId": item.get("page_id") or item.get("p", ""),
                "lineIds": item.get("line_ids") or item.get("l", []),
            }
    return citations


def strip_citation_block(llm_output: str) -> str:
    """Remove the citation block to get user-visible text."""
    return re.sub(
        r"\s*<<<CITATION_DATA>>>.*?<<<END_CITATION_DATA>>>\s*",
        "",
        llm_output,
        flags=re.DOTALL,
    ).strip()
```

---

## Error Handling

```python
def handle_dc_error(response: httpx.Response):
    if response.status_code == 401:
        raise Exception("Invalid API key — check DEEPCITATION_API_KEY")
    elif response.status_code == 429:
        raise Exception("Billing limit exceeded — add a payment method")
    elif response.status_code == 413:
        raise Exception("File too large — max 100 MB")
    elif response.status_code >= 500:
        raise Exception(f"Server error ({response.status_code}) — safe to retry")
    else:
        response.raise_for_status()
```

---

## Response Shape

{: .note }
The REST API returns `searchState.status` (e.g., `"found"`, `"not_found"`). If you later migrate to the TypeScript SDK, the status is normalized to `verification.status`. See [Verification Statuses]({{ site.baseurl }}/verification-statuses/) for all possible values.

---

## Next Steps

- [API Reference]({{ site.baseurl }}/api-reference/) — Full REST endpoint documentation
- [Curl Guide]({{ site.baseurl }}/curl-guide/) — Direct API usage examples
- [Verification Statuses]({{ site.baseurl }}/verification-statuses/) — Understanding verification results
