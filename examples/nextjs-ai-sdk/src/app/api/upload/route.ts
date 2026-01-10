import { NextRequest, NextResponse } from "next/server";
import { uploadDocument } from "@/lib/deepcitation";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const sessionId = (formData.get("sessionId") as string) || "default";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to DeepCitation
    const { fileId, deepTextPromptPortion } = await uploadDocument(
      sessionId,
      buffer,
      file.name
    );

    return NextResponse.json({
      success: true,
      fileId,
      filename: file.name,
      deepTextPromptPortionLength: deepTextPromptPortion.length,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
