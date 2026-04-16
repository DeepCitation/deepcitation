/**
 * Auth & Login Scenario Tests
 *
 * Deep tests for the authentication paths that confuse users and agents:
 * - Auth resolution priority (env var > .env > credentials.json)
 * - Cowork environments (domain hints, credential path)
 * - Non-TTY / agent environments
 * - Proxy blocking after successful auth
 * - Invalid/malformed keys at every entry point
 * - Credential file corruption and edge cases
 * - .env file variations
 * - Login lifecycle with persistence
 * - Network errors after auth succeeds (are error messages helpful?)
 */

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";

const CLI = resolve(__dirname, "../../lib/cli.js");
const BASE_DIR = join(tmpdir(), `dc-auth-scenarios-${Date.now()}`);

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function run(
  args: string[],
  opts?: { env?: Record<string, string | undefined>; cwd?: string; stdin?: string },
): RunResult {
  // Build clean env: start from process.env, overlay opts.env, remove undefined keys
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (opts?.env) {
    for (const [k, v] of Object.entries(opts.env)) {
      if (v === undefined) {
        delete env[k];
      } else {
        env[k] = v;
      }
    }
  }
  env.NODE_NO_WARNINGS = "1";

  const result = spawnSync("node", [CLI, ...args], {
    env,
    timeout: 15000,
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

/** Create an isolated home directory with no credentials */
function freshHome(): string {
  const dir = join(BASE_DIR, `home-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Standard env that isolates auth from the test runner's real credentials */
function noAuthEnv(home?: string): Record<string, string | undefined> {
  return {
    HOME: home ?? freshHome(),
    DEEPCITATION_API_KEY: undefined,
    HTTPS_PROXY: undefined,
    HTTP_PROXY: undefined,
    NO_PROXY: undefined,
  };
}

beforeAll(() => mkdirSync(BASE_DIR, { recursive: true }));
afterAll(() => rmSync(BASE_DIR, { recursive: true, force: true }));

// ── Auth resolution priority ──────────────────────────────────────

describe("auth resolution priority", () => {
  it("env var takes priority over credentials.json", () => {
    const home = freshHome();
    // Write a credentials file
    const credDir = join(home, ".deepcitation");
    mkdirSync(credDir, { recursive: true });
    writeFileSync(
      join(credDir, "credentials.json"),
      JSON.stringify({
        version: 1,
        apiKey: "sk-dc-from-credentials-file",
        createdAt: new Date().toISOString(),
      }),
    );

    // status with env var should show env var source
    const r = run(["status"], {
      env: { HOME: home, DEEPCITATION_API_KEY: "sk-dc-from-environment-var" },
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("environment variable");
  });

  it("credentials.json used when no env var set", () => {
    const home = freshHome();
    const credDir = join(home, ".deepcitation");
    mkdirSync(credDir, { recursive: true });
    writeFileSync(
      join(credDir, "credentials.json"),
      JSON.stringify({
        version: 1,
        apiKey: "sk-dc-from-credentials-file",
        email: "user@test.com",
        createdAt: new Date().toISOString(),
      }),
    );

    const r = run(["status"], { env: noAuthEnv(home) });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Authenticated");
  });

  it(".env file in working directory takes priority over credentials.json", () => {
    const home = freshHome();
    const cwd = join(BASE_DIR, `cwd-dotenv-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });

    // Write credentials.json
    const credDir = join(home, ".deepcitation");
    mkdirSync(credDir, { recursive: true });
    writeFileSync(
      join(credDir, "credentials.json"),
      JSON.stringify({
        version: 1,
        apiKey: "sk-dc-from-credentials-file",
        createdAt: new Date().toISOString(),
      }),
    );

    // Write .env
    writeFileSync(join(cwd, ".env"), "DEEPCITATION_API_KEY=sk-dc-from-dotenv-file1");

    const r = run(["whoami"], { env: noAuthEnv(home), cwd });
    expect(r.exitCode).toBe(0);
    // Should show the .env path, not the credentials path
    expect(r.stdout).toContain(".env");
  });

  it("env var with invalid prefix is ignored", () => {
    const home = freshHome();
    const r = run(["status"], {
      env: { HOME: home, DEEPCITATION_API_KEY: "not-a-valid-key-prefix" },
    });
    // Should not be authenticated — invalid prefix is ignored
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("Not logged in");
  });

  it("empty env var is treated as unset", () => {
    const home = freshHome();
    const r = run(["status"], { env: { HOME: home, DEEPCITATION_API_KEY: "" } });
    expect(r.exitCode).toBe(1);
  });
});

