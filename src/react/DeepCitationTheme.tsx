/**
 * DeepCitationTheme — override `--dc-*` design tokens for all citation components.
 * Renders a `<style>` block targeting `:root` (light) and `.dark` (dark),
 * or a scoped `<div>` wrapper when `scoped` is true.
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
  /** Active tabs, links, interactive accent. */
  primary?: string;
  /** Text on primary surfaces. */
  primaryForeground?: string;
  /** Verified / success indicator color. */
  verified?: string;
  /** Partial match / warning indicator color. */
  partial?: string;
  /** Not found / error indicator color. */
  destructive?: string;
  /** Loading / unresolved indicator color. */
  pending?: string;
  /** Verified chip/banner background. */
  verifiedBg?: string;
  /** Verified chip/banner border. */
  verifiedBorder?: string;
  /** Verified chip hover background. */
  verifiedHover?: string;
  /** Verified chip hover text color (ensures contrast on hover background). */
  verifiedHoverForeground?: string;
  /** Partial chip/banner background. */
  partialBg?: string;
  /** Partial chip/banner border. */
  partialBorder?: string;
  /** Partial chip hover background. */
  partialHover?: string;
  /** Partial chip hover text color. */
  partialHoverForeground?: string;
  /** Error chip/banner background. */
  destructiveBg?: string;
  /** Error chip/banner border. */
  destructiveBorder?: string;
  /** Destructive chip hover background. */
  destructiveHover?: string;
  /** Destructive chip hover text color. */
  destructiveHoverForeground?: string;
  /** Pending chip/banner background. */
  pendingBg?: string;
  /** Pending chip/banner border. */
  pendingBorder?: string;
  /** Pending chip hover background. */
  pendingHover?: string;
  /** Pending chip hover text color. */
  pendingHoverForeground?: string;
  /** Small border radius. */
  radiusSm?: string;
  /** Medium border radius. */
  radiusMd?: string;
  /** Large border radius. */
  radiusLg?: string;
  /** Font family for citation components. */
  fontFamily?: string;
}

export interface DeepCitationThemeProps {
  /** Light-mode token overrides (targets `:root`). */
  theme?: DeepCitationThemeColors;
  /** Dark-mode token overrides (targets `.dark`). */
  darkTheme?: DeepCitationThemeColors;
  /** When true, renders a `<div style={vars}>` wrapper instead of global `<style>` injection (enables per-instance theming). */
  scoped?: boolean;
  /** Optional children — rendered as-is alongside the `<style>` block (or inside the scoped wrapper). */
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
  primary: "--dc-primary",
  primaryForeground: "--dc-primary-foreground",
  verified: "--dc-verified",
  partial: "--dc-partial",
  destructive: "--dc-destructive",
  pending: "--dc-pending",
  verifiedBg: "--dc-verified-bg",
  verifiedBorder: "--dc-verified-border",
  verifiedHover: "--dc-verified-hover",
  verifiedHoverForeground: "--dc-verified-hover-foreground",
  partialBg: "--dc-partial-bg",
  partialBorder: "--dc-partial-border",
  partialHover: "--dc-partial-hover",
  partialHoverForeground: "--dc-partial-hover-foreground",
  destructiveBg: "--dc-destructive-bg",
  destructiveBorder: "--dc-destructive-border",
  destructiveHover: "--dc-destructive-hover",
  destructiveHoverForeground: "--dc-destructive-hover-foreground",
  pendingBg: "--dc-pending-bg",
  pendingBorder: "--dc-pending-border",
  pendingHover: "--dc-pending-hover",
  pendingHoverForeground: "--dc-pending-hover-foreground",
  radiusSm: "--dc-radius-sm",
  radiusMd: "--dc-radius-md",
  radiusLg: "--dc-radius-lg",
  fontFamily: "--dc-font-family",
};

function colorsToDeclarations(colors: DeepCitationThemeColors): string {
  return (Object.entries(colors) as [keyof DeepCitationThemeColors, string | undefined][])
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `  ${TOKEN_MAP[key]}: ${value};`)
    .join("\n");
}

function colorsToStyleObject(colors: DeepCitationThemeColors): Record<string, string> {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors) as [keyof DeepCitationThemeColors, string | undefined][]) {
    if (value !== undefined) {
      style[TOKEN_MAP[key]] = value;
    }
  }
  return style;
}

export const DeepCitationTheme = ({ theme, darkTheme, scoped, children }: DeepCitationThemeProps): React.ReactNode => {
  // Scoped mode: wrap children in a <div> with inline CSS custom properties.
  // darkTheme is not supported in scoped mode — inline styles cannot target .dark descendants.
  if (scoped) {
    if (darkTheme && process.env.NODE_ENV !== "production") {
      console.warn(
        "[DeepCitationTheme] darkTheme is ignored in scoped mode. Use global mode (scoped={false}) for dark theme support.",
      );
    }
    const vars = theme ? colorsToStyleObject(theme) : {};
    return (
      <div data-dc-theme-scope="" style={vars}>
        {children}
      </div>
    );
  }

  // Global mode: inject <style> block targeting :root / .dark
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
