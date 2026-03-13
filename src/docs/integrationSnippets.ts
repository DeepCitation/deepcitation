/**
 * Centralized, tested code snippets used in INTEGRATION.md.
 *
 * Every code block in INTEGRATION.md that references SDK functions should
 * match one of these constants. Tests in __tests__/integrationSnippets.test.ts
 * verify that each snippet references real exports and does NOT use removed
 * legacy XML patterns.
 *
 * DO NOT modify these snippets without running the tests:
 *   bun test src/__tests__/integrationSnippets.test.ts
 */

// =============================================================================
// Quick Reference Recipes
// =============================================================================

/** Recipe 1 — Strip citations, show clean text */
export const RECIPE_STRIP = `import { stripCitations } from "deepcitation";

// Strips [N] markers and the <<<CITATION_DATA>>> block, returns clean text
const cleanText = stripCitations(llmResponse);`;

/** Recipe 2 — Keep [N] numbers, add references section */
export const RECIPE_KEEP_MARKERS = `import { extractVisibleText, renderCitationsAsMarkdown } from "deepcitation";

// Numeric format: text already has [N] markers after stripping the data block
const text = extractVisibleText(llmResponse);

// Render as markdown with bracket-style references
const { markdown, references } = renderCitationsAsMarkdown(llmResponse, { variant: "brackets" });`;

/** Recipe 3 — Render React <CitationComponent> inline */
export const RECIPE_REACT_INLINE = `import { CitationComponent } from "deepcitation/react";
import { parseCitationResponse, getCitationKey } from "deepcitation";

const result = parseCitationResponse(llmOutput);
const segments = result.visibleText.split(result.splitPattern);

const rendered = segments.map((seg, i) => {
  if (result.format === "numeric") {
    const match = seg.match(/^\\[(\\d+)\\]$/);
    if (match) {
      const key = result.markerMap[Number(match[1])];
      return <CitationComponent key={i} citation={result.citations[key]} verification={verifications[key] ?? null} />;
    }
  }
  return <span key={i}>{seg}</span>;
});`;

/** Recipe 4 — Verify and show status indicators (numeric format) */
export const RECIPE_VERIFY_STATUS = `import { extractVisibleText, parseCitationData, replaceCitationMarkers } from "deepcitation";

const { visibleText, citationMap } = parseCitationData(llmResponse);
const display = replaceCitationMarkers(visibleText, {
  citationMap,
  verifications,
  showVerificationStatus: true,
});`;

// =============================================================================
// Quick Start
// =============================================================================

/** Quick Start — Server side (full pipeline) */
export const QUICKSTART_SERVER = `import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
  extractVisibleText,
  getCitationStatus,
} from "deepcitation";
import type { CitationRecord, VerificationRecord } from "deepcitation";
import OpenAI from "openai";
import { readFileSync } from "fs";

async function analyzeDocument(filePath: string, question: string) {
  const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY! });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  // Step 1: Prepare source
  const document = readFileSync(filePath);
  const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareAttachments([
    { file: document, filename: filePath },
  ]);
  const attachmentId = fileDataParts[0].attachmentId; // 20-char alphanumeric ID

  // Step 2: Enhance prompts & call LLM
  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt: "You are a helpful assistant. Cite your sources.",
    userPrompt: question,
    deepTextPromptPortion,
  });

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: enhancedSystemPrompt },
      { role: "user", content: enhancedUserPrompt },
    ],
  });
  const llmOutput = response.choices[0].message.content!;

  // Step 3: Parse, verify, display
  const citations: CitationRecord = getAllCitationsFromLlmOutput(llmOutput);
  const visibleText = extractVisibleText(llmOutput);

  if (Object.keys(citations).length === 0) {
    return { response: visibleText, citations: {}, verifications: {} };
  }

  const result = await deepcitation.verifyAttachment(attachmentId, citations, {
    generateProofUrls: true,
    proofConfig: { access: "signed", signedUrlExpiry: "7d", imageFormat: "avif" },
  });

  return { response: visibleText, citations, verifications: result.verifications };
}`;

