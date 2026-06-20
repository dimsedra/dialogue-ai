import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { verifyPbToken } from "@/lib/pb-actions/auth";
import { mergeSession } from "@/lib/jobs/mergeSession";
import { join } from "path";
import { DEFAULT_FOLIO_DIR } from "@/lib/folio/constants";

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

  // Resolve folioRootPath
  let devFallbackPath = process.env.NODE_ENV === "development" ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  const folioRootPath = req.headers.get("x-folio-path") || devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);

  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const userPb = new PocketBase(pbUrl);
  userPb.authStore.save(token, null);

  try {
    const result = await mergeSession(userPb, {
      userId: user.id,
      sessionId,
      folioRootPath,
    });

    if (result.status === "failed") {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}
