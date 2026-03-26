---
layout: default
title: Claude Code Skill
nav_order: 8
description: "Set up the /verify skill to verify AI citations directly from Claude Code"
---

# Claude Code Skill

Use the `/verify` skill to verify AI citations against source documents directly from Claude Code — no app code required. It orchestrates the full DeepCitation pipeline and generates a branded interactive HTML report.

---

## Setup

### 1. Get an API key

Sign up at [deepcitation.com/keys](https://deepcitation.com/keys) and create a new API key.

### 2. Set the environment variable

Add your key to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export DEEPCITATION_API_KEY="dc_your_key_here"
```

Restart your terminal or run `source ~/.zshrc` for the change to take effect.

### 3. Install the SDK

The skill uses the `deepcitation` package to generate branded HTML reports:

```bash
npm install deepcitation
```

### 4. Install the skill

Open [claude.ai/customize/skills](https://claude.ai/customize/skills) and click **"Add Skill"**. Paste the raw URL:

```
https://raw.githubusercontent.com/DeepCitation/deepcitation/main/docs/skills/verify/SKILL.md
```

**Or** copy the skill file into your project manually:

```bash
mkdir -p .claude/skills/verify
curl -sL https://raw.githubusercontent.com/DeepCitation/deepcitation/main/docs/skills/verify/SKILL.md \
  -o .claude/skills/verify/SKILL.md
```

### 5. Verify it works

In any Claude Code conversation with a source document:

```
/verify my-report.pdf
```

---

## What it does

The `/verify` skill runs a 4-step pipeline:

1. **Prepare** — uploads your source files to the DeepCitation API, saves `attachmentId` and extracted text
2. **Generate** — Claude produces a cited response using the extracted text as context
3. **Verify** — sends citations to the API for verification against source documents
4. **Report** — generates a self-contained HTML report with:
   - Summary dashboard (verified / partial / not found counts)
   - Collapsible sections grouped by verification status
   - Evidence thumbnails showing where each citation was found
   - Interactive citation popovers
   - Light/dark theme support

The report opens in your browser automatically. All intermediate artifacts are saved in `.deepcitation/` for auditability.

---

## Output artifacts

| File | Contents |
|:-----|:---------|
| `.deepcitation/prepare-{source}.json` | Upload response with `attachmentId` |
| `.deepcitation/llm-output.txt` | Full response with citation markers |
| `.deepcitation/verify-response.json` | Verification results and evidence |
| `.deepcitation/report-{topic}-{timestamp}.html` | Branded interactive report |

---

## Troubleshooting

| Problem | Fix |
|:--------|:----|
| `DEEPCITATION_API_KEY not set` | Add `export DEEPCITATION_API_KEY="dc_..."` to your shell profile and restart terminal |
| `Cannot find module 'deepcitation'` | Run `npm install deepcitation` in your project |
| `/verify` not recognized | Re-add the skill at [claude.ai/customize/skills](https://claude.ai/customize/skills) |
| Report doesn't open | Check `.deepcitation/` for the HTML file and open it manually |

---

## Learn more

- [Getting Started]({{ site.baseurl }}/getting-started) — full SDK integration guide
- [API Reference]({{ site.baseurl }}/api-reference) — REST endpoints and TypeScript types
- [Verification Statuses]({{ site.baseurl }}/verification-statuses) — what each status means
- [Source code](https://github.com/DeepCitation/deepcitation/blob/main/docs/skills/verify/SKILL.md) — the skill file itself