/** Quick Start — React client side */
export const QUICKSTART_REACT_CLIENT = `import { useState } from "react";
import { parseCitationResponse } from "deepcitation";
import type { Citation, Verification } from "deepcitation";
import {
  CitationComponent,
  CitationDrawer,
  CitationDrawerTrigger,
  getCitationKey,
  groupCitationsBySource,
  type CitationDrawerItem,
} from "deepcitation";

function MessageWithCitations({
  llmOutput,
  verifications,
}: {
  llmOutput: string;
  verifications: Record<string, Verification>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const result = parseCitationResponse(llmOutput);
  const citations = result.citations;

  // Build drawer items
  const drawerItems: CitationDrawerItem[] = Object.entries(citations).map(
    ([citationKey, citation]) => ({
      citationKey,
      citation,
      verification: verifications[citationKey] ?? null,
    }),
  );
  const citationGroups = groupCitationsBySource(drawerItems);

  // Split text on [N] markers and render CitationComponent for each
  const segments = result.visibleText.split(result.splitPattern);
  const rendered = segments.map((seg, i) => {
    const match = seg.match(/^\\[(\\d+)\\]$/);
    if (match) {
      const key = result.markerMap[Number(match[1])];
      return (
        <CitationComponent
          key={i}
          citation={citations[key]}
          verification={verifications[key] ?? null}
        />
      );
    }
    return <span key={i}>{seg}</span>;
  });

  return (
    <div>
      <div>{rendered}</div>
      {citationGroups.length > 0 && (
        <>
          <CitationDrawerTrigger
            citationGroups={citationGroups}
            onClick={() => setDrawerOpen(true)}
            isOpen={drawerOpen}
          />
          {drawerOpen && (
            <CitationDrawer
              isOpen={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              citationGroups={citationGroups}
            />
          )}
        </>
      )}
    </div>
  );
}`;

// =============================================================================
// Section 1: Install & Setup
// =============================================================================

/** Section 1.2 — Import types */
export const SETUP_IMPORT_TYPES = `import type {
  Citation,
  Verification,
  CitationRecord,     // Record<string, Citation> — NOT an array
  VerificationRecord, // Record<string, Verification>
} from "deepcitation";`;

/** Section 1.3 — Initialize client */
export const SETUP_INIT_CLIENT = `import { DeepCitation } from "deepcitation";

const deepcitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY!,
});`;

/** Section 1.4 — Prepare files */
export const SETUP_PREPARE_FILES = `import { readFileSync } from "fs";

const document = readFileSync("./document.pdf");
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareAttachments([
  { file: document, filename: "document.pdf" },
  { file: imageBuffer, filename: "chart.png" }, // multiple files supported
]);

// Save attachmentId for verification (valid for 24 hours)
const attachmentId = fileDataParts[0].attachmentId; // e.g. "a1b2c3d4e5f6g7h8i9j0"`;

/** Section 1.4 — Prepare URLs */
export const SETUP_PREPARE_URL = `const { attachmentId, deepTextPromptPortion, metadata } = await deepcitation.prepareUrl({
  url: "https://example.com/article",
});`;

/** Section 1.5 — Proof image options */
export const SETUP_PROOF_IMAGES = `const result = await deepcitation.verifyAttachment(attachmentId, citations, {
  generateProofUrls: true,
  proofConfig: {
    access: "signed",      // "signed" | "workspace" | "public"
    signedUrlExpiry: "7d", // Only for access: "signed". Options: "1h" | "24h" | "7d" | "30d" | "90d" | "1y"
    imageFormat: "avif",   // "png" | "jpeg" | "avif" | "webp"
    includeBase64: false,  // Set true to also include base64 alongside URLs
  },
});`;

// =============================================================================
// Section 2: Server Side
// =============================================================================

/** Section 2.1 — Wrap prompts */
export const SERVER_WRAP_PROMPTS = `import { wrapCitationPrompt } from "deepcitation";

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a helpful assistant...",
  userPrompt: "Summarize this document",
  deepTextPromptPortion, // from Section 1 — prepareAttachments or prepareUrl
});`;

/** Section 2.2 — Call your LLM (OpenAI example) */
export const SERVER_CALL_LLM = `import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await openai.chat.completions.create({
  model: "gpt-5-mini",
  messages: [
    { role: "system", content: enhancedSystemPrompt },
    { role: "user", content: enhancedUserPrompt },
  ],
});

const llmOutput = response.choices[0].message.content!;`;

/** Section 2.3 — Verify citations (simple API) */
export const SERVER_VERIFY_SIMPLE = `import { extractVisibleText } from "deepcitation";

const visibleText = extractVisibleText(llmOutput); // Always strip before display

const result = await deepcitation.verify({
  llmOutput,
  fileDataParts, // required if Zero Data Retention is enabled
});
const verifications: VerificationRecord = result.verifications;`;

/** Section 2.3 — Verify citations (explicit API) */
export const SERVER_VERIFY_EXPLICIT = `import { getAllCitationsFromLlmOutput, extractVisibleText } from "deepcitation";
import type { CitationRecord, VerificationRecord } from "deepcitation";

const citations: CitationRecord = getAllCitationsFromLlmOutput(llmOutput);
const visibleText = extractVisibleText(llmOutput);

if (Object.keys(citations).length === 0) {
  return { response: visibleText, verifications: {} };
}

const result = await deepcitation.verifyAttachment(attachmentId, citations, {
  generateProofUrls: true,
  proofConfig: { access: "signed", signedUrlExpiry: "7d", imageFormat: "avif" },
});
const verifications: VerificationRecord = result.verifications;`;

