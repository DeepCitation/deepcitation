/**
 * DeepCitationTheme — override `--dc-*` design tokens for all citation components.
 * Renders a `<style>` block targeting `:root` (light) and `.dark` (dark).
 */

import type React from "react";

/** Overridable design tokens. Each field maps 1:1 to a `--dc-*` CSS custom property. */
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
