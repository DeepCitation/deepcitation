/**
 * Unit tests for the `verify --json` (`--keep-json`) sidecar path.
 *
 * We do not exercise the full verifyHtml pipeline here (it requires a live
 * API call and an attached fixture). Instead we lock down the path-derivation
 * helper that `--json` uses — the actual write-to-disk is one line in the
 * handler and its correctness follows from the helper being correct.
 */

import { describe, expect, it } from "bun:test";
import { basename, dirname, resolve } from "node:path";
import { deriveVerifyResponseSidecarPath } from "../cli/commands.js";

describe("deriveVerifyResponseSidecarPath", () => {
  it("strips a trailing -verified suffix from the stem", () => {
    const out = resolve("/tmp/report-verified.html");
    const side = deriveVerifyResponseSidecarPath(out);
    expect(basename(side)).toBe("report-verify-response.json");
    expect(dirname(side)).toBe(dirname(out));
  });

  it("uses the bare stem when the HTML is not named -verified", () => {
    const out = resolve("/tmp/draft.html");
    const side = deriveVerifyResponseSidecarPath(out);
    expect(basename(side)).toBe("draft-verify-response.json");
  });

  it("places the sidecar next to the HTML regardless of directory", () => {
    const out = resolve("/some/nested/dir/paper-verified.html");
    const side = deriveVerifyResponseSidecarPath(out);
    expect(dirname(side)).toBe(dirname(out));
    expect(basename(side)).toBe("paper-verify-response.json");
  });

  it("handles files with no extension gracefully", () => {
    const out = resolve("/tmp/report-verified");
    const side = deriveVerifyResponseSidecarPath(out);
    expect(basename(side)).toBe("report-verify-response.json");
  });

  it("only strips -verified at the end, not in the middle", () => {
    const out = resolve("/tmp/verified-report.html");
    const side = deriveVerifyResponseSidecarPath(out);
    // The leading "verified-" should NOT be stripped — only a trailing suffix.
    expect(basename(side)).toBe("verified-report-verify-response.json");
  });
});
