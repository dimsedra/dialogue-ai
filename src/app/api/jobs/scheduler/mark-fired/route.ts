import { NextRequest, NextResponse } from "next/server";
import { getPbAdmin } from "@/lib/pb-server-admin";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.INTERNAL_CRON_SECRET || "default_local_secret";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { notificationIds } = body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Invalid notificationIds" }, { status: 400 });
    }

    const pb = await getPbAdmin();
    const now = Date.now();

    for (const id of notificationIds) {
      try {
        await pb.collection("scheduled_notifications").update(id, { delivered: true });
      } catch (err) {
        console.error(`Failed to mark notification ${id} as delivered:`, err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("mark-fired error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
