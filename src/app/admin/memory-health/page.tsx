import { getPbAdmin } from "@/lib/pb-server-admin";
import { getMemoryHealth, type MemoryHealth } from "@/lib/graph/health";
import Link from "next/link";
import { ArrowLeft, Brain, Link2, AlertTriangle } from "lucide-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadHealth(): Promise<MemoryHealth | { error: string }> {
  try {
    const pb = await getPbAdmin();
    return await getMemoryHealth(pb);
  } catch (err) {
    console.error("[admin/memory-health] failed to load:", err);
    return { error: "Failed to read memory graph. Is the PocketBase server running?" };
  }
}

export default async function MemoryHealthPage() {
  const health = await loadHealth();

  if ("error" in health) {
    return (
      <main className="mx-auto max-w-3xl p-8 text-zinc-100">
        <h1 className="text-2xl font-semibold mb-4">Memory Health</h1>
        <div className="rounded-md border border-red-800 bg-red-950/40 p-4 text-red-200">
          {health.error}
        </div>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft size={16} /> Back
        </Link>
      </main>
    );
  }

  const cards = [
    {
      icon: Brain,
      label: "Total memories",
      value: health.totalMemories,
      hint: "Memory nodes currently in the graph",
    },
    {
      icon: Link2,
      label: "Total edges",
      value:
        health.edgesByType.MENTIONS_TASK +
        health.edgesByType.MENTIONS_EVENT +
        health.edgesByType.MENTIONS_HABIT,
      hint: `Task ${health.edgesByType.MENTIONS_TASK} · Event ${health.edgesByType.MENTIONS_EVENT} · Habit ${health.edgesByType.MENTIONS_HABIT}`,
    },
    {
      icon: AlertTriangle,
      label: "Lonely memories",
      value: health.lonelyMemories.count,
      hint: "Memories with no MENTIONS_* edges (sample shown below)",
    },
  ];

  return (
    <main className="mx-auto max-w-3xl p-8 text-zinc-100">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Memory Health</h1>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <p className="text-sm text-zinc-400 mb-6">
        Live snapshot of the local PocketBase memory graph. Use this to spot
        memories that should have mentioned a task / event / habit but ended
        up with no edges (silent no-op on stale IDs).
      </p>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {cards.map(({ icon: Icon, label, value, hint }) => (
          <div
            key={label}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4"
          >
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <Icon size={16} /> {label}
            </div>
            <div className="text-3xl font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-zinc-500 mt-2">{hint}</div>
          </div>
        ))}
      </section>

      {health.lonelyMemories.sample.length > 0 ? (
        <section>
          <h2 className="text-lg font-medium mb-3">
            Lonely memories (sample of {health.lonelyMemories.sample.length})
          </h2>
          <ul className="space-y-2">
            {health.lonelyMemories.sample.map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
              >
                <div className="text-xs text-zinc-500 font-mono mb-1">{m.id}</div>
                <div className="text-sm text-zinc-200">{m.text}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
          No lonely memories. Every Memory has at least one MENTIONS_* edge.
        </section>
      )}
    </main>
  );
}
