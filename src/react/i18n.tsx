/**
 * Internationalization (i18n) infrastructure for DeepCitation React components.
 *
 * Provides a lightweight, zero-dependency i18n system:
 * - `defaultMessages`: Default English message dictionary
 * - `DeepCitationI18nProvider`: React context provider for custom translations
 * - `useTranslation()`: Hook to access the `t()` function in components
 * - `createTranslator()`: Factory for non-React contexts (tests, SSR)
 *
 * @example
 * ```tsx
 * // Override specific messages
 * const frenchMessages = {
 *   "status.verified": "Vérifié",
 *   "status.notFound": "Non trouvé",
 * };
 *
 * <DeepCitationI18nProvider messages={frenchMessages}>
 *   <CitationComponent ... />
 * </DeepCitationI18nProvider>
 * ```
 *
 * @packageDocumentation
 */

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { safeReplace } from "../utils/regexSafety.js";

// =============================================================================
// DEFAULT MESSAGES (English)
// =============================================================================

/**
 * Default English messages for all user-facing strings in DeepCitation
 * React components. Override any subset via `DeepCitationI18nProvider`.
 *
 * Strings use `{placeholder}` syntax for interpolation.
 * Plurals use `_one` / `_other` suffix convention.
 */
export const defaultMessages = {
  // ── Status labels ──────────────────────────────────────────────
  "status.verified": "Verified",
  "status.partialMatch": "Partial Match",
  "status.notFound": "Not Found",
  "status.verifying": "Verifying\u2026",

  // ── Outcome labels ─────────────────────────────────────────────
  "outcome.exactMatch": "Exact match",
  "outcome.normalizedMatch": "Normalized match",
  "outcome.anchorTextMatch": "Anchor text match",
  "outcome.matchFound": "Match found",
  "outcome.scanComplete_one": "Scan complete \u00b7 {count} search",
  "outcome.scanComplete_other": "Scan complete \u00b7 {count} searches",

  // ── Variation type labels ──────────────────────────────────────
  "variation.exact": "Exact match",
  "variation.normalized": "Normalized",
  "variation.currency": "Price formats",
  "variation.date": "Date formats",
  "variation.numeric": "Number formats",
  "variation.symbol": "Symbol variants",
  "variation.accent": "Accent variants",

  // ── Status indicator aria-labels ───────────────────────────────
  "indicator.verified": "Verified",
  "indicator.partial": "Partial match",
  "indicator.notFound": "Not found",
  "indicator.verifying": "Verifying",
  "indicator.stillVerifying": "Still verifying\u2026",

  // ── Contextual status messages ─────────────────────────────────
  "message.exactMatch": "Exact match",
  "message.anchorTextFound": "Anchor text found",
  "message.phraseFound": "Full phrase found",
  "message.partialTextMatch": "Partial text match",
  "message.foundOnOtherPage": "Found on p.\u202f{actualPage} (expected p.\u202f{expectedPage})",
  "message.foundOnDifferentPage": "Found on different page",
  "message.foundOnDifferentLine": "Found at different position",
  "message.firstWordOnly": "First word only",
  "message.notFound": "Not found in source",
  "message.searching": "Searching\u2026",

  // ── Popover loading messages ──────────────────────────────────
  "popover.searching": "Searching\u2026",
  "popover.lookingOnPage": "Looking on p.\u202f{pageNumber}",
  "popover.searchingImage": "Searching image\u2026",

  // ── Tab labels ─────────────────────────────────────────────────
  "tab.expected": "Expected",
  "tab.diff": "Diff",
  "tab.found": "Found",
  "tab.exactMatch": "Exact match",

  // ── Diff tooltips ──────────────────────────────────────────────
  "diff.expectedNotFound": "Expected but not found",
  "diff.actuallyFound": "Actually found in source",
  "diff.inlineView": "Inline diff view",
  "diff.splitView": "Split view",

  // ── Drawer / source labels ─────────────────────────────────────
  "drawer.sources": "Sources",
  "drawer.source": "Source",
  "drawer.document": "Document",
  "drawer.unknownSource": "Unknown Source",
  "drawer.close": "Close",
  "drawer.showAnnotation": "Show annotation",
  "drawer.hideAnnotation": "Hide annotation",

  // ── Zoom controls ──────────────────────────────────────────────
  "zoom.controls": "Zoom controls",
  "zoom.out": "Zoom out",
  "zoom.in": "Zoom in",
  "zoom.reCenter": "Re-center on annotation",
  "zoom.centered": "Centered on annotation",

  // ── Button / action labels ─────────────────────────────────────
  "action.close": "Close",
  "action.closeExpanded": "Close expanded view (Esc)",
  "action.expandFullPage": "Expand to full page",
  "action.expandFullPageNum": "Expand to full page {pageNumber}",
  "action.viewImage": "View image",
  "action.openProof": "Open proof in new tab",
  "action.openInNewTab": "Open in new tab",
  "action.closeSources": "Close sources",

  // ── Search method display names ────────────────────────────────
  "search.method.exactLineMatch": "Exact location",
  "search.method.lineWithBuffer": "Nearby lines",
  "search.method.expandedLineBuffer": "Extended nearby lines",
  "search.method.currentPage": "Expected page",
  "search.method.anchorTextFallback": "Anchor text",
  "search.method.adjacentPages": "Nearby pages",
  "search.method.expandedWindow": "Wider area",
  "search.method.regexSearch": "Entire document",
  "search.method.firstWordFallback": "First word",
  "search.method.firstHalfFallback": "First half",
  "search.method.lastHalfFallback": "Last half",
  "search.method.firstQuarterFallback": "First quarter",
  "search.method.secondQuarterFallback": "Second quarter",
  "search.method.thirdQuarterFallback": "Third quarter",
  "search.method.fourthQuarterFallback": "Fourth quarter",
  "search.method.longestWordFallback": "Longest word",
  "search.method.customPhraseFallback": "Custom search",
  "search.method.keyspanFallback": "Anchor text",
  "search.empty": "(empty)",

  // ── Search phrase type labels ──────────────────────────────────
  "searchPhrase.anchorText": "Anchor text",
  "searchPhrase.fullPhrase": "Full phrase",
  "searchPhrase.firstHalf": "First half",
  "searchPhrase.lastHalf": "Last half",
  "searchPhrase.firstQuarter": "First quarter",
  "searchPhrase.secondQuarter": "Second quarter",
  "searchPhrase.thirdQuarter": "Third quarter",
  "searchPhrase.fourthQuarter": "Fourth quarter",
  "searchPhrase.firstWord": "First word",
  "searchPhrase.longestWord": "Longest word",
  "searchPhrase.customPhrase": "Custom phrase",

  // ── URL access explanations ────────────────────────────────────
  "urlAccess.paywall.title": "Paywall Detected",
  "urlAccess.paywall.description": "This site requires a paid subscription to access.",
  "urlAccess.paywall.suggestion":
    "You can verify this citation by visiting the URL directly if you have a subscription.",
  "urlAccess.login.title": "Login Required",
  "urlAccess.login.description": "This page requires authentication to view its content.",
  "urlAccess.login.suggestion": "Log in to the site and visit the URL to verify this citation.",
  "urlAccess.geo.title": "Region Restricted",
  "urlAccess.geo.description": "This content isn\u2019t available from our verification server\u2019s location.",
  "urlAccess.geo.suggestion": "Try visiting the URL directly \u2014 it may be accessible from your location.",
  "urlAccess.antibot.title": "Blocked by Site Protection",
  "urlAccess.antibot.description": "This site\u2019s bot protection prevented our crawler from accessing the page.",
  "urlAccess.antibot.suggestion": "Visit the URL directly in your browser to verify this citation.",
  "urlAccess.rateLimit.title": "Rate Limited",
  "urlAccess.rateLimit.description": "Too many requests were sent to this site.",
  "urlAccess.rateLimit.suggestion": "Try again later \u2014 the rate limit should reset shortly.",
  "urlAccess.notFound.title": "Page Not Found",
  "urlAccess.notFound.description": "This URL returned a 404 error \u2014 the page may have been moved or deleted.",
  "urlAccess.notFound.suggestion": "Check if the URL is correct, or search the site for the content.",
  "urlAccess.server.title": "Server Error",
  "urlAccess.server.description": "The website returned a server error and could not be accessed.",
  "urlAccess.server.suggestion": "Try again later \u2014 the site may be experiencing temporary issues.",
  "urlAccess.timeout.title": "Connection Timed Out",
  "urlAccess.timeout.description": "The website took too long to respond to our verification request.",
  "urlAccess.timeout.suggestion": "Try again later \u2014 the site may be under heavy load.",
  "urlAccess.network.title": "Network Error",
  "urlAccess.network.description": "Could not connect to this website \u2014 the domain may be unreachable.",
  "urlAccess.network.suggestion": "Check if the URL is correct and that the site is still online.",

  // ── Page / location labels ─────────────────────────────────────
  "location.page": "p.\u202f{pageNumber}",
  "location.image": "Image",

  // ── Misc ───────────────────────────────────────────────────────
  "misc.noTextFound": "No text found",
  "misc.warning": "Warning",
  "misc.error": "Error",
  "citation.fallback": "Citation {number}",
  "ambiguity.found": "Found {totalOccurrences} occurrences",
  "ambiguity.onExpectedPage": "({occurrencesOnExpectedPage} on expected page)",
  "error.citation": "Citation error: {message}",

  // ── Sources list ───────────────────────────────────────────────
  "sourcesList.verified": "Verified",
  "sourcesList.partial": "Partial",
  "sourcesList.pending": "Pending",
  "sourcesList.failed": "Failed",
  "sourcesList.unknown": "Unknown",
} as const satisfies Record<string, string>;

