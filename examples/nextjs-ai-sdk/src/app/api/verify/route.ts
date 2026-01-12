import { NextRequest, NextResponse } from "next/server";
import {
  DeepCitation,
  FoundHighlightLocation,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
} from "@deepcitation/deepcitation-js";
import { getSessionFiles } from "@/lib/store";

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
      sessionId = "default",
      content,
      // Accept file data directly from client
      fileDataParts: clientFileDataParts = [],
    } = await req.json();

    if (!content) {
      return NextResponse.json(
        { error: "No content provided" },
        { status: 400 }
      );
    }

    // Extract citations from the content
    console.log(`[${sessionId}] Raw content to parse:`, content?.substring(0, 500));
    const citations = getAllCitationsFromLlmOutput(content);
    const citationCount = Object.keys(citations).length;

    console.log(`[${sessionId}] Parsed ${citationCount} citations:`, JSON.stringify(citations, null, 2));

    if (citationCount === 0) {
      console.log(`[${sessionId}] No citations found in content. Check if LLM is outputting <cite .../> tags.`);
      return NextResponse.json({
        citations: {},
        verifications: {},
        summary: { total: 0, verified: 0, missed: 0, pending: 0 },
      });
    }

    // Prefer client-provided data, fall back to server-side store
    const fileDataParts =
      clientFileDataParts.length > 0
        ? clientFileDataParts
        : getSessionFiles(sessionId);

    console.log(`[${sessionId}] File data parts:`, JSON.stringify(fileDataParts, null, 2));

    if (fileDataParts.length === 0) {
      console.log(`[${sessionId}] No file data parts - cannot verify`);
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

    const allHighlights: Record<string, FoundHighlightLocation> = {};

    for (const filePart of fileDataParts) {
      try {
        console.log(
          `[${sessionId}] Verifying citations for file ${filePart.fileId}:`,
          JSON.stringify(citations, null, 2)
        );

        const result = await dc.verifyCitations(filePart.fileId, citations);
        const { foundHighlights } = result;

        console.log(
          `[${sessionId}] Verification result:`,
          JSON.stringify(foundHighlights, null, 2)
        );

        // Log each highlight's details
        for (const [key, highlight] of Object.entries(foundHighlights)) {
          console.log(
            `[${sessionId}] Citation [${key}]:`,
            JSON.stringify(highlight, null, 2)
          );
        }

        Object.assign(allHighlights, foundHighlights);
      } catch (err) {
        console.error(
          `[${sessionId}] Verification failed for file ${filePart.fileId}:`,
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
      `[${sessionId}] Summary: ${verified} verified, ${missed} missed, ${pending} pending`
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
