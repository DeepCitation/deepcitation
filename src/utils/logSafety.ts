/**
 * Log safety utilities to prevent log injection attacks.
 *
 * Log injection occurs when untrusted data is logged without sanitization,
 * allowing attackers to inject fake log entries (e.g., "[ERROR] System hacked").
 * This module provides safe logging utilities that sanitize user input.
 *
 * @module utils/logSafety
 */

/**
 * Sanitize a value for safe logging.
 * Removes control characters, ANSI codes, and newlines that could be used
 * to inject fake log entries.
 *
 * @param value - The value to sanitize
 * @param maxLength - Maximum output length before truncation (default: 1000)
 * @returns A sanitized string safe for logging
 *
 * @example
 * ```typescript
 * const userInput = "Normal\n[ERROR] Fake error\n[ADMIN] Backdoor";
 * console.log("[API] Input:", sanitizeForLog(userInput));
 * // Output: [API] Input: Normal\n[ERROR] Fake error\n[ADMIN] Backdoor
 * // (rendered as literal \n, not actual newlines)
 * ```
 */
export function sanitizeForLog(value: unknown, maxLength = 1000): string {
  // Convert value to string
  const str = typeof value === "string" ? value : JSON.stringify(value);

  // Sanitize dangerous characters
  return (
    str
      // Replace actual newlines with literal \n
      .replace(/\r?\n/g, "\\n")
      // Replace tabs with literal \t
      .replace(/\t/g, "\\t")
      // Remove all ANSI escape sequences (comprehensive pattern)
      // Matches: ESC [ ... (any letter), ESC ] ... BEL/ST, ESC ( ... ), etc.
      // See: https://en.wikipedia.org/wiki/ANSI_escape_code
      .replace(
        /\x1b(?:\[[0-9;]*[a-zA-Z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[()][0-9A-Za-z]|\[[0-9;?]*[hl])/g,
        "",
      )
      // Truncate to prevent log spam
      .slice(0, maxLength)
  );
}

/**
 * Create a sanitized log entry from parts.
 * Useful for structured logging where you want to combine user input safely.
 *
 * @param parts - Strings and values to combine for logging
 * @returns A sanitized log entry
 *
 * @example
 * ```typescript
 * const logEntry = createLogEntry(
 *   '[API]',
 *   'Received request from',
 *   userEmail,
 *   'with payload:',
 *   requestData
 * );
 * console.log(logEntry);
 * ```
 */
export function createLogEntry(...parts: unknown[]): string {
  return parts
    .map(part => {
      if (typeof part === "string") {
        return part; // Keep strings as-is (assume they're trusted)
      }
      return sanitizeForLog(part);
    })
    .join(" ");
}

/**
 * Safe structured logging function.
 * Sanitizes all user-provided values while preserving log structure.
 *
 * @param level - The log level ('info', 'warn', 'error', 'debug')
 * @param prefix - Optional prefix for the log message (e.g., '[API]')
 * @param message - The main message (should be trusted/static)
 * @param data - Any user-provided data to log
 *
 * @example
 * ```typescript
 * safeLog('info', '[Chat API]', 'User message', messages[0].content);
 * // Output: [Chat API] User message "The user's actual message (sanitized)"
 * ```
 */
export function safeLog(
  level: "debug" | "info" | "warn" | "error",
  prefix: string,
  message: string,
  data?: unknown,
): void {
  const sanitized = data ? sanitizeForLog(data) : "";
  const logFn = console[level] ?? console.log;

  if (data) {
    logFn(`${prefix} ${message}`, sanitized);
  } else {
    logFn(`${prefix} ${message}`);
  }
}

/**
 * Sanitize JSON for logging.
 * Safely stringifies JSON while limiting depth and size.
 *
 * @param value - The value to stringify
 * @param maxLength - Maximum output length (default: 1000)
 * @param maxDepth - Maximum nesting depth (default: 3)
 * @returns A sanitized JSON string
 *
 * @example
 * ```typescript
 * const data = { user: { email: 'user@example.com', nested: { deep: 'value' } } };
 * console.log('[Data]', sanitizeJsonForLog(data, 500, 2));
 * ```
 */
/**
 * Helper to stringify a value with depth limiting.
 * @private
 */
function stringifyWithDepthLimit(value: unknown, maxDepth: number): string {
  const seen = new WeakSet<object>();

  function stringify(obj: unknown, depth: number): string {
    if (depth > maxDepth) {
      return '"[Omitted - too deep]"';
    }

    if (obj === null) return "null";
    if (obj === undefined) return "null"; // Undefined in arrays becomes null (objects filter it out)

    const type = typeof obj;
    if (type === "string") return JSON.stringify(obj);
    if (type === "number" || type === "boolean") return String(obj);

    if (type === "object") {
      if (seen.has(obj as object)) {
        return '"[Circular]"';
      }
      seen.add(obj as object);

      if (Array.isArray(obj)) {
        const items = obj.map(item => stringify(item, depth + 1));
        return `[${items.join(",")}]`;
      }

      const entries = Object.entries(obj)
        .filter(([, val]) => val !== undefined) // Skip undefined values like native JSON.stringify
        .map(([key, val]) => `${JSON.stringify(key)}:${stringify(val, depth + 1)}`)
        .join(",");
      return `{${entries}}`;
    }

    return JSON.stringify(obj);
  }

  return stringify(value, 0);
}

export function sanitizeJsonForLog(value: unknown, maxLength = 1000, maxDepth = 3): string {
  try {
    const json = stringifyWithDepthLimit(value, maxDepth);
    return sanitizeForLog(json, maxLength);
  } catch (e) {
    // If stringification fails, fall back to string representation
    return sanitizeForLog(String(e), maxLength);
  }
}
