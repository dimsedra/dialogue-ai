import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { verifyPbToken } from "@/lib/pb-actions/auth";
import {
  generateWeeklyOCEAN,
  type GenerateWeeklyOCEANResult,
} from "@/lib/jobs/generateWeeklyOCEAN";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Missing Bearer token" },
      { status: 401 },
    );
  }

  const user = await verifyPbToken(token);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Invalid or expired token" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const args = (body as { args?: any })?.args;
  const timezone = args?.timezone;
  const timezoneOffset = args?.timezoneOffset;
  
  if (typeof timezone !== "string" || typeof timezoneOffset !== "number") {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid timezone / timezoneOffset" },
      { status: 400 },
    );
  }

  // Request-scoped PB client authenticated as the calling user.
  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const userPb = new PocketBase(pbUrl);
  userPb.authStore.save(token, null);

  let result: GenerateWeeklyOCEANResult;
  try {
    result = await generateWeeklyOCEAN(userPb, {
      userId: user.id,
      timezone,
      timezoneOffset,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }

  if (result.status === "created") {
    return NextResponse.json({ ok: true, result }, { status: 200 });
  }
  return NextResponse.json({ ok: true, result }, { status: 200 });
}
