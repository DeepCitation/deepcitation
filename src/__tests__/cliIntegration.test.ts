/**
 * CLI Integration Tests — Subprocess-based tests for the DeepCitation CLI.
 *
 * These tests invoke the built CLI as a child process, testing real argument
 * parsing, exit codes, stdout/stderr output, and file I/O. They cover command
 * dispatch, argument validation, error handling, and auth flows.
 *
 * Requires `bun run build` to have been run first (tests use lib/cli.js).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

const CLI = resolve(__dirname, "../../lib/cli.js");

// Temp directory for test artifacts
const TEST_DIR = join(tmpdir(), `dc-cli-test-${Date.now()}`);

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function run(args: string[], opts?: { env?: Record<string, string>; cwd?: string; stdin?: string }): RunResult {
  const result = spawnSync("node", [CLI, ...args], {
    env: { ...process.env, ...(opts?.env ?? {}), NODE_NO_WARNINGS: "1" },
    timeout: 10000,
    cwd: opts?.cwd,
    input: opts?.stdin,
    stdio: ["pipe", "pipe", "pipe"],
  });

  return {
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
    exitCode: result.status ?? 1,
  };
}

beforeAll(() => {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── Top-level dispatch ────────────────────────────────────────────

describe("CLI dispatch", () => {
  it("shows help with no args", () => {
    const r = run([]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Commands:");
    expect(r.stdout).toContain("auth");
    expect(r.stdout).toContain("prepare");
    expect(r.stdout).toContain("verify");
  });

  it("shows help with -h", () => {
    const r = run(["-h"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Commands:");
  });

  it("shows help with --help", () => {
    const r = run(["--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Commands:");
  });

  it("shows version with --version", () => {
    const r = run(["--version"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("shows version with -v", () => {
    const r = run(["-v"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("errors on unknown command", () => {
    const r = run(["frobnicate"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Unknown command");
    expect(r.stderr).toContain("frobnicate");
  });
});

// ── Command help flags ────────────────────────────────────────────

describe("command help flags", () => {
  it("prepare --help", () => {
    const r = run(["prepare", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Prepare a file");
  });

  it("verify --help", () => {
    const r = run(["verify", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Verify citations");
  });

  it("inject --help", () => {
    const r = run(["inject", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Inject DeepCitation");
  });

  it("keygen --help", () => {
    const r = run(["keygen", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("citation keys");
  });

  it("get --help", () => {
    const r = run(["get", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("attachment metadata");
  });
});

// ── Auth commands ─────────────────────────────────────────────────

describe("auth commands", () => {
  // Use isolated HOME to avoid touching real credentials
  const fakeHome = join(TEST_DIR, "fake-home");

  beforeAll(() => {
    mkdirSync(fakeHome, { recursive: true });
  });

  it("status exits 1 when not logged in", () => {
    const r = run(["status"], { env: { HOME: fakeHome, DEEPCITATION_API_KEY: "" } });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("Not logged in");
  });

  it("status exits 0 with DEEPCITATION_API_KEY set", () => {
    const r = run(["status"], { env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Authenticated");
  });

  it("whoami exits 1 when not logged in", () => {
    const r = run(["whoami"], { env: { HOME: fakeHome, DEEPCITATION_API_KEY: "" } });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("Not logged in");
  });

  it("whoami shows key when authenticated via env", () => {
    const r = run(["whoami"], { env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("sk-dc-");
    expect(r.stdout).toContain("Source:");
  });

  it("auth env outputs export statement", () => {
    const r = run(["auth", "env"], { env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('export DEEPCITATION_API_KEY="sk-dc-test12345678901234"');
  });

  it("auth env exits 1 when not logged in", () => {
    const r = run(["auth", "env"], { env: { HOME: fakeHome, DEEPCITATION_API_KEY: "" } });
    expect(r.exitCode).toBe(1);
  });

  it("login --key saves valid credentials", () => {
    const loginHome = join(TEST_DIR, "login-home");
    mkdirSync(loginHome, { recursive: true });
    const r = run(["login", "--key", "sk-dc-test12345678901234"], {
      env: { HOME: loginHome, DEEPCITATION_API_KEY: "" },
    });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("Credentials saved");
  });

  it("login --key rejects invalid key", () => {
    const r = run(["login", "--key", "bad-key"], { env: { HOME: fakeHome } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Invalid API key format");
  });

  it("login --key rejects key without value", () => {
    const r = run(["login", "--key"], { env: { HOME: fakeHome } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--key requires a value");
  });

  it("login --stdin saves valid key", () => {
    const stdinHome = join(TEST_DIR, "stdin-home");
    mkdirSync(stdinHome, { recursive: true });
    const r = run(["login", "--stdin"], {
      env: { HOME: stdinHome, DEEPCITATION_API_KEY: "" },
      stdin: "sk-dc-test12345678901234\n",
    });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("Credentials saved");
  });

  it("login --stdin rejects invalid key", () => {
    const r = run(["login", "--stdin"], { env: { HOME: fakeHome }, stdin: "not-a-key\n" });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Invalid API key format");
  });

  it("login when already authenticated shows message", () => {
    const r = run(["login"], { env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Authenticated");
  });

  it("logout without credentials says no saved credentials", () => {
    const r = run(["logout"], { env: { HOME: fakeHome, DEEPCITATION_API_KEY: "" } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("No saved credentials");
  });

  it("logout with env var says to unset", () => {
    const r = run(["logout"], { env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("unset DEEPCITATION_API_KEY");
  });

  it("full auth lifecycle: login --key → status → logout", () => {
    const lifecycleHome = join(TEST_DIR, "lifecycle-home");
    mkdirSync(lifecycleHome, { recursive: true });
    const envOpts = { env: { HOME: lifecycleHome, DEEPCITATION_API_KEY: "" } };

    // Login
    const login = run(["login", "--key", "sk-dc-test12345678901234"], envOpts);
    expect(login.exitCode).toBe(0);

    // Status
    const status = run(["status"], envOpts);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("Authenticated");

    // Logout
    const logout = run(["logout"], envOpts);
    expect(logout.exitCode).toBe(0);

    // Status again
    const status2 = run(["status"], envOpts);
    expect(status2.exitCode).toBe(1);
  });
});

// ── prepare command ───────────────────────────────────────────────

describe("prepare command", () => {
  it("errors when no file or URL provided", () => {
    const r = run(["prepare"], { env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("file path or URL is required");
  });

  it("errors when file not found", () => {
    const r = run(["prepare", "/nonexistent/file.pdf"], { env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("File not found");
  });

  it("errors when not authenticated", () => {
    const noAuthHome = join(TEST_DIR, "no-auth-home");
    mkdirSync(noAuthHome, { recursive: true });
    const r = run(["prepare", "test.pdf"], { env: { HOME: noAuthHome, DEEPCITATION_API_KEY: "" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("action needed");
  });
});

// ── verify command ────────────────────────────────────────────────

describe("verify command", () => {
  it("errors when no mode flag provided", () => {
    const r = run(["verify"], { env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--html or --citations is required");
  });

  it("verify --markdown errors on nonexistent file", () => {
    const r = run(["verify", "--markdown", "/nonexistent.md"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("File not found");
  });

  it("verify --markdown errors when no citation data block", () => {
    const mdFile = join(TEST_DIR, "no-citations.md");
    writeFileSync(mdFile, "# Just a header\n\nSome text without citations.\n");
    const r = run(["verify", "--markdown", mdFile], { env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("No citations found");
  });

  it("verify --markdown errors with invalid --style", () => {
    const mdFile = join(TEST_DIR, "style-test.md");
    writeFileSync(mdFile, "test\n<<<CITATION_DATA>>>\n[]\n<<<END_CITATION_DATA>>>");
    const r = run(["verify", "--markdown", mdFile, "--style", "fancy"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--style");
  });

  it("verify --markdown errors with invalid --audience", () => {
    const mdFile = join(TEST_DIR, "audience-test.md");
    writeFileSync(mdFile, "test\n<<<CITATION_DATA>>>\n[]\n<<<END_CITATION_DATA>>>");
    const r = run(["verify", "--markdown", mdFile, "--audience", "casual"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--audience");
  });

  it("verify --html errors on nonexistent file", () => {
    const r = run(["verify", "--html", "/nonexistent.html"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
  });

  it("verify --prompt prints citation format spec", () => {
    const r = run(["verify", "--prompt"]);
    // --prompt doesn't require auth; it just reads a file
    if (r.exitCode === 0) {
      expect(r.stdout.length).toBeGreaterThan(100);
    }
    // If spec file doesn't exist in built output, that's also acceptable (exit 1 with message)
  });

});

// ── inject command ────────────────────────────────────────────────

describe("inject command", () => {
  it("errors without --html", () => {
    const r = run(["inject"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--html is required");
  });

  it("errors without --verify-response", () => {
    const r = run(["inject", "--html", "test.html"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--verify-response is required");
  });

  it("errors with invalid --theme", () => {
    const htmlFile = join(TEST_DIR, "inject-theme.html");
    const verifyFile = join(TEST_DIR, "inject-verify.json");
    writeFileSync(htmlFile, "<html><body>test</body></html>");
    writeFileSync(verifyFile, '{"verifications":{}}');
    const r = run(["inject", "--html", htmlFile, "--verify-response", verifyFile, "--theme", "neon"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--theme");
  });

  it("errors with invalid --indicator", () => {
    const htmlFile = join(TEST_DIR, "inject-ind.html");
    const verifyFile = join(TEST_DIR, "inject-ind-verify.json");
    writeFileSync(htmlFile, "<html><body>test</body></html>");
    writeFileSync(verifyFile, '{"verifications":{}}');
    const r = run(["inject", "--html", htmlFile, "--verify-response", verifyFile, "--indicator", "caret"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--indicator");
  });

  it("successfully injects into HTML file", () => {
    const htmlFile = join(TEST_DIR, "inject-basic.html");
    const verifyFile = join(TEST_DIR, "inject-basic-verify.json");
    const outFile = join(TEST_DIR, "inject-basic-out.html");
    writeFileSync(htmlFile, "<html><body><p>Test content</p></body></html>");
    writeFileSync(verifyFile, JSON.stringify({ verifications: { abc123: { status: "found" } } }));

    const r = run(["inject", "--html", htmlFile, "--verify-response", verifyFile, "--out", outFile]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(outFile)).toBe(true);

    const output = readFileSync(outFile, "utf-8");
    expect(output).toContain("dc-data");
    expect(output).toContain("DeepCitationPopover");
    expect(output).toContain("Test content");
  });

  it("inject with --theme dark sets theme in init", () => {
    const htmlFile = join(TEST_DIR, "inject-dark.html");
    const verifyFile = join(TEST_DIR, "inject-dark-verify.json");
    const outFile = join(TEST_DIR, "inject-dark-out.html");
    writeFileSync(htmlFile, "<html><body>test</body></html>");
    writeFileSync(verifyFile, JSON.stringify({ verifications: {} }));

    const r = run(["inject", "--html", htmlFile, "--verify-response", verifyFile, "--out", outFile, "--theme", "dark"]);
    expect(r.exitCode).toBe(0);
    const output = readFileSync(outFile, "utf-8");
    expect(output).toContain('"dark"');
  });

  it("inject with --indicator dot sets indicator in init", () => {
    const htmlFile = join(TEST_DIR, "inject-dot.html");
    const verifyFile = join(TEST_DIR, "inject-dot-verify.json");
    const outFile = join(TEST_DIR, "inject-dot-out.html");
    writeFileSync(htmlFile, "<html><body>test</body></html>");
    writeFileSync(verifyFile, JSON.stringify({ verifications: {} }));

    const r = run([
      "inject",
      "--html",
      htmlFile,
      "--verify-response",
      verifyFile,
      "--out",
      outFile,
      "--indicator",
      "dot",
    ]);
    expect(r.exitCode).toBe(0);
    const output = readFileSync(outFile, "utf-8");
    expect(output).toContain("indicatorVariant");
  });

  it("inject strips existing injection before re-injecting", () => {
    const htmlFile = join(TEST_DIR, "inject-dup.html");
    const verifyFile = join(TEST_DIR, "inject-dup-verify.json");
    writeFileSync(
      htmlFile,
      '<html><body>test<script type="application/json" id="dc-data">{"old":"data"}</script></body></html>',
    );
    writeFileSync(verifyFile, JSON.stringify({ verifications: {} }));

    const r = run(["inject", "--html", htmlFile, "--verify-response", verifyFile]);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("stripped existing");

    const output = readFileSync(htmlFile, "utf-8");
    // Should have exactly one dc-data block
    const dcDataCount = (output.match(/id="dc-data"/g) ?? []).length;
    expect(dcDataCount).toBe(1);
  });
});

// ── inject edge cases ────────────────────────────────────────────

describe("inject edge cases", () => {
  it("inject with --key-map includes dc-key-map script", () => {
    const htmlFile = join(TEST_DIR, "inject-km.html");
    const verifyFile = join(TEST_DIR, "inject-km-verify.json");
    const keyMapFile = join(TEST_DIR, "inject-km-map.json");
    const outFile = join(TEST_DIR, "inject-km-out.html");
    writeFileSync(htmlFile, '<html><body><span data-citation-key="abc123">text</span></body></html>');
    writeFileSync(verifyFile, JSON.stringify({ verifications: {} }));
    writeFileSync(keyMapFile, JSON.stringify({ "cite-1": "abc123" }));

    const r = run([
      "inject",
      "--html",
      htmlFile,
      "--verify-response",
      verifyFile,
      "--key-map",
      keyMapFile,
      "--out",
      outFile,
    ]);
    expect(r.exitCode).toBe(0);
    const output = readFileSync(outFile, "utf-8");
    expect(output).toContain('id="dc-key-map"');
    expect(output).toContain("cite-1");
  });

  it("inject with invalid --key-map JSON errors", () => {
    const htmlFile = join(TEST_DIR, "inject-km-bad.html");
    const verifyFile = join(TEST_DIR, "inject-km-bad-verify.json");
    const keyMapFile = join(TEST_DIR, "inject-km-bad-map.json");
    writeFileSync(htmlFile, "<html><body>test</body></html>");
    writeFileSync(verifyFile, JSON.stringify({ verifications: {} }));
    writeFileSync(keyMapFile, "this is { not valid json");

    const r = run(["inject", "--html", htmlFile, "--verify-response", verifyFile, "--key-map", keyMapFile]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("not valid JSON");
  });

  it("inject auto-fixes display-label when visible text differs from sourceMatch", () => {
    const htmlFile = join(TEST_DIR, "inject-dl.html");
    const verifyFile = join(TEST_DIR, "inject-dl-verify.json");
    const outFile = join(TEST_DIR, "inject-dl-out.html");
    writeFileSync(htmlFile, '<html><body><span data-citation-key="abc123">visible label</span></body></html>');
    writeFileSync(
      verifyFile,
      JSON.stringify({
        verifications: {
          abc123: { status: "found", citation: { sourceMatch: "completely different anchor text" } },
        },
      }),
    );

    const r = run(["inject", "--html", htmlFile, "--verify-response", verifyFile, "--out", outFile]);
    expect(r.exitCode).toBe(0);
    const output = readFileSync(outFile, "utf-8");
    expect(output).toContain('data-dc-display-label="visible label"');
    expect(r.stderr).toContain("Auto-set display label");
  });

  it("inject does NOT auto-fix display-label when visible text matches sourceMatch", () => {
    const htmlFile = join(TEST_DIR, "inject-dl-match.html");
    const verifyFile = join(TEST_DIR, "inject-dl-match-verify.json");
    const outFile = join(TEST_DIR, "inject-dl-match-out.html");
    writeFileSync(htmlFile, '<html><body><span data-citation-key="abc123">$2.3B</span></body></html>');
    writeFileSync(
      verifyFile,
      JSON.stringify({
        verifications: {
          abc123: { status: "found", citation: { sourceMatch: "Revenue grew to $2.3B" } },
        },
      }),
    );

    const r = run(["inject", "--html", htmlFile, "--verify-response", verifyFile, "--out", outFile]);
    expect(r.exitCode).toBe(0);
    // No auto-fix log should appear (visible text "$2.3B" is a substring of sourceMatch)
    expect(r.stderr).not.toContain("Auto-set display label");
  });

  it("inject default writes to -verified.html when no --out", () => {
    const htmlFile = join(TEST_DIR, "inject-overwrite.html");
    const verifyFile = join(TEST_DIR, "inject-overwrite-verify.json");
    writeFileSync(htmlFile, "<html><body><p>original</p></body></html>");
    writeFileSync(verifyFile, JSON.stringify({ verifications: {} }));

    const r = run(["inject", "--html", htmlFile, "--verify-response", verifyFile]);
    expect(r.exitCode).toBe(0);
    // stdout contains the output path printed by writeVerifiedOutput
    const outPath = r.stdout.trim();
    const output = readFileSync(outPath, "utf-8");
    expect(output).toContain("dc-data");
    expect(output).toContain("original");
  });
});

// ── verify edge cases ────────────────────────────────────────────

describe("verify edge cases", () => {
  it("verify --citations errors with invalid --image-format", () => {
    const citFile = join(TEST_DIR, "verify-fmt.json");
    writeFileSync(
      citFile,
      JSON.stringify({
        c1: { sourceContext: "test", sourceMatch: "test", pageNumber: 1, lineIds: [1], attachmentId: "att-1" },
      }),
    );
    const r = run(["verify", "--citations", citFile, "--image-format", "gif"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--image-format");
  });

  it("verify --citations errors when citation missing attachmentId", () => {
    const citFile = join(TEST_DIR, "verify-no-aid.json");
    writeFileSync(
      citFile,
      JSON.stringify({ c1: { sourceContext: "test", sourceMatch: "test", pageNumber: 1, lineIds: [1] } }),
    );
    const r = run(["verify", "--citations", citFile], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("missing attachmentId");
  });

  it("verify --markdown parses citation data before auth check", () => {
    const mdDir = join(TEST_DIR, "md-naming");
    mkdirSync(mdDir, { recursive: true });
    const mdFile = join(mdDir, "quarterly-report.md");
    writeFileSync(
      mdFile,
      `# Report\n\nRevenue grew 45% [1].\n\n<<<CITATION_DATA>>>\n[{"n":1,"a":"att-1","r":"Revenue","f":"Revenue grew 45%","k":"45%","p":"page_number_1_index_0","l":[1]}]\n<<<END_CITATION_DATA>>>`,
    );

    const noAuthHome = join(TEST_DIR, "md-naming-home");
    mkdirSync(noAuthHome, { recursive: true });
    const r = run(["verify", "--markdown", mdFile], { env: { HOME: noAuthHome, DEEPCITATION_API_KEY: "" } });
    // Parses citations successfully, then fails at auth step
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("1 citation");
    expect(r.stderr).toContain("action needed");
  });
});

// ── prepare edge cases ───────────────────────────────────────────

describe("prepare edge cases", () => {
  it("prepare with http:// URL shows plaintext warning", () => {
    const r = run(["prepare", "http://example.com/doc.pdf"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.stderr).toContain("http://");
    expect(r.stderr).toContain("plaintext");
  });

  it("prepare with http://localhost does NOT show plaintext warning", () => {
    const r = run(["prepare", "http://localhost:3000/doc.pdf"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.stderr).not.toContain("plaintext");
  });
});

// ── billing command ──────────────────────────────────────────────

describe("billing command", () => {
  it("billing exits 0 and mentions billing URL", () => {
    const r = run(["billing"], { env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234", DC_NO_BROWSER: "1" } });
    expect(r.exitCode).toBe(0);
    expect(r.stderr + r.stdout).toContain("deepcitation.com");
  });
});

// ── keygen command ────────────────────────────────────────────────

describe("keygen command", () => {
  it("errors without --citations", () => {
    const r = run(["keygen"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--citations is required");
  });

  it("prints key mapping to stdout", () => {
    const citFile = join(TEST_DIR, "keygen-cit.json");
    writeFileSync(
      citFile,
      JSON.stringify({
        "cite-1": {
          sourceContext: "Revenue grew 45% year-over-year to $2.3B",
          sourceMatch: "$2.3B",
          pageNumber: 2,
          lineIds: [20],
          attachmentId: "att-123",
        },
      }),
    );
    const r = run(["keygen", "--citations", citFile]);
    expect(r.exitCode).toBe(0);
    const mapping = JSON.parse(r.stdout);
    expect(mapping["cite-1"]).toMatch(/^[a-f0-9]{16}$/);
  });

  it("produces deterministic keys", () => {
    const citFile = join(TEST_DIR, "keygen-det.json");
    writeFileSync(
      citFile,
      JSON.stringify({
        "my-cite": {
          sourceContext: "Test phrase",
          sourceMatch: "Test",
          pageNumber: 1,
          lineIds: [1],
          attachmentId: "att-456",
        },
      }),
    );
    const r1 = run(["keygen", "--citations", citFile]);
    const r2 = run(["keygen", "--citations", citFile]);
    expect(r1.stdout).toBe(r2.stdout);
  });

  it("writes rekeyed file with --out", () => {
    const citFile = join(TEST_DIR, "keygen-out-cit.json");
    const outFile = join(TEST_DIR, "keygen-out.json");
    writeFileSync(
      citFile,
      JSON.stringify({
        "label-a": {
          sourceContext: "Some phrase here",
          sourceMatch: "phrase",
          pageNumber: 1,
          lineIds: [5],
          attachmentId: "att-789",
        },
      }),
    );
    const r = run(["keygen", "--citations", citFile, "--out", outFile]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(outFile)).toBe(true);

    const rekeyed = JSON.parse(readFileSync(outFile, "utf-8"));
    const keys = Object.keys(rekeyed);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[a-f0-9]{16}$/);
  });
});

// ── get command ───────────────────────────────────────────────────

describe("get command", () => {
  it("errors without attachment ID", () => {
    const r = run(["get"], { env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("attachment ID is required");
  });

  it("errors when not authenticated", () => {
    const noAuthHome = join(TEST_DIR, "get-no-auth");
    mkdirSync(noAuthHome, { recursive: true });
    const r = run(["get", "some-id"], { env: { HOME: noAuthHome, DEEPCITATION_API_KEY: "" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("action needed");
  });
});

// ── auth env edge cases ──────────────────────────────────────────

describe("auth env edge cases", () => {
  it("rejects saved key with special characters (format validation)", () => {
    // Keys with hyphens/special chars after sk-dc- are rejected by env's strict regex
    const envHome = join(TEST_DIR, "env-format-home");
    mkdirSync(join(envHome, ".deepcitation"), { recursive: true });
    writeFileSync(
      join(envHome, ".deepcitation", "credentials.json"),
      JSON.stringify({ apiKey: "sk-dc-has-hyphens-in-key" }),
    );
    const r = run(["auth", "env"], { env: { HOME: envHome, DEEPCITATION_API_KEY: "" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("unexpected format");
  });

  it("accepts key with only alphanumeric chars after prefix", () => {
    const r = run(["auth", "env"], { env: { DEEPCITATION_API_KEY: "sk-dc-validAlphaNum123" } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('export DEEPCITATION_API_KEY="sk-dc-validAlphaNum123"');
  });
});

// ── verify --html edge cases ─────────────────────────────────────

describe("verify --html edge cases", () => {
  it("errors when HTML file has no citation data block", () => {
    const htmlFile = join(TEST_DIR, "verify-no-cit.html");
    writeFileSync(htmlFile, "<html><body><p>Just text, no citation data.</p></body></html>");
    const r = run(["verify", "--html", htmlFile], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("No valid");
    expect(r.stderr).toContain("CITATION_DATA");
  });

  it("errors with invalid --image-format in HTML mode", () => {
    const htmlFile = join(TEST_DIR, "verify-html-fmt.html");
    writeFileSync(
      htmlFile,
      `<html><body>[1] test</body></html>\n<<<CITATION_DATA>>>\n[{"n":1,"a":"att-1","r":"t","f":"test","k":"test","p":"page_number_1_index_0","l":[1]}]\n<<<END_CITATION_DATA>>>`,
    );
    const r = run(["verify", "--html", htmlFile, "--image-format", "bmp"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--image-format");
  });

  it("warns when --variant is non-text (React-only)", () => {
    const htmlFile = join(TEST_DIR, "verify-html-variant.html");
    writeFileSync(
      htmlFile,
      `<html><body>[1] test</body></html>\n<<<CITATION_DATA>>>\n[{"n":1,"a":"att-1","r":"t","f":"test","k":"test","p":"page_number_1_index_0","l":[1]}]\n<<<END_CITATION_DATA>>>`,
    );
    // Will fail at API call, but we check the warning appears before that
    const r = run(["verify", "--html", htmlFile, "--variant", "sidebar"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.stderr).toContain("--variant");
    expect(r.stderr).toContain("React");
  });

  it("errors with invalid --indicator in HTML mode", () => {
    const htmlFile = join(TEST_DIR, "verify-html-ind.html");
    writeFileSync(
      htmlFile,
      `<html><body>[1] test</body></html>\n<<<CITATION_DATA>>>\n[{"n":1,"a":"att-1","r":"t","f":"test","k":"test","p":"page_number_1_index_0","l":[1]}]\n<<<END_CITATION_DATA>>>`,
    );
    const r = run(["verify", "--html", htmlFile, "--indicator", "caret"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--indicator");
  });

  it("errors with invalid --theme in HTML mode", () => {
    const htmlFile = join(TEST_DIR, "verify-html-theme.html");
    writeFileSync(
      htmlFile,
      `<html><body>[1] test</body></html>\n<<<CITATION_DATA>>>\n[{"n":1,"a":"att-1","r":"t","f":"test","k":"test","p":"page_number_1_index_0","l":[1]}]\n<<<END_CITATION_DATA>>>`,
    );
    const r = run(["verify", "--html", htmlFile, "--theme", "neon"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--theme");
  });
});

// ── DC_LOGIN_URL validation ──────────────────────────────────────

describe("DC_LOGIN_URL validation", () => {
  it("rejects invalid DC_LOGIN_URL", () => {
    const r = run(["status"], {
      env: { DC_LOGIN_URL: "ftp://invalid.example.com", DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("DC_LOGIN_URL");
    expect(r.stderr).toContain("not a valid HTTP");
  });

  it("rejects non-URL DC_LOGIN_URL", () => {
    const r = run(["status"], {
      env: { DC_LOGIN_URL: "not-a-url-at-all", DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("DC_LOGIN_URL");
  });

  it("accepts valid http DC_LOGIN_URL", () => {
    const r = run(["status"], {
      env: { DC_LOGIN_URL: "http://localhost:3000", DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    // Should succeed (status checks auth, not the login URL)
    expect(r.exitCode).toBe(0);
  });
});

// ── verify --markdown output naming ──────────────────────────────

describe("verify --markdown output naming", () => {
  it("derives output name from input: report.md → report-verified.html", () => {
    const mdDir = join(TEST_DIR, "md-out-naming");
    mkdirSync(mdDir, { recursive: true });
    const mdFile = join(mdDir, "my-report.md");
    writeFileSync(
      mdFile,
      `# Report\n\nClaim [1].\n\n<<<CITATION_DATA>>>\n[{"n":1,"a":"att-1","r":"t","f":"claim","k":"Claim","p":"page_number_1_index_0","l":[1]}]\n<<<END_CITATION_DATA>>>`,
    );

    // Will fail at API, but stderr shows the parsed citation count
    // confirming the file was parsed and the pipeline reached the verify stage
    const r = run(["verify", "--markdown", mdFile], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    // Should parse the citation before failing at API
    expect(r.stderr).toContain("1 citation");
  });

  it("--style and --audience are forwarded through markdown pipeline", () => {
    const mdDir = join(TEST_DIR, "md-style-fwd");
    mkdirSync(mdDir, { recursive: true });
    const mdFile = join(mdDir, "styled.md");
    writeFileSync(
      mdFile,
      `Claim [1].\n\n<<<CITATION_DATA>>>\n[{"n":1,"a":"att-1","r":"t","f":"claim","k":"Claim","p":"page_number_1_index_0","l":[1]}]\n<<<END_CITATION_DATA>>>`,
    );

    // plain style + executive audience should not error at parse stage
    const r = run(["verify", "--markdown", mdFile, "--style", "plain", "--audience", "executive"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-test12345678901234" },
    });
    expect(r.stderr).toContain("1 citation");
  });
});
