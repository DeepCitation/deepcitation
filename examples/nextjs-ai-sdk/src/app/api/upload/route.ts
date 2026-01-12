import { NextRequest, NextResponse } from "next/server";
import { DeepCitation } from "@deepcitation/deepcitation-js";
import { addSessionFiles } from "@/lib/store";

// Check for API key at startup
const apiKey = process.env.DEEPCITATION_API_KEY;
if (!apiKey) {
  console.error(
    "\n⚠️  DEEPCITATION_API_KEY is not set!\n" +
    "   1. Copy .env.example to .env\n" +
    "   2. Get your API key from https://deepcitation.com/dashboard\n" +
    "   3. Add it to .env: DEEPCITATION_API_KEY=sk-dc-your-key\n"
  );
}

const dc = apiKey ? new DeepCitation({ apiKey }) : null;

export async function POST(req: NextRequest) {
  // Check API key before processing
  if (!dc) {
    return NextResponse.json(
      {
        error: "DeepCitation API key not configured",
        details: "Set DEEPCITATION_API_KEY in your .env file. Get a key at https://deepcitation.com/dashboard",
      },
      { status: 500 }
    );
  }

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
    const { fileDataParts, deepTextPromptPortion } = await dc.prepareFiles([
      { file: buffer, filename: file.name },
    ]);

    // Store for later verification
    addSessionFiles(sessionId, fileDataParts, deepTextPromptPortion);

    console.log(`[${sessionId}] Uploaded: ${file.name} (${fileDataParts[0].fileId})`);

    return NextResponse.json({
      success: true,
      fileId: fileDataParts[0].fileId,
      filename: file.name,
      deepTextPromptPortion: deepTextPromptPortion[0],
    });
  } catch (error: any) {
    const message = error?.message || "Unknown error";
    console.error("Upload error:", message);

    // Provide helpful error messages
    if (message.includes("Invalid or expired API key")) {
      return NextResponse.json(
        {
          error: "Invalid or expired API key",
          details: "Check your DEEPCITATION_API_KEY in .env. Get a new key at https://deepcitation.com/dashboard",
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to upload file", details: message },
      { status: 500 }
    );
  }
}
