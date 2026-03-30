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

## Automated Release (recommended)

The `release.yml` workflow handles version bumping, changelog generation, tagging, GitHub Release creation, and npm publish in one shot.

### Trigger via GitHub UI

1. Go to **Actions → Release → Run workflow**
2. Select the `main` branch
3. Choose the version bump: `patch`, `minor`, or `major`
4. Click **Run workflow**

### Trigger via CLI

```bash
gh workflow run release.yml -f version=patch   # or minor / major
```

### What it does

1. Checks out `main` and runs lint, test, and build
2. Bumps `package.json` version and updates `CHANGELOG.md`
3. Commits, tags, and pushes `chore: release vX.Y.Z`
4. Extracts the release notes from `CHANGELOG.md` (the changelog is the single source of truth — no auto-generated PR lists)
5. Creates a GitHub Release with the extracted changelog section as the body
6. Publishes to npm with provenance
7. Appends "Published to npm registry" to the release notes

### After the workflow completes

- [ ] **Verify on npm** — `npm view deepcitation version` returns the new version
- [ ] **Spot-check release notes** — the body should already be clean (pulled from CHANGELOG.md), but verify it rendered correctly

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

### Phase 3: Commit & Tag

- [ ] **Commit all changes** — stage `package.json`, `CHANGELOG.md`, and any updated docs. Message: `chore: release vX.Y.Z`.
- [ ] **Push to main** — ensure the release commit lands on `main` (direct push or merge PR).
- [ ] **Wait for CI** — the "CI" (`ci.yml`) and "Playwright Tests" (`playwright.yml`) workflows must pass on the main branch.

### Phase 4: GitHub Release

- [ ] **Create a GitHub Release** — tag `vX.Y.Z` (must match `package.json` version exactly).
  ```bash
  gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes
  ```
  Edit the body afterward if you want curated notes instead of the auto-generated list.
- [ ] **Mark as latest release** — must be **not** a pre-release and **not** a draft. Publishing triggers the `publish.yml` workflow automatically.

### Phase 5: Post-Release Verification

- [ ] **Monitor publish workflow** — watch `.github/workflows/publish.yml`. It will build, publish to npm with provenance, and append "Published to npm registry" to the release notes.
- [ ] **Verify on npm** — `npm view deepcitation version` returns the new version.
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
| Automated release | `gh workflow run release.yml -f version=patch` |
| Build | `bun run build` |
| Test | `bun test` |
| Lint | `bun run lint` |
| Size check | `bun run size` |
| Manual release | `gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes` |
| Verify npm | `npm view deepcitation version` |

## Notes

- The `publish.yml` workflow triggers on `release` events where `prerelease == false`. Creating a pre-release first and then promoting to a full release also works.
- The `prepublishOnly` script in `package.json` runs `npm run build` automatically, but the workflow builds with `bun run build` explicitly.
- npm provenance is enabled via `publishConfig.provenance: true` — the workflow needs `id-token: write` permission (already configured).
