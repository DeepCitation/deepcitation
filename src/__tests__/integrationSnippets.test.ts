/**
 * Content integrity tests for INTEGRATION.md code snippets.
 *
 * These verify that every snippet in src/docs/integrationSnippets.ts:
 * 1. References the correct SDK functions/types
 * 2. Does NOT reference removed XML <cite> patterns
 * 3. Does NOT reference renamed/removed function names
 *
 * Run with: bun test src/__tests__/integrationSnippets.test.ts
 */
import { describe, expect, it } from "bun:test";

import {
  DISPLAY_CITATION_KEY,
  DISPLAY_NUMERIC_MARKERS,
  DISPLAY_POST_STREAM,
  DISPLAY_STREAMING,
  PROVIDER_ANTHROPIC,
  PROVIDER_GOOGLE,
  QUICKSTART_REACT_CLIENT,
  QUICKSTART_SERVER,
  RECIPE_KEEP_MARKERS,
  RECIPE_REACT_INLINE,
  RECIPE_STRIP,
  RECIPE_VERIFY_STATUS,
  SERVER_PERSIST,
  SERVER_VERIFY_EXPLICIT,
  SERVER_VERIFY_SIMPLE,
  SERVER_WRAP_PROMPTS,
  SETUP_IMPORT_TYPES,
  SETUP_INIT_CLIENT,
  SETUP_PREPARE_FILES,
  SETUP_PREPARE_URL,
  SETUP_PROOF_IMAGES,
} from "../docs/integrationSnippets";

// Collect all snippets for cross-cutting assertions
const ALL_SNIPPETS: Record<string, string> = {
  RECIPE_STRIP,
  RECIPE_KEEP_MARKERS,
  RECIPE_REACT_INLINE,
  RECIPE_VERIFY_STATUS,
  QUICKSTART_SERVER,
  QUICKSTART_REACT_CLIENT,
  SETUP_IMPORT_TYPES,
  SETUP_INIT_CLIENT,
  SETUP_PREPARE_FILES,
  SETUP_PREPARE_URL,
  SETUP_PROOF_IMAGES,
  SERVER_WRAP_PROMPTS,
  SERVER_VERIFY_SIMPLE,
  SERVER_VERIFY_EXPLICIT,
  SERVER_PERSIST,
  DISPLAY_CITATION_KEY,
  DISPLAY_POST_STREAM,
  DISPLAY_STREAMING,
  DISPLAY_NUMERIC_MARKERS,
  PROVIDER_ANTHROPIC,
  PROVIDER_GOOGLE,
};

// =============================================================================
// Negative assertions — NO snippet should reference removed XML patterns
// =============================================================================

describe("no snippet references removed XML <cite> patterns", () => {
  for (const [name, snippet] of Object.entries(ALL_SNIPPETS)) {
    it(`${name} does not split on <cite> tags`, () => {
      expect(snippet).not.toContain('startsWith("<cite"');
      expect(snippet).not.toContain("startsWith('<cite'");
      expect(snippet).not.toContain("/<cite");
    });

    it(`${name} does not reference "xml" format`, () => {
      expect(snippet).not.toContain('"xml"');
    });

    it(`${name} does not reference "deferred" format (renamed to "numeric")`, () => {
      expect(snippet).not.toContain('"deferred"');
    });

    it(`${name} does not use deferredCitationToCitation (renamed to citationDataToCitation)`, () => {
      expect(snippet).not.toContain("deferredCitationToCitation");
    });
  }
});

// =============================================================================
// Quick Reference Recipes
// =============================================================================

describe("Recipe snippets", () => {
  it("RECIPE_STRIP uses stripCitations", () => {
    expect(RECIPE_STRIP).toContain("stripCitations");
    expect(RECIPE_STRIP).toContain('from "deepcitation"');
  });

  it("RECIPE_KEEP_MARKERS uses extractVisibleText and renderCitationsAsMarkdown", () => {
    expect(RECIPE_KEEP_MARKERS).toContain("extractVisibleText");
    expect(RECIPE_KEEP_MARKERS).toContain("renderCitationsAsMarkdown");
    expect(RECIPE_KEEP_MARKERS).toContain('from "deepcitation"');
  });

  it("RECIPE_REACT_INLINE uses parseCitationResponse + markerMap + CitationComponent", () => {
    expect(RECIPE_REACT_INLINE).toContain("parseCitationResponse");
    expect(RECIPE_REACT_INLINE).toContain("markerMap");
    expect(RECIPE_REACT_INLINE).toContain("CitationComponent");
    expect(RECIPE_REACT_INLINE).toContain("splitPattern");
    expect(RECIPE_REACT_INLINE).toContain('"numeric"');
    expect(RECIPE_REACT_INLINE).toContain('from "deepcitation/react"');
  });

  it("RECIPE_VERIFY_STATUS uses replaceCitationMarkers (not replaceCitations)", () => {
    expect(RECIPE_VERIFY_STATUS).toContain("replaceCitationMarkers");
    expect(RECIPE_VERIFY_STATUS).toContain("parseCitationData");
    expect(RECIPE_VERIFY_STATUS).toContain("showVerificationStatus");
    // Should NOT use the legacy XML replaceCitations
    expect(RECIPE_VERIFY_STATUS).not.toContain("replaceCitations(");
  });
});

