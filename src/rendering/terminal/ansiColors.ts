/**
 * ANSI escape code utilities for terminal output.
 * Supports NO_COLOR environment variable for plain text fallback.
 */

/** ANSI escape code prefix */
const ESC = "\x1b[";

/** ANSI color codes for citation status */
const ANSI_COLORS = {
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  red: `${ESC}31m`,
  gray: `${ESC}90m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  reset: `${ESC}0m`,
} as const;

/**
 * Check whether color output should be suppressed.
 * Respects the NO_COLOR convention (https://no-color.org/).
 */
export function shouldUseColor(colorOption?: boolean): boolean {
  if (colorOption === false) return false;
  if (colorOption === true) return true;
  // Auto-detect: respect NO_COLOR env var
  if (typeof process !== "undefined" && process.env?.NO_COLOR !== undefined) return false;
  return true;
}

/**
 * Wrap text in ANSI color codes for a given status.
 */
export function colorize(
  text: string,
  statusKey: "verified" | "partial" | "notFound" | "pending",
  useColor: boolean,
): string {
  if (!useColor) return text;

  switch (statusKey) {
    case "verified":
      return `${ANSI_COLORS.green}${text}${ANSI_COLORS.reset}`;
    case "partial":
      return `${ANSI_COLORS.yellow}${text}${ANSI_COLORS.reset}`;
    case "notFound":
      return `${ANSI_COLORS.red}${text}${ANSI_COLORS.reset}`;
    case "pending":
      return `${ANSI_COLORS.gray}${text}${ANSI_COLORS.reset}`;
    default:
      return text;
  }
}

/**
 * Apply bold formatting.
 */
export function bold(text: string, useColor: boolean): string {
  if (!useColor) return text;
  return `${ANSI_COLORS.bold}${text}${ANSI_COLORS.reset}`;
}

/**
 * Apply dim formatting.
 */
export function dim(text: string, useColor: boolean): string {
  if (!useColor) return text;
  return `${ANSI_COLORS.dim}${text}${ANSI_COLORS.reset}`;
}

/**
 * Strip all ANSI escape codes from a string.
 */
export function stripAnsi(str: string): string {
  // Matches all ANSI escape sequences
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require control characters
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

/**
 * Box-drawing characters for sources section.
 */
export const BOX_CHARS = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  tee: "├",
} as const;

/**
 * Render a horizontal rule with a title.
 */
export function horizontalRule(title: string, width: number, useColor: boolean): string {
  const titleWithPad = ` ${title} `;
  const leftLen = 3;
  const rightLen = Math.max(1, width - leftLen - titleWithPad.length);
  const left = BOX_CHARS.horizontal.repeat(leftLen);
  const right = BOX_CHARS.horizontal.repeat(rightLen);
  const line = `${left}${titleWithPad}${right}`;
  return useColor ? bold(line, true) : line;
}
