"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { MoreHorizontal, Clock, Moon, Sunrise, BellOff, X, ChevronLeft } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

type CardType =
  | "attention_needed"
  | "reflection_ready"
  | "task_triage"
  | "habit_check"
  | "morning_brief"
  | "event_prep"
  | "evening_log"
  | "all_caught_up";

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
  "evening_log",
]);

const DISMISSABLE: ReadonlySet<CardType> = new Set([
  "attention_needed",
  "reflection_ready",
  "task_triage",
  "event_prep",
]);

const HUMAN_LABELS: Record<CardType, string> = {
  attention_needed: "attention prompts",
  reflection_ready: "Weekly Wrap",
  task_triage: "Task Triage",
  habit_check: "Habit Check-In",
  morning_brief: "Morning Brief",
  event_prep: "Event Prep",
  evening_log: "Evening Log",
  all_caught_up: "All Caught Up",
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
  const [view, setView] = useState<"closed" | "actions">("closed");
  const [confirming, setConfirming] = useState<ConfirmationState>(null);
  const [busy, setBusy] = useState(false);
  const dismissCard = useMutation(api.dashboard.dismissCard);
  const snoozeCard = useMutation(api.dashboard.snoozeCard);
  const muteCardType = useMutation(api.dashboard.muteCardType);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(null), 2200);
    return () => clearTimeout(timer);
  }, [confirming]);

  const handleSnooze = async (duration: "1h" | "today" | "tomorrow") => {
    setBusy(true);
    try {
      await snoozeCard({
        cardType,
        cardId: cardId as Id<"reflections"> | Id<"habits"> | undefined,
        duration,
      });
      setConfirming({ kind: "snoozed", until: duration });
      onConfirmation?.({ kind: "snoozed", until: duration });
      setView("closed");
    } catch (err) {
      console.error("Snooze failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleMute = async () => {
    setBusy(true);
    try {
      await muteCardType({ cardType });
      setConfirming({ kind: "muted" });
      onConfirmation?.({ kind: "muted" });
      setView("closed");
    } catch (err) {
      console.error("Mute failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    setBusy(true);
    try {
      await dismissCard({
        cardType,
        cardId: cardId as Id<"reflections"> | Id<"habits"> | undefined,
      });
      setConfirming({ kind: "dismissed" });
      onConfirmation?.({ kind: "dismissed" });
      setView("closed");
    } catch (err) {
      console.error("Dismiss failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const isTimeBucketed = TIME_BUCKETED.has(cardType);
  const isDismissable = DISMISSABLE.has(cardType);
  const isNonInteractive = cardType === "all_caught_up";

  if (isNonInteractive) {
    return null;
  }

  return (
    <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20">
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
        ) : view === "actions" ? (
          <motion.div
            key="actions"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => setView("closed")}
              disabled={busy}
              aria-label="Back"
              className="w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 disabled:opacity-50"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: `1px solid ${borderColor}`,
                color: mutedTextColor,
              }}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleSnooze("1h")}
              disabled={busy}
              title="Snooze 1 hour"
              className="h-7 px-2.5 rounded-full flex items-center gap-1.5 backdrop-blur-md transition-all hover:scale-105 disabled:opacity-50 text-[10px] font-bold uppercase tracking-widest"
              style={{
                background: bgColor,
                border: `1px solid ${borderColor}`,
                color: accentColor,
              }}
            >
              <Clock className="w-3 h-3" />
              <span>1h</span>
            </button>

            <button
              type="button"
              onClick={() => handleSnooze("today")}
              disabled={busy}
              title="Snooze until this evening"
              className="w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 disabled:opacity-50"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: `1px solid ${borderColor}`,
                color: mutedTextColor,
              }}
            >
              <Moon className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleSnooze("tomorrow")}
              disabled={busy}
              title="Snooze until tomorrow"
              className="w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 disabled:opacity-50"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: `1px solid ${borderColor}`,
                color: mutedTextColor,
              }}
            >
              <Sunrise className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleMute}
              disabled={busy}
              title={`Don't show ${HUMAN_LABELS[cardType]} again`}
              className="w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 disabled:opacity-50"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: `1px solid ${borderColor}`,
                color: mutedTextColor,
              }}
            >
              <BellOff className="w-3.5 h-3.5" />
            </button>

            {isDismissable && !isTimeBucketed && (
              <button
                type="button"
                onClick={handleDismiss}
                disabled={busy}
                title="Dismiss this card"
                className="w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 disabled:opacity-50"
                style={{
                  background: "rgba(0,0,0,0.35)",
                  border: `1px solid ${borderColor}`,
                  color: mutedTextColor,
                }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <button
              type="button"
              onClick={() => setView("actions")}
              disabled={busy}
              aria-label="Card options"
              className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 disabled:opacity-50"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: `1px solid ${borderColor}`,
                color: mutedTextColor,
              }}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
