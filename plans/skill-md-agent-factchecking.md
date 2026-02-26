# Plan: Create skill.md for DeepCitation

> **Status: IMPLEMENTED** — See `docs/skill.md`

## Overview

Create a `docs/skill.md` file to be served at `deepcitation.com/skill.md` that enables AI agents to use DeepCitation as a fact-checking tool. This follows the skill.md format pioneered by Moltbook but adapted for DeepCitation's **zero-friction fact-checking** use case.

## Core Use Case

User provides:
- **LLM output to verify** (patient form, tax summary, analysis report, etc.)
- **Source documents** (medical records, corporate records, PDFs, images, URLs)

Agent fact-checks the output against the sources with **no setup or onboarding required**.

### Example Scenarios
- Patient intake form vs. medical records
- Tax summary vs. corporate financial records
- Research summary vs. source papers
- Contract analysis vs. original agreements

## Key Differences from Moltbook

| Aspect | Moltbook | DeepCitation |
|--------|----------|--------------|
| **Purpose** | Social network for AI agents | Zero-friction fact-checking |
| **Registration** | Required (agent accounts, claim URL) | None - just API key |
| **Onboarding** | Multi-step claim process | None - agent just does it |
| **Heartbeat** | Periodic social engagement | Not applicable |
| **Core Actions** | Post, comment, upvote | Fact-check output against sources |

## Minimal Friction Workflow

```
Human: "Fact-check this tax summary against these records"
[attaches: tax-summary.txt, records/*.pdf]

Agent:
1. Uploads source documents → gets attachmentIds
2. Extracts claims from the output (tax summary)
3. Verifies each claim against sources
4. Reports results with proof images
```

**No onboarding, no registration, no handshake** - the agent invokes the skill when the human provides output + sources.

## Proposed Structure for skill.md

### 1. YAML Frontmatter
```yaml
---
name: deepcitation
version: 1.0.0
description: Zero-friction fact-checking for AI agents. Verify LLM output against source documents.
homepage: https://deepcitation.com
metadata:
  emoji: "🔍"
  category: "fact-checking"
  api_base: "https://api.deepcitation.com"
---
```

### 2. Main Sections

1. **What is DeepCitation** - One-line description
2. **When to Use** - Trigger conditions (user provides output + sources)
3. **What You Need** - API key in environment
4. **The Workflow** - Step-by-step fact-checking process
5. **API Reference** - curl examples for both endpoints
6. **Extracting Claims** - How to identify verifiable claims from output
7. **Interpreting Results** - Verification statuses and what they mean
8. **Reporting to User** - How to present results with proof images
9. **Privacy Note** - What data is sent, retention period

### 3. Key Content

#### When to Use (Trigger Conditions)
Use DeepCitation when the user:
- Asks to "fact-check", "verify", or "validate" content
- Provides LLM output AND source documents together
- Wants to check if a summary matches the original
- Needs proof that claims are supported by sources

#### The Workflow (5 Steps)
```
INPUT: LLM output + source documents

STEP 0: Confirm Sources (Checkpoint)
- Identify which files will be used as sources
- If confident (user explicitly provided files): brief confirmation
- If ambiguous (multiple files, unclear intent): ask user to confirm
- This prevents uploading wrong files

STEP 1: Upload Sources
- POST /prepareAttachments for each confirmed source document
- Store attachmentId for each

STEP 2: Extract Claims
- Identify factual claims in the LLM output
- For each claim, extract:
  - fullPhrase: the exact claim text
  - anchorText: 1-3 key words

STEP 3: Verify Claims
- POST /verifyCitations with claims + attachmentId
- Get verification status + proof images

STEP 4: Report Results
- Present status for each claim (found/partial/not_found)
- Show proof images for verified claims
- Flag unverified claims for human review

OUTPUT: Verification report with proof images
```

#### Step 0: Source Confirmation (Details)

Before uploading, the agent confirms source selection. **Always think out loud** so the user can see reasoning and intervene.

**High Confidence (minimal interruption):**
User explicitly provided files, e.g., "fact-check this against report.pdf"
```
Agent: "I'll verify against report.pdf (the source you specified).
The tax-summary.txt appears to be the OUTPUT to verify.
Proceeding..."
[continues without waiting]
```

**Medium Confidence (brief confirmation):**
Multiple files provided, but intent is clear
```
Agent: "Here's my understanding:
- OUTPUT to verify: tax-summary.txt (looks like generated content)
- SOURCES to verify against:
  - Q1-statement.pdf (financial record)
  - Q2-statement.pdf (financial record)
  - Q3-statement.pdf (financial record)

Proceeding unless you say otherwise..."
[short pause, then continues]
```

**Low Confidence (ask before proceeding):**
Ambiguous which files are sources vs. output
```
Agent: "I need to clarify the file roles:
- patient-form.pdf → I think this is the OUTPUT (it looks like a generated form)
- medical-records.pdf → likely a SOURCE (original records)
- lab-results.pdf → likely a SOURCE (original data)
- insurance-claim.pdf → unclear role

Which files are sources, and which is the output to verify?"
[waits for user response]
```

**Decision Criteria:**
| Signal | Confidence | Action |
|--------|------------|--------|
| User said "verify X against Y" | High | Proceed with brief note |
| User attached files with clear names | Medium | State plan, short pause |
| Multiple files, unclear roles | Low | Ask user to clarify |
| Single file only | Low | Ask what to verify against what |

