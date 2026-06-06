import { NextRequest, NextResponse } from "next/server";
import { getLocalEmbedding } from "@/lib/graph/embedding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_LENGTH = 4000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const text = body?.text;

    if (typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty `text` field" },
        { status: 400 },
      );
    }

    if (text.length > MAX_INPUT_LENGTH) {
      return NextResponse.json(
        { error: `Text exceeds ${MAX_INPUT_LENGTH} characters` },
        { status: 400 },
      );
    }

    const embedding = await getLocalEmbedding(text);

    if (embedding.length !== 384) {
      console.error(
        `Embedding model produced ${embedding.length}-dim vector, expected 384`,
      );
      return NextResponse.json(
        { error: `Embedding model returned ${embedding.length} dimensions, expected 384` },
        { status: 500 },
      );
    }

    return NextResponse.json({ embedding });
  } catch (error) {
    console.error("[/api/embeddings] failed:", error);
    return NextResponse.json(
      { error: "Failed to generate embedding" },
      { status: 500 },
    );
  }
}
