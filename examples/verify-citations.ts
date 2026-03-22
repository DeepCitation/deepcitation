/**
 * Standalone citation verification script.
 *
 * Reads a JSON config with sources + citations, runs the DeepCitation
 * prepare → verify pipeline, and outputs a JSON file ready for rendering
 * with CitationComponent.
 *
 * Usage:
 *   # Dry run (prints to stdout):
 *   DEEPCITATION_API_KEY=dc-xxx bun run verify-citations.ts --config=citations.json
 *
 *   # Write output file:
 *   DEEPCITATION_API_KEY=dc-xxx bun run verify-citations.ts --config=citations.json --output=verifications.json
 *
 * Input format (citations.json):
 *   {
 *     "sources": [
 *       { "url": "https://example.com", "name": "example" },
 *       { "path": "./docs/contract.pdf", "name": "contract" }
 *     ],
 *     "citations": [
 *       { "type": "url", "url": "https://example.com", "anchorText": "...", "fullPhrase": "...", "pageNumber": 1, "lineIds": [1, 5] }
 *     ]
 *   }
 *
 * Output format (verifications.json):
 *   {
 *     "sources": [{ "name": "...", "url": "...", "downloadUrl": "...", "mimeType": "...", "pageCount": 1 }],
 *     "results": [{ "citation": {...}, "verification": {...}, "sourceLabel": "..." }]
 *   }
 *
 * Each results[i] maps 1:1 to:
 *   <CitationComponent citation={r.citation} verification={r.verification} sourceLabel={r.sourceLabel} />
 */

import type { Citation, Verification } from "deepcitation";
import { DeepCitation, getCitationKey } from "deepcitation";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const API_KEY = process.env.DEEPCITATION_API_KEY;
if (!API_KEY) {
  console.error("DEEPCITATION_API_KEY environment variable is required");
  console.error("Usage: DEEPCITATION_API_KEY=dc-xxx bun run verify-citations.ts --config=citations.json [--output=verifications.json]");
  process.exit(1);
}

function getArg(name: string): string | undefined {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  return arg?.split("=").slice(1).join("=");
}

const configPath = getArg("config");
if (!configPath) {
  console.error("--config=<path> is required");
  process.exit(1);
}

