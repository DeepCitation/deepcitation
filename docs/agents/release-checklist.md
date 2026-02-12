---
layout: default
title: Release Checklist
nav_exclude: true
search_exclude: true
---

# Release Checklist

Actionable checklist for preparing and publishing a release of `@deepcitation/deepcitation-js`. Copy into a GitHub issue or use in-place.

---

## Phase 1: Pre-Release Preparation

- [ ] **Decide version number** — patch / minor / major based on changes since last release. Follow [semver](https://semver.org/).
- [ ] **Review merged PRs** — scan PRs merged since the last release tag to ensure nothing is missed in the changelog.
- [ ] **Update `CHANGELOG.md`** — move items from `[Unreleased]` into a new `## [x.y.z] - YYYY-MM-DD` heading. Use [Keep a Changelog](https://keepachangelog.com/) format (Added, Changed, Fixed, Removed).
- [ ] **Bump `package.json` version** — set `"version"` to match the new release number.

## Phase 2: Documentation Updates

- [ ] **Review `README.md`** — update badges, installation instructions, feature tables, or examples if affected by this release.
- [ ] **Review `llms.txt`** — update if there are new exports, API changes, or significant features an LLM code-gen context should know about.
- [ ] **Review `AGENTS.md`** — update if there are new build commands, project structure changes, or code conventions.
- [ ] **Review `INTEGRATION.md`** — update if there are new API endpoints, workflow changes, or integration patterns.
- [ ] **Review `CLAUDE.md`** — update if there are new exports, component props, canonical locations, or API surface changes.
- [ ] **Review `docs/` site pages** — update affected pages (`components.md`, `api-reference.md`, `types.md`, `styling.md`, etc.) for any user-facing changes.

## Phase 3: Quality Checks

- [ ] **Build** — `bun run build` succeeds cleanly.
- [ ] **Tests** — `bun test` passes.
- [ ] **Lint** — `bun run lint` passes (Biome).
- [ ] **Bundle size** — `bun run size` confirms size limits are not exceeded.
- [ ] **Verify exports** — spot-check that any new exports are in both `package.json` exports map and `tsup.config.ts` entry points.

## Phase 4: Commit & Tag

- [ ] **Commit all changes** — stage `package.json`, `CHANGELOG.md`, and any updated docs. Message: `chore: release vX.Y.Z`.
- [ ] **Push to main** — ensure the release commit lands on `main` (direct push or merge PR).
- [ ] **Wait for CI** — `ci.yml` and `playwright.yml` workflows must pass on the main branch.

## Phase 5: GitHub Release

- [ ] **Create a GitHub Release** — tag `vX.Y.Z` (must match `package.json` version exactly).
  ```bash
  gh release create vX.Y.Z --title "vX.Y.Z" --notes "$(sed -n '/^## \[X.Y.Z\]/,/^## \[/{ /^## \[X.Y.Z\]/d; /^## \[/d; p; }' CHANGELOG.md)"
  ```
  Or create via the GitHub UI — paste the CHANGELOG entry as the body.
- [ ] **Mark as latest release** — must be marked as **not** a pre-release and **not** a draft. Publishing triggers the `publish.yml` workflow automatically.

## Phase 6: Post-Release Verification

- [ ] **Monitor publish workflow** — watch `.github/workflows/publish.yml`. It will build, publish to npm with provenance, and append "Published to npm registry" to the release notes.
- [ ] **Verify on npm** — `npm view @deepcitation/deepcitation-js version` returns the new version.
- [ ] **Test install** — `npm install @deepcitation/deepcitation-js@X.Y.Z` in a scratch directory to confirm the package works.
- [ ] **Update `[Unreleased]` comparison link** — at the bottom of `CHANGELOG.md`, update the comparison URL to `vX.Y.Z...HEAD`.

---

## Quick Reference

| Step | Command |
|------|---------|
| Build | `bun run build` |
| Test | `bun test` |
| Lint | `bun run lint` |
| Size check | `bun run size` |
| Create release | `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file notes.md` |
| Verify npm | `npm view @deepcitation/deepcitation-js version` |

## Notes

- The `publish.yml` workflow triggers on `release` events where `prerelease == false`. Creating a pre-release first and then marking it as a full release also works.
- The `prepublishOnly` script in `package.json` runs `npm run build` automatically, but the workflow builds with `bun run build` explicitly.
- npm provenance is enabled via `publishConfig.provenance: true` — the workflow needs `id-token: write` permission (already configured).
