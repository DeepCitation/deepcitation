import { NextResponse } from "next/server";
import { getCorpusAttachments } from "@/lib/corpusAttachment";
export async function GET() {
    try {
        const { fileDataParts, deepTextPagesByAttachmentId } = await getCorpusAttachments();
        return NextResponse.json({ fileDataParts, deepTextPagesByAttachmentId });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
