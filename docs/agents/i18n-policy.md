# i18n Policy

Open this file when adding user-facing text, aria-labels, or status messages to DeepCitation React components.

## Core Rule

**No hardcoded user-facing strings or aria-labels in React components.** All text visible to users or screen readers must use i18n keys via the `t()` translator function.

```tsx
// WRONG — hardcoded string
<span>Verified</span>                    // ❌
<div aria-label="Close">...</div>        // ❌

// CORRECT — i18n key
<span>{t("status.verified")}</span>      // ✓
<div aria-label={t("action.close")}>     // ✓
```

## How to Add a New String

1. **Add the key** to `defaultMessages` in `src/react/i18n.tsx` (canonical location).
2. **Add translations** to all locale files in `src/react/locales/` (currently: `es.ts`, `fr.ts`, `vi.ts`).
3. **Use `t("key")`** in the component.

The test `src/__tests__/i18nLocales.test.ts` enforces that every key in `defaultMessages` appears in all locale files. CI will fail if a locale is missing a key.

## Usage Patterns

### React components

```tsx
import { useTranslation } from "../i18n.js";

function MyComponent() {
  const t = useTranslation();
  return <span>{t("status.verified")}</span>;
}
```

### Interpolation

```tsx
t("message.foundOnOtherPage", { actualPage: 5, expectedPage: 3 })
// → "Found on p. 5 (expected p. 3)"
```

Template strings use `{placeholder}` syntax in the message dictionary.

### Pluralization

```tsx
import { tPlural } from "../i18n.js";

tPlural(t, "outcome.scanComplete", count, { count })
// count=1 → "Scan complete · 1 search"
// count=4 → "Scan complete · 4 searches"
```

Plural keys use `_one` / `_other` suffixed variants in the dictionary.

### Non-React contexts (tests, SSR, utilities)

Accept a `t` parameter with a default:

```typescript
import { type TranslateFunction, defaultTranslator } from "../i18n.js";

function formatLabel(status: string, t: TranslateFunction = defaultTranslator): string {
  return t("status.verified");
}
```

## Key Naming Convention

Keys use dot-separated namespaces:

| Namespace | Purpose | Examples |
|-----------|---------|----------|
| `status.*` | Verification status labels | `status.verified`, `status.notFound` |
| `outcome.*` | Outcome descriptions | `outcome.exactMatch`, `outcome.scanComplete_one` |
| `aria.*` | Accessibility labels | `aria.citation`, `aria.closePageView` |
| `action.*` | Button / action labels | `action.close`, `action.expandFullPage` |
| `message.*` | Contextual status messages | `message.exactMatch`, `message.notFound` |
| `popover.*` | Popover loading messages | `popover.searching` |
| `drawer.*` | Drawer / source labels | `drawer.citations`, `drawer.close` |
| `zoom.*` | Zoom control labels | `zoom.in`, `zoom.out` |
| `search.*` | Search method display names | `search.method.exactLineMatch` |
| `urlAccess.*` | URL access explanations | `urlAccess.paywall.title` |
| `urlStatus.*` | URL status labels | `urlStatus.verified` |

## Locale Coverage

Every key in `defaultMessages` must exist in **all** locale files under `src/react/locales/`. This is enforced by the test suite:

```
src/__tests__/i18nLocales.test.ts
```

When adding a new locale file, also add it to this test's `locales` array.

## Code Review Checklist

When reviewing PRs that touch React components, verify:

- [ ] No hardcoded user-facing strings (check JSX text content and string props like `aria-label`, `title`, `placeholder`)
- [ ] New strings have keys added to `defaultMessages` in `src/react/i18n.tsx`
- [ ] All locale files in `src/react/locales/` updated with the new keys
- [ ] Keys follow the dot-separated namespace convention
- [ ] Plurals use `_one` / `_other` suffixes with `tPlural()`
- [ ] Non-React code accepts `t: TranslateFunction = defaultTranslator` rather than importing `defaultMessages` directly

## Canonical Locations

| Symbol | File |
|--------|------|
| `defaultMessages` | `src/react/i18n.tsx` |
| `DeepCitationI18nProvider` | `src/react/i18n.tsx` |
| `useTranslation()` | `src/react/i18n.tsx` |
| `createTranslator()` | `src/react/i18n.tsx` |
| `tPlural()` | `src/react/i18n.tsx` |
| `defaultTranslator` | `src/react/i18n.tsx` |
| Locale files | `src/react/locales/*.ts` |
| Locale sync test | `src/__tests__/i18nLocales.test.ts` |