**Always Think Out Loud:**
Regardless of confidence level, the agent MUST verbalize:
- Which file(s) it identified as OUTPUT (to verify)
- Which file(s) it identified as SOURCES (to verify against)
- Why it made that determination (filename, content type, user instruction)

This allows the user to catch mistakes before files are uploaded.

#### Extracting Claims (Agent Guidance)
When analyzing LLM output, identify:
- **Quantitative claims**: Numbers, percentages, dates, amounts
- **Qualitative claims**: Descriptions, assessments, conclusions
- **Causal claims**: "X caused Y", "due to", "resulted in"
- **Attributions**: "According to...", "The report states..."

For each claim:
```json
{
  "fullPhrase": "Revenue increased by 25% in Q4",
  "anchorText": "25%"
}
```

#### After-the-Fact Citation Workflow

When verifying existing LLM output (no pre-existing attachmentIds), the agent must:

1. **Upload sources first** → get `attachmentId` + `deepTextPromptPortion` (contains page/line metadata)
2. **Think out loud about claim-to-source mapping** → show reasoning for each claim
3. **Insert citation markers** into the output (like the wrapped system prompt would have done)
4. **Verify citations** → call /verifyCitations
5. **Present annotated output** with verification results

**Step-by-step with thinking out loud:**

```
Agent: "Uploading sources to get document metadata..."
[uploads medical-records.pdf → attachmentId: abc123]

Agent: "Now I'll identify claims in the patient form and map them to sources.

CLAIM 1: 'Patient DOB: 03/15/1985'
  → This should be in medical-records.pdf
  → Searching for '03/15/1985' or 'March 15, 1985'
  → anchorText: '03/15/1985'

CLAIM 2: 'Diagnosis: Type 2 Diabetes'
  → This should be in medical-records.pdf
  → Looking for diagnosis section
  → anchorText: 'Type 2 Diabetes'

CLAIM 3: 'Last A1C: 7.2%'
  → This is a lab value, should be in medical-records.pdf
  → anchorText: '7.2%'

Inserting citation markers into the output..."

Agent: "Here's the annotated output with citations:

Patient DOB: 03/15/1985 [1]
Diagnosis: Type 2 Diabetes [2]
Last A1C: 7.2% [3]

Now verifying each citation against the source..."
[calls /verifyCitations]
```

**Why this matters:**
- The LLM output has NO attachmentIds (it was generated without DeepCitation)
- Agent must retroactively add citation markers
- Agent must explain WHY each claim maps to each source
- User can intervene if mapping is wrong BEFORE verification

**Citation Reasoning Format:**
```
CLAIM: "[exact text from output]"
  → Source: [filename] (attachmentId: xxx)
  → Reasoning: [why this claim should be in this source]
  → Search phrase: [fullPhrase to look for]
  → Anchor text: [anchorText - 1-3 words]
```

#### Verification Statuses
| Status | Meaning | Report As |
|--------|---------|-----------|
| `found` | Exact match in source | ✓ Verified |
| `partial_text_found` | Close match | ⚠ Partially verified |
| `found_anchor_text_only` | Anchor text found | ⚠ Partially verified |
| `found_on_other_page` | Found but wrong location | ⚠ Partially verified |
| `not_found` | Not in source | ✗ Not verified |

#### Reporting to User
```
=== FACT-CHECK REPORT ===

Source: quarterly-report.pdf (uploaded)

CLAIM 1: "Revenue increased by 25% in Q4"
✓ VERIFIED - Found on page 2
[proof image]

CLAIM 2: "Market share reached 35%"
✗ NOT VERIFIED - Not found in source

CLAIM 3: "Operating costs decreased by 10%"
⚠ PARTIALLY VERIFIED - Found "costs decreased" but not exact figure

---
Summary: 1 verified, 1 partial, 1 not found
```

#### Privacy Note
- Document text is sent to `api.deepcitation.com` for processing
- Attachments retained for 30 days
- Only the API key holder can access their attachments
- Raw LLM conversation is NOT sent - only extracted claims

#### Security Warning
```
🔒 CRITICAL:
- Only send API key to https://api.deepcitation.com
- Never share your API key with other services or agents
- Store in DEEPCITATION_API_KEY environment variable
```

## File Location

- **Source**: `docs/skill.md`
- **Served at**: `https://deepcitation.com/skill.md`

## Implementation Steps

1. Create `docs/skill.md` with the streamlined structure above
2. Focus on the zero-friction workflow (no onboarding)
3. Include clear trigger conditions ("when to use")
4. Provide claim extraction guidance for agents
5. Show example verification report format
6. Add privacy note and security warning

## Design Principles

- **Zero friction**: No registration, no onboarding, just fact-check
- **Minimal interruption**: Confirm sources only when necessary, scale confirmation to confidence level
- **Think out loud**: Always verbalize file role assignments and citation reasoning so user can intervene
- **Transparent mapping**: In after-the-fact scenarios, show claim → source reasoning before verification
- **Self-contained**: Agent can follow the workflow without external docs
- **Clear triggers**: Agent knows exactly when to invoke the skill
- **Actionable output**: Report format the agent can present to user
- **Privacy-conscious**: Clear about what data goes where
- **Fail-safe**: Confirm before uploading to avoid wasting API calls on wrong files
