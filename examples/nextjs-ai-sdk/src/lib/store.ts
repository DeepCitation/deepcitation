import type { FileDataPart } from "@deepcitation/deepcitation-js";

// In-memory session store (use Redis/DB in production)
const fileStore = new Map<string, FileDataPart[]>();
const promptPortionStore = new Map<string, string[]>();

export function addSessionFiles(
  sessionId: string,
  fileDataParts: FileDataPart[],
  deepTextPromptPortion: string[]
): void {
  const existingFiles = fileStore.get(sessionId) || [];
  fileStore.set(sessionId, [...existingFiles, ...fileDataParts]);

  const existingPrompts = promptPortionStore.get(sessionId) || [];
  promptPortionStore.set(sessionId, [...existingPrompts, ...deepTextPromptPortion]);
}

export function getSessionFiles(sessionId: string): FileDataPart[] {
  return fileStore.get(sessionId) || [];
}

export function getSessionPromptPortions(sessionId: string): string[] {
  return promptPortionStore.get(sessionId) || [];
}

export function clearSession(sessionId: string): void {
  fileStore.delete(sessionId);
  promptPortionStore.delete(sessionId);
}
