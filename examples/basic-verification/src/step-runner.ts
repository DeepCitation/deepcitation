/**
 * Step-based resumable workflow runner.
 *
 * Persists each step's output to JSON so you can resume from any point.
 * Two main iteration loops:
 *   - System prompt → markdown:  tweak prompts, re-run LLM only
 *   - Markdown → verifications/HTML:  tweak rendering without API calls
 *
 * Usage:
 *   bun run steps:openai 0                  # full run, pre-filled source 0
 *   bun run steps:openai https://example.com # full run, custom URL
 *   bun run steps:openai path/to/report.pdf  # full run, local file
 *   bun run steps:openai 0 --from=4         # resume from parse (skip LLM)
 *   bun run steps:openai 0 --from=2 --to=3  # re-run prompts + LLM only
 *   bun run steps:openai 0 --step=6         # re-run HTML generation only
 *
 *   LLM_RESPONSE=path/to/response.txt bun run steps:openai 0 --from=3
 *     → inject pre-recorded LLM response, skip streaming
 *
 * Flags:
 *   --from=N       Start from step N (load prior steps from cache)
 *   --to=N         Stop after step N
 *   --step=N       Run only step N (shorthand for --from=N --to=N)
 *   --provider=P   openai | anthropic | gemini (default: openai)
 *   --cache-dir=P  Where to read/write step files (default: output/)
 *
 * Env:
 *   LLM_RESPONSE       Path to a file containing raw LLM output (skips step 3)
 *   SYSTEM_PROMPT       Override system prompt (used in step 2)
 *   USER_PROMPT         Override user prompt (used in step 2)
 *   DEEPCITATION_API_KEY  Required for steps 1 and 5
 *   OPENAI_API_KEY      Required for --provider=openai step 3
 *   ANTHROPIC_API_KEY   Required for --provider=anthropic step 3
 *   GOOGLE_API_KEY      Required for --provider=gemini step 3
 */

import "dotenv/config";
import { DeepCitation, type SearchStatus, type Verification } from "deepcitation";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, extname, resolve } from "path";
import { execFileSync } from "child_process";

import {
  type Source,
  type StreamLlmFn,
  type Step1Result,
  type Step2Result,
  type Step3Result,
  type Step4Result,
  type Step5Result,
  SOURCES,
  DEFAULT_OUT_DIR,
  toSafeName,
  stepUpload,
  stepWrapPrompts,
  stepCallLlm,
  stepParseCitations,
  stepVerify,
  stepGenerateHtml,
} from "./shared.js";

// ─── CLI arg parsing ───────────────────────────────────────────────────────

function parseArgs() {
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, ...rest] = arg.slice(2).split("=");
      flags[key] = rest.join("=") || "true";
    } else {
      positional.push(arg);
    }
  }

  const step = flags.step ? Number(flags.step) : undefined;
  const from = step ?? (flags.from ? Number(flags.from) : 1);
  const to = step ?? (flags.to ? Number(flags.to) : 6);
  const provider = (flags.provider ?? "openai") as "openai" | "anthropic" | "gemini";
  const cacheDir = flags["cache-dir"] ? resolve(flags["cache-dir"]) : DEFAULT_OUT_DIR;
  const sourceArg = positional[0] ?? undefined;

  return { from, to, provider, cacheDir, sourceArg };
}

// ─── Provider streaming factories ──────────────────────────────────────────

async function createOpenAIStream(): Promise<StreamLlmFn> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const model = "gpt-5-mini";

  return async ({ enhancedSystemPrompt, enhancedUserPrompt, imageBase64 }) => {
    const userContent: any[] = [];
    if (imageBase64) userContent.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } });
    userContent.push({ type: "text", text: enhancedUserPrompt });

    const stream = await client.chat.completions.create({
      model, stream: true,
      messages: [{ role: "system", content: enhancedSystemPrompt }, { role: "user", content: userContent }],
    });

    let response = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      process.stdout.write(content);
      response += content;
    }
    return response;
  };
}

