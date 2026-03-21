import { NextResponse } from "next/server";
import { getCorpusAttachments } from "@/lib/corpusAttachment";

export async function GET() {
  try {
    const { fileDataParts, deepTextPromptPortions } = await getCorpusAttachments();
    return NextResponse.json({ fileDataParts, deepTextPromptPortions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
