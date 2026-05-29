/**
 * Shared workflow for DeepCitation basic examples.
 *
 * Each provider example only needs to implement the LLM streaming call.
 * This module handles the common steps: upload, prompt wrapping, parsing,
 * verification, and result display.
 *
 * Supports three source types:
 * - **image**: Upload an image file (LLM receives base64 for vision)
 * - **pdf**: Upload a PDF file (LLM receives extracted text only)
 * - **url**: Fetch & convert a URL (LLM receives extracted text only)
 */
import "dotenv/config";
import { DeepCitation } from "deepcitation/client";
import { extractVisibleText, getAllCitationsFromLlmOutput, renderVerifiedHtml, } from "deepcitation";
import { wrapCitationPrompt } from "deepcitation/prompts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
// Get current directory for loading sample files
const __dirname = dirname(fileURLToPath(import.meta.url));
/**
 * Pre-filled sources that exercise every supported input type.
 * Override by setting SOURCE=<index> (0-based) to run a single source.
 */
export const SOURCES = [
    // Local files
    {
        type: "image",
        path: resolve(__dirname, "../../assets/john-doe-50-m-chart.jpg"),
        filename: "john-doe-50-m-chart.jpg",
        label: "Medical chart image",
    },
    {
        type: "pdf",
        path: resolve(__dirname, "../../assets/PPT1.pdf"),
        filename: "PPT1.pdf",
        label: "PDF presentation",
    },
    {
        type: "url",
        url: "https://arxiv.org/html/2509.04664v1",
        label: "arXiv HTML paper",
    },
];
// ─── Interactive menu ───────────────────────────────────────────────────────
function ask(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((res) => rl.question(question, (answer) => { rl.close(); res(answer.trim()); }));
}
export async function promptSourceSelection() {
    console.log("\nChoose a source to verify:\n");
    console.log("  [1] 🖼️  Image  — Medical chart (john-doe-50-m-chart.jpg)");
    console.log("  [2] 📄 PDF    — Presentation (PPT1.pdf)");
    console.log("  [3] 🔗 URL    — arXiv HTML paper (2509.04664v1)");
    console.log("  [4] 🔗 Custom — Enter your own URL");
    console.log();
    const choice = await ask("Enter choice [1-4]: ");
    switch (choice) {
        case "1": return SOURCES[0];
        case "2": return SOURCES[1];
        case "3": return SOURCES[2];
        case "4": {
            const url = await ask("Enter URL: ");
            if (!url)
                throw new Error("No URL provided.");
            return { type: "url", url, label: "Custom URL" };
        }
        default:
            throw new Error(`Invalid choice: "${choice}". Expected 1-4.`);
    }
}
export const DEFAULT_OUT_DIR = resolve(__dirname, "../../output");
// ─── Step functions ─────────────────────────────────────────────────────────
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant. Answer the user's question accurately and cite your sources.";
const DEFAULT_USER_PROMPT = "Please summarize the key findings in this document and cite specific claims with evidence.";
export async function stepUpload(dc, source) {
    if (source.type === "url") {
        const result = await dc.prepareUrl({ url: source.url });
        return {
            attachmentId: result.attachmentId,
            deepTextPages: result.deepTextPages,
            sourceLabel: source.label,
        };
    }
    const buffer = readFileSync(source.path);
    const result = await dc.uploadFile(buffer, { filename: source.filename });
    const imageBase64 = source.type === "image" ? buffer.toString("base64") : undefined;
    return {
        attachmentId: result.attachmentId,
        deepTextPages: result.deepTextPages,
        imageBase64,
        sourceLabel: source.label,
    };
}
export function stepWrapPrompts(s1) {
    const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        userPrompt: DEFAULT_USER_PROMPT,
        deepTextPages: s1.deepTextPages,
    });
    return {
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        userPrompt: DEFAULT_USER_PROMPT,
        enhancedSystemPrompt,
        enhancedUserPrompt,
    };
}
export async function stepCallLlm(streamLlm, s2, imageBase64) {
    const llmResponse = await streamLlm({
        enhancedSystemPrompt: s2.enhancedSystemPrompt,
        enhancedUserPrompt: s2.enhancedUserPrompt,
        imageBase64,
    });
    return { llmResponse };
}
export function stepParseCitations(llmResponse) {
    const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);
    const visibleText = extractVisibleText(llmResponse);
    return { parsedCitations, visibleText, citationCount: Object.keys(parsedCitations).length };
}
export async function stepVerify(dc, attachmentId, parsedCitations) {
    const result = await dc.verifyAttachment(attachmentId, parsedCitations);
    return { verifications: result.verifications, attachments: result.attachments };
}
export function stepGenerateHtml(step4, step5, sourceLabel, outDir) {
    if (!existsSync(outDir))
        mkdirSync(outDir, { recursive: true });
    const safeName = toSafeName(sourceLabel);
    const htmlPath = resolve(outDir, `${safeName}-verified.html`);
    const html = renderVerifiedHtml(step4.visibleText, step4.parsedCitations, step5.verifications, step5.attachments, { title: sourceLabel });
    writeFileSync(htmlPath, html);
    const snapshotPath = resolve(outDir, `${safeName}-snapshot.json`);
    writeFileSync(snapshotPath, JSON.stringify({ verifications: step5.verifications, title: sourceLabel }, null, 2));
    return { htmlPath, snapshotPath };
}
export function toSafeName(label) {
    return label.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 50);
}
// ─── Workflow (uses step functions with logging) ───────────────────────────
/**
 * Run the full DeepCitation verification workflow for one source.
 */
