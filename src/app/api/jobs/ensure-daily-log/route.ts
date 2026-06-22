import { NextResponse } from "next/server";
import { getPbAdmin } from "@/lib/pb-server-admin";

export async function GET() {
  try {
    const pb = await getPbAdmin();

    // Get active users
    const users = await pb.collection("users").getFullList();
    if (users.length === 0) {
      return NextResponse.json({ ok: false, reason: "no_users" });
    }

    const user = users[0];
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const { generateDailySummary } = await import("@/lib/jobs/generateDailySummary");
    const result = await generateDailySummary(pb, { userId: user.id, timezone });

    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ensure-daily-log] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
