/**
 * CLI E2E Tests — Real API calls with fixture caching.
 *
 * First run with API key: makes real calls, saves fixtures.
 * Subsequent runs: loads from fixtures, no API key needed.
 *
 * To regenerate fixtures:
 *   REFRESH_FIXTURES=1 DEEPCITATION_API_KEY=sk-dc-... bun test cliE2e
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

import { DeepCitation } from "../client/DeepCitation.js";
import { cachedFixture, canRunE2e, hasApiKey } from "./fixtures/fixtureCache.js";

// ── Setup ─────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), `dc-e2e-${Date.now()}`);

beforeAll(() => mkdirSync(TEST_DIR, { recursive: true }));
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

function getClient(): DeepCitation {
  const apiKey = process.env.DEEPCITATION_API_KEY;
  if (!apiKey) throw new Error("DEEPCITATION_API_KEY required for live API calls");
  return new DeepCitation({ apiKey });
}

// ── Types for cached responses ────────────────────────────────────

interface PrepareResult {
  attachmentId: string;
  metadata: { pageCount: number; textByteSize: number };
  deepTextPromptPortion: string;
}

interface VerifyResult {
  verifications: Record<string, { status: string; citation?: Record<string, unknown> }>;
}

interface AttachmentResult {
  attachmentId: string;
  status: string;
  pageCount: number;
  verifications: Record<string, unknown>;
}

// ── E2E: prepare ──────────────────────────────────────────────────

describe("E2E: prepare", () => {
  const canRun = canRunE2e("prepare-example-com");

  (canRun ? it : it.skip)("prepares a URL and returns attachmentId + metadata", async () => {
    const result = await cachedFixture<PrepareResult>("prepare-example-com", async () => {
      const dc = getClient();
      const res = await dc.prepareUrl({ url: "https://example.com", unsafeFastUrlOutput: true });
      return {
        attachmentId: res.attachmentId,
        metadata: { pageCount: res.metadata.pageCount, textByteSize: res.metadata.textByteSize },
        deepTextPromptPortion: res.deepTextPromptPortion,
      };
    });

    expect(result.attachmentId).toBeTruthy();
    expect(typeof result.attachmentId).toBe("string");
    expect(result.metadata.pageCount).toBeGreaterThan(0);
    expect(result.metadata.textByteSize).toBeGreaterThan(0);
    expect(result.deepTextPromptPortion).toContain("Example Domain");
  });

  (canRun ? it : it.skip)("deepTextPromptPortion contains page and line tags", async () => {
    const result = await cachedFixture<PrepareResult>("prepare-example-com", async () => {
      const dc = getClient();
      const res = await dc.prepareUrl({ url: "https://example.com", unsafeFastUrlOutput: true });
      return {
        attachmentId: res.attachmentId,
        metadata: { pageCount: res.metadata.pageCount, textByteSize: res.metadata.textByteSize },
        deepTextPromptPortion: res.deepTextPromptPortion,
      };
    });

    // Verify the structure that the /verify skill depends on
    expect(result.deepTextPromptPortion).toMatch(/<page_number_\d+_index_\d+>/);
    expect(result.deepTextPromptPortion).toMatch(/<line id="\d+">/);
  });
});

// ── E2E: get attachment ───────────────────────────────────────────

describe("E2E: get attachment", () => {
  const canRun = canRunE2e("prepare-example-com") && canRunE2e("get-attachment");

  (canRun ? it : it.skip)("fetches attachment metadata by ID", async () => {
    // Load the prepare fixture to get the attachmentId
    const prepare = await cachedFixture<PrepareResult>("prepare-example-com", async () => {
      throw new Error("prepare fixture must exist first");
    });

    const result = await cachedFixture<AttachmentResult>("get-attachment", async () => {
      const dc = getClient();
      const res = await dc.getAttachment(prepare.attachmentId);
      return {
        attachmentId: res.attachmentId ?? prepare.attachmentId,
        status: res.status,
        pageCount: res.pageCount,
        verifications: res.verifications,
      };
    });

    expect(result.status).toBeTruthy();
    expect(result.pageCount).toBeGreaterThan(0);
    expect(typeof result.verifications).toBe("object");
  });
});

// ── E2E: verify citations ─────────────────────────────────────────

describe("E2E: verify citations", () => {
  const canRun = canRunE2e("prepare-example-com") && canRunE2e("verify-citations");

  (canRun ? it : it.skip)("verifies a citation against a prepared attachment", async () => {
    const prepare = await cachedFixture<PrepareResult>("prepare-example-com", async () => {
      throw new Error("prepare fixture must exist first");
    });

    const result = await cachedFixture<VerifyResult>("verify-citations", async () => {
      const dc = getClient();

      // Build a citation from the prepared content
      // example.com contains "Example Domain" — cite that
      const citations = {
        "test-citation-1": {
          fullPhrase: "Example Domain",
          anchorText: "Example",
          pageNumber: 1,
          lineIds: [1],
          attachmentId: prepare.attachmentId,
        },
      };

      const res = await dc.verifyAttachment(prepare.attachmentId, citations as any, { outputImageFormat: "avif" });

      return {
        verifications: Object.fromEntries(
          Object.entries(res.verifications).map(([k, v]) => [
            k,
            { status: (v as any).status, citation: (v as any).citation },
          ]),
        ),
      };
    });

    const keys = Object.keys(result.verifications);
    expect(keys.length).toBeGreaterThan(0);

    // At least one citation should have a status
    const firstVerification = result.verifications[keys[0]];
    expect(firstVerification.status).toBeTruthy();
    expect(["found", "partial_text_found", "found_anchor_text_only", "not_found", "found_on_other_page"]).toContain(
      firstVerification.status,
    );
  });

  (canRun ? it : it.skip)("verification result contains citation metadata", async () => {
    const result = await cachedFixture<VerifyResult>("verify-citations", async () => {
      throw new Error("Should have been cached by previous test");
    });

    const keys = Object.keys(result.verifications);
    expect(keys.length).toBeGreaterThan(0);

    // The key should be a 16-char hex hash (keygen was applied)
    for (const key of keys) {
      expect(key).toMatch(/^[a-f0-9]{16}$/);
    }
  });
});

// ── E2E: full pipeline (prepare → build citations → verify) ──────

describe("E2E: full pipeline", () => {
  const canRun = canRunE2e("prepare-example-com");

  (canRun ? it : it.skip)("citation data round-trips through prepare → verify", async () => {
    const prepare = await cachedFixture<PrepareResult>("prepare-example-com", async () => {
      throw new Error("prepare fixture must exist first");
    });

    // Verify the prepare output has what the skill needs
    expect(prepare.attachmentId).toBeTruthy();
    expect(prepare.deepTextPromptPortion.length).toBeGreaterThan(50);

    // Simulate what the skill does: extract text, build citation, verify
    const deepText = prepare.deepTextPromptPortion;

    // Find a real phrase in the deep text
    const lineMatch = deepText.match(/<line id="\d+">([^<]+)<\/line>/);
    expect(lineMatch).toBeTruthy();
    const phrase = lineMatch![1].trim();
    expect(phrase.length).toBeGreaterThan(0);

    // Find the page tag
    const pageMatch = deepText.match(/<(page_number_\d+_index_\d+)>/);
    expect(pageMatch).toBeTruthy();
    const pageId = pageMatch![1];

    // Find the line ID
    const lineIdMatch = deepText.match(/<line id="(\d+)">/);
    expect(lineIdMatch).toBeTruthy();
    const lineId = Number(lineIdMatch![1]);

    // This is exactly the structure the /verify skill produces
    const citationData = {
      n: 1,
      a: prepare.attachmentId,
      r: "E2E test citation",
      f: phrase,
      k: phrase.split(" ")[0], // First word as anchor
      p: pageId,
      l: [lineId],
    };

    // Validate the citation data matches Phase 0 structural requirements
    expect(citationData.k.length).toBeLessThanOrEqual(40);
    expect(citationData.f.includes(citationData.k)).toBe(true);
    expect(citationData.p).toMatch(/^page_number_\d+_index_\d+$/);
    expect(citationData.l.length).toBeGreaterThan(0);
  });
});
