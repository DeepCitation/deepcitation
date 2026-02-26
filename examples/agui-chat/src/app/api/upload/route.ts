import { DeepCitation, sanitizeForLog, validateUploadFile } from "deepcitation";
import { type NextRequest, NextResponse } from "next/server";

// Check for API key at startup
const apiKey = process.env.DEEPCITATION_API_KEY;
if (!apiKey) {
  console.error(
    "\n⚠️  DEEPCITATION_API_KEY is not set!\n" +
      "   1. Copy .env.example to .env\n" +
      "   2. Get your API key from https://deepcitation.com/dashboard\n" +
      "   3. Add it to .env: DEEPCITATION_API_KEY=sk-dc-your-key\n",
  );
}

const deepCitation = apiKey ? new DeepCitation({ apiKey }) : null;

export async function POST(req: NextRequest) {
  // Check API key before processing
  if (!dc) {
    return NextResponse.json(
      {
        error: "DeepCitation API key not configured",
        details: "Set DEEPCITATION_API_KEY in your .env file. Get a key at https://deepcitation.com/dashboard",
      },
      { status: 500 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file size, MIME type, and magic bytes (from core package)
    const uploadError = validateUploadFile(file.size, file.type, new Uint8Array(arrayBuffer));
    if (uploadError) {
      const status = uploadError.includes("too large") ? 413 : 400;
      return NextResponse.json({ error: uploadError }, { status });
    }

    // Upload to DeepCitation
    const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([{ file: buffer, filename: file.name }]);

    const fileDataPart = fileDataParts[0];
    console.log(`Uploaded: ${sanitizeForLog(file.name)} (${fileDataPart.attachmentId})`);

    // Return fileDataPart for verification tracking + deepTextPromptPortion for LLM prompts
    return NextResponse.json({
      success: true,
      fileDataPart,
      deepTextPromptPortion,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Upload error:", sanitizeForLog(message));

    // Provide helpful error messages
    if (message.includes("Invalid or expired API key")) {
      return NextResponse.json(
        {
          error: "Invalid or expired API key",
          details: "Check your DEEPCITATION_API_KEY in .env. Get a new key at https://deepcitation.com/dashboard",
        },
        { status: 401 },
      );
    }

    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