// =============================================================================
// TYPES
// =============================================================================

/** All available message keys. */
export type MessageKey = keyof typeof defaultMessages;

/** The full messages dictionary type. */
export type DeepCitationMessages = Record<MessageKey, string>;

/** Interpolation values for message templates. */
export type MessageValues = Record<string, string | number>;

/**
 * Plural base keys — message keys that have `_one` and `_other` suffixed variants.
 * Derived from the default dictionary by stripping `_one` suffixes.
 */
export type PluralBaseKey = MessageKey extends infer K ? (K extends `${infer Base}_one` ? Base : never) : never;

/** A function that looks up and interpolates a message by key. */
export type TranslateFunction = (key: MessageKey, values?: MessageValues) => string;

// =============================================================================
// TRANSLATOR FACTORY
// =============================================================================

/**
 * Create a bound `t()` function from a (partial) messages dictionary.
 * Missing keys fall back to the default English message.
 *
 * **Security Note**: Interpolated values are converted to strings but NOT HTML-escaped.
 * Always render translations through JSX/React (which auto-escapes). Never use
 * `dangerouslySetInnerHTML` with translated strings containing user input.
 *
 * @param messages - Partial override dictionary (e.g., French translations)
 * @returns A `t(key, values?)` function
 *
 * @example
 * ```ts
 * const t = createTranslator({ "status.verified": "Vérifié" });
 * t("status.verified"); // "Vérifié"
 * t("status.notFound"); // "Not Found" (English fallback)
 * ```
 */
