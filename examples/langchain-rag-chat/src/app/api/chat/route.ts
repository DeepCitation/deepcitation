import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/rag";
import { checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 60;

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { allowed, remaining, reason } = checkRateLimit(ip);
  if (!allowed) {
    const message =
      reason === "ip"
        ? "You\u2019ve reached the per-user daily limit (5 queries). Fork this example and add your own API keys to remove the limit."
        : "Daily query limit reached. Fork this example and add your own API keys to remove the limit.";
    return NextResponse.json(
      { error: message },
      { status: 429, headers: { "Retry-After": "86400" } },
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