async function runSingleSource(deepcitation, providerName, source, streamLlm) {
    const separator = "─".repeat(50);
    const wideSeparator = "═".repeat(60);
    const wideSubSeparator = "─".repeat(60);
    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  Source: ${source.label}`);
    console.log(`▓  Type:   ${source.type}`);
    console.log(`${"▓".repeat(60)}\n`);
    // ── Step 1: Upload ──
    console.log("📄 Step 1: Uploading document and preparing prompts...\n");
    if (source.type === "url")
        console.log(`   URL: ${source.url}\n`);
    const s1 = await stepUpload(deepcitation, source);
    console.log("✅ Document uploaded successfully");
    console.log(`   Attachment ID: ${s1.attachmentId}\n`);
    // ── Step 2: Wrap Prompts ──
    const s2 = stepWrapPrompts(s1);
    console.log("📋 System Prompt (BEFORE):");
    console.log(separator);
    console.log(s2.systemPrompt);
    console.log(separator + "\n");
    console.log("📋 User Prompt (BEFORE):");
    console.log(separator);
    console.log(s2.userPrompt);
    console.log(separator + "\n");
    console.log("📋 System Prompt (AFTER):");
    console.log(separator);
    console.log(s2.enhancedSystemPrompt);
    console.log(separator + "\n");
    console.log("📋 User Prompt (AFTER):");
    console.log(separator);
    console.log(s2.enhancedUserPrompt);
    console.log(separator + "\n");
    // ── Step 3: Call LLM ──
    console.log(`🤖 Step 2: Calling ${providerName}...\n`);
    console.log("📝 LLM Response (raw with citations):");
    console.log(separator);
    const s3 = await stepCallLlm(streamLlm, s2, s1.imageBase64);
    console.log("\n" + separator + "\n");
    // ── Step 3: Create report (server-side: parse → verify → render → store) ──
    console.log("\n🔍 Step 3: Creating verification report...\n");
    let report;
    try {
        report = await deepcitation.createReport(s1.attachmentId, s3.llmResponse, {
            title: s1.sourceLabel,
            visibility: "private",
        });
    }
    catch (err) {
        console.error(`❌ Report creation failed: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }
    const portalUrl = `https://deepcitation.com/verifications/${report.id}`;
    console.log(`✅ Report created`);
    console.log(`   id:         ${report.id}`);
    console.log(`   portalUrl:  ${portalUrl}`);
    console.log(`   citations:  ${report.citationCount ?? "—"}`);
    console.log(`   verified:   ${report.verifiedCount ?? "—"}`);
    console.log(`   partial:    ${report.partialCount ?? "—"}`);
    console.log(`   not found:  ${report.notFoundCount ?? "—"}`);
    // Open the portal detail page in the browser
    try {
        const { execFileSync } = await import("child_process");
        try {
            execFileSync("explorer.exe", [portalUrl], { stdio: "ignore", timeout: 5000 });
        }
        catch {
            try {
                execFileSync("xdg-open", [portalUrl], { stdio: "ignore", timeout: 5000 });
            }
            catch {
                try {
                    execFileSync("open", [portalUrl], { stdio: "ignore", timeout: 5000 });
                }
                catch { /* manual */ }
            }
        }
    }
    catch { /* dynamic import failed, skip */ }
}
/**
 * Run the full DeepCitation verification workflow.
 *
 * Source selection priority (first match wins):
 *   1. URL argument:   bun src/openai.ts https://example.com/doc.pdf
 *   2. Path argument:  bun src/openai.ts /path/to/file.pdf
 *   3. Index argument: bun src/openai.ts 2    (into SOURCES array)
 *   4. "all" argument: bun src/openai.ts all  (run all predefined sources)
 *   5. Interactive:    prompts the user to pick a source (no argument)
 *
 * Predefined SOURCES index reference:
 *   0 = image (medical chart)
 *   1 = pdf   (presentation)
 *   2 = url   (arXiv HTML paper)
 */
export async function runWorkflow(providerName, streamLlm) {
    console.log(`🔍 DeepCitation Basic Example - ${providerName}\n`);
    const deepcitation = new DeepCitation({
        apiKey: process.env.DEEPCITATION_API_KEY,
    });
    // CLI arg takes precedence over env var
    const sourceArg = process.argv[2] ?? process.env.SOURCE;
    let sources;
    if (sourceArg === "all") {
        // Run all pre-filled sources
        sources = SOURCES;
    }
    else if (sourceArg != null) {
        const parsedUrl = (() => { try {
            return new URL(sourceArg);
        }
        catch {
            return null;
        } })();
        const resolvedPath = resolve(sourceArg);
        if (parsedUrl?.protocol === "http:" || parsedUrl?.protocol === "https:") {
            sources = [{ type: "url", url: sourceArg, label: sourceArg }];
        }
        else if (existsSync(resolvedPath)) {
            const filename = basename(resolvedPath);
            const ext = filename.split(".").pop()?.toLowerCase() ?? "";
            const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
            sources = [{ type: isImage ? "image" : "pdf", path: resolvedPath, filename, label: filename }];
        }
        else {
            const idx = Number(sourceArg);
            const s = SOURCES[idx];
            if (!s)
                throw new Error(`Invalid source "${sourceArg}". Expected: a URL, a file path, a number 0-${SOURCES.length - 1}, or "all"`);
            sources = [s];
        }
    }
    else {
        // Interactive menu
        const source = await promptSourceSelection();
        sources = [source];
    }
    console.log(`\n📋 Running ${sources.length} source(s):`);
    for (const [i, s] of sources.entries()) {
        const detail = s.type === "url" ? s.url : "filename" in s ? s.filename : "";
        console.log(`   [${i}] ${s.type.padEnd(5)} — ${s.label} (${detail})`);
    }
    for (const source of sources) {
        await runSingleSource(deepcitation, providerName, source, streamLlm);
    }
    console.log("\n✅ All sources processed.\n");
}
