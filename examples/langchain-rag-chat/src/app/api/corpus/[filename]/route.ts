import { NextResponse } from "next/server";
import { CORPUS_SOURCES } from "@/lib/corpus";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const source = CORPUS_SOURCES.find(s => s.filename === filename);

  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(source.url);
}
