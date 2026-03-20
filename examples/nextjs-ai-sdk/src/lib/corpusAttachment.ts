import { DeepCitation } from "deepcitation";
import { CORPUS_SOURCE } from "./corpus";

type FileDataPart = { attachmentId: string; filename?: string };

const apiKey = process.env.DEEPCITATION_API_KEY;
const dc = apiKey ? new DeepCitation({ apiKey, endUserId: "nextjs-ai-sdk" }) : null;

let cachedPromise: Promise<{ fileDataPart: FileDataPart; deepTextPromptPortion: string }> | null = null;

async function resolveAttachment(
  client: DeepCitation,
): Promise<{ fileDataPart: FileDataPart; deepTextPromptPortion: string }> {
  const savedId = process.env[CORPUS_SOURCE.attachmentEnvVar];

  if (savedId) {
    const attachment = await client.getAttachment(savedId);
    if (attachment.deepTextPromptPortion) {
      return {
        fileDataPart: { attachmentId: savedId, filename: CORPUS_SOURCE.filename },
        deepTextPromptPortion: attachment.deepTextPromptPortion,
      };
    }
    console.warn(
      `[DeepCitation] ${CORPUS_SOURCE.attachmentEnvVar}=${savedId} did not return deepTextPromptPortion — re-uploading.`,
    );
  }

  const response = await fetch(CORPUS_SOURCE.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch "${CORPUS_SOURCE.filename}": ${response.status} ${response.statusText}`);
  }
  const file = Buffer.from(await response.arrayBuffer());
  const prepared = await client.prepareAttachments([{ file, filename: CORPUS_SOURCE.filename }]);
  const attachmentId = prepared.fileDataParts[0].attachmentId;

  console.log(
    `[DeepCitation] Uploaded "${CORPUS_SOURCE.title}". Add to env to skip re-upload on cold starts:\n  ${CORPUS_SOURCE.attachmentEnvVar}=${attachmentId}`,
  );

  return {
    fileDataPart: { attachmentId, filename: CORPUS_SOURCE.filename },
    deepTextPromptPortion: prepared.deepTextPromptPortion,
  };
}

export type { FileDataPart };

export function getCorpusAttachment(): Promise<{ fileDataPart: FileDataPart; deepTextPromptPortion: string }> {
  if (!dc) {
    return Promise.reject(new Error("DEEPCITATION_API_KEY is not set"));
  }
  cachedPromise ??= resolveAttachment(dc);
  return cachedPromise;
}

// Fire-and-forget warmup on module load
if (dc) {
  cachedPromise = resolveAttachment(dc);
}
