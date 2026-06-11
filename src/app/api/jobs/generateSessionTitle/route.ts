// POST /api/jobs/generateSessionTitle — Phase 6.1.1 (POC).
//
// HTTP wrapper around the pure `generateSessionTitle(pb, args)` function
// in `@/lib/jobs/generateSessionTitle`. Verifies the Bearer token, then
// constructs a request-scoped PB client authenticated as the user and
// runs the job.
//
// Why a dedicated route (not the B.4 dispatcher)?
//   - Background jobs are semantically distinct from Convex action
//     equivalents: caller is fire-and-forget, job does its own PB
//     reads + writes, the dispatcher would have to special-case it.
//   - The other 4 Phase 6 background jobs (generateCronReflection,
//     generateWeeklyOCEAN, generateMonthlyOCEAN, generateDailySummary)
//     will follow the same `/api/jobs/<name>` shape.
//
// What this route does NOT do:
//   - Stream. The job returns a single result; no streaming needed.
//   - Validate args shape. The function does that.
//   - Cache. Title generation is one-shot per session, no need to memoize.
//
// Request:
//   POST /api/jobs/generateSessionTitle
//   Authorization: Bearer <PB auth token>
//   Content-Type: application/json
//   { "args": { "sessionId": "<pb id>" } }
//
// Response:
//   200 { "ok": true,  "result": { "status": "updated", "title": "..." } }
//   204 { "ok": true,  "result": { "status": "skipped_..." | "failed_llm" } }
//   400 { "ok": false, "error": "Invalid JSON body" | "Missing args.sessionId" }
//   401 { "ok": false, "error": "Missing Bearer token" | "Invalid or expired token" }

import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { verifyPbToken } from "@/lib/pb-actions/auth";
import {
  generateSessionTitle,
  type GenerateSessionTitleResult,
} from "@/lib/jobs/generateSessionTitle";

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
  const sessionId = (body as { args?: { sessionId?: unknown } })?.args?.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing args.sessionId" },
      { status: 400 },
    );
  }

  // Request-scoped PB client authenticated as the calling user. We
  // construct a fresh client (don't reuse the auth-refresh singleton
  // from `lib/pb-actions/auth.ts`) so the data-query rules apply
  // (`user = @request.auth.id`).
  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const userPb = new PocketBase(pbUrl);
  userPb.authStore.save(token, null);

  let result: GenerateSessionTitleResult;
  try {
    result = await generateSessionTitle(userPb, {
      userId: user.id,
      sessionId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }

  // 200 on no-op (skipped / failed) or updated with the new title.
  if (result.status === "updated") {
    return NextResponse.json({ ok: true, result }, { status: 200 });
  }
  return NextResponse.json({ ok: true, result }, { status: 200 });
}