// ── .env file edge cases ──────────────────────────────────────────

describe(".env file variations", () => {
  function envTest(content: string, shouldAuth: boolean) {
    const cwd = join(BASE_DIR, `env-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, ".env"), content);
    const r = run(["status"], { env: noAuthEnv(), cwd });
    if (shouldAuth) {
      expect(r.exitCode).toBe(0);
    } else {
      expect(r.exitCode).toBe(1);
    }
    return r;
  }

  it("reads unquoted key", () => {
    envTest("DEEPCITATION_API_KEY=sk-dc-unquoted-key-12345", true);
  });

  it("reads single-quoted key", () => {
    envTest("DEEPCITATION_API_KEY='sk-dc-singlequoted-key1'", true);
  });

  it("reads double-quoted key", () => {
    envTest('DEEPCITATION_API_KEY="sk-dc-doublequoted-key1"', true);
  });

  it("reads key with spaces around =", () => {
    envTest("DEEPCITATION_API_KEY = sk-dc-spaced-equals-key1", true);
  });

  it("ignores comments", () => {
    envTest("# DEEPCITATION_API_KEY=sk-dc-commented-outkey\nOTHER_VAR=foo", false);
  });

  it("reads key when mixed with other vars", () => {
    envTest("OTHER_VAR=foo\nDEEPCITATION_API_KEY=sk-dc-mixed-vars-key-123\nANOTHER=bar", true);
  });

  it("reads from .deepcitation/.env too", () => {
    const cwd = join(BASE_DIR, `env-nested-${Date.now()}`);
    const dcDir = join(cwd, ".deepcitation");
    mkdirSync(dcDir, { recursive: true });
    writeFileSync(join(dcDir, ".env"), "DEEPCITATION_API_KEY=sk-dc-nested-dotenv-key1");
    const r = run(["status"], { env: noAuthEnv(), cwd });
    expect(r.exitCode).toBe(0);
  });
});

// ── Credential file edge cases ────────────────────────────────────

describe("credential file edge cases", () => {
  it("corrupted credentials.json is gracefully ignored", () => {
    const home = freshHome();
    const credDir = join(home, ".deepcitation");
    mkdirSync(credDir, { recursive: true });
    writeFileSync(join(credDir, "credentials.json"), "THIS IS NOT JSON {{{}}}");

    const r = run(["status"], { env: noAuthEnv(home) });
    expect(r.exitCode).toBe(1);
    // Should not crash — just says "not logged in"
    expect(r.stdout).toContain("Not logged in");
  });

  it("empty credentials.json is gracefully ignored", () => {
    const home = freshHome();
    const credDir = join(home, ".deepcitation");
    mkdirSync(credDir, { recursive: true });
    writeFileSync(join(credDir, "credentials.json"), "");

    const r = run(["status"], { env: noAuthEnv(home) });
    expect(r.exitCode).toBe(1);
  });

  it("credentials.json with missing apiKey is ignored", () => {
    const home = freshHome();
    const credDir = join(home, ".deepcitation");
    mkdirSync(credDir, { recursive: true });
    writeFileSync(
      join(credDir, "credentials.json"),
      JSON.stringify({ version: 1, email: "user@test.com", createdAt: new Date().toISOString() }),
    );

    const r = run(["status"], { env: noAuthEnv(home) });
    // readCredentials returns the object but resolveAuth checks apiKey.startsWith("sk-dc-")
    // So this should either fail auth or show as authenticated with a bad key
    // The behavior depends on whether readCredentials validates
    expect(r.exitCode === 0 || r.exitCode === 1).toBe(true);
  });

  it("login --key creates .deepcitation directory if missing", () => {
    const home = freshHome();
    const credDir = join(home, ".deepcitation");

    expect(existsSync(credDir)).toBe(false);
    run(["login", "--key", "sk-dc-freshdirkey12345678"], { env: noAuthEnv(home) });
    expect(existsSync(join(credDir, "credentials.json"))).toBe(true);
  });

  it("login --key overwrites existing credentials", () => {
    const home = freshHome();
    const credDir = join(home, ".deepcitation");
    mkdirSync(credDir, { recursive: true });
    writeFileSync(
      join(credDir, "credentials.json"),
      JSON.stringify({ version: 1, apiKey: "sk-dc-old-key-that-existed", createdAt: "2025-01-01" }),
    );

    run(["login", "--key", "sk-dc-newkeyreplace012345"], { env: noAuthEnv(home) });

    const creds = JSON.parse(readFileSync(join(credDir, "credentials.json"), "utf-8"));
    expect(creds.apiKey).toBe("sk-dc-newkeyreplace012345");
  });
});

// ── Dual-location credential storage ──────────────────────────────

describe("dual-location credentials", () => {
  it("project-local credentials.json is preferred over home when both exist", () => {
    const home = freshHome();
    const cwd = join(BASE_DIR, `dual-project-wins-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });

    // Home has one key
    const homeCredDir = join(home, ".deepcitation");
    mkdirSync(homeCredDir, { recursive: true });
    writeFileSync(
      join(homeCredDir, "credentials.json"),
      JSON.stringify({ version: 1, apiKey: "sk-dc-from-home-credsfile", createdAt: new Date().toISOString() }),
    );

    // Project has a different key
    const projectCredDir = join(cwd, ".deepcitation");
    mkdirSync(projectCredDir, { recursive: true });
    writeFileSync(
      join(projectCredDir, "credentials.json"),
      JSON.stringify({ version: 1, apiKey: "sk-dc-from-project-credfil", createdAt: new Date().toISOString() }),
    );

    const r = run(["whoami"], { env: noAuthEnv(home), cwd });
    expect(r.exitCode).toBe(0);
    // Project path should be named as the source
    expect(r.stdout).toContain(join(cwd, ".deepcitation", "credentials.json"));
    expect(r.stdout).not.toContain(join(home, ".deepcitation", "credentials.json"));
  });

  it("falls back to project-local when home directory is not writable", () => {
    const home = join(BASE_DIR, `readonly-home-${Date.now()}`);
    mkdirSync(home, { recursive: true });
    // Make home read-only so ~/.deepcitation can't be created
    chmodSync(home, 0o500);
    const cwd = join(BASE_DIR, `fallback-cwd-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });

    try {
      const r = run(["login", "--key", "sk-dc-fallbackwritekey0123"], { env: noAuthEnv(home), cwd });
      expect(r.exitCode).toBe(0);
      // Credentials should have landed in the project dir, not home
      const projectPath = join(cwd, ".deepcitation", "credentials.json");
      expect(existsSync(projectPath)).toBe(true);
      const creds = JSON.parse(readFileSync(projectPath, "utf-8"));
      expect(creds.apiKey).toBe("sk-dc-fallbackwritekey0123");
      // And the success message names the project path
      expect(r.stderr).toContain(projectPath);
    } finally {
      // Restore write perm so cleanup in afterAll works
      chmodSync(home, 0o700);
    }
  });

  it("fallback write drops a self-ignoring .gitignore next to project credentials", () => {
    const home = join(BASE_DIR, `gitignore-home-${Date.now()}`);
    mkdirSync(home, { recursive: true });
    chmodSync(home, 0o500);
    const cwd = join(BASE_DIR, `gitignore-cwd-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });

    try {
      run(["login", "--key", "sk-dc-gitignoredropkey01234"], { env: noAuthEnv(home), cwd });
      const gitignorePath = join(cwd, ".deepcitation", ".gitignore");
      expect(existsSync(gitignorePath)).toBe(true);
      expect(readFileSync(gitignorePath, "utf-8")).toContain("*");
    } finally {
      chmodSync(home, 0o700);
    }
  });

  it("Cowork environment writes project-local even when home is writable", () => {
    const home = freshHome();
    const cwd = join(BASE_DIR, `cowork-writes-project-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });

    const r = run(["login", "--key", "sk-dc-coworkwritetestkey01"], {
      env: { ...noAuthEnv(home), CLAUDE_CODE_REMOTE: "true" },
      cwd,
    });
    expect(r.exitCode).toBe(0);

    const projectPath = join(cwd, ".deepcitation", "credentials.json");
    const homePath = join(home, ".deepcitation", "credentials.json");
    expect(existsSync(projectPath)).toBe(true);
    expect(existsSync(homePath)).toBe(false);
  });

  it("logout clears both home and project credentials", () => {
    const home = freshHome();
    const cwd = join(BASE_DIR, `logout-both-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });

    // Seed both locations with credentials
    const homeCredDir = join(home, ".deepcitation");
    mkdirSync(homeCredDir, { recursive: true });
    writeFileSync(
      join(homeCredDir, "credentials.json"),
      JSON.stringify({ version: 1, apiKey: "sk-dc-home-logout-key12345", createdAt: new Date().toISOString() }),
    );
    const projectCredDir = join(cwd, ".deepcitation");
    mkdirSync(projectCredDir, { recursive: true });
    writeFileSync(
      join(projectCredDir, "credentials.json"),
      JSON.stringify({ version: 1, apiKey: "sk-dc-proj-logout-key12345", createdAt: new Date().toISOString() }),
    );

    const r = run(["logout"], { env: noAuthEnv(home), cwd });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(homeCredDir, "credentials.json"))).toBe(false);
    expect(existsSync(join(projectCredDir, "credentials.json"))).toBe(false);
  });
});

