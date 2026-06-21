import { NextResponse } from "next/server";

const LM_STUDIO_URL = "http://127.0.0.1:1234";

async function proxyGet(path: string) {
  const res = await fetch(`${LM_STUDIO_URL}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  return res;
}

async function proxyPost(path: string, body: unknown) {
  const res = await fetch(`${LM_STUDIO_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Default: list models
    const res = await proxyGet("/api/v1/models");
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error: "LM Studio is not running. Please start LM Studio and enable the server.",
        details: (err as Error).message || String(err),
      },
      { status: 503 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, model, context_length, flash_attention, num_experts } = body;

    if (action === "load") {
      if (!model) {
        return NextResponse.json({ error: "Missing model parameter" }, { status: 400 });
      }
      const loadBody: Record<string, unknown> = { model };
      if (context_length) loadBody.context_length = context_length;
      if (flash_attention !== undefined) loadBody.flash_attention = flash_attention;
      if (num_experts) loadBody.num_experts = num_experts;

      const res = await proxyPost("/api/v1/models/load", loadBody);
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: text }, { status: res.status });
      }
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "unload") {
      const instance_id = body.instance_id;
      if (!instance_id) {
        return NextResponse.json({ error: "Missing instance_id parameter" }, { status: 400 });
      }

      const res = await proxyPost("/api/v1/models/unload", { instance_id });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: text }, { status: res.status });
      }
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("[LM Studio Route] Error:", err);
    return NextResponse.json(
      {
        error: "LM Studio is not running. Please start LM Studio and enable the server.",
        details: (err as Error).message || String(err),
      },
      { status: 503 }
    );
  }
}
