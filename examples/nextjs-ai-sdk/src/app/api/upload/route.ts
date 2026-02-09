import { DeepCitation } from "@deepcitation/deepcitation-js";
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

const dc = apiKey ? new DeepCitation({ apiKey }) : null;

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

    // Upload to DeepCitation - fileDataParts now includes deepTextPromptPortion
    const { fileDataParts } = await dc.prepareFiles([{ file: buffer, filename: file.name }]);

    const fileDataPart = fileDataParts[0];
    console.log(`Uploaded: ${file.name} (${fileDataPart.attachmentId})`);

    // Return the complete FileDataPart - client stores this as single source of truth
    return NextResponse.json({
      success: true,
      fileDataPart,
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
        { status: 401 },
      );
    }

    return NextResponse.json({ error: "Failed to upload file", details: message }, { status: 500 });
  }
}
