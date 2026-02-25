import { DeepCitation, sanitizeForLog } from "@deepcitation/deepcitation-js";
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

    // Validate file size (50MB limit)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB." },
        { status: 413 },
      );
    }

    // Validate MIME type
    const ALLOWED_TYPES = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/tiff",
      "image/webp",
    ];
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Allowed: PDF, PNG, JPEG, TIFF, WebP." },
        { status: 400 },
      );
    }

    // Convert File to Buffer and validate magic bytes
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify actual file content matches claimed MIME type via magic bytes.
    // Client-supplied Content-Type is trivially spoofable; this checks the real bytes.
    const MAGIC_BYTES: Record<string, number[][]> = {
      "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
      "image/png": [[0x89, 0x50, 0x4e, 0x47]],       // .PNG
      "image/jpeg": [[0xff, 0xd8, 0xff]],             // SOI marker
      "image/tiff": [[0x49, 0x49, 0x2a, 0x00], [0x4d, 0x4d, 0x00, 0x2a]], // II* or MM*
      "image/webp": [[0x52, 0x49, 0x46, 0x46]],       // RIFF
    };
    const signatures = MAGIC_BYTES[file.type];
    if (signatures && !signatures.some(sig => sig.every((b, i) => buffer[i] === b))) {
      return NextResponse.json(
        { error: "File content does not match its declared type." },
        { status: 400 },
      );
    }

    // Upload to DeepCitation - fileDataParts now includes deepTextPromptPortion
    const { fileDataParts } = await dc.prepareFiles([{ file: buffer, filename: file.name }]);

    const fileDataPart = fileDataParts[0];
    console.log(`Uploaded: ${file.name} (${fileDataPart.attachmentId})`);

    // Return the complete FileDataPart - client stores this as single source of truth
    return NextResponse.json({
      success: true,
      fileDataPart,
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