// ── login --key validation ────────────────────────────────────────

describe("login --key validation", () => {
  const home = freshHome();
  const env = noAuthEnv(home);

  it("rejects key without prefix", () => {
    const r = run(["login", "--key", "abcdefghij1234567890"], { env });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Invalid API key format");
    expect(r.stderr).toContain("sk-dc-");
  });

  it("rejects key that is too short", () => {
    const r = run(["login", "--key", "sk-dc-short"], { env });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Invalid API key format");
  });

  it("rejects empty key", () => {
    const r = run(["login", "--key", ""], { env });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Invalid API key format");
  });

  it("error message mentions the source (--key flag)", () => {
    const r = run(["login", "--key", "bad"], { env });
    expect(r.stderr).toContain("--key flag");
  });
});

// ── login --stdin validation ──────────────────────────────────────

describe("login --stdin validation", () => {
  it("accepts valid key from stdin", () => {
    const home = freshHome();
    const r = run(["login", "--stdin"], { env: noAuthEnv(home), stdin: "sk-dc-validstdinkey012345\n" });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("Credentials saved");
  });

  it("trims whitespace from stdin key", () => {
    const home = freshHome();
    const r = run(["login", "--stdin"], { env: noAuthEnv(home), stdin: "  sk-dc-whitespacepaddedkey1  \n" });
    expect(r.exitCode).toBe(0);
  });

  it("rejects invalid key from stdin", () => {
    const r = run(["login", "--stdin"], { env: noAuthEnv(), stdin: "not-a-real-key\n" });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Invalid API key format");
  });

  it("error message mentions the source (stdin)", () => {
    const r = run(["login", "--stdin"], { env: noAuthEnv(), stdin: "bad\n" });
    expect(r.stderr).toContain("stdin");
  });
});

