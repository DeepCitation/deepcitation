import { DeepCitation, getAllCitationsFromLlmOutput, getCitationStatus, sanitizeForLog } from "deepcitation";
import { type NextRequest, NextResponse } from "next/server";

// Check for API key at startup
const apiKey = process.env.DEEPCITATION_API_KEY;
if (!apiKey) {
  console.error(
    "\n⚠️  DEEPCITATION_API_KEY is not set!\n" + "   Get your API key from https://deepcitation.com/keys\n",
  );
}

const deepcitation = apiKey ? new DeepCitation({ apiKey }) : null;

export async function POST(req: NextRequest) {
  console.log("🚀 /api/verify called");
  if (!deepcitation) {
    return NextResponse.json(
      {
        error: "DeepCitation API key not configured",
        details: "Set DEEPCITATION_API_KEY in your .env file",
      },
      { status: 500 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 },
    );
  }

  try {
    const { llmOutput, attachmentId } = body;

    // Extract citations from LLM output
    const citations = getAllCitationsFromLlmOutput(llmOutput);
    const citationCount = Object.keys(citations).length;

    console.log(`📥 Found ${citationCount} citations in LLM output`);

    if (citationCount === 0) {
      return NextResponse.json({
        citations: {},
        verifications: {},
        summary: { total: 0, verified: 0, missed: 0, pending: 0 },
      });
    }

    // INTENTIONAL: Allow returning unverified citations if no attachmentId provided.
    // This is a valid use case (extraction-only mode) and not a security bypass.
    // lgtm[js/user-controlled-bypass]
    // codeql[js/user-controlled-bypass]
    if (!attachmentId) {
      // No attachmentId - return citations without verification
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

    console.log("[verify] citations", citations);

    // Verify citations against the source document
    const result = await deepcitation.verifyAttachment(attachmentId, citations, {
      outputImageFormat: "avif",
    });

    const { verifications } = result;

    console.log("[verify] verifications", verifications);

    // Log verification results and calculate summary in a single pass
    // (Performance fix: avoid N+1 calls to getCitationStatus)
    console.log("✨ Verification Results\n");

    let verified = 0;
    let missed = 0;
    let pending = 0;

    for (const [key, verification] of Object.entries(verifications)) {
      const status = getCitationStatus(verification);

      // Count by status
      if (status.isVerified) verified++;
      if (status.isMiss) missed++;
      if (status.isPending) pending++;

      // Log with appropriate icon
      const statusIcon = status.isVerified ? (status.isPartialMatch ? "⚠️ " : "✅") : status.isPending ? "⏳" : "❌";

      console.log(`Citation [${key}]: ${statusIcon}`);
    }

    console.log(`📊 Summary: ${verified} verified, ${missed} missed, ${pending} pending`);

    return NextResponse.json({
      citations,
      verifications,
      summary: {
        total: citationCount,
        verified,
        missed,
        pending,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Verification error:", sanitizeForLog(message));

    if (message.includes("Invalid or expired API key")) {
      return NextResponse.json(
        {
          error: "Invalid or expired API key",
          details: "Check your DEEPCITATION_API_KEY in .env",
        },
        { status: 401 },
      );
    }

    return NextResponse.json({ error: "Failed to verify citations" }, { status: 500 });
  }
}
