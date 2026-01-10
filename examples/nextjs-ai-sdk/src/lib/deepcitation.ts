import {
  DeepCitation,
  wrapCitationPrompt,
  getCitationStatus,
  getAllCitationsFromLlmOutput,
  type FileDataPart,
  type FoundHighlightLocation,
  type Citation,
} from "@deepcitation/deepcitation-js";

// Singleton client instance
let dcClient: DeepCitation | null = null;

export function getDeepCitationClient(): DeepCitation {
  if (!dcClient) {
    dcClient = new DeepCitation({
      apiKey: process.env.DEEPCITATION_API_KEY!,
    });
  }
  return dcClient;
}

// In-memory store for file data (use Redis/DB in production)
const fileStore = new Map<string, FileDataPart[]>();
const deepTextPromptPortionStore = new Map<string, string[]>();

export async function uploadDocument(
  sessionId: string,
  file: Buffer,
  filename: string
): Promise<{ fileId: string; deepTextPromptPortion: string }> {
  const dc = getDeepCitationClient();

  const { fileDataParts, deepTextPromptPortion } = await dc.prepareFiles([
    { file, filename },
  ]);

  // Store for later verification
  const existing = fileStore.get(sessionId) || [];
  fileStore.set(sessionId, [...existing, ...fileDataParts]);

  const existingTexts = deepTextPromptPortionStore.get(sessionId) || [];
  deepTextPromptPortionStore.set(sessionId, [
    ...existingTexts,
    ...deepTextPromptPortion,
  ]);

  return {
    fileId: fileDataParts[0].fileId,
    deepTextPromptPortion: deepTextPromptPortion[0],
  };
}

export function getSessionFiles(sessionId: string): FileDataPart[] {
  return fileStore.get(sessionId) || [];
}

export function getSessiondeepTextPromptPortion(sessionId: string): string[] {
  return deepTextPromptPortionStore.get(sessionId) || [];
}

export async function verifyCitations(
  sessionId: string,
  llmOutput: string
): Promise<Record<string, FoundHighlightLocation>> {
  const dc = getDeepCitationClient();
  const fileDataParts = getSessionFiles(sessionId);

  if (fileDataParts.length === 0) {
    return {};
  }

  const result = await dc.verifyCitationsFromLlmOutput({
    llmOutput,
    fileDataParts,
  });

  return result.foundHighlights;
}

export function enhancePrompts(
  systemPrompt: string,
  userPrompt: string,
  sessionId: string
): { enhancedSystemPrompt: string; enhancedUserPrompt: string } {
  const deepTextPromptPortion = getSessiondeepTextPromptPortion(sessionId);

  return wrapCitationPrompt({
    systemPrompt,
    userPrompt,
    deepTextPromptPortion:
      deepTextPromptPortion.length > 0 ? deepTextPromptPortion : undefined,
  });
}

export { getCitationStatus, getAllCitationsFromLlmOutput };
export type { Citation, FoundHighlightLocation, FileDataPart };
