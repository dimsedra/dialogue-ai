import { NextResponse } from "next/server";
import { getPbAdmin } from "@/lib/pb-server-admin";
import { getMemoryHealth } from "@/lib/graph/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/memory-health
 *
 * Returns a snapshot of graph health stats for the admin MemoryHealth page.
 */
export async function GET() {
  try {
    const pb = await getPbAdmin();
    const health = await getMemoryHealth(pb);
    return NextResponse.json(health);
  } catch (error) {
    console.error("[/api/admin/memory-health] failed:", error);
    return NextResponse.json(
      { error: "Failed to read memory health" },
      { status: 500 },
    );
  }
}
