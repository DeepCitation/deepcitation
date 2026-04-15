---
layout: default
title: Release Checklist
nav_exclude: true
search_exclude: true
---

# Release Checklist

Actionable checklist for preparing and publishing a release of `deepcitation`.

There are two ways to release: **automated** (recommended) via the `release.yml` workflow, or **manual** via the CLI.

---

## Before You Trigger the Release

### Populate `[Unreleased]` in CHANGELOG.md

The `release.yml` workflow moves the content of `## [Unreleased]` into a new versioned section via `sed`. If `[Unreleased]` is empty, the release notes will be auto-generated from GitHub's PR list (unpolished). **Always populate `[Unreleased]` with curated entries before triggering.**

Rules:
- Write content under `## [Unreleased]` only — **do NOT add a version heading yourself** (the workflow stamps it).
- Use Keep a Changelog sections: Added, Changed, Fixed, Removed.
- Format each entry as `**Bold label** — benefit-focused description. (#PR)`.
- Verify: `git diff HEAD -- CHANGELOG.md` shows entries under `[Unreleased]`.

### Check the size-limit

Run `bun run size` locally before triggering. The main-entry limit is 90 kB (brotlied) because `renderVerifiedHtml` embeds the full CDN bundle as a string. If a new export adds a heavy transitive dep to `lib/index.js`, the limit must be updated in the `size-limit` section of `package.json`.

---

## Automated Release (recommended)

The `release.yml` workflow handles version bumping, changelog generation, tagging, and GitHub Release creation. npm publishing is handled by `publish.yml` (see below).

### Trigger via GitHub UI

1. Go to **Actions → Release → Run workflow**
2. Select the `main` branch
3. Choose the version bump: `patch`, `minor`, or `major`
4. Click **Run workflow**

### Trigger via CLI

```bash
gh workflow run release.yml -f version=patch   # or minor / major
```

### What release.yml does

1. Checks out `main` and runs lint, test, and build
2. Bumps `package.json` version and updates `CHANGELOG.md` (moves `[Unreleased]` content into a new `[X.Y.Z]` section)
3. Commits, tags, and pushes `chore: release vX.Y.Z`
4. Extracts the release notes from `CHANGELOG.md` (the changelog is the single source of truth — no auto-generated PR lists)
5. Creates a GitHub Release with the extracted changelog section as the body
6. Verifies `README.md` is present in the tarball

> **Note:** `release.yml` does NOT publish to npm. Publishing is delegated to `publish.yml`.

### After release.yml completes

The GitHub Release will be created. Then you must trigger `publish.yml` to publish to npm (see below).

---

## Publishing to npm (publish.yml)

npm publishing uses OIDC Trusted Publishers configured on npmjs.com. The OIDC is configured **for `publish.yml` only** — `release.yml` cannot publish directly.

### Auto-trigger (may not fire reliably)

`publish.yml` is configured to trigger on `release` events (`types: [released]`). Releases created programmatically by `release.yml` sometimes do not reliably trigger this. **Always verify manually.**

### Manual trigger (reliable — use this)

```bash
# 1. Get the release ID
gh api repos/DeepCitation/deepcitation/releases/tags/vX.Y.Z --jq '.id'

# 2. Trigger publish
gh workflow run publish.yml -f tag_name=vX.Y.Z -f release_id=<id>
```

### What publish.yml does

1. Checks out the release tag
2. Builds the package
3. Deletes `//registry.npmjs.org/:_authToken` from `.npmrc` (required before OIDC)
4. Publishes to npm with OIDC provenance
5. Appends "Published to npm registry" to the GitHub Release body

---

## Post-Release Verification

- [ ] **Verify on npm** — `npm view deepcitation version` returns the new version
- [ ] **Verify README on npm** — `npm view deepcitation readme | head -5` shows the README content (not empty). **If this returns nothing, the README was missing from `package.json` `files` — check that `README.md` is explicitly listed there.**
- [ ] **Spot-check release notes** — GitHub Release body should show the changelog sections and end with "✅ Published to npm registry"

---

## Manual Release

Use this if you need more control over the changelog or release notes.

### Phase 1: Pre-Release Preparation

