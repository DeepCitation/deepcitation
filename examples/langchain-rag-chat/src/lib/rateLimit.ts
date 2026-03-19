/**
 * Simple daily rate limiter for the hosted demo.
 *
 * Two tiers:
 *   - Global: 100 queries/day across all users
 *   - Per-IP: 5 queries/day per client IP
 *
 * Uses module-level state, which persists within a single Vercel serverless
 * instance. On cold starts the counter resets — this is intentionally lenient
 * rather than strict, since the goal is to cap runaway usage, not enforce
 * exact billing limits.
 *
 * To disable: set RATE_LIMIT_DISABLED=true in your env, or delete this file
 * and remove the check in the chat route. Only the exact string "true" is
 * accepted — "1", "yes", and "TRUE" are treated as enabled.
 */

function parsePositiveInt(val: string | undefined, fallback: number): number {
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const MAX_QUERIES_PER_DAY = parsePositiveInt(process.env.RATE_LIMIT_MAX_PER_DAY, 100);
const MAX_QUERIES_PER_IP_PER_DAY = parsePositiveInt(process.env.RATE_LIMIT_MAX_PER_IP_PER_DAY, 5);

let globalCount = 0;
let windowStart = todayKey();
const ipCounts = new Map<string, number>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "2026-03-19"
}

function resetIfNewDay(): void {
  const today = todayKey();
  if (today !== windowStart) {
    globalCount = 0;
    ipCounts.clear();
    windowStart = today;
  }
}

export function checkRateLimit(ip?: string | null): {
  allowed: boolean;
  remaining: number;
  reason?: string;
} {
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return { allowed: true, remaining: MAX_QUERIES_PER_DAY };
  }

  resetIfNewDay();

  if (globalCount >= MAX_QUERIES_PER_DAY) {
    return { allowed: false, remaining: 0, reason: "global" };
  }

  if (ip) {
    const ipCount = ipCounts.get(ip) ?? 0;
    if (ipCount >= MAX_QUERIES_PER_IP_PER_DAY) {
      return {
        allowed: false,
        remaining: MAX_QUERIES_PER_DAY - globalCount,
        reason: "ip",
      };
    }
    ipCounts.set(ip, ipCount + 1);
  }

  globalCount += 1;
  return { allowed: true, remaining: MAX_QUERIES_PER_DAY - globalCount };
}
