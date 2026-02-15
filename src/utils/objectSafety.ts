/**
 * Object safety utilities to prevent prototype pollution and property injection attacks.
 *
 * Prototype pollution occurs when untrusted data is assigned to object properties,
 * allowing attackers to modify Object.prototype or constructor properties. This module
 * provides safe object creation and assignment utilities.
 *
 * @module utils/objectSafety
 */

/**
 * Set of property names that can cause prototype pollution.
 * These are the core vectors for prototype pollution attacks:
 * - `__proto__`: Direct access to object's internal prototype
 * - `constructor`: Indirect access to constructor.prototype
 * - `prototype`: Modifies constructor's prototype for all instances
 *
 * Additional dangerous keys that could be added for method hijacking:
 * - toString, valueOf, hasOwnProperty, isPrototypeOf, toLocaleString
 *
 * However, we focus on the main prototype pollution vectors to avoid
 * over-blocking legitimate use cases.
 */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Optional warning function for logging rejected keys.
 * Set to null to disable warnings entirely.
 * @internal
 */
let warningFn: ((message: string) => void) | null = console.warn;

/**
 * Set a custom warning function for rejected keys, or disable warnings.
 *
 * @param fn - The warning function to use, or null to disable warnings
 *
 * @example
 * ```typescript
 * // Use a custom logger
 * setObjectSafetyWarning((msg) => logger.warn(msg));
 *
 * // Disable all warnings
 * setObjectSafetyWarning(null);
 * ```
 */
export function setObjectSafetyWarning(fn: ((message: string) => void) | null): void {
  warningFn = fn;
}

/**
 * Check if a key is safe for object property assignment.
 * Returns false for dangerous keys that can pollute prototypes.
 *
 * @param key - The property name to check
 * @returns True if the key is safe, false if it could cause prototype pollution
 *
 * @example
 * ```typescript
 * if (!isSafeKey(userProvidedKey)) {
 *   console.warn(`Rejected dangerous key: ${userProvidedKey}`);
 *   return;
 * }
 * ```
 */
export function isSafeKey(key: string): boolean {
  return !DANGEROUS_KEYS.has(key);
}

/**
 * Create a null-prototype object to prevent prototype pollution.
 * Objects created with Object.create(null) don't inherit from Object.prototype,
 * making them immune to prototype pollution attacks.
 *
 * @returns A new object with null prototype
 *
 * @example
 * ```typescript
 * const attrs = createSafeObject<string>();
 * // Now safe to assign even if key is '__proto__'
 * attrs[key] = value; // Won't pollute global prototypes
 * ```
 */
export function createSafeObject<T = unknown>(): Record<string, T> {
  return Object.create(null);
}

/**
 * Safely assign a property only if the key is not dangerous.
 * Optionally validates against an allowlist of permitted keys.
 *
 * @param obj - The object to assign to (should be created with createSafeObject)
 * @param key - The property name
 * @param value - The value to assign
 * @param allowedKeys - Optional set of allowed property names
 * @returns True if assignment succeeded, false if key was rejected
 *
 * @example
 * ```typescript
 * const attrs = createSafeObject<string>();
 * const allowed = new Set(['color', 'size', 'name']);
 *
 * if (safeAssign(attrs, 'color', 'red', allowed)) {
 *   // Property was assigned
 * } else {
 *   // Key was rejected as dangerous or not in allowlist
 * }
 * ```
 */
export function safeAssign<T>(obj: Record<string, T>, key: string, value: T, allowedKeys?: Set<string>): boolean {
  // Always reject dangerous keys
  if (!isSafeKey(key)) {
    warningFn?.(`[Security] Rejected dangerous key: ${key}`);
    return false;
  }

  // If an allowlist is provided, reject unlisted keys
  if (allowedKeys && !allowedKeys.has(key)) {
    warningFn?.(`[Security] Rejected unknown key: ${key}`);
    return false;
  }

  // Safe to assign
  obj[key] = value;
  return true;
}

/**
 * Bulk assign multiple properties with safety checks.
 * Useful for processing object entries from untrusted sources.
 *
 * @param obj - The object to assign to
 * @param entries - Key-value pairs to assign
 * @param allowedKeys - Optional set of allowed property names
 * @returns Count of successfully assigned properties
 *
 * @example
 * ```typescript
 * const attrs = createSafeObject<string>();
 * const allowed = new Set(['id', 'name', 'email']);
 * const count = safeAssignBulk(attrs, Object.entries(userData), allowed);
 * console.log(`Assigned ${count} properties`);
 * ```
 */
export function safeAssignBulk<T>(
  obj: Record<string, T>,
  entries: Array<[string, T]>,
  allowedKeys?: Set<string>,
): number {
  let assigned = 0;
  for (const [key, value] of entries) {
    if (safeAssign(obj, key, value, allowedKeys)) {
      assigned++;
    }
  }
  return assigned;
}

/**
 * Safely merge objects from untrusted sources.
 * Only assigns properties that pass safety checks.
 *
 * @param target - The object to merge into
 * @param source - The object to merge from (may be untrusted)
 * @param allowedKeys - Optional set of allowed property names
 * @returns The target object with safe properties merged
 *
 * @example
 * ```typescript
 * const safeAttrs = safeMerge(
 *   createSafeObject<string>(),
 *   userProvidedAttrs,
 *   new Set(['class', 'id', 'data'])
 * );
 * ```
 */
export function safeMerge<T>(
  target: Record<string, T>,
  source: Record<string, T>,
  allowedKeys?: Set<string>,
): Record<string, T> {
  safeAssignBulk(target, Object.entries(source), allowedKeys);
  return target;
}