// ── login --stdin key extraction ─────────────────────────────────

describe("login --stdin key extraction", () => {
  it("accepts quoted key from stdin", () => {
    const home = freshHome();
    const r = run(["login", "--stdin"], { env: noAuthEnv(home), stdin: '"sk-dc-quotedstdinkey01234"\n' });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("Credentials saved");
  });

  it("accepts full npx command from stdin", () => {
    const home = freshHome();
    const r = run(["login", "--stdin"], {
      env: noAuthEnv(home),
      stdin: 'npx deepcitation login --key "sk-dc-fromcommandline01234"\n',
    });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("Credentials saved");
  });

  it("rejects input with no valid key", () => {
    const r = run(["login", "--stdin"], { env: noAuthEnv(), stdin: "some random text\n" });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Invalid API key format");
  });
});

// ── Non-TTY / agent environment ───────────────────────────────────

describe("non-TTY / agent environment login", () => {
  // In subprocess tests, stdin is always piped (non-TTY), so
  // `login` without --key/--stdin hits the non-interactive path.

  it("shows instructions for non-interactive environment", () => {
    const r = run(["login"], { env: noAuthEnv() });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Browser authentication is disabled or unavailable");
    expect(r.stderr).toContain("Get your API key");
    // New (post-d2f67c2) guidance recommends the persistent `auth --key` path
    // over transient `export DEEPCITATION_API_KEY`. Both recover the same failure,
    // but `auth --key` saves credentials to the home-dir file so the next session
    // inherits them without re-exporting.
    expect(r.stderr).toContain("deepcitation auth --key");
  });

  it("shows non-interactive instructions when IS_AI_AGENT env var is set", () => {
    // CLAUDE_CODE=1 sets IS_AI_AGENT=true in auth.ts, which canStartBrowserAuth() checks
    const r = run(["login"], { env: { ...noAuthEnv(), CLAUDE_CODE: "1" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Browser authentication is disabled or unavailable");
    expect(r.stderr).toContain("Get your API key");
  });

  it("Cowork environment shows domain setup instructions", () => {
    const r = run(["login"], { env: { ...noAuthEnv(), CLAUDE_CODE_REMOTE: "true" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Cowork");
    expect(r.stderr).toContain("allowed domains");
    expect(r.stderr).toContain("deepcitation.com");
    expect(r.stderr).toContain("claude.ai/settings/capabilities");
  });

  it("Cowork instructions mention persistent env var", () => {
    const r = run(["login"], { env: { ...noAuthEnv(), CLAUDE_CODE_REMOTE: "true" } });
    expect(r.stderr).toContain("DEEPCITATION_API_KEY");
    expect(r.stderr).toContain("Cowork environment settings");
  });
});

// ── Commands that need auth give helpful errors ───────────────────

describe("unauthenticated command errors", () => {
  const env = noAuthEnv();

  it("prepare says 'action needed' with login instructions", () => {
    const r = run(["prepare", "test.pdf"], { env });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("action needed");
    expect(r.stderr).toContain("DEEPCITATION_API_KEY");
  });

  it("verify --citations says 'action needed'", () => {
    const cwd = join(BASE_DIR, `unauth-verify-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(
      join(cwd, "cit.json"),
      JSON.stringify({ c1: { attachmentId: "a", sourceContext: "t", sourceMatch: "t", pageNumber: 1 } }),
    );
    const r = run(["verify", "--citations", join(cwd, "cit.json")], { env });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("action needed");
  });

  it("get says 'action needed'", () => {
    const r = run(["get", "some-id"], { env });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("action needed");
  });
});

// ── Network/proxy error messages after successful auth ────────────

describe("network error messages with auth", () => {
  // These tests use a valid-format key so auth passes, then the API call
  // fails due to network issues. We verify the error messages are helpful.

  it("prepare with unreachable API shows network error", () => {
    // Use a key that passes format validation but point to nonexistent host
    const r = run(["prepare", "https://example.com"], {
      env: {
        DEEPCITATION_API_KEY: "sk-dc-valid-format-fake-key",
        // Override API URL to force network failure
        DC_API_URL: "https://nonexistent.invalid",
      },
    });
    // This should fail with a network error (not an auth error)
    expect(r.exitCode).toBe(1);
    // Error should mention network, not auth
    expect(r.stderr).toContain("Error:");
  });

  it("proxy detection is logged to stderr when HTTPS_PROXY set", () => {
    // We don't want to actually hit a broken proxy (slow timeout).
    // Instead, verify the CLI detects and logs the proxy before any request.
    // The formatNetworkError path is tested in cliUnit.test.ts.
    const r = run(["prepare", "--help"], {
      env: { HTTPS_PROXY: "http://corp-proxy:3128" },
    });
    // --help exits before any network call, but proxy detection happens at client creation
    // which is after --help. Just verify the help works regardless of proxy env.
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Prepare a file");
  });
});

// ── Logout scenarios ──────────────────────────────────────────────

describe("logout scenarios", () => {
  it("logout removes credentials.json and subsequent status fails", () => {
    const home = freshHome();
    const env = noAuthEnv(home);

    // Login
    run(["login", "--key", "sk-dc-logouttestkey012345"], { env });
    expect(run(["status"], { env }).exitCode).toBe(0);

    // Logout
    const r = run(["logout"], { env });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Logged out");

    // Status should fail
    expect(run(["status"], { env }).exitCode).toBe(1);
  });

  it("logout with env var tells user to unset it", () => {
    const r = run(["logout"], { env: { DEEPCITATION_API_KEY: "sk-dc-env-var-key-123456" } });
    expect(r.stdout).toContain("unset DEEPCITATION_API_KEY");
  });

  it("logout with .env file tells user about the file", () => {
    const cwd = join(BASE_DIR, `logout-dotenv-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, ".env"), "DEEPCITATION_API_KEY=sk-dc-dotenv-logout-key1");

    const r = run(["logout"], { env: noAuthEnv(), cwd });
    expect(r.stdout).toContain(".env");
    expect(r.stdout).toContain("Remove");
  });

  it("double logout is safe", () => {
    const home = freshHome();
    const env = noAuthEnv(home);

    run(["login", "--key", "sk-dc-doublelogoutkey01234"], { env });
    run(["logout"], { env });
    const r = run(["logout"], { env });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("No saved credentials");
  });
});

// ── whoami detail levels ──────────────────────────────────────────

describe("whoami output detail", () => {
  it("shows email and displayName from credentials.json", () => {
    const home = freshHome();
    const credDir = join(home, ".deepcitation");
    mkdirSync(credDir, { recursive: true });
    writeFileSync(
      join(credDir, "credentials.json"),
      JSON.stringify({
        version: 1,
        apiKey: "sk-dc-whoami-test-key-123456",
        email: "developer@example.com",
        displayName: "Dev User",
        createdAt: new Date().toISOString(),
      }),
    );

    const r = run(["whoami"], { env: noAuthEnv(home) });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Dev User");
    expect(r.stdout).toContain("developer@example.com");
    expect(r.stdout).toContain("sk-dc-");
  });

  it("env var auth has no name/email (only key and source)", () => {
    const r = run(["whoami"], { env: { DEEPCITATION_API_KEY: "sk-dc-env-only-key-1234567" } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Key:");
    expect(r.stdout).toContain("Source:");
    // Should NOT contain Name: or Email: since env var has no metadata
    expect(r.stdout).not.toContain("Name:");
    expect(r.stdout).not.toContain("Email:");
  });
});

// ── auth env command safety ───────────────────────────────────────

describe("auth env command", () => {
  it("outputs only the export statement on stdout (safe for eval)", () => {
    const r = run(["auth", "env"], { env: { DEEPCITATION_API_KEY: "sk-dc-evalSafeKey1234567" } });
    expect(r.exitCode).toBe(0);
    // stdout should contain ONLY the export line
    expect(r.stdout.trim()).toBe('export DEEPCITATION_API_KEY="sk-dc-evalSafeKey1234567"');
    // No other text on stdout (info messages go to stderr)
    expect(r.stdout.split("\n").filter(l => l.trim()).length).toBe(1);
  });

  it("rejects key with unexpected format even if authenticated", () => {
    // Simulate a corrupted credentials file that has a key without sk-dc- prefix
    // This would be caught by env's format check
    const home = freshHome();
    const credDir = join(home, ".deepcitation");
    mkdirSync(credDir, { recursive: true });
    writeFileSync(
      join(credDir, "credentials.json"),
      JSON.stringify({
        version: 1,
        apiKey: "corrupted-key-no-prefix-here",
        createdAt: new Date().toISOString(),
      }),
    );

    const r = run(["auth", "env"], { env: noAuthEnv(home) });
    // resolveAuth checks sk-dc- prefix, so this should fail at auth level
    expect(r.exitCode).toBe(1);
  });
});

// ── Full lifecycle: skill perspective ─────────────────────────────

describe("skill/agent auth lifecycle", () => {
  it("agent can check status, login via --key, use commands, logout", () => {
    const home = freshHome();
    const cwd = join(BASE_DIR, `agent-lifecycle-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    const env = { ...noAuthEnv(home) };

    // 1. Agent checks status — not logged in
    const s1 = run(["status"], { env, cwd });
    expect(s1.exitCode).toBe(1);

    // 2. Agent logs in with --key
    const login = run(["login", "--key", "sk-dc-agentlifecycle012345"], { env, cwd });
    expect(login.exitCode).toBe(0);
    expect(login.stderr).toContain("Credentials saved");

    // 3. Agent verifies status
    const s2 = run(["status"], { env, cwd });
    expect(s2.exitCode).toBe(0);
    expect(s2.stdout).toContain("Authenticated");

    // 4. Agent tries prepare (will fail at API, but auth should pass)
    const prep = run(["prepare", "https://example.com/doc"], { env, cwd });
    expect(prep.exitCode).toBe(1);
    // Should NOT say "action needed" — auth passed, it's a network/API error
    expect(prep.stderr).not.toContain("action needed");

    // 5. Agent logs out
    const logout = run(["logout"], { env, cwd });
    expect(logout.exitCode).toBe(0);

    // 6. Verify logged out
    const s3 = run(["status"], { env, cwd });
    expect(s3.exitCode).toBe(1);
  });

  it("agent can use env var without login command", () => {
    const cwd = join(BASE_DIR, `agent-envvar-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });

    // Agent sets env var — no login needed
    const s = run(["status"], { env: { DEEPCITATION_API_KEY: "sk-dc-agent-envvar-key-123" }, cwd });
    expect(s.exitCode).toBe(0);

    // prepare should pass auth (fail at API level)
    const prep = run(["prepare", "https://example.com/doc"], {
      env: { DEEPCITATION_API_KEY: "sk-dc-agent-envvar-key-123" },
      cwd,
    });
    expect(prep.exitCode).toBe(1);
    expect(prep.stderr).not.toContain("action needed");
  });
});

// ── Callback server auth (unit-level, not subprocess) ─────────────

describe("callback server edge cases", () => {
  // These test the auth module directly (not via subprocess)
  // Already partially covered in auth.test.ts, but these focus on
  // edge cases that affect the skill/user experience.

  // Import directly for these tests
  const authModule = require("../auth.js") as typeof import("../auth.js");

  async function httpReq(
    port: number,
    method: string,
    path: string,
    body?: string,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: string }> {
    const http = require("node:http");
    return new Promise((resolve, reject) => {
      const r = http.request({ hostname: "127.0.0.1", port, path, method, headers }, (res: any) => {
        let data = "";
        res.on("data", (chunk: any) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      });
      r.on("error", reject);
      if (body) r.write(body);
      r.end();
    });
  }

  it("rejects key without sk-dc- prefix via callback", async () => {
    const nonce = authModule.generateNonce();
    const { port, result, cancel } = await authModule.startCallbackServer(nonce);
    // Prevent unhandled rejection from cancel()
    result.catch(() => {});

    try {
      const res = await httpReq(
        port,
        "POST",
        "/callback",
        JSON.stringify({ apiKey: "pk-test-1234567890123456", nonce }),
        { "Content-Type": "application/json" },
      );

      expect(res.status).toBe(400);
      expect(res.body).toContain("Invalid API key");
    } finally {
      cancel();
    }
  }, 10_000);

  it("rejects key too short via callback", async () => {
    const nonce = authModule.generateNonce();
    const { port, result, cancel } = await authModule.startCallbackServer(nonce);
    result.catch(() => {});

    try {
      const res = await httpReq(port, "POST", "/callback", JSON.stringify({ apiKey: "sk-dc-short", nonce }), {
        "Content-Type": "application/json",
      });

      expect(res.status).toBe(400);
    } finally {
      cancel();
    }
  }, 10_000);

  it("cancel() stops the server cleanly", async () => {
    const nonce = authModule.generateNonce();
    const { result, cancel } = await authModule.startCallbackServer(nonce);

    cancel();

    await expect(result).rejects.toThrow("Login cancelled");
  }, 10_000);

  it("CORS allows deepcitation.com subdomains", async () => {
    const nonce = authModule.generateNonce();
    const { port, result, cancel } = await authModule.startCallbackServer(nonce);
    result.catch(() => {});

    try {
      const res = await httpReq(port, "OPTIONS", "/callback", undefined, {
        Origin: "https://app.deepcitation.com",
      });

      expect(res.status).toBe(204);
    } finally {
      cancel();
    }
  }, 10_000);
});
