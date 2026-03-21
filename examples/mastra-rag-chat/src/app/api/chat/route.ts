import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/rag";
import { checkRateLimit } from "@/lib/rateLimit";

// Cold starts may need extra time for vector-store embedding + PDF attachment
// resolution. 120s is within Vercel Pro limits; Hobby silently caps at 60s.
export const maxDuration = 120;

export async function POST(request: Request) {
  // NOTE: x-forwarded-for is client-controlled behind Vercel's edge network — the
  // leftmost value can be spoofed to bypass the per-IP cap. This is acceptable for a
  // demo. For a production deployment use `x-real-ip` or Next.js edge middleware's
  // `request.ip`, which Vercel sets from the trusted edge layer.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { allowed, remaining, reason } = checkRateLimit(ip);
  if (!allowed) {
    const message =
      reason === "ip"
        ? "You\u2019ve reached the per-user daily limit (5 queries). Fork this example and add your own API keys to remove the limit."
        : "Daily query limit reached. Fork this example and add your own API keys to remove the limit.";
    // Compute seconds remaining until the next UTC midnight window reset rather than
    // always returning 86400 — a user hitting the cap at 23:58 UTC only waits ~2 min.
    const nowMs = Date.now();
    const midnightMs =
      new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime() + 86_400_000;
    const retryAfter = String(Math.ceil((midnightMs - nowMs) / 1000));
    return NextResponse.json(
      { error: message },
      { status: 429, headers: { "Retry-After": retryAfter } },
    );
  }

  let body: { question?: unknown };

  try {
    body = (await request.json()) as { question?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required." }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: "question must be 2000 characters or fewer." }, { status: 400 });
  }

  try {
    const result = await answerQuestion(question);
    return NextResponse.json(result, {
      headers: { "X-RateLimit-Remaining": String(remaining) },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
