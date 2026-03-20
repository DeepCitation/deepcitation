import { NextResponse } from "next/server";
import { CORPUS_SOURCE } from "@/lib/corpus";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (filename !== CORPUS_SOURCE.filename) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(CORPUS_SOURCE.url);
}
