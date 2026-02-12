# CI/CD Improvements: Smart Conditional Execution

## Overview

Updated `.github/workflows/ci.yml` to intelligently skip unnecessary checks based on commit message patterns and file changes. This reduces CI run time for documentation-only updates while maintaining full validation for code changes.

## Key Changes

### 1. **Commit Message Detection**
- Detects `docs:` prefix in commit messages (e.g., `docs: update README`)
- Also detects `chore: docs` pattern
- For PRs, checks both PR title and body

**Behavior:**
- **Docs-only commits on push**: Skips the entire CI job (no tests, lint, build)
- **Docs-only commits on PR**: Still runs CI (safer approach - ensures code quality for all PRs)
- **Code commits**: Runs full CI pipeline

### 2. **File Change Detection**
Tracks changes to critical files:
- `src/` directory
- `package.json`
- `tsconfig`
- `biome.json`
- `vite.config`

**Behavior:**
- If no critical files changed: Skips build, lint, and tests
- On PRs: Always assumes files might have changed (safer)
- On pushes: Only runs jobs if actual changes detected

### 3. **Conditional Step Execution**
Each step now has intelligent `if` conditions:

| Step | Runs When |
|------|-----------|
| **Auto-fix formatting & lint** | `src-changed && !docs-only` |
| **Lint & format check** | `src-changed && !docs-only` |
| **Build** | `src-changed` OR on PR |
| **Run tests** | `src-changed` OR on PR |

### 4. **Two-Job Architecture**

**Job 1: `check-changes`** (ubuntu-latest, fast)
- Analyzes commit message and file changes
- Outputs: `docs-only`, `src-changed` flags
- Runs first and feeds results to main CI job

**Job 2: `ci`** (blacksmith-4vcpu, expensive)
- Depends on `check-changes` results
- Only runs if needed
- Conditional steps save time within job

## Examples

### Example 1: Documentation Update
```
git commit -m "docs: improve API documentation"
git push origin main
```
**Result:** CI job skipped entirely (saves ~3-5 minutes)
- ✅ No unnecessary tests
- ✅ No lint/format checks
- ✅ No build overhead

### Example 2: Code Fix with Tests
```
git commit -m "fix: handle null citation references"
git push origin main
```
**Result:** Full CI runs
- ✅ Lint & format check
- ✅ Build verification
- ✅ Test suite
- ✅ Auto-fix any formatting issues

### Example 3: PR (any commit message)
```
git push origin feature-branch
gh pr create --title "Add citation component..."
```
**Result:** CI always runs
- ✅ Safe approach: ensures code quality for all PRs
- ✅ Even `docs:` prefixed PRs run full validation
- ✅ More reliable than skipping PRs entirely

## Technical Details

### Commit Message Extraction

**For pushes:**
```bash
COMMIT_MSG=$(git log -1 --pretty=%B)
```
Uses the full commit body for accuracy

**For PRs:**
```bash
COMMIT_MSG="${{ github.event.pull_request.title }} ${{ github.event.pull_request.body }}"
```
Checks both title and body (more flexible)

### File Detection Patterns

Uses regex to match:
- `^src/` - Any source file changes
- `package\.json` - Dependency changes
- `tsconfig|biome\.json|vite\.config` - Build config changes

### Output Flags

```yaml
outputs:
  docs-only: ${{ steps.check.outputs.docs-only }}    # "true" or "false"
  src-changed: ${{ steps.check.outputs.src-changed }}  # "true" or "false"
```

Used throughout the CI job with Bash-style conditionals:
```yaml
if: needs.check-changes.outputs.docs-only == 'false'
```

## Benefits

| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| Docs-only push | 5 min | Skipped | ~5 min |
| Docs-only PR | 5 min | 5 min | None (safe) |
| Code change | 5 min | 5 min | None (same) |
| Non-critical files | 5 min | 5 min | None (assumes changed) |

## Future Improvements

Consider these enhancements:

1. **Granular step skipping for PRs**
   - Could skip individual steps based on file changes even on PRs
   - Trade-off: less safe, but faster
   - Current approach: conservative (always validate PRs)

2. **Path-specific detection**
   - Only run React tests if `src/react/` changed
   - Only build CSS if `src/styles.css` changed
   - More complex but more precise

3. **Custom commit message conventions**
   - Support additional prefixes: `chore:`, `refactor:`, `ci:`
   - Extend to skip other workflows (e.g., Playwright tests)

4. **File path matrix**
   - Different jobs for different components
   - Parallel execution of independent tests
   - Useful as project grows

## Migration Notes

No changes needed to:
- Existing workflows
- Build scripts
- Package configuration

Just ensure commit messages follow conventional commit format:
- `docs: ...` for documentation
- `feat: ...` for features
- `fix: ...` for bug fixes
- `refactor: ...` for refactoring
- `chore: ...` for maintenance

Standard practices already in use! ✓
