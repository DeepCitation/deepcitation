/**
 * Tests for the `verify --pub` one-shot publish flag.
 *
 * `verify --pub` hands its freshly-verified HTML + verify-response.json
 * straight to `publishInMemory`, the shared helper also used by the
 * standalone `publish` subcommand. Most of the upload semantics are
 * covered by cliPublish.test.ts via the disk path. This file focuses on:
 *
 *   1. VERIFY_HELP documents the new flag so agents can discover it.
 *   2. The shared guards (size cap, API-key leak scan, JSON validate)
 *      reject bad payloads **before** any network call — i.e. the same
 *      fail-closed posture used by `publish`, but reached via the
 *      in-memory entry point.
 *
 * We never exercise the full verifyHtml pipeline here: it needs live
 * auth and a live API. The thin wiring inside verifyHtml is:
 *
 *     if (publishAfter) { await publishInMemory(...); }
 *
 * — and its correctness follows from publishInMemory being correct.
 */

import { describe, expect, it } from "@jest/globals";
import { VERIFY_HELP } from "../cli/commands.js";
import { API_KEY_LEAK_RE, MAX_HTML_BYTES, MAX_JSON_BYTES, publishInMemory } from "../cli/publish.js";

describe("verify --pub help surface", () => {
  it("VERIFY_HELP lists --pub / --publish", () => {
    expect(VERIFY_HELP).toContain("--pub");
    expect(VERIFY_HELP).toContain("--publish");
  });

  it("VERIFY_HELP lists --vis for the publish visibility knob", () => {
    expect(VERIFY_HELP).toContain("--vis");
    expect(VERIFY_HELP).toContain("--visibility");
  });

  it("VERIFY_HELP shows a one-shot publish example so agents can copy it", () => {
    expect(VERIFY_HELP).toMatch(/verify --md .*--pub/);
  });
});

describe("publishInMemory fail-closed guards (shared by verify --pub and publish)", () => {
  const MINIMAL_JSON = JSON.stringify({ verifications: { abc: { status: "found" } } });

  it("rejects HTML containing a DeepCitation API key", async () => {
    const html = "<html><body>leaked sk-dc-abcdefghijklmn01 in page</body></html>";
    await expect(
      publishInMemory({
        html,
        verifyResponseJson: MINIMAL_JSON,
        visibility: "unlisted",
      }),
    ).rejects.toThrow(/API key/);
  });

  it("rejects HTML larger than the MAX_HTML_BYTES cap", async () => {
    // Build a string just over the cap without allocating a 10MB regex target.
    const html = "x".repeat(MAX_HTML_BYTES + 1);
    await expect(
      publishInMemory({
        html,
        verifyResponseJson: MINIMAL_JSON,
        visibility: "unlisted",
      }),
    ).rejects.toThrow(/HTML exceeds/);
  });

  it("rejects verify-response.json larger than the MAX_JSON_BYTES cap", async () => {
    const json = "x".repeat(MAX_JSON_BYTES + 1);
    await expect(
      publishInMemory({
        html: "<html><body>ok</body></html>",
        verifyResponseJson: json,
        visibility: "unlisted",
      }),
    ).rejects.toThrow(/verify-response\.json exceeds/);
  });

  it("rejects invalid JSON bodies", async () => {
    await expect(
      publishInMemory({
        html: "<html><body>ok</body></html>",
        verifyResponseJson: "not json at all",
        visibility: "unlisted",
      }),
    ).rejects.toThrow(/not valid JSON/);
  });
});

describe("API_KEY_LEAK_RE regression guard", () => {
  it("matches production-length DeepCitation keys", () => {
    expect(API_KEY_LEAK_RE.test("sk-dc-abcdefghijklmn01")).toBe(true);
  });

  it("does not flag shorter lookalikes (avoid over-eager strips)", () => {
    expect(API_KEY_LEAK_RE.test("sk-dc-short")).toBe(false);
  });
});
