import { NextRequest, NextResponse } from "next/server";
import {
  DeepCitation,
  Verification,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
  type FileDataPart,
} from "@deepcitation/deepcitation-js";

// Check for API key at startup
const apiKey = process.env.DEEPCITATION_API_KEY;
if (!apiKey) {
  console.error(
    "\n⚠️  DEEPCITATION_API_KEY is not set!\n" +
      "   Get your API key from https://deepcitation.com/dashboard\n"
  );
}

const dc = apiKey ? new DeepCitation({ apiKey }) : null;

export async function POST(req: NextRequest) {
  if (!dc) {
    return NextResponse.json(
      {
        error: "DeepCitation API key not configured",
        details: "Set DEEPCITATION_API_KEY in your .env file",
      },
      { status: 500 }
    );
  }

  try {
    const {
      content,
      // fileDataParts now contains deepTextPromptPortion - single source of truth
      fileDataParts: clientFileDataParts = [],
    } = await req.json();

    if (!content) {
      return NextResponse.json(
        { error: "No content provided" },
        { status: 400 }
      );
    }

    // Extract citations from the content
    console.log(
      "[Verify API] Raw content to parse:",
      content?.substring(0, 500)
    );
    const citations = getAllCitationsFromLlmOutput(content);
    const citationCount = Object.keys(citations).length;

    console.log(
      `[Verify API] Parsed ${citationCount} citations:`,
      JSON.stringify(citations, null, 2)
    );

    if (citationCount === 0) {
      console.log(
        "[Verify API] No citations found in content. Check if LLM is outputting <cite .../> tags."
      );
      return NextResponse.json({
        citations: {},
        verifications: {},
        summary: { total: 0, verified: 0, missed: 0, pending: 0 },
      });
    }

    // fileDataParts from client is the single source of truth
    const fileDataParts: FileDataPart[] = clientFileDataParts;

    console.log(
      "[Verify API] File data parts:",
      JSON.stringify(
        fileDataParts.map((f) => ({ fileId: f.fileId, filename: f.filename })),
        null,
        2
      )
    );

    if (fileDataParts.length === 0) {
      console.log("[Verify API] No file data parts - cannot verify");
      return NextResponse.json({
        citations,
        verifications: {},
        summary: {
          total: citationCount,
          verified: 0,
          missed: 0,
          pending: citationCount,
        },
      });
    }

    const allHighlights: Record<string, Verification> = {};

    for (const filePart of fileDataParts) {
      try {
        console.log(
          `[Verify API] Verifying citations for file ${filePart.fileId}:`,
          JSON.stringify(citations, null, 2)
        );

        const result = await dc.verifyCitations(filePart.fileId, citations);
        const { verifications } = result;

        console.log(
          "[Verify API] Verification result:",
          JSON.stringify(verifications, null, 2)
        );

        // Log each highlight's details
        for (const [key, verification] of Object.entries(verifications)) {
          console.log(
            `[Verify API] Citation [${key}]:`,
            JSON.stringify(verification, null, 2)
          );
        }

        Object.assign(allHighlights, verifications);
      } catch (err) {
        console.error(
          `[Verify API] Verification failed for file ${filePart.fileId}:`,
          err
        );
      }
    }

    // Calculate summary using getCitationStatus (like playground page)
    const verified = Object.values(allHighlights).filter(
      (v) => getCitationStatus(v as any).isVerified
    ).length;
    const missed = Object.values(allHighlights).filter(
      (v) => getCitationStatus(v as any).isMiss
    ).length;
    const pending = Object.values(allHighlights).filter(
      (v) => getCitationStatus(v as any).isPending
    ).length;

    console.log(
      `[Verify API] Summary: ${verified} verified, ${missed} missed, ${pending} pending`
    );

    return NextResponse.json({
      citations,
      verifications: allHighlights,
      summary: {
        total: citationCount,
        verified,
        missed,
        pending,
      },
    });
  } catch (error: any) {
    const message = error?.message || "Unknown error";
    console.error("Verification error:", message);

    if (message.includes("Invalid or expired API key")) {
      return NextResponse.json(
        {
          error: "Invalid or expired API key",
          details: "Check your DEEPCITATION_API_KEY in .env",
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to verify citations", details: message },
      { status: 500 }
    );
  }
}
