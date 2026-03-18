import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/rag";

export const maxDuration = 60;

export async function POST(request: Request) {
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

  try {
    return NextResponse.json(await answerQuestion(question));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