- [ ] **Decide version number** — patch / minor / major based on changes since last release. Follow [semver](https://semver.org/).
- [ ] **Review merged PRs** — scan PRs merged since the last release tag to ensure nothing is missed in the changelog.
- [ ] **Update `CHANGELOG.md`** — move items from `[Unreleased]` into a new `## [x.y.z] - YYYY-MM-DD` heading. Use [Keep a Changelog](https://keepachangelog.com/) format (Added, Changed, Fixed, Removed).
- [ ] **Bump `package.json` version** — set `"version"` to match the new release number.

### Phase 2: Quality Checks

- [ ] **Lint** — `bun run lint` passes (Biome).
- [ ] **Tests** — `bun test` passes.
- [ ] **Build** — `bun run build` succeeds cleanly.
- [ ] **Bundle size** — `bun run size` confirms size limits are not exceeded.
- [ ] **README in `files`** — `cat package.json | grep -A20 '"files"' | grep README` confirms `README.md` is listed in the `package.json` `files` array. This is the root cause of the "README missing on npm" incident — when `files` is set, npm only ships what is explicitly listed.
- [ ] **Dry-run tarball** — `npm pack --dry-run 2>&1 | grep README` confirms README.md appears in the packed output. **This must return a result — if it returns nothing, stop and fix `package.json` `files` before continuing.**

### Phase 3: Commit & Tag

- [ ] **Commit all changes** — stage `package.json`, `CHANGELOG.md`, and any updated docs. Message: `chore: release vX.Y.Z`.
- [ ] **Push to main** — ensure the release commit lands on `main` (direct push or merge PR).
- [ ] **Wait for CI** — the "CI" (`ci.yml`) and "Playwright Tests" (`playwright.yml`) workflows must pass on the main branch.

### Phase 4: GitHub Release

- [ ] **Create a GitHub Release** — tag `vX.Y.Z` (must match `package.json` version exactly).
  ```bash
  gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes
  ```
  Edit the body afterward with curated notes from `CHANGELOG.md`.
- [ ] **Mark as latest release** — must be **not** a pre-release and **not** a draft. This triggers the `publish.yml` workflow automatically (or trigger manually — see above).

### Phase 5: Post-Release Verification

- [ ] **Monitor publish workflow** — watch `.github/workflows/publish.yml`. It will build, publish to npm with provenance, and append "Published to npm registry" to the release notes.
- [ ] **Verify on npm** — `npm view deepcitation version` returns the new version.
- [ ] **Verify README on npm** — `npm view deepcitation readme | head -5` shows the README content. Check https://www.npmjs.com/package/deepcitation renders it within a few minutes.
- [ ] **Test install** — in a scratch directory, install and verify imports work:
  ```bash
  mkdir /tmp/test-release && cd /tmp/test-release
  echo '{"type":"module"}' > package.json
  npm install deepcitation@X.Y.Z
  node --eval "import('deepcitation').then(m => console.log('OK:', Object.keys(m).length, 'exports'))"
  ```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Trigger automated release | `gh workflow run release.yml -f version=patch` |
| Get release ID | `gh api repos/DeepCitation/deepcitation/releases/tags/vX.Y.Z --jq '.id'` |
| Trigger npm publish | `gh workflow run publish.yml -f tag_name=vX.Y.Z -f release_id=<id>` |
| Build | `bun run build` |
| Test | `bun test` |
| Lint | `bun run lint` |
| Size check | `bun run size` |
| Manual GitHub release | `gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes` |
| Verify npm | `npm view deepcitation version` |

---

## Notes

### npm OIDC Trusted Publishing

The package uses npm Trusted Publishers (configured on npmjs.com) with "disallow tokens" — no `NPM_TOKEN` secret is needed. The workflow authenticates via OIDC. Key details:

- **OIDC is configured for `publish.yml` only.** `release.yml` cannot publish via OIDC — it creates the GitHub Release and stops. This is by design.
- **`NODE_AUTH_TOKEN` must be cleared before publishing.** `setup-node` injects the GitHub token as `NODE_AUTH_TOKEN` into `$GITHUB_ENV`, which gets written into `.npmrc` as `_authToken`. `publish.yml` runs `npm config delete "//registry.npmjs.org/:_authToken"` to remove it before publishing — otherwise npm uses the GitHub token (which is not a valid npm token) instead of OIDC.
- **Broken bundled npm workaround.** Node 22.22.2 (and potentially future Node releases) ships with a bundled npm that fails with `MODULE_NOT_FOUND: promise-retry`. Both `release.yml` and `publish.yml` bootstrap npm via curl+tar instead of `npm install -g npm@latest` to avoid this. The bootstrap deletes the old npm dir first (overlaying without deleting causes `Class extends value undefined` errors from stale files).
- **`gh run rerun` uses the release tag's workflow, not `main`.** If `publish.yml` fails and you push a fix to `main`, `gh run rerun` will NOT pick it up — it replays the workflow at the original release commit. Use `gh workflow run publish.yml -f tag_name=vX.Y.Z -f release_id=<id>` to trigger a fresh run from the latest `main`.

To get the numeric release ID: `gh api repos/DeepCitation/deepcitation/releases/tags/vX.Y.Z --jq '.id'`

### Bundle size and the main entry

The `lib/index.js` size-limit is 90 kB (brotlied). This is larger than it looks because `renderVerifiedHtml` (exported from the main entry) chains through `markdownToHtml` → `_generated_cdn.ts`, which embeds the full CDN bundle (~74 kB brotlied) as a string literal. If the CDN bundle grows significantly, the main-entry limit must be updated to match.

### `publish.yml` and the `prepublishOnly` build

`publish.yml` checks out the release tag and runs `npm publish`, which triggers the `prepublishOnly` script (`npm run build`). This means the package is rebuilt from source at the tagged commit, not from the build artifacts produced by `release.yml`. Both builds should be identical for the same source, but this adds ~45 seconds to the publish workflow.