export function createTranslator(messages: Partial<DeepCitationMessages> = {}): TranslateFunction {
  return function t(key: MessageKey, values?: MessageValues): string {
    const template = (messages as Record<string, string>)[key] ?? defaultMessages[key];
    if (!values) return template;
    return safeReplace(template, /\{(\w+)\}/g, (match, k: string) => {
      const v = values[k];
      return v != null ? String(v) : match;
    });
  };
}

/** Default English translator singleton — used when no provider is present. */
export const defaultTranslator = createTranslator();

// =============================================================================
// PLURAL HELPER
// =============================================================================

/**
 * Select the correct plural form based on count.
 * Uses the `_one` / `_other` suffix convention.
 *
 * @example
 * ```ts
 * tPlural(t, "outcome.scanComplete", 1, { count: 1 });
 * // → "Scan complete · 1 search"
 *
 * tPlural(t, "outcome.scanComplete", 4, { count: 4 });
 * // → "Scan complete · 4 searches"
 * ```
 */
export function tPlural(t: TranslateFunction, baseKey: PluralBaseKey, count: number, values?: MessageValues): string {
  const suffix = count === 1 ? "_one" : "_other";
  return t(`${baseKey}${suffix}` as MessageKey, values);
}

// =============================================================================
// REACT CONTEXT
// =============================================================================

const I18nContext = createContext<TranslateFunction>(defaultTranslator);

export interface DeepCitationI18nProviderProps {
  /** Partial or full message overrides. Missing keys fall back to English. */
  messages: Partial<DeepCitationMessages>;
  children: ReactNode;
}

/**
 * Provides custom translations to all DeepCitation React components
 * within its subtree.
 *
 * **Performance**: The `messages` prop is used as a `useMemo` dependency.
 * If you define messages inline, memoize the object (e.g., with `useMemo` or
 * a module-level constant) to avoid recreating the translator every render.
 *
 * @example
 * ```tsx
 * const messages = useMemo(() => ({ "status.verified": "Vérifié" }), []);
 * <DeepCitationI18nProvider messages={messages}>
 *   <App />
 * </DeepCitationI18nProvider>
 * ```
 */
export function DeepCitationI18nProvider({ messages, children }: DeepCitationI18nProviderProps) {
  const t = useMemo(() => createTranslator(messages), [messages]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

/**
 * Access the translation function within DeepCitation React components.
 * Returns the default English translator if no `DeepCitationI18nProvider`
 * is present in the tree.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const t = useTranslation();
 *   return <span>{t("status.verified")}</span>;
 * }
 * ```
 */
export function useTranslation(): TranslateFunction {
  return useContext(I18nContext);
}