// =============================================================================
// Quick Start
// =============================================================================

describe("Quick Start snippets", () => {
  it("QUICKSTART_SERVER covers full pipeline: prepare → wrap → call → verify", () => {
    expect(QUICKSTART_SERVER).toContain("DeepCitation");
    expect(QUICKSTART_SERVER).toContain("prepareAttachments");
    expect(QUICKSTART_SERVER).toContain("wrapCitationPrompt");
    expect(QUICKSTART_SERVER).toContain("getAllCitationsFromLlmOutput");
    expect(QUICKSTART_SERVER).toContain("extractVisibleText");
    expect(QUICKSTART_SERVER).toContain("verifyAttachment");
    expect(QUICKSTART_SERVER).toContain("Object.keys(citations).length");
    expect(QUICKSTART_SERVER).toContain("CitationRecord");
  });

  it("QUICKSTART_REACT_CLIENT uses parseCitationResponse + CitationDrawer", () => {
    expect(QUICKSTART_REACT_CLIENT).toContain("parseCitationResponse");
    expect(QUICKSTART_REACT_CLIENT).toContain("CitationComponent");
    expect(QUICKSTART_REACT_CLIENT).toContain("CitationDrawer");
    expect(QUICKSTART_REACT_CLIENT).toContain("CitationDrawerTrigger");
    expect(QUICKSTART_REACT_CLIENT).toContain("groupCitationsBySource");
    expect(QUICKSTART_REACT_CLIENT).toContain("markerMap");
    expect(QUICKSTART_REACT_CLIENT).toContain("splitPattern");
  });
});

// =============================================================================
// Section 1: Setup
// =============================================================================

describe("Setup snippets", () => {
  it("SETUP_IMPORT_TYPES imports from deepcitation", () => {
    expect(SETUP_IMPORT_TYPES).toContain("Citation");
    expect(SETUP_IMPORT_TYPES).toContain("Verification");
    expect(SETUP_IMPORT_TYPES).toContain("CitationRecord");
    expect(SETUP_IMPORT_TYPES).toContain("VerificationRecord");
    expect(SETUP_IMPORT_TYPES).toContain('from "deepcitation"');
  });

  it("SETUP_INIT_CLIENT uses DeepCitation constructor", () => {
    expect(SETUP_INIT_CLIENT).toContain("new DeepCitation");
    expect(SETUP_INIT_CLIENT).toContain("DEEPCITATION_API_KEY");
  });

  it("SETUP_PREPARE_FILES uses prepareAttachments", () => {
    expect(SETUP_PREPARE_FILES).toContain("prepareAttachments");
    expect(SETUP_PREPARE_FILES).toContain("fileDataParts");
    expect(SETUP_PREPARE_FILES).toContain("deepTextPromptPortion");
    expect(SETUP_PREPARE_FILES).toContain("attachmentId");
  });

  it("SETUP_PREPARE_URL uses prepareUrl", () => {
    expect(SETUP_PREPARE_URL).toContain("prepareUrl");
    expect(SETUP_PREPARE_URL).toContain("attachmentId");
    expect(SETUP_PREPARE_URL).toContain("deepTextPromptPortion");
  });

  it("SETUP_PROOF_IMAGES uses verifyAttachment with proofConfig", () => {
    expect(SETUP_PROOF_IMAGES).toContain("verifyAttachment");
    expect(SETUP_PROOF_IMAGES).toContain("generateProofUrls");
    expect(SETUP_PROOF_IMAGES).toContain("proofConfig");
    expect(SETUP_PROOF_IMAGES).toContain('"signed"');
  });
});

// =============================================================================
// Section 2: Server Side
// =============================================================================

describe("Server Side snippets", () => {
  it("SERVER_WRAP_PROMPTS uses wrapCitationPrompt", () => {
    expect(SERVER_WRAP_PROMPTS).toContain("wrapCitationPrompt");
    expect(SERVER_WRAP_PROMPTS).toContain("enhancedSystemPrompt");
    expect(SERVER_WRAP_PROMPTS).toContain("enhancedUserPrompt");
    expect(SERVER_WRAP_PROMPTS).toContain("deepTextPromptPortion");
  });

  it("SERVER_VERIFY_SIMPLE uses verify() simple API", () => {
    expect(SERVER_VERIFY_SIMPLE).toContain("extractVisibleText");
    expect(SERVER_VERIFY_SIMPLE).toContain("deepcitation.verify");
    expect(SERVER_VERIFY_SIMPLE).toContain("VerificationRecord");
  });

  it("SERVER_VERIFY_EXPLICIT uses getAllCitationsFromLlmOutput + verifyAttachment", () => {
    expect(SERVER_VERIFY_EXPLICIT).toContain("getAllCitationsFromLlmOutput");
    expect(SERVER_VERIFY_EXPLICIT).toContain("extractVisibleText");
    expect(SERVER_VERIFY_EXPLICIT).toContain("verifyAttachment");
    expect(SERVER_VERIFY_EXPLICIT).toContain("Object.keys(citations).length");
    expect(SERVER_VERIFY_EXPLICIT).toContain("CitationRecord");
    expect(SERVER_VERIFY_EXPLICIT).toContain("VerificationRecord");
  });

  it("SERVER_PERSIST stores visibleText, citations, verifications", () => {
    expect(SERVER_PERSIST).toContain("visibleText");
    expect(SERVER_PERSIST).toContain("citations");
    expect(SERVER_PERSIST).toContain("verifications");
    expect(SERVER_PERSIST).toContain("<<<CITATION_DATA>>>");
  });
});

