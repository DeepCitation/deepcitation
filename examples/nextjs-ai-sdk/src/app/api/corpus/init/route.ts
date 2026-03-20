import { NextResponse } from "next/server";
import { getCorpusAttachment } from "@/lib/corpusAttachment";

export async function GET() {
  try {
    const { fileDataPart, deepTextPromptPortion } = await getCorpusAttachment();
    return NextResponse.json({ fileDataPart, deepTextPromptPortion });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
