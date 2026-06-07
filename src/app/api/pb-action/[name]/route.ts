// PB action dispatcher — Phase 2 Stage B.4.
//
// What this does:
//   - Resolves the action name to a registered handler.
//   - Verifies the Bearer token (PB auth) and pulls the user context.
//   - Parses the request body (`{ args }`) and calls the handler.
//   - Returns the result as `{ ok: true, result }` or
//     `{ ok: false, error }` with a non-200 status on failure.
//
// What this deliberately does NOT do:
//   - Per-action auth (admin-only etc). Handlers do that themselves.
//   - Streaming. Non-streaming request/response only.
//   - Validation of `args` shape. Handlers validate their own args and
//     throw if the shape is wrong; the dispatcher catches and surfaces
//     the error message in the response.

import { NextRequest, NextResponse } from "next/server";
import { getActionHandler } from "@/lib/pb-actions/registry";
import { verifyPbToken } from "@/lib/pb-actions/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await params;
  const handler = getActionHandler(name);
  if (!handler) {
    return NextResponse.json(
      { ok: false, error: `Unknown action: ${name}` },
      { status: 404 },
    );
  }

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
  const args = (body as { args?: unknown })?.args;
  if (args === undefined) {
    return NextResponse.json(
      { ok: false, error: "Missing args in body" },
      { status: 400 },
    );
  }

  try {
    const result = await handler(args, { user });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
