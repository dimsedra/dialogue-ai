"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Doc } from "../../../../../convex/_generated/dataModel";
import { exportReflectionAsImage } from "@/utils/exportReflectionImage";

interface Props {
  reflection: Doc<"reflections">;
}

export function PublicReflectionSaveButton({ reflection }: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await exportReflectionAsImage(reflection, {
        filename: `dialogue-${reflection.type}-${reflection.periodStart}.png`,
      });
      setDone(true);
      setTimeout(() => setDone(false), 2200);
    } catch (err) {
      console.error("Public save image failed:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-2xl font-black uppercase tracking-[0.2em] transition-all disabled:opacity-50 shadow-lg shadow-[#d4a373]/10"
      style={{
        background: done
          ? "linear-gradient(135deg, #10b981, #059669)"
          : "linear-gradient(135deg, #d4a373, #e6b984)",
        color: "#0f0e0c",
        padding: "clamp(0.625rem, 1.6vw, 0.875rem) clamp(1.25rem, 3vw, 1.75rem)",
        fontSize: "clamp(0.625rem, 1.4vw, 0.75rem)",
        letterSpacing: "0.18em",
      }}
    >
      {busy ? (
        <Loader2
          className="animate-spin"
          style={{ width: "clamp(0.875rem, 1.8vw, 1rem)", height: "clamp(0.875rem, 1.8vw, 1rem)" }}
        />
      ) : (
        <Download
          style={{ width: "clamp(0.875rem, 1.8vw, 1rem)", height: "clamp(0.875rem, 1.8vw, 1rem)" }}
        />
      )}
      {done ? "Saved" : "Save Image"}
    </button>
  );
}
