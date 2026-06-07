import { NextResponse } from "next/server";
import { getGraphConnection } from "@/lib/graph/ladybug";
import { getMemoryHealth } from "@/lib/graph/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/memory-health
 *
 * Returns a snapshot of graph health stats for the admin MemoryHealth page:
 * - totalMemories
 * - edgesByType: counts per MENTIONS_TASK / MENTIONS_EVENT / MENTIONS_HABIT
 * - lonelyMemories: count + bounded sample of Memories with no outgoing edges
 *
 * Phase 2 Stage 1.3 of the migration plan. No auth here yet — this is a
 * local single-user desktop app in spirit. When auth lands, gate it.
 */
export async function GET() {
  try {
    const conn = await getGraphConnection();
    const health = await getMemoryHealth(conn);
    return NextResponse.json(health);
  } catch (error) {
    console.error("[/api/admin/memory-health] failed:", error);
    return NextResponse.json(
      { error: "Failed to read memory health" },
      { status: 500 },
    );
  }
}
