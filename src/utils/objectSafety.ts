/** Prototype pollution prevention utilities for untrusted object assignment. */

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** @internal */
let warningFn: ((message: string) => void) | null = console.warn;

/** Set a custom warning function for rejected keys, or null to disable. */
export function setObjectSafetyWarning(fn: ((message: string) => void) | null): void {
  warningFn = fn;
}

/** Returns false for keys that can cause prototype pollution. */
export function isSafeKey(key: string): boolean {
  return !DANGEROUS_KEYS.has(key);
}

/** Create a null-prototype object immune to prototype pollution. */
export function createSafeObject<T = unknown>(): Record<string, T> {
  return Object.create(null);
}

/** Assign a property only if the key passes safety checks and optional allowlist. */
export function safeAssign<T>(obj: Record<string, T>, key: string, value: T, allowedKeys?: Set<string>): boolean {
  if (!isSafeKey(key)) {
    warningFn?.(`[Security] Rejected dangerous key: ${key}`);
    return false;
  }
  if (allowedKeys && !allowedKeys.has(key)) {
    warningFn?.(`[Security] Rejected unknown key: ${key}`);
    return false;
  }
  obj[key] = value;
  return true;
}

/** Bulk assign multiple entries with safety checks. Returns count of successful assignments. */
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

/** Merge properties from an untrusted source, rejecting dangerous keys. */
export function safeMerge<T>(
  target: Record<string, T>,
  source: Record<string, T>,
  allowedKeys?: Set<string>,
): Record<string, T> {
  safeAssignBulk(target, Object.entries(source), allowedKeys);
  return target;
}