// =============================================================================
// Section 3: Display
// =============================================================================

describe("Display snippets", () => {
  it("DISPLAY_CITATION_KEY uses getCitationKey", () => {
    expect(DISPLAY_CITATION_KEY).toContain("getCitationKey");
    expect(DISPLAY_CITATION_KEY).toContain('from "deepcitation"');
  });

  it("DISPLAY_POST_STREAM uses parseCitationResponse + markerMap pattern", () => {
    expect(DISPLAY_POST_STREAM).toContain("parseCitationResponse");
    expect(DISPLAY_POST_STREAM).toContain("markerMap");
    expect(DISPLAY_POST_STREAM).toContain("splitPattern");
    expect(DISPLAY_POST_STREAM).toContain("CitationComponent");
    expect(DISPLAY_POST_STREAM).toContain('"numeric"');
    expect(DISPLAY_POST_STREAM).toContain('from "deepcitation/react"');
  });

  it("DISPLAY_STREAMING uses extractVisibleText + getAllCitationsFromLlmOutput", () => {
    expect(DISPLAY_STREAMING).toContain("extractVisibleText");
    expect(DISPLAY_STREAMING).toContain("getAllCitationsFromLlmOutput");
    expect(DISPLAY_STREAMING).toContain("verifyAttachment");
    expect(DISPLAY_STREAMING).toContain("Object.keys(citations).length");
  });

  it("DISPLAY_NUMERIC_MARKERS uses replaceCitationMarkers", () => {
    expect(DISPLAY_NUMERIC_MARKERS).toContain("replaceCitationMarkers");
    expect(DISPLAY_NUMERIC_MARKERS).toContain("getAllCitationsFromLlmOutput");
    expect(DISPLAY_NUMERIC_MARKERS).toContain("extractVisibleText");
    expect(DISPLAY_NUMERIC_MARKERS).toContain("showVerificationStatus");
  });
});

// =============================================================================
// Appendix B: Providers
// =============================================================================

describe("Provider snippets", () => {
  it("PROVIDER_ANTHROPIC uses Anthropic SDK", () => {
    expect(PROVIDER_ANTHROPIC).toContain("@anthropic-ai/sdk");
    expect(PROVIDER_ANTHROPIC).toContain("messages.create");
    expect(PROVIDER_ANTHROPIC).toContain("enhancedSystemPrompt");
    expect(PROVIDER_ANTHROPIC).toContain("enhancedUserPrompt");
  });

  it("PROVIDER_GOOGLE uses Google Generative AI", () => {
    expect(PROVIDER_GOOGLE).toContain("@google/generative-ai");
    expect(PROVIDER_GOOGLE).toContain("generateContent");
    expect(PROVIDER_GOOGLE).toContain("enhancedSystemPrompt");
    expect(PROVIDER_GOOGLE).toContain("enhancedUserPrompt");
  });
});

// =============================================================================
// SDK export verification — snippets reference real exports
// =============================================================================

describe("snippets reference real SDK exports", () => {
  it("all deepcitation imports exist as actual exports", async () => {
    // Import the real SDK to check exports exist
    const sdk = await import("../index");

    // Functions that snippets reference
    const expectedFunctions = [
      "stripCitations",
      "extractVisibleText",
      "renderCitationsAsMarkdown",
      "parseCitationResponse",
      "getCitationKey",
      "replaceCitationMarkers",
      "parseCitationData",
      "wrapCitationPrompt",
      "getAllCitationsFromLlmOutput",
      "getCitationStatus",
    ];

    for (const fn of expectedFunctions) {
      expect(sdk).toHaveProperty(fn);
      expect(typeof (sdk as Record<string, unknown>)[fn]).toBe("function");
    }
  });

  it("DeepCitation class is exported", async () => {
    const sdk = await import("../index");
    expect(sdk).toHaveProperty("DeepCitation");
    expect(typeof sdk.DeepCitation).toBe("function");
  });

  it("all referenced types exist as type exports", async () => {
    // We can't check types at runtime, but we can verify that the
    // type-only imports reference names that appear in the module's exports
    const sdk = await import("../index");

    // Type guards and constructors that prove types exist
    expect(sdk).toHaveProperty("isDocumentCitation");
    expect(sdk).toHaveProperty("isUrlCitation");
    expect(sdk).toHaveProperty("isAudioVideoCitation");
  });
});
