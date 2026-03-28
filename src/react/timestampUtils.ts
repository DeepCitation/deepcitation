/**
 * Timestamp formatting utilities for audio/video citations.
 *
 * Converts HH:MM:SS.mmm timestamps to human-friendly display strings.
 *
 * @packageDocumentation
 */

const TIMESTAMP_RE = /^(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/;

/**
 * Converts an HH:MM:SS.mmm timestamp to a compact human-friendly string.
 *
 * - `"00:01:30.500"` → `"1:30"`
 * - `"01:15:00.000"` → `"1:15:00"`
 * - `"00:00:05.200"` → `"0:05"`
 *
 * Returns the input unchanged if it doesn't match the expected format.
 */
export function formatTimestamp(hhmmss: string): string {
  if (!hhmmss) return hhmmss;
  const match = TIMESTAMP_RE.exec(hhmmss);
  if (!match) return hhmmss;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3]; // keep zero-padded
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

/**
 * Formats a start–end timestamp range for display.
 *
 * - Both provided: `"1:30 – 2:15"`
 * - Only start: the formatted start time
 * - Only end: the formatted end time
 * - Neither: `""`
 */
export function formatTimestampRange(start?: string, end?: string): string {
  const s = start ? formatTimestamp(start) : "";
  const e = end ? formatTimestamp(end) : "";
  if (s && e) return `${s} \u2013 ${e}`;
  return s || e;
}