async function createAnthropicStream(): Promise<StreamLlmFn> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const model = "claude-haiku-4-5-20251001";

  return async ({ enhancedSystemPrompt, enhancedUserPrompt, imageBase64 }) => {
    const userContent: any[] = [];
    if (imageBase64) userContent.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } });
    userContent.push({ type: "text", text: enhancedUserPrompt });

    const stream = client.messages.stream({
      model, max_tokens: 4096, system: enhancedSystemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    let response = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && (event.delta as any).type === "text_delta") {
        const text = (event.delta as any).text;
        process.stdout.write(text);
        response += text;
      }
    }
    return response;
  };
}

async function createGeminiStream(): Promise<StreamLlmFn> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = "gemini-2.0-flash-lite";

  return async ({ enhancedSystemPrompt, enhancedUserPrompt, imageBase64 }) => {
    const parts: any[] = [];
    if (imageBase64) parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
    parts.push({ text: enhancedUserPrompt });

    const result = await genAI.getGenerativeModel({ model }).generateContentStream({
      systemInstruction: enhancedSystemPrompt,
      contents: [{ role: "user", parts }],
    });

    let response = "";
    for await (const chunk of result.stream) {
      const text = chunk.text();
      process.stdout.write(text);
      response += text;
    }
    return response;
  };
}

async function getStreamFn(provider: string): Promise<StreamLlmFn> {
  switch (provider) {
    case "openai": return createOpenAIStream();
    case "anthropic": return createAnthropicStream();
    case "gemini": return createGeminiStream();
    default: throw new Error(`Unknown provider: ${provider}. Use openai, anthropic, or gemini.`);
  }
}

// ─── Persistence helpers ───────────────────────────────────────────────────

const STEP_LABELS = ["upload", "prompts", "llm", "parsed", "verified", "html"] as const;

function stepPath(cacheDir: string, safeName: string, step: number): string {
  return resolve(cacheDir, `${safeName}-step${step}-${STEP_LABELS[step - 1]}.json`);
}

function saveStep(cacheDir: string, safeName: string, step: number, data: unknown) {
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const path = stepPath(cacheDir, safeName, step);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`   💾 Saved: ${path}`);
}

function loadStep<T>(cacheDir: string, safeName: string, step: number): T {
  const path = stepPath(cacheDir, safeName, step);
  if (!existsSync(path)) {
    throw new Error(`Missing cached step ${step} at ${path}\n   Run the full pipeline first, or run --from=1 to generate it.`);
  }
  const data = JSON.parse(readFileSync(path, "utf-8"));
  console.log(`   📂 Loaded: ${path}`);
  return data as T;
}

// ─── Main ──────────────────────────────────────────────────────────────────

const { from, to, provider, cacheDir, sourceArg } = parseArgs();

if (sourceArg == null) {
  console.error("Usage: bun run steps:<provider> <source> [--from=N] [--to=N] [--step=N]");
  console.error("\n  <source> can be:");
  console.error("    0, 1, 2        Pre-filled source index");
  console.error("    https://...    URL to verify");
  console.error("    path/to/file   Local file (PDF, image)\n");
  console.error("Pre-filled sources:");
  for (const [i, s] of SOURCES.entries()) {
    const detail = s.type === "url" ? s.url : "filename" in s ? s.filename : "";
    console.error(`  ${i}: ${s.type.padEnd(5)} — ${s.label} (${detail})`);
  }
  process.exit(1);
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".tiff"]);

