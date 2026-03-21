import { DeepCitation, getAllCitationsFromLlmOutput, getCitationStatus, sanitizeForLog } from "deepcitation";
import { type NextRequest, NextResponse } from "next/server";

const apiKey = process.env.DEEPCITATION_API_KEY;
if (!apiKey) {
  console.error(
    "\n⚠️  DEEPCITATION_API_KEY is not set!\n" + "   Get your API key from https://deepcitation.com/keys\n",
  );
}

// Rate limiting is only applied on the /api/chat route. Verify is called as
// part of the same user interaction, so rate-limiting here would double-count.
const deepcitation = apiKey ? new DeepCitation({ apiKey, endUserId: "nextjs-ai-sdk" }) : null;

export async function POST(req: NextRequest) {
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
    const { llmOutput } = body;

    // Extract citations from LLM output
    const citations = getAllCitationsFromLlmOutput(llmOutput);
    const citationCount = Object.keys(citations).length;

    console.log(`[verify] Found ${citationCount} citations in LLM output`);

    if (citationCount === 0) {
      return NextResponse.json({
        citations: {},
        verifications: {},
        summary: { total: 0, verified: 0, missed: 0, pending: 0 },
      });
    }

    // Verify citations against all source documents
    const result = await deepcitation.verify(
      { llmOutput, outputImageFormat: "avif" },
      citations,
    );

    const { verifications } = result;

    // Log verification results and calculate summary
    let verified = 0;
    let missed = 0;
    let pending = 0;

    for (const [key, verification] of Object.entries(verifications)) {
      const status = getCitationStatus(verification);
      if (status.isVerified) verified++;
      if (status.isMiss) missed++;
      if (status.isPending) pending++;

      const statusIcon = status.isVerified ? (status.isPartialMatch ? "⚠️ " : "✅") : status.isPending ? "⏳" : "❌";
      console.log(`Citation [${key}]: ${statusIcon}`);
    }

    console.log(`[verify] Summary: ${verified} verified, ${missed} missed, ${pending} pending`);

    return NextResponse.json({
      citations,
      verifications,
      summary: { total: citationCount, verified, missed, pending },
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