const outputPath = getArg("output");
const dc = new DeepCitation({
  apiKey: API_KEY,
  ...(process.env.DEEPCITATION_API_URL ? { apiUrl: process.env.DEEPCITATION_API_URL } : {}),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceConfig {
  url?: string;
  path?: string;
  name: string;
}

interface CitationsConfig {
  sources: SourceConfig[];
  citations: Citation[];
}

interface PreparedSource {
  name: string;
  url?: string;
  attachmentId: string;
  downloadUrl?: string;
  mimeType?: string;
  pageCount?: number;
}

interface OutputResult {
  citation: Citation;
  verification: Verification;
  sourceLabel: string;
}

// ---------------------------------------------------------------------------
// Clean verification for storage
// ---------------------------------------------------------------------------

function cleanVerification(v: Verification, label: string): Verification {
  const clean: Record<string, unknown> = { ...v };
  delete clean.attachmentId;
  delete clean.citation;
  if (clean.document && typeof clean.document === "object") {
    delete (clean.document as Record<string, unknown>).attachmentId;
  }
  clean.verifiedAt = clean.verifiedAt || new Date().toISOString();
  clean.label = label;
  return clean as Verification;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Read config
  const configAbsolute = path.resolve(configPath!);
  const configDir = path.dirname(configAbsolute);
  const config: CitationsConfig = JSON.parse(fs.readFileSync(configAbsolute, "utf-8"));

  if (!config.sources?.length) {
    console.error("Config must have at least one source");
    process.exit(1);
  }
  if (!config.citations?.length) {
    console.error("Config must have at least one citation");
    process.exit(1);
  }

  console.log(`Config: ${config.sources.length} sources, ${config.citations.length} citations`);

  // 2. Prepare sources (in parallel)
  console.log("\n--- Prepare ---");

  async function prepareSource(source: SourceConfig): Promise<PreparedSource | null> {
    if (source.url) {
      console.log(`  URL: ${source.name} (${source.url})`);
      const resp = await dc.prepareUrl({ url: source.url, filename: source.name });
      if (resp.status === "error") {
        console.error(`    Error: ${(resp as { error?: string }).error}`);
        return null;
      }
      const downloadUrl = resp.convertedDownload?.link.url ?? resp.originalDownload?.link.url;
      console.log(`    OK (${resp.metadata?.pageCount || 1} pages)`);
      return {
        name: source.name,
        url: source.url,
        attachmentId: resp.attachmentId,
        downloadUrl,
        mimeType: resp.metadata?.mimeType,
        pageCount: resp.metadata?.pageCount,
      };
    } else if (source.path) {
      const fullPath = path.resolve(configDir, source.path);
      if (!fs.existsSync(fullPath)) {
        console.warn(`  Skipping missing file: ${fullPath}`);
        return null;
      }
      console.log(`  File: ${source.name} (${fullPath})`);
      const buffer = fs.readFileSync(fullPath);
      const blob = new Blob([new Uint8Array(buffer)]);
      const resp = await dc.uploadFile(blob, { filename: source.name });
      if (resp.status === "error") {
        console.error(`    Error: ${(resp as { error?: string }).error}`);
        return null;
      }
      const downloadUrl = resp.originalDownload?.link.url ?? resp.convertedDownload?.link.url;
      console.log(`    OK (${resp.metadata?.pageCount || 1} pages)`);
      return {
        name: source.name,
        attachmentId: resp.attachmentId,
        downloadUrl,
        mimeType: resp.metadata?.mimeType,
        pageCount: resp.metadata?.pageCount,
      };
    }
    return null;
  }

  const results = await Promise.all(config.sources.map(prepareSource));
  const prepared = results.filter((r): r is PreparedSource => r !== null);

  if (prepared.length === 0) {
    console.error("No sources prepared successfully");
    process.exit(1);
  }

  // Build lookups
  const urlToAttachmentId = new Map<string, string>();
  const nameToAttachmentId = new Map<string, string>();
  const attachmentIdToName = new Map<string, string>();
  for (const s of prepared) {
    if (s.url) urlToAttachmentId.set(s.url, s.attachmentId);
    nameToAttachmentId.set(s.name, s.attachmentId);
    attachmentIdToName.set(s.attachmentId, s.name);
  }

  // 3. Group citations by attachmentId and verify
  console.log("\n--- Verify ---");
  const citationsByAttachment = new Map<string, { citations: Citation[]; indices: number[] }>();

  for (let i = 0; i < config.citations.length; i++) {
    const citation = config.citations[i];
    let attachmentId: string | undefined;

    // Resolve which prepared source this citation belongs to
    if (citation.type === "url" && (citation as { url?: string }).url) {
      attachmentId = urlToAttachmentId.get((citation as { url: string }).url);
    }
    // citation.attachmentId can be used as a source name alias in the config
    if (!attachmentId && citation.attachmentId) {
      attachmentId = nameToAttachmentId.get(citation.attachmentId);
    }
    if (!attachmentId) {
      console.warn(`  Citation "${citation.anchorText}" has no matching source — falling back to first prepared source`);
      attachmentId = prepared[0].attachmentId;
    }

    const group = citationsByAttachment.get(attachmentId);
    if (group) {
      group.citations.push(citation);
      group.indices.push(i);
    } else {
      citationsByAttachment.set(attachmentId, { citations: [citation], indices: [i] });
    }
  }

  const results: (OutputResult | null)[] = new Array(config.citations.length).fill(null);

  for (const [attachmentId, group] of citationsByAttachment) {
    const sourceName = attachmentIdToName.get(attachmentId) ?? "unknown";
    console.log(`  Verifying ${group.citations.length} citations against "${sourceName}"...`);

    const citationRecord = Object.fromEntries(group.citations.map(c => [getCitationKey(c), c]));
    const resp = await dc.verifyAttachment(attachmentId, citationRecord);

    for (let j = 0; j < group.citations.length; j++) {
      const originalIndex = group.indices[j];
      const citation = group.citations[j];
      const key = getCitationKey(citation);
      const v = resp.verifications[key];

      if (!v) {
        console.warn(`    [missing] ${citation.anchorText}`);
        results[originalIndex] = {
          citation,
          verification: { status: "not_found", verifiedAt: new Date().toISOString() } as Verification,
          sourceLabel: sourceName,
        };
        continue;
      }

      const cleaned = cleanVerification(v, sourceName);
      const status = v.status === "found" || v.status === "partial_text_found" ? "found" : v.status;
      console.log(`    [${status}] ${citation.anchorText}`);

      results[originalIndex] = {
        citation,
        verification: cleaned,
        sourceLabel: sourceName,
      };
    }
  }

  const foundCount = results.filter(r => {
    const s = r?.verification.status;
    return s === "found" || s === "partial_text_found";
  }).length;
  console.log(`\n  Results: ${foundCount}/${results.length} found`);

  // 4. Build output
  const output = {
    sources: prepared.map(s => ({
      name: s.name,
      ...(s.url ? { url: s.url } : {}),
      ...(s.downloadUrl ? { downloadUrl: s.downloadUrl } : {}),
      ...(s.mimeType ? { mimeType: s.mimeType } : {}),
      ...(s.pageCount ? { pageCount: s.pageCount } : {}),
    })),
    results: results.filter((r): r is OutputResult => r !== null),
  };

  if (outputPath) {
    const outputAbsolute = path.resolve(outputPath);
    fs.writeFileSync(outputAbsolute, JSON.stringify(output, null, 2));
    console.log(`\nWritten to ${outputAbsolute}`);
  } else {
    console.log("\n--- Output (run with --output=verifications.json to save) ---\n");
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
