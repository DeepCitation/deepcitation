import { DeepCitation, sanitizeForLog } from "deepcitation";
import { CORPUS_SOURCES, type CorpusSource } from "./corpus";

type FileDataPart = { attachmentId: string; filename?: string };

const apiKey = process.env.DEEPCITATION_API_KEY;
// All demo users intentionally share a single endUserId. In production,
// use a per-user identifier for usage attribution.
const dc = apiKey ? new DeepCitation({ apiKey, endUserId: "nextjs-ai-sdk" }) : null;

const preparedAttachmentCache = new Map<
  string,
  Promise<{ fileDataPart: FileDataPart; deepTextPromptPortion: string }>
>();

async function resolveAttachment(
  client: DeepCitation,
  source: CorpusSource,
): Promise<{ fileDataPart: FileDataPart; deepTextPromptPortion: string }> {
  const savedId = process.env[source.attachmentEnvVar];

  if (savedId) {
    try {
      const attachment = await client.getAttachment(savedId);
      if (attachment.deepTextPromptPortion) {
        return {
          fileDataPart: { attachmentId: savedId, filename: source.filename },
          deepTextPromptPortion: attachment.deepTextPromptPortion,
        };
      }
      console.warn(
        `[DeepCitation] ${source.attachmentEnvVar}=${sanitizeForLog(savedId)} did not return deepTextPromptPortion — re-uploading.`,
      );
    } catch (err) {
      console.warn(
        `[DeepCitation] Cached ${source.attachmentEnvVar}=${sanitizeForLog(savedId)} failed (${err instanceof Error ? err.message : err}) — re-uploading.`,
      );
    }
  }

  const response = await fetch(source.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch "${source.filename}": ${response.status} ${response.statusText}`);
  }
  const file = Buffer.from(await response.arrayBuffer());
  const prepared = await client.prepareAttachments([{ file, filename: source.filename }]);
  const attachmentId = prepared.fileDataParts[0].attachmentId;

  console.log(
    `[DeepCitation] Uploaded "${source.title}". Add to env to skip re-upload on cold starts:\n  ${source.attachmentEnvVar}=${sanitizeForLog(attachmentId)}`,
  );

  return {
    fileDataPart: { attachmentId, filename: source.filename },
    deepTextPromptPortion: prepared.deepTextPromptPortion,
  };
}

export type { FileDataPart };

function cacheAttachment(
  client: DeepCitation,
  source: CorpusSource,
): Promise<{ fileDataPart: FileDataPart; deepTextPromptPortion: string }> {
  const pending = resolveAttachment(client, source);
  preparedAttachmentCache.set(source.id, pending);
  pending.catch(() => preparedAttachmentCache.delete(source.id));
  return pending;
}

export async function getCorpusAttachments(): Promise<{
  fileDataParts: FileDataPart[];
  deepTextPromptPortions: string[];
}> {
  if (!dc) {
    throw new Error("DEEPCITATION_API_KEY is not set");
  }

  const results = await Promise.all(
    CORPUS_SOURCES.map((source) => {
      const cached = preparedAttachmentCache.get(source.id);
      if (cached) return cached;
      return cacheAttachment(dc, source);
    }),
  );

  return {
    fileDataParts: results.map((r) => r.fileDataPart),
    deepTextPromptPortions: results.map((r) => r.deepTextPromptPortion),
  };
}

// Fire-and-forget warmup on module load.
if (dc) {
  for (const source of CORPUS_SOURCES) {
    cacheAttachment(dc, source);
  }
}
