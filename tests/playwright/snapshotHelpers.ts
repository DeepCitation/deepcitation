import type { Page } from "@playwright/test";

/**
 * Scale down and compress spacing in a showcase element before snapshot.
 * - CSS transform: scale(0.5) halves both width and height (~75% pixel reduction)
 * - Spacing overrides compress padding, margins, and gaps to eliminate whitespace
 * These overrides only apply during snapshot capture, not interactive development.
 */
export async function scaleDownForSnapshot(page: Page, testId: string) {
  const sel = `[data-testid="${testId}"]`;
  await page.addStyleTag({
    content: `
      ${sel} {
        transform: scale(0.5);
        transform-origin: top left;
        padding: 0.5rem !important;
        min-height: 0 !important;
      }
      ${sel} section {
        margin-bottom: 1rem !important;
      }
      ${sel} section > p {
        margin-bottom: 0.25rem !important;
      }
      ${sel} h1 {
        margin-bottom: 0.25rem !important;
        font-size: 1.25rem !important;
      }
      ${sel} h1 + p {
        margin-bottom: 0.5rem !important;
      }
      ${sel} h2 {
        margin-bottom: 0.125rem !important;
      }
      ${sel} .grid {
        gap: 0.25rem !important;
      }
      ${sel} [class*="p-4"] {
        padding: 0.375rem !important;
      }
      ${sel} [class*="p-6"] {
        padding: 0.5rem !important;
      }
      ${sel} [class*="mb-2"] {
        margin-bottom: 0.125rem !important;
      }
      ${sel} [class*="pb-2"] {
        padding-bottom: 0.125rem !important;
      }
      ${sel} [class*="mt-3"] {
        margin-top: 0.25rem !important;
      }
      ${sel} [class*="mt-4"] {
        margin-top: 0.25rem !important;
      }
      ${sel} [class*="mb-6"] {
        margin-bottom: 0.5rem !important;
      }
      ${sel} [class*="mb-10"] {
        margin-bottom: 0.75rem !important;
      }
      ${sel} [class*="gap-4"] {
        gap: 0.25rem !important;
      }
      ${sel} [class*="gap-6"] {
        gap: 0.375rem !important;
      }
      ${sel} [class*="space-y-4"] > * + * {
        margin-top: 0.25rem !important;
      }
      ${sel} [class*="space-y-6"] > * + * {
        margin-top: 0.375rem !important;
      }
      ${sel} [class*="mb-3"] {
        margin-bottom: 0.25rem !important;
      }
      ${sel} [class*="mb-4"] {
        margin-bottom: 0.25rem !important;
      }
    `,
  });
}