/** Section 2.4 — Persist results */
export const SERVER_PERSIST = `// Store after verification
await db.messages.insert({
  id: messageId,
  userId,
  text: visibleText,          // The <<<CITATION_DATA>>> block has been stripped
  citations: citations,        // CitationRecord for client-side rendering
  verifications: verifications, // VerificationRecord — status + proof per citation
  createdAt: new Date(),
});

// Retrieve and send to client — no re-verification needed
const message = await db.messages.findById(messageId);
return {
  text: message.text,
  citations: message.citations,
  verifications: message.verifications,
};`;

// =============================================================================
// Section 3: Display with CitationComponent
// =============================================================================

/** Section 3.1 — How CitationKey works */
export const DISPLAY_CITATION_KEY = `import { getCitationKey } from "deepcitation";

// Generate the key — same algorithm used internally, always deterministic
const key = getCitationKey(citation); // e.g. "a3f7b2c1d8e9f012"

// Look up the verification result using the key
const verification = verifications[key] ?? null;`;

/** Section 3.2 — Post-stream full response */
export const DISPLAY_POST_STREAM = `import { CitationComponent } from "deepcitation/react";
import { parseCitationResponse, getCitationKey } from "deepcitation";
import type { CitationRecord, VerificationRecord } from "deepcitation";

function MessageWithCitations({
  llmOutput,
  verifications,
}: {
  llmOutput: string;     // full LLM output with <<<CITATION_DATA>>> block
  verifications: VerificationRecord;
}) {
  const result = parseCitationResponse(llmOutput);
  // result.format is "numeric" | "none"

  if (result.format !== "numeric") {
    return <p>{result.visibleText}</p>;
  }

  const segments = result.visibleText.split(result.splitPattern);

  return (
    <p>
      {segments.map((seg, i) => {
        const match = seg.match(/^\\[(\\d+)\\]$/);
        if (match) {
          const key = result.markerMap[Number(match[1])];
          return (
            <CitationComponent
              key={i}
              citation={result.citations[key]}
              verification={verifications[key] ?? null}
            />
          );
        }
        return <span key={i}>{seg}</span>;
      })}
    </p>
  );
}`;

/** Section 3.3 — During streaming */
export const DISPLAY_STREAMING = `import { extractVisibleText, getAllCitationsFromLlmOutput } from "deepcitation";

// Stream the LLM response
let fullResponse = "";

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content ?? "";
  fullResponse += delta;

  // Show visible text as it arrives — extractVisibleText safely handles partial responses
  // (strips the <<<CITATION_DATA>>> block if/when it appears)
  setDisplayText(extractVisibleText(fullResponse));
}

// Stream complete — now parse all citations and verify
const citations = getAllCitationsFromLlmOutput(fullResponse);
const visibleText = extractVisibleText(fullResponse);

if (Object.keys(citations).length > 0) {
  const result = await deepcitation.verifyAttachment(attachmentId, citations, {
    generateProofUrls: true,
    proofConfig: { access: "signed", signedUrlExpiry: "7d", imageFormat: "avif" },
  });
  // Re-render using the pattern from Section 3.2
  setVerifications(result.verifications);
  setCitations(citations);
}
setDisplayText(visibleText);`;

/** Section 3.4 — Numeric markers with verification indicators */
export const DISPLAY_NUMERIC_MARKERS = `import { extractVisibleText, getAllCitationsFromLlmOutput, replaceCitationMarkers } from "deepcitation";

// After streaming the LLM response:
const citations = getAllCitationsFromLlmOutput(llmResponse);
const visibleText = extractVisibleText(llmResponse);
const { verifications } = await deepcitation.verifyAttachment(attachmentId, citations);

// Display with verification indicators: [1☑️] [2❌] [3✅]
const display = replaceCitationMarkers(visibleText, {
  verifications,
  showVerificationStatus: true,
});`;

// =============================================================================
// Appendix B: Other LLM Providers
// =============================================================================

/** Appendix B — Anthropic Claude */
export const PROVIDER_ANTHROPIC = `import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const response = await anthropic.messages.create({
  model: "claude-3-5-haiku-20241022",
  max_tokens: 4096,
  system: enhancedSystemPrompt,
  messages: [{ role: "user", content: enhancedUserPrompt }],
});
const llmOutput = response.content[0].text;`;

/** Appendix B — Google Gemini */
export const PROVIDER_GOOGLE = `import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
const result = await model.generateContent([
  { text: enhancedSystemPrompt },
  { text: enhancedUserPrompt },
]);
const llmOutput = result.response.text();`;
