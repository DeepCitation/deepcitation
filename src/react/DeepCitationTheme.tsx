/**
 * DeepCitationTheme — single-entry-point React theming component.
 *
 * Override any design token for all citation, popover, drawer, and trigger
 * components by passing a `theme` and/or `darkTheme` prop. Changes are applied
 * as a `<style>` block targeting `:root` (light) and `.dark` (dark).
 *
 * @example
 * ```tsx
 * // Global light + dark override
 * <DeepCitationTheme
 *   theme={{ background: "#fdfbf7", border: "#e2e0dc" }}
 *   darkTheme={{ background: "#1c1917", border: "#44403c" }}
 * />
 *
 * // Status colors only
 * <DeepCitationTheme theme={{ verified: "#0d9488", partial: "#d97706" }} />
 * ```
 *
 * @packageDocumentation
 */

import type React from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * All overridable design tokens for DeepCitation components.
 * Each field maps 1:1 to a `--dc-*` CSS custom property.
 *
 * Token reference:
 * | Field              | CSS variable            | Role                                    |
 * |--------------------|-------------------------|-----------------------------------------|
 * | background         | --dc-background         | Card / popover / drawer surface         |
 * | muted              | --dc-muted              | Subdued surface (code blocks, tab bars) |
 * | foreground         | --dc-foreground         | Primary text (headings, labels)         |
 * | mutedForeground    | --dc-muted-foreground   | Body text, secondary labels             |
 * | subtleForeground   | --dc-subtle-foreground  | Icons, timestamps, tertiary text        |
 * | border             | --dc-border             | All borders and dividers                |
 * | ring               | --dc-ring               | Focus ring color                        |
 * | verified           | --dc-verified           | Verified / success state                |
 * | partial            | --dc-partial            | Partial match / warning state           |
 * | destructive        | --dc-destructive        | Not found / error state                 |
 * | pending            | --dc-pending            | Loading / unresolved state              |
 */
export interface DeepCitationThemeColors {
  /** Card / popover / drawer surface. */
  background?: string;
  /** Subdued surface: code blocks, tab bars, inactive areas. */
  muted?: string;
  /** Primary text: headings, labels. */
  foreground?: string;
  /** Body text, secondary labels. */
  mutedForeground?: string;
  /** Icons, timestamps, tertiary text. */
  subtleForeground?: string;
  /** All borders and dividers. */
  border?: string;
  /** Focus ring color. */
  ring?: string;
  /** Verified / success indicator color. */
  verified?: string;
  /** Partial match / warning indicator color. */
  partial?: string;
  /** Not found / error indicator color. */
  destructive?: string;
  /** Loading / unresolved indicator color. */
  pending?: string;
}

export interface DeepCitationThemeProps {
  /** Light-mode token overrides (targets `:root`). */
  theme?: DeepCitationThemeColors;
  /** Dark-mode token overrides (targets `.dark`). */
  darkTheme?: DeepCitationThemeColors;
  /** Optional children — rendered as-is alongside the `<style>` block. */
  children?: React.ReactNode;
}

// =============================================================================
// HELPERS
// =============================================================================

const TOKEN_MAP: Record<keyof DeepCitationThemeColors, string> = {
  background: "--dc-background",
  muted: "--dc-muted",
  foreground: "--dc-foreground",
  mutedForeground: "--dc-muted-foreground",
  subtleForeground: "--dc-subtle-foreground",
  border: "--dc-border",
  ring: "--dc-ring",
  verified: "--dc-verified",
  partial: "--dc-partial",
  destructive: "--dc-destructive",
  pending: "--dc-pending",
};

function colorsToDeclarations(colors: DeepCitationThemeColors): string {
  return (Object.entries(colors) as [keyof DeepCitationThemeColors, string | undefined][])
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `  ${TOKEN_MAP[key]}: ${value};`)
    .join("\n");
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Apply DeepCitation design token overrides for all citation, popover,
 * drawer, and trigger components.
 *
 * Renders a `<style>` element that overrides CSS custom properties on
 * `:root` (light) and `.dark` (dark). No wrapper `<div>` is added —
 * `children` pass through unmodified.
 */
export const DeepCitationTheme = ({ theme, darkTheme, children }: DeepCitationThemeProps): React.ReactNode => {
  const parts: string[] = [];

  if (theme) {
    const declarations = colorsToDeclarations(theme);
    if (declarations) parts.push(`:root {\n${declarations}\n}`);
  }

  if (darkTheme) {
    const declarations = colorsToDeclarations(darkTheme);
    if (declarations) parts.push(`.dark {\n${declarations}\n}`);
  }

  const css = parts.join("\n");

  return (
    <>
      {css && <style data-dc-theme="">{css}</style>}
      {children}
    </>
  );
};
