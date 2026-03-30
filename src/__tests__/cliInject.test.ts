import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { escapeJsForScript, escapeJsonForScript, stripExistingInjection } from "../vanilla/reportUtils.js";

// ── escapeJsForScript ───────────────────────────────────────────────

describe("escapeJsForScript", () => {
  it("escapes closing script tags", () => {
    const input = 'var x = "</script>";';
    const escaped = escapeJsForScript(input);
    expect(escaped).not.toContain("</script>");
    expect(escaped).not.toContain("</");
    expect(escaped).toContain("<\\u002fscript>");
  });

  it("preserves code without closing tags", () => {
    const input = "var x = 1 + 2;";
    expect(escapeJsForScript(input)).toBe(input);
  });

  it("escapes multiple occurrences", () => {
    const input = "</script></style></div>";
    const escaped = escapeJsForScript(input);
    expect(escaped).not.toContain("</");
  });
});

// ── escapeJsonForScript ─────────────────────────────────────────────

describe("escapeJsonForScript", () => {
  it("escapes angle brackets", () => {
    const input = '{"html":"<script>alert(1)</script>"}';
    const escaped = escapeJsonForScript(input);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
    expect(escaped).toContain("\\u003c");
    expect(escaped).toContain("\\u003e");
  });

  it("escapes line terminators", () => {
    const escaped = escapeJsonForScript("line\u2028sep\u2029end");
    expect(escaped).toContain("\\u2028");
    expect(escaped).toContain("\\u2029");
  });
});

// ── inject snippet assembly (unit-level, no subprocess) ─────────────

describe("inject snippet assembly", () => {
  it("injects dc-data and init script before </body>", () => {
    const html = "<html><body><p>Hello</p></body></html>";
    const verifications = { key1: { status: "verified" } };
    const jsonData = escapeJsonForScript(JSON.stringify(verifications));
    const theme = "auto";

    const snippet = [
      `<script type="application/json" id="dc-data">${jsonData}</script>`,
      `<script>window.DeepCitationPopover&&window.DeepCitationPopover.init({theme:${JSON.stringify(theme)}});</script>`,
    ].join("\n");

    const output = html.replace("</body>", () => `${snippet}\n</body>`);

    expect(output).toContain('id="dc-data"');
    expect(output).toContain("DeepCitationPopover");
    const dcDataIdx = output.indexOf("dc-data");
    const bodyCloseIdx = output.indexOf("</body>");
    expect(dcDataIdx).toBeLessThan(bodyCloseIdx);
  });

  it("includes key-map snippet when provided", () => {
    const html = "<html><body></body></html>";
    const keyMap = { "my claim": "abc123" };
    const keyMapSnippet = `<script type="application/json" id="dc-key-map">${escapeJsonForScript(JSON.stringify(keyMap))}</script>`;

    const snippet = [
      '<script type="application/json" id="dc-data">{}</script>',
      keyMapSnippet,
      "<script>init()</script>",
    ]
      .filter(Boolean)
      .join("\n");

    const output = html.replace("</body>", () => `${snippet}\n</body>`);
    expect(output).toContain('id="dc-key-map"');
    expect(output).toContain("abc123");
  });

  it("filters empty key-map snippet with .filter(Boolean)", () => {
    const keyMapSnippet = "";
    const parts = ['<script id="dc-data">{}</script>', keyMapSnippet, "<script>init()</script>"].filter(Boolean);
    expect(parts).toHaveLength(2);
    expect(parts.join("\n")).not.toContain("\n\n");
  });

  it("uses JSON.stringify for theme (injection-safe)", () => {
    const theme = "dark";
    const initScript = `window.DeepCitationPopover&&window.DeepCitationPopover.init({theme:${JSON.stringify(theme)}});`;
    expect(initScript).toContain('theme:"dark"');
    // Verify a hypothetical malicious theme value gets properly quoted
    const evil = '"});alert(1);//';
    const evilScript = `init({theme:${JSON.stringify(evil)}});`;
    expect(evilScript).toContain('\\"});alert(1);//');
    expect(evilScript).not.toContain("theme:" + evil);
  });

  it("appends to end when no </body> or </html> tag", () => {
    const html = "<div>content</div>";
    const snippet = '<script id="dc-data">{}</script>';

    let output = html;
    if (output.includes("</body>")) {
      output = output.replace("</body>", () => `${snippet}\n</body>`);
    } else if (output.includes("</html>")) {
      output = output.replace("</html>", () => `${snippet}\n</html>`);
    } else {
      output = `${output}\n${snippet}`;
    }

    expect(output).toContain("content");
    expect(output).toContain("dc-data");
    expect(output.indexOf("content")).toBeLessThan(output.indexOf("dc-data"));
  });
});

// ── stripExistingInjection ─────────────────────────────────────────

describe("stripExistingInjection", () => {
  it("passes clean HTML through unchanged", () => {
    const html = "<html><body><p>Hello</p></body></html>";
    const result = stripExistingInjection(html);
    expect(result.hadExisting).toBe(false);
    expect(result.html).toBe(html);
  });

  it("strips dc-data script", () => {
    const html =
      '<html><body><script type="application/json" id="dc-data">{"key":{"status":"found"}}</script></body></html>';
    const result = stripExistingInjection(html);
    expect(result.hadExisting).toBe(true);
    expect(result.html).not.toContain("dc-data");
    expect(result.html).toContain("<body>");
  });

  it("strips dc-key-map script", () => {
    const html =
      '<html><body><script type="application/json" id="dc-key-map">{"cite-1":"abc123"}</script></body></html>';
    const result = stripExistingInjection(html);
    expect(result.hadExisting).toBe(true);
    expect(result.html).not.toContain("dc-key-map");
  });

  it("strips init script", () => {
    const html =
      '<html><body><script>window.DeepCitationPopover&&window.DeepCitationPopover.init({theme:"auto"});</script></body></html>';
    const result = stripExistingInjection(html);
    expect(result.hadExisting).toBe(true);
    expect(result.html).not.toContain("DeepCitationPopover");
  });

  it("strips all injection components together", () => {
    const html = [
      "<html><body><p>Content</p>",
      '<script type="application/json" id="dc-data">{"k":{}}</script>',
      '<script type="application/json" id="dc-key-map">{"a":"b"}</script>',
      "<script>/* CDN bundle */ window.DeepCitationPopover = {init:function(){}};</script>",
      '<script>window.DeepCitationPopover&&window.DeepCitationPopover.init({theme:"auto"});</script>',
      "</body></html>",
    ].join("\n");
    const result = stripExistingInjection(html);
    expect(result.hadExisting).toBe(true);
    expect(result.html).not.toContain("dc-data");
    expect(result.html).not.toContain("dc-key-map");
    expect(result.html).not.toContain("DeepCitationPopover");
    expect(result.html).toContain("Content");
    expect(result.html).toContain("</body>");
  });

  it("preserves non-DC scripts", () => {
    const html =
      '<html><body><script>console.log("hello")</script><script type="application/json" id="dc-data">{}</script></body></html>';
    const result = stripExistingInjection(html);
    expect(result.hadExisting).toBe(true);
    expect(result.html).toContain('console.log("hello")');
    expect(result.html).not.toContain("dc-data");
  });
});
