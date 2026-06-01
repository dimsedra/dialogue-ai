"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { MoreHorizontal, Clock, Moon, Sunrise, BellOff, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

type CardType =
  | "reflection_ready"
  | "task_triage"
  | "habit_check"
  | "morning_brief"
  | "standard_snapshot";

type ConfirmationState =
  | { kind: "snoozed"; until: "1h" | "today" | "tomorrow" }
  | { kind: "muted" }
  | { kind: "dismissed" }
  | null;

interface CardMenuProps {
  cardType: CardType;
  cardId?: string;
  accentColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  bgColor: string;
  onConfirmation?: (state: ConfirmationState) => void;
}

const SNOOZE_LABELS: Record<"1h" | "today" | "tomorrow", string> = {
  "1h": "1 hour",
  today: "Until this evening",
  tomorrow: "Until tomorrow",
};

const SNOOZE_ICONS: Record<"1h" | "today" | "tomorrow", React.ReactNode> = {
  "1h": <Clock className="w-3.5 h-3.5" />,
  today: <Moon className="w-3.5 h-3.5" />,
  tomorrow: <Sunrise className="w-3.5 h-3.5" />,
};

const TIME_BUCKETED: ReadonlySet<CardType> = new Set([
  "habit_check",
  "morning_brief",
]);

const DISMISSABLE: ReadonlySet<CardType> = new Set([
  "reflection_ready",
  "task_triage",
]);

const HUMAN_LABELS: Record<CardType, string> = {
  reflection_ready: "Weekly Wrap",
  task_triage: "Task Triage",
  habit_check: "Habit Check-In",
  morning_brief: "Morning Brief",
  standard_snapshot: "Today",
};

export function CardMenu({
  cardType,
  cardId,
  accentColor,
  textColor,
  mutedTextColor,
  borderColor,
  bgColor,
  onConfirmation,
}: CardMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmationState>(null);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dismissCard = useMutation(api.dashboard.dismissCard);
  const snoozeCard = useMutation(api.dashboard.snoozeCard);
  const muteCardType = useMutation(api.dashboard.muteCardType);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(null), 2200);
    return () => clearTimeout(timer);
  }, [confirming]);

  const handleSnooze = async (duration: "1h" | "today" | "tomorrow") => {
    setBusy(true);
    setOpen(false);
    try {
      await snoozeCard({
        cardType,
        cardId: cardId as Id<"reflections"> | Id<"habits"> | undefined,
        duration,
      });
      setConfirming({ kind: "snoozed", until: duration });
      onConfirmation?.({ kind: "snoozed", until: duration });
    } catch (err) {
      console.error("Snooze failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleMute = async () => {
    setBusy(true);
    setOpen(false);
    try {
      await muteCardType({ cardType });
      setConfirming({ kind: "muted" });
      onConfirmation?.({ kind: "muted" });
    } catch (err) {
      console.error("Mute failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    setBusy(true);
    setOpen(false);
    try {
      await dismissCard({
        cardType,
        cardId: cardId as Id<"reflections"> | Id<"habits"> | undefined,
      });
      setConfirming({ kind: "dismissed" });
      onConfirmation?.({ kind: "dismissed" });
    } catch (err) {
      console.error("Dismiss failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const isTimeBucketed = TIME_BUCKETED.has(cardType);
  const isDismissable = DISMISSABLE.has(cardType);
  const isStandard = cardType === "standard_snapshot";

  if (isStandard) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20"
    >
      <AnimatePresence mode="wait" initial={false}>
        {confirming ? (
          <motion.div
            key="confirmation"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg backdrop-blur-md"
            style={{
              background: bgColor,
              border: `1px solid ${borderColor}`,
            }}
          >
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: accentColor }}
            >
              {confirming.kind === "snoozed"
                ? `Snoozed · ${SNOOZE_LABELS[confirming.until]}`
                : confirming.kind === "muted"
                  ? `${HUMAN_LABELS[cardType]} muted`
                  : "Card dismissed"}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="relative"
          >
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              disabled={busy}
              aria-label="Card options"
              className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 disabled:opacity-50"
              style={{
                background: open ? bgColor : "rgba(0,0,0,0.35)",
                border: `1px solid ${borderColor}`,
                color: open ? textColor : mutedTextColor,
              }}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute top-full right-0 mt-2 w-56 rounded-xl shadow-2xl shadow-black/40 backdrop-blur-xl overflow-hidden"
                  style={{
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                  }}
                >
                  <div
                    className="px-3 py-2 border-b"
                    style={{ borderColor: borderColor }}
                  >
                    <span
                      className="text-[9px] font-black uppercase tracking-[0.2em]"
                      style={{ color: mutedTextColor }}
                    >
                      Snooze
                    </span>
                  </div>
                  {(["1h", "today", "tomorrow"] as const).map((dur) => (
                    <MenuItem
                      key={dur}
                      icon={SNOOZE_ICONS[dur]}
                      label={SNOOZE_LABELS[dur]}
                      onClick={() => handleSnooze(dur)}
                      textColor={textColor}
                      mutedTextColor={mutedTextColor}
                      accentColor={accentColor}
                    />
                  ))}

                  <div
                    className="border-t my-1"
                    style={{ borderColor: borderColor }}
                  />

                  <MenuItem
                    icon={<BellOff className="w-3.5 h-3.5" />}
                    label={`Don't show ${HUMAN_LABELS[cardType]} again`}
                    onClick={handleMute}
                    textColor={textColor}
                    mutedTextColor={mutedTextColor}
                    accentColor={accentColor}
                  />

                  {isDismissable && !isTimeBucketed && (
                    <MenuItem
                      icon={<X className="w-3.5 h-3.5" />}
                      label="Dismiss this card"
                      onClick={handleDismiss}
                      textColor={textColor}
                      mutedTextColor={mutedTextColor}
                      accentColor={accentColor}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  textColor,
  mutedTextColor,
  accentColor,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors"
      style={{
        background: hovered ? "rgba(255,255,255,0.04)" : "transparent",
        color: textColor,
      }}
    >
      <span
        className="shrink-0"
        style={{ color: hovered ? accentColor : mutedTextColor }}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
