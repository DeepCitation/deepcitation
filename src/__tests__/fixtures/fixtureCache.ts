/**
 * Fixture cache for E2E tests.
 *
 * On first run (or when REFRESH_FIXTURES=1), makes real API calls and saves
 * responses as JSON fixtures. On subsequent runs, loads from the fixture files
 * — no API key needed, no network latency.
 *
 * Fixture files are committed to the repo so CI can run these tests without
 * an API key. To regenerate: `REFRESH_FIXTURES=1 DEEPCITATION_API_KEY=sk-dc-... bun test cliE2e`
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURES_DIR = resolve(__dirname);
const REFRESH = process.env.REFRESH_FIXTURES === "1";

/** In-memory cache for the current process (avoids re-fetching within a single test run) */
const memoryCache = new Map<string, unknown>();

export interface CachedFixture<T> {
  /** Timestamp of when the fixture was captured */
  capturedAt: string;
  /** The cached response data */
  data: T;
}

/**
 * Load a fixture from cache, or call the producer function and cache the result.
 *
 * @param name - Fixture filename (without .json extension)
 * @param producer - Async function that makes the real API call
 * @returns The cached or freshly-produced data
 */
export async function cachedFixture<T>(name: string, producer: () => Promise<T>): Promise<T> {
  const path = resolve(FIXTURES_DIR, `${name}.json`);

  // Check in-memory cache first (handles multiple tests using same fixture in one run)
  if (memoryCache.has(name)) {
    return memoryCache.get(name) as T;
  }

  // Use disk cache if available and not refreshing
  if (!REFRESH && existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as CachedFixture<T>;
    memoryCache.set(name, raw.data);
    return raw.data;
  }

  // Make the real call
  const data = await producer();

  // Cache the result
  if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });
  const fixture: CachedFixture<T> = {
    capturedAt: new Date().toISOString(),
    data,
  };
  writeFileSync(path, JSON.stringify(fixture, null, 2));
  memoryCache.set(name, data);

  return data;
}

/**
 * Check if we can make real API calls (key is set and we're refreshing or missing fixtures).
 */
export function hasApiKey(): boolean {
  const key = process.env.DEEPCITATION_API_KEY;
  return Boolean(key && key.startsWith("sk-dc-") && key.length >= 20);
}

/**
 * Check if a specific fixture exists on disk.
 */
export function fixtureExists(name: string): boolean {
  return existsSync(resolve(FIXTURES_DIR, `${name}.json`));
}

/**
 * Determine if a test can run: either fixtures exist or we have an API key to create them.
 */
export function canRunE2e(fixtureName: string): boolean {
  return fixtureExists(fixtureName) || hasApiKey();
}
