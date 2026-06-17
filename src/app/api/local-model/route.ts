import { NextResponse } from "next/server";

const RUNNER_URL = "http://127.0.0.1:11430";

export async function GET() {
  try {
    const res = await fetch(`${RUNNER_URL}/status`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Runner returned status ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    // If runner is not responding, it is effectively unloaded
    return NextResponse.json({
      status: "unloaded",
      modelPath: null,
      contextSize: 4096,
      gpuLayers: 99,
      threads: 4,
      error: (err as Error).message || String(err),
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, config } = body;

    if (action === "load") {
      if (!config || !config.modelPath) {
        return NextResponse.json({ error: "Missing modelPath config" }, { status: 400 });
      }

      const res = await fetch(`${RUNNER_URL}/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelPath: config.modelPath,
          contextSize: Number(config.contextSize || 4096),
          gpuLayers: Number(config.gpuLayers ?? 99),
          threads: Number(config.threads || 4),
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to trigger load on runner: ${res.statusText}`);
      }

      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "unload") {
      const res = await fetch(`${RUNNER_URL}/unload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Failed to trigger unload on runner: ${res.statusText}`);
      }

      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("[Local Model Route] Error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
