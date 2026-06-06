import { NextRequest, NextResponse } from "next/server";
import { getGraphConnection } from "@/lib/graph/ladybug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_DIM = 384;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const { id, text, embedding } = body ?? {};

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json(
        { error: "Missing `id` field" },
        { status: 400 },
      );
    }

    if (typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty `text` field" },
        { status: 400 },
      );
    }

    if (!Array.isArray(embedding) || embedding.length !== EXPECTED_DIM) {
      return NextResponse.json(
        { error: `Embedding must be an array of ${EXPECTED_DIM} numbers` },
        { status: 400 },
      );
    }

    for (let i = 0; i < embedding.length; i++) {
      if (typeof embedding[i] !== "number" || !Number.isFinite(embedding[i])) {
        return NextResponse.json(
          { error: `Embedding[${i}] is not a finite number` },
          { status: 400 },
        );
      }
    }

    const conn = await getGraphConnection();
    const stmt = await conn.prepare(
      "CREATE (m:Memory {id: $id, text: $text, embedding: $emb})",
    );
    await conn.execute(stmt, { id, text, emb: embedding });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/graph/memory] failed:", error);
    return NextResponse.json(
      { error: "Failed to write memory node" },
      { status: 500 },
    );
  }
}