function resolveSource(arg: string): Source {
  // Numeric index → pre-filled source
  if (/^\d+$/.test(arg)) {
    const s = SOURCES[Number(arg)];
    if (!s) {
      console.error(`Invalid source index ${arg}. Valid: 0-${SOURCES.length - 1}`);
      process.exit(1);
    }
    return s;
  }

  // URL
  if (arg.startsWith("http://") || arg.startsWith("https://")) {
    return { type: "url", url: arg, label: arg };
  }

  // Local file
  const filePath = resolve(arg);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${arg}`);
    process.exit(1);
  }
  const filename = basename(filePath);
  const ext = extname(filePath).toLowerCase();
  const type = IMAGE_EXTS.has(ext) ? "image" : "pdf";
  return { type, path: filePath, filename, label: filename } as Source;
}

const source = resolveSource(sourceArg);
const sourceLabel = source.type === "url" ? source.url : "filename" in source ? source.filename : source.label;
const safeName = toSafeName(sourceLabel);

console.log(`\n🔧 Step Runner — ${provider} / ${source.label}`);
console.log(`   Steps: ${from} → ${to}`);
console.log(`   Cache: ${cacheDir}`);
console.log(`   Safe name: ${safeName}\n`);

// Collect results from each step (loaded from cache or computed)
let s1: Step1Result | undefined;
let s2: Step2Result | undefined;
let s3: Step3Result | undefined;
let s4: Step4Result | undefined;
let s5: Step5Result | undefined;

// Load cached steps needed for the starting point
if (from > 1) {
  console.log(`📂 Loading cached steps 1–${from - 1}...\n`);
  // Only load what downstream steps actually need
  if (from <= 6) s1 = loadStep<Step1Result>(cacheDir, safeName, 1);   // needed by steps 2,3,5,6
  if (from > 2 && to >= 3) s2 = loadStep<Step2Result>(cacheDir, safeName, 2);  // needed by step 3
  if (from > 3) s3 = loadStep<Step3Result>(cacheDir, safeName, 3);   // needed by step 4
  if (from > 4) s4 = loadStep<Step4Result>(cacheDir, safeName, 4);   // needed by steps 5,6
  if (from > 5) s5 = loadStep<Step5Result>(cacheDir, safeName, 5);   // needed by step 6
  console.log();
}

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });

// Per-step timing (ms) — only recorded when the step actually runs (not loaded from cache)
const timing: { upload_ms?: number; llm_ms?: number; verify_ms?: number; total_ms?: number } = {};
const runStart = Date.now();

// ── Step 1: Upload ──────────────────────────────────────────────────────
if (from <= 1 && to >= 1) {
  console.log("━━━ Step 1: Upload & Prepare ━━━");
  const t0 = Date.now();
  s1 = await stepUpload(dc, source);
  timing.upload_ms = Date.now() - t0;
  console.log(`   Attachment ID: ${s1.attachmentId}`);
  console.log(`   Pages: ${s1.deepTextPages.length}`);
  console.log(`   Has image: ${!!s1.imageBase64}`);
  console.log(`   ⏱ ${timing.upload_ms}ms`);
  saveStep(cacheDir, safeName, 1, s1);
  console.log();
}

// ── Step 2: Wrap Prompts ────────────────────────────────────────────────
if (from <= 2 && to >= 2) {
  console.log("━━━ Step 2: Wrap Prompts ━━━");
  s2 = stepWrapPrompts(s1!.deepTextPages);
  console.log(`   System prompt: ${s2.systemPrompt.slice(0, 80)}...`);
  console.log(`   User prompt: ${s2.userPrompt.slice(0, 80)}...`);
  saveStep(cacheDir, safeName, 2, s2);
  console.log();
}

// ── Step 3: Call LLM ────────────────────────────────────────────────────
if (from <= 3 && to >= 3) {
  console.log("━━━ Step 3: Call LLM ━━━");

  const llmResponseOverride = process.env.LLM_RESPONSE;
  if (llmResponseOverride) {
    // Inject pre-recorded response
    const content = existsSync(llmResponseOverride)
      ? readFileSync(llmResponseOverride, "utf-8")
      : llmResponseOverride;
    s3 = { llmResponse: content };
    console.log(`   Injected from LLM_RESPONSE (${content.length} chars)`);
  } else {
    console.log(`   Provider: ${provider}`);
    const streamFn = await getStreamFn(provider);
    const t3 = Date.now();
    s3 = await stepCallLlm(streamFn, s2!, s1?.imageBase64);
    timing.llm_ms = Date.now() - t3;
    console.log(`\n   Response: ${s3.llmResponse.length} chars`);
    console.log(`   ⏱ ${timing.llm_ms}ms`);
  }
  saveStep(cacheDir, safeName, 3, s3);
  console.log();
}

// ── Step 4: Parse Citations ─────────────────────────────────────────────
if (from <= 4 && to >= 4) {
  console.log("━━━ Step 4: Parse Citations ━━━");
  s4 = stepParseCitations(s3!.llmResponse);
  console.log(`   Citations: ${s4.citationCount}`);
  console.log(`   Visible text: ${s4.visibleText.length} chars`);
  for (const [key, c] of Object.entries(s4.parsedCitations)) {
    console.log(`   [${key}]: "${c.fullPhrase?.slice(0, 60)}..."`);
  }
  saveStep(cacheDir, safeName, 4, s4);
  console.log();
}

// ── Step 5: Verify ──────────────────────────────────────────────────────
if (from <= 5 && to >= 5) {
  console.log("━━━ Step 5: Verify Citations ━━━");
  if (s4!.citationCount === 0) {
    console.log("   ⚠️  No citations to verify.");
    s5 = { verifications: {} };
  } else {
    const t5 = Date.now();
    s5 = await stepVerify(dc, s1!.attachmentId, s4!.parsedCitations);
    timing.verify_ms = Date.now() - t5;
    console.log(`   Verifications: ${Object.keys(s5.verifications).length}`);
    console.log(`   ⏱ ${timing.verify_ms}ms`);
  }
  saveStep(cacheDir, safeName, 5, s5);
  console.log();
}

// ── Step 6: Generate HTML ───────────────────────────────────────────────
if (from <= 6 && to >= 6) {
  console.log("━━━ Step 6: Generate HTML ━━━");
  const s6 = stepGenerateHtml(s4!, s5!, s1!.sourceLabel, cacheDir);

  // Overwrite snapshot with llmResponse if available
  if (s3) {
    writeFileSync(s6.snapshotPath, JSON.stringify({
      llmResponse: s3.llmResponse,
      verifications: s5!.verifications,
      attachments: s5!.attachments,
      title: s1!.sourceLabel,
    }, null, 2));
  }

  console.log(`   HTML: ${s6.htmlPath}`);
  console.log(`   Snapshot: ${s6.snapshotPath}`);

  // Open in browser
  try {
    const winPath = execFileSync("wslpath", ["-w", s6.htmlPath], { encoding: "utf-8" }).trim();
    execFileSync("explorer.exe", [winPath], { stdio: "ignore", timeout: 5000 });
  } catch {
    try { execFileSync("xdg-open", [s6.htmlPath], { stdio: "ignore", timeout: 5000 }); }
    catch { try { execFileSync("open", [s6.htmlPath], { stdio: "ignore", timeout: 5000 }); } catch { /* manual */ } }
  }
  console.log();
}

// ── Write metrics.json ──────────────────────────────────────────────────
const PROVIDER_MODELS: Record<string, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-haiku-4-5-20251001",
  gemini: "gemini-2.0-flash-lite",
};
const toSeconds = (ms: number) => Math.round(ms / 100) / 10;

const PARTIAL_STATUSES = new Set<SearchStatus>([
  "partial_text_found",
  "found_source_match_only",
  "found_context_missed_source_match",
  "found_on_other_page",
  "found_on_other_line",
  "first_word_found",
  "first_word_fallback",
]);

timing.total_ms = Date.now() - runStart;
if (s5?.verifications) {
  const verifs: Verification[] = Object.values(s5.verifications);
  const total = verifs.length;
  const found = verifs.filter(v => v.status === "found").length;
  const partial = verifs.filter(v => v.status != null && PARTIAL_STATUSES.has(v.status)).length;
  const metrics = {
    provider,
    model: PROVIDER_MODELS[provider] ?? provider,
    date: new Date().toISOString().slice(0, 10),
    source: sourceLabel,
    upload_s: timing.upload_ms != null ? toSeconds(timing.upload_ms) : null,
    llm_s: timing.llm_ms != null ? toSeconds(timing.llm_ms) : null,
    verify_s: timing.verify_ms != null ? toSeconds(timing.verify_ms) : null,
    total_s: toSeconds(timing.total_ms),
    citations: total,
    found,
    partial,
    not_found: total - found - partial,
    found_pct: total ? Math.round(found * 1000 / total) / 10 : 0,
  };
  const metricsPath = resolve(cacheDir, `${safeName}-metrics.json`);
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
  console.log(`📊 Metrics: ${metricsPath}`);
  console.log(`   ${found}/${total} found (${metrics.found_pct}%) · total: ${metrics.total_s}s\n`);
}

console.log("✅ Done.\n");
