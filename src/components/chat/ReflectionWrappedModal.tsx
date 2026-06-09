import { useEffect, useMemo, useState } from "react";
import { usePbReflection, usePbReflectionSaveComment, 
usePbReflectionToggleShare, PbReflections } from "@/pb-compat";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  Award,
  CalendarDays,
  Flame,
  Tag,
  Check,
  Share2,
  Download,
  Quote,
  Hash,
} from "lucide-react";

interface ReflectionWrappedModalProps {
  reflectionId: string | null;
  onClose: () => void;
  onExportImage?: (reflectionId: string) => Promise<void>;
}

const SLIDE_COUNT = 5;

const SLIDE_KEYS = ["hero", "stats", "focus", "narrative", "journal"] as const;

export function ReflectionWrappedModal({
  reflectionId,
  onClose,
  onExportImage,
}: ReflectionWrappedModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(1);
  const [journalText, setJournalText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);

  const reflection = usePbReflection(reflectionId);

  const saveComment = usePbReflectionSaveComment();
  const toggleShare = usePbReflectionToggleShare();

  const [trackedId, setTrackedId] = useState<string | null>(reflectionId);
  if (trackedId !== reflectionId) {
    setTrackedId(reflectionId);
    setCurrentSlide(0);
    setDirection(1);
    setJournalText("");
    setSaved(false);
  }

  const goNext = () => {
    setDirection(1);
    setCurrentSlide((s) => Math.min(s + 1, SLIDE_COUNT - 1));
  };
  const goPrev = () => {
    setDirection(-1);
    setCurrentSlide((s) => Math.max(s - 1, 0));
  };
  const goTo = (i: number) => {
    setDirection(i > currentSlide ? 1 : -1);
    setCurrentSlide(i);
  };

  useEffect(() => {
    if (!reflectionId) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [reflectionId, onClose]);

  useEffect(() => {
    if (!reflectionId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [reflectionId]);

  const liveJournalText = journalText || (reflection?.userReflection ?? "");
  const liveSaved = saved || (reflection?.userReflection !== undefined);

  const handleSaveJournal = async () => {
    if (!reflectionId) return;
    setSaving(true);
    try {
      await saveComment({ id: reflectionId, userReflection: journalText });
      setSaved(true);
    } catch (err) {
      console.error("Failed to save journal:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleShare = async () => {
    if (!reflectionId) return;
    await toggleShare({ id: reflectionId, shared: !reflection?.shared });
  };

  const handleExport = async () => {
    if (!reflectionId || !onExportImage) return;
    setExporting(true);
    try {
      await onExportImage(reflectionId);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AnimatePresence>
      {reflectionId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-1000 flex items-center justify-center bg-[#0a0907]/95 backdrop-blur-xl"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[640px] h-full sm:h-[92vh] sm:max-h-[920px] flex flex-col bg-[#0a0907] border border-[#d4a373]/15 sm:rounded-[2rem] shadow-2xl shadow-black/60 overflow-hidden"
          >
            <AmbientBackdrop slideKey={SLIDE_KEYS[currentSlide]} />

            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 sm:top-5 sm:right-5 z-20 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md flex items-center justify-center text-[#a8a29e] hover:text-[#f2efeb] transition-all"
              aria-label="Close reflection"
            >
              <X className="w-4 h-4" />
            </button>

            {!reflection ? (
              <div className="flex-1 flex items-center justify-center text-[#a8a29e] relative z-10">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                  <Sparkles className="w-4 h-4 animate-pulse text-[#d4a373]" />
                  Loading your wrap...
                </div>
              </div>
            ) : (
              <>
                <SlideHeader
                  type={reflection.type}
                  periodLabel={reflection.periodLabel}
                  currentSlide={currentSlide}
                />

                <div className="flex-1 relative overflow-hidden">
                  <AnimatePresence mode="wait" custom={direction} initial={false}>
                    <motion.div
                      key={currentSlide}
                      custom={direction}
                      initial={{ opacity: 0, x: direction * 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: direction * -40 }}
                      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                      className="absolute inset-0 overflow-y-auto px-5 sm:px-10 py-6 sm:py-10"
                    >
                      {currentSlide === 0 && (
                        <HeroSlide reflection={reflection} />
                      )}
                      {currentSlide === 1 && (
                        <StatsSlide reflection={reflection} />
                      )}
                      {currentSlide === 2 && (
                        <FocusSlide reflection={reflection} />
                      )}
                      {currentSlide === 3 && (
                        <NarrativeSlide reflection={reflection} />
                      )}
                      {currentSlide === 4 && (
                        <JournalSlide
                          reflection={reflection}
                          journalText={liveJournalText}
                          setJournalText={setJournalText}
                          saved={liveSaved}
                          saving={saving}
                          onSave={handleSaveJournal}
                          onToggleShare={handleToggleShare}
                          onExport={handleExport}
                          exporting={exporting}
                          hasExport={Boolean(onExportImage)}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="px-5 sm:px-8 py-3 sm:py-4 border-t border-[#d4a373]/10 flex items-center justify-between relative z-10 bg-[#0a0907]/60 backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={currentSlide === 0}
                    className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#a8a29e] hover:text-[#f2efeb] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Back
                  </button>

                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => goTo(i)}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          i === currentSlide
                            ? "w-7 bg-gradient-to-r from-[#d4a373] to-[#e6b984]"
                            : "w-1.5 bg-[#a8a29e]/30 hover:bg-[#a8a29e]/50"
                        }`}
                        aria-label={`Go to slide ${i + 1}`}
                      />
                    ))}
                  </div>

                  {currentSlide < SLIDE_COUNT - 1 ? (
                    <button
                      type="button"
                      onClick={goNext}
                      className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#d4a373] hover:text-[#e6b984] transition-colors"
                    >
                      Next
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#d4a373] hover:text-[#e6b984] transition-colors"
                    >
                      {saved ? "Done" : "Skip"}
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SlideHeader({
  type,
  periodLabel,
  currentSlide,
}: {
  type: string;
  periodLabel: string;
  currentSlide: number;
}) {
  return (
    <div className="px-5 sm:px-8 pt-5 sm:pt-6 pb-3 flex items-center justify-between border-b border-[#d4a373]/10 relative z-10 bg-[#0a0907]/40 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-[#d4a373]">
        <motion.div
          key={`icon-${currentSlide}`}
          initial={{ rotate: -30, scale: 0.6, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <Sparkles className="w-3.5 h-3.5" />
        </motion.div>
        <span
          className="font-black uppercase"
          style={{ fontSize: "clamp(0.625rem, 1.4vw, 0.75rem)", letterSpacing: "0.22em" }}
        >
          {capitalize(type)} Wrap
        </span>
      </div>
      <span
        className="font-bold text-[#a8a29e] uppercase truncate ml-3"
        style={{ fontSize: "clamp(0.5625rem, 1.2vw, 0.6875rem)", letterSpacing: "0.15em" }}
      >
        {periodLabel}
      </span>
    </div>
  );
}

function AmbientBackdrop({ slideKey }: { slideKey: string }) {
  const gradients: Record<string, string> = {
    hero: "radial-gradient(ellipse at 30% 20%, rgba(212,163,115,0.18) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.10) 0%, transparent 60%)",
    stats: "radial-gradient(ellipse at 80% 30%, rgba(16,185,129,0.10) 0%, transparent 55%), radial-gradient(ellipse at 20% 70%, rgba(212,163,115,0.12) 0%, transparent 55%)",
    focus: "radial-gradient(ellipse at 50% 30%, rgba(249,115,22,0.10) 0%, transparent 55%), radial-gradient(ellipse at 50% 90%, rgba(212,163,115,0.10) 0%, transparent 60%)",
    narrative: "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.08) 0%, transparent 60%), radial-gradient(ellipse at 20% 90%, rgba(212,163,115,0.10) 0%, transparent 60%)",
    journal: "radial-gradient(ellipse at 30% 30%, rgba(212,163,115,0.10) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(16,185,129,0.08) 0%, transparent 60%)",
  };
  return (
    <motion.div
      key={slideKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="absolute inset-0 pointer-events-none"
      style={{
        background: gradients[slideKey] ?? gradients.hero,
      }}
    />
  );
}

function HeroSlide({ reflection }: { reflection: PbReflections }) {
  const stats = reflection.stats;
  const heroStat = useMemo(() => {
    const candidates: Array<{ key: string; value: number; suffix?: string }> = [
      { key: "tasksCompleted", value: stats.tasksCompleted },
      { key: "eventsAttended", value: stats.eventsAttended },
      { key: "streakDays", value: stats.streakDays ?? 0, suffix: "d" },
      { key: "habitLogsCompleted", value: stats.habitLogsCompleted ?? 0 },
    ];
    return candidates.reduce((max, c) => (c.value > max.value ? c : max));
  }, [stats]);

  const period = reflection.type;
  const periodHeadline =
    period === "weekly"
      ? "Your week, condensed."
      : period === "monthly"
        ? "Your month, in motion."
        : period === "yearly"
          ? "Your year, in review."
          : `${capitalize(period)} in review.`;

  return (
    <div className="h-full flex flex-col justify-between min-h-0">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="space-y-2"
      >
        <div className="flex items-center gap-1.5 text-[#d4a373]">
          <Hash className="w-3 h-3" />
          <span
            className="font-black uppercase"
            style={{ fontSize: "clamp(0.5625rem, 1.2vw, 0.6875rem)", letterSpacing: "0.3em" }}
          >
            {reflection.periodLabel}
          </span>
        </div>
        <h1
          className="font-black text-[#f2efeb] leading-[0.95] tracking-[-0.04em]"
          style={{ fontSize: "clamp(2.5rem, 7.5vw, 4.5rem)" }}
        >
          {periodHeadline.split(",")[0]}
          <span style={{ color: "#d4a373" }}>{periodHeadline.includes(",") ? "," : ""}</span>
          <br />
          <span
            className="italic font-light"
            style={{ color: "#d4a373", letterSpacing: "-0.02em" }}
          >
            {periodHeadline.split(",")[1]?.trim() ?? "in motion."}
          </span>
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.3, type: "spring", damping: 20 }}
        className="flex flex-col items-center justify-center my-4 sm:my-6"
      >
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(212,163,115,0.35) 0%, transparent 70%)" }}
          />
          <AnimatedNumber
            value={heroStat.value}
            suffix={heroStat.suffix}
            className="relative font-black text-[#f2efeb] leading-none tabular-nums"
            style={{ fontSize: "clamp(6rem, 22vw, 12rem)", letterSpacing: "-0.06em" }}
          />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.9 }}
          className="text-center mt-2"
        >
          <div
            className="text-[#a8a29e] uppercase font-black"
            style={{ fontSize: "clamp(0.625rem, 1.4vw, 0.75rem)", letterSpacing: "0.3em" }}
          >
            {labelForStat(heroStat.key)}
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="space-y-2"
      >
        <p
          className="text-[#a8a29e]"
          style={{ fontSize: "clamp(0.8125rem, 1.8vw, 0.9375rem)", lineHeight: 1.5 }}
        >
          {reflection.stats.tasksCompleted} task{reflection.stats.tasksCompleted === 1 ? "" : "s"} closed ·{" "}
          {reflection.stats.eventsAttended} event{reflection.stats.eventsAttended === 1 ? "" : "s"} attended ·{" "}
          {(reflection.stats.streakDays ?? 0)} day streak
        </p>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.9, ease: "easeOut" }}
          className="h-px bg-gradient-to-r from-transparent via-[#d4a373]/50 to-transparent origin-left"
        />
      </motion.div>
    </div>
  );
}

function StatsSlide({ reflection }: { reflection: PbReflections }) {
  const stats = reflection.stats;
  const items: Array<{
    key: string;
    label: string;
    value: number;
    color: string;
    bg: string;
    border: string;
    icon: React.ReactNode;
    hint?: string;
  }> = [
    {
      key: "tasks",
      label: "Tasks Done",
      value: stats.tasksCompleted,
      color: "#10b981",
      bg: "rgba(16,185,129,0.06)",
      border: "rgba(16,185,129,0.18)",
      icon: <Award className="w-3.5 h-3.5" />,
      hint: `${stats.tasksCreated} created`,
    },
    {
      key: "events",
      label: "Events",
      value: stats.eventsAttended,
      color: "#8b5cf6",
      bg: "rgba(139,92,246,0.06)",
      border: "rgba(139,92,246,0.18)",
      icon: <CalendarDays className="w-3.5 h-3.5" />,
      hint: "Attended",
    },
    {
      key: "streak",
      label: "Active Days",
      value: stats.streakDays ?? 0,
      color: "#f97316",
      bg: "rgba(249,115,22,0.06)",
      border: "rgba(249,115,22,0.18)",
      icon: <Flame className="w-3.5 h-3.5" />,
      hint: "In a row",
    },
  ];
  if (stats.habitLogsCompleted !== undefined) {
    items.push({
      key: "habits",
      label: "Habits",
      value: stats.habitLogsCompleted,
      color: "#d4a373",
      bg: "rgba(212,163,115,0.06)",
      border: "rgba(212,163,115,0.20)",
      icon: <Sparkles className="w-3.5 h-3.5" />,
      hint: stats.habitStreakDays ? `${stats.habitStreakDays}d streak` : "Logged",
    });
  }

  return (
    <div className="space-y-5 sm:space-y-7">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-2"
      >
        <div className="flex items-center gap-1.5 text-[#d4a373]">
          <Sparkles className="w-3 h-3" />
          <span
            className="font-black uppercase"
            style={{ fontSize: "clamp(0.5625rem, 1.2vw, 0.6875rem)", letterSpacing: "0.3em" }}
          >
            Snapshot
          </span>
        </div>
        <h2
          className="font-black text-[#f2efeb] leading-[0.95] tracking-[-0.04em]"
          style={{ fontSize: "clamp(2rem, 6vw, 3.25rem)" }}
        >
          The numbers
          <span style={{ color: "#d4a373" }}>.</span>
        </h2>
      </motion.div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {items.map((item, i) => (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.08, ease: "easeOut" }}
            className="rounded-2xl p-4 sm:p-5 space-y-2 backdrop-blur-sm"
            style={{
              background: item.bg,
              border: `1px solid ${item.border}`,
            }}
          >
            <div
              className="flex items-center gap-1.5 opacity-80"
              style={{ color: item.color }}
            >
              {item.icon}
              <span
                className="font-black uppercase"
                style={{ fontSize: "clamp(0.5rem, 1.1vw, 0.625rem)", letterSpacing: "0.22em" }}
              >
                {item.label}
              </span>
            </div>
            <AnimatedNumber
              value={item.value}
              className="block font-black text-[#f2efeb] leading-none tabular-nums"
              style={{ fontSize: "clamp(2.25rem, 7vw, 3.5rem)", letterSpacing: "-0.04em" }}
            />
            {item.hint && (
              <div
                className="text-[#a8a29e]"
                style={{ fontSize: "clamp(0.625rem, 1.3vw, 0.75rem)" }}
              >
                {item.hint}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function FocusSlide({ reflection }: { reflection: PbReflections }) {
  const stats = reflection.stats;
  const categories = useMemo<string[]>(
    () => stats.topCategories ?? [],
    [stats.topCategories],
  );
  const totalTasks = Math.max(stats.tasksCompleted, 1);

  return (
    <div className="space-y-5 sm:space-y-7">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-2"
      >
        <div className="flex items-center gap-1.5 text-[#d4a373]">
          <Tag className="w-3 h-3" />
          <span
            className="font-black uppercase"
            style={{ fontSize: "clamp(0.5625rem, 1.2vw, 0.6875rem)", letterSpacing: "0.3em" }}
          >
            Focus domains
          </span>
        </div>
        <h2
          className="font-black text-[#f2efeb] leading-[0.95] tracking-[-0.04em]"
          style={{ fontSize: "clamp(2rem, 6vw, 3.25rem)" }}
        >
          Where your
          <br />
          <span style={{ color: "#d4a373" }} className="italic font-light">
            energy
          </span>{" "}
          went.
        </h2>
        <p
          className="text-[#a8a29e]"
          style={{ fontSize: "clamp(0.75rem, 1.6vw, 0.875rem)" }}
        >
          Top focus areas across {totalTasks} task{totalTasks === 1 ? "" : "s"}.
        </p>
      </motion.div>

      {categories.length === 0 ? (
        <div
          className="rounded-2xl border p-6 text-center"
          style={{
            borderColor: "rgba(168,162,158,0.18)",
            color: "#a8a29e",
            fontSize: "clamp(0.8125rem, 1.8vw, 0.9375rem)",
          }}
        >
          No categories recorded yet.
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {categories.map((cat, i) => {
            const pct = Math.round((1 / categories.length) * 100);
            return (
              <motion.div
                key={cat}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.15 + i * 0.1 }}
                className="space-y-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="font-bold text-[#f2efeb] capitalize"
                    style={{ fontSize: "clamp(0.875rem, 2vw, 1.0625rem)" }}
                  >
                    {cat}
                  </span>
                  <span
                    className="font-black shrink-0"
                    style={{
                      color: i === 0 ? "#d4a373" : "#a8a29e",
                      fontSize: "clamp(0.6875rem, 1.5vw, 0.8125rem)",
                    }}
                  >
                    {pct}%
                  </span>
                </div>
                <div
                  className="rounded-full overflow-hidden"
                  style={{
                    background: "rgba(168,162,158,0.10)",
                    height: i === 0 ? "0.5rem" : "0.375rem",
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, delay: 0.3 + i * 0.1, ease: [0.32, 0.72, 0, 1] }}
                    className="h-full rounded-full"
                    style={{
                      background:
                        i === 0
                          ? "linear-gradient(90deg, #d4a373, #e6b984, #f0c89a)"
                          : "linear-gradient(90deg, rgba(212,163,115,0.6), rgba(212,163,115,0.4))",
                    }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NarrativeSlide({ reflection }: { reflection: PbReflections }) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-2"
      >
        <div className="flex items-center gap-1.5 text-[#d4a373]">
          <Quote className="w-3 h-3" />
          <span
            className="font-black uppercase"
            style={{ fontSize: "clamp(0.5625rem, 1.2vw, 0.6875rem)", letterSpacing: "0.3em" }}
          >
            The story
          </span>
        </div>
        <h2
          className="font-black text-[#f2efeb] leading-[0.95] tracking-[-0.04em]"
          style={{ fontSize: "clamp(2rem, 6vw, 3.25rem)" }}
        >
          In the
          <span style={{ color: "#d4a373" }} className="italic font-light">{" "}agent&apos;s{" "}</span>
          <br />
          words.
        </h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative rounded-2xl p-5 sm:p-6 backdrop-blur-sm"
        style={{
          background: "linear-gradient(135deg, rgba(40,36,30,0.7) 0%, rgba(26,24,20,0.6) 100%)",
          border: "1px solid rgba(212,163,115,0.18)",
        }}
      >
        <div
          className="absolute -top-2 -left-2 text-[#d4a373]/15 font-black leading-none select-none pointer-events-none"
          style={{ fontSize: "clamp(4rem, 10vw, 6rem)" }}
          aria-hidden
        >
          &ldquo;
        </div>
        <div
          className="prose prose-invert max-w-none text-[#f2efeb] font-sans"
          style={{ fontSize: "clamp(0.9375rem, 2.1vw, 1.0625rem)", lineHeight: 1.65 }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
              ul: ({ children }) => (
                <ul className="list-disc pl-5 mb-3 space-y-1.5 marker:text-[#d4a373]">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pl-5 mb-3 space-y-1.5 marker:text-[#d4a373]">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="text-[#f2efeb] leading-relaxed">{children}</li>
              ),
              strong: ({ children }) => (
                <strong className="text-[#d4a373] font-bold">{children}</strong>
              ),
              em: ({ children }) => <em className="text-[#e6b984] italic">{children}</em>,
              h1: ({ children }) => (
                <h1 className="text-2xl font-black text-[#f2efeb] mt-4 mb-2">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-black text-[#f2efeb] mt-3 mb-2">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-bold text-[#f2efeb] mt-3 mb-1">{children}</h3>
              ),
              code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<"code">) => {
                const isInline = !className;
                if (isInline) {
                  return (
                    <code
                      className="bg-[#0f0e0c]/70 px-1.5 py-0.5 rounded text-[#d4a373] font-mono text-[0.9em]"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {reflection.summary}
          </ReactMarkdown>
        </div>
      </motion.div>
    </div>
  );
}

interface JournalSlideProps {
  reflection: PbReflections;
  journalText: string;
  setJournalText: (s: string) => void;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  onToggleShare: () => void;
  onExport: () => void;
  exporting: boolean;
  hasExport: boolean;
}

function JournalSlide({
  reflection,
  journalText,
  setJournalText,
  saved,
  saving,
  onSave,
  onToggleShare,
  onExport,
  exporting,
  hasExport,
}: JournalSlideProps) {
  const isShared = Boolean(reflection.shared);
  return (
    <div className="space-y-5 sm:space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-2"
      >
        <h2
          className="font-black text-[#f2efeb] leading-[0.95] tracking-[-0.04em]"
          style={{ fontSize: "clamp(2rem, 6vw, 3.25rem)" }}
        >
          How does this
          <br />
          <span style={{ color: "#d4a373" }} className="italic font-light">feel</span>?
        </h2>
        <p
          className="text-[#a8a29e]"
          style={{ fontSize: "clamp(0.8125rem, 1.8vw, 0.9375rem)", lineHeight: 1.5 }}
        >
          Add a quick private journal entry. Share only when you flip the switch below.
        </p>
      </motion.div>

      <textarea
        value={journalText}
        onChange={(e) => setJournalText(e.target.value)}
        placeholder="Write your reflection here…"
        rows={6}
        className="w-full resize-none rounded-2xl border bg-[#0f0e0c]/60 px-4 py-3 text-[#f2efeb] placeholder:text-[#a8a29e]/50 focus:border-[#d4a373]/40 focus:outline-none focus:ring-1 focus:ring-[#d4a373]/20 transition-colors"
        style={{
          borderColor: "rgba(168,162,158,0.22)",
          fontSize: "clamp(0.875rem, 1.9vw, 0.9375rem)",
          lineHeight: 1.55,
        }}
      />

      <button
        type="button"
        onClick={onSave}
        disabled={saving || !journalText.trim()}
        className="w-full flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-gradient-to-br from-[#d4a373] to-[#e6b984] text-[#0f0e0c] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#d4a373]/10"
        style={{ fontSize: "clamp(0.625rem, 1.4vw, 0.6875rem)", letterSpacing: "0.18em" }}
      >
        {saved ? <Check className="w-3.5 h-3.5" /> : null}
        {saving ? "Saving…" : saved ? "Saved" : "Save entry"}
      </button>

      <div
        className="rounded-2xl border p-4 sm:p-5 space-y-4 backdrop-blur-sm"
        style={{
          background: "rgba(40,36,30,0.4)",
          borderColor: "rgba(168,162,158,0.18)",
        }}
      >
        <button
          type="button"
          onClick={onToggleShare}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Share2 className="w-4 h-4 text-[#d4a373] shrink-0" />
            <div className="min-w-0">
              <div
                className="font-bold text-[#f2efeb]"
                style={{ fontSize: "clamp(0.8125rem, 1.8vw, 0.9375rem)" }}
              >
                Public share link
              </div>
              <div
                className="text-[#a8a29e] truncate"
                style={{ fontSize: "clamp(0.625rem, 1.3vw, 0.75rem)" }}
              >
                {isShared ? "Anyone with the link can view" : "Off — your wrap is private"}
              </div>
            </div>
          </div>
          <Toggle on={isShared} />
        </button>

        {isShared && <ShareUrlDisplay reflectionId={reflection._id} />}

        <button
          type="button"
          onClick={onExport}
          disabled={!hasExport || exporting}
          className="w-full flex items-center justify-between gap-3 text-left px-1 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Download className="w-4 h-4 text-[#d4a373] shrink-0" />
            <div className="min-w-0">
              <div
                className="font-bold text-[#f2efeb]"
                style={{ fontSize: "clamp(0.8125rem, 1.8vw, 0.9375rem)" }}
              >
                Save as image
              </div>
              <div
                className="text-[#a8a29e]"
                style={{ fontSize: "clamp(0.625rem, 1.3vw, 0.75rem)" }}
              >
                {hasExport
                  ? exporting
                    ? "Rendering PNG…"
                    : "Download a 1080×1920 share card"
                  : "Image export coming soon"}
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div
      className={`w-10 h-5.5 rounded-full relative transition-colors shrink-0 ${
        on ? "bg-gradient-to-r from-[#d4a373] to-[#e6b984]" : "bg-[#a8a29e]/25"
      }`}
      style={{ height: "1.375rem" }}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#f2efeb] shadow transition-transform ${
          on ? "translate-x-[20px]" : "translate-x-0.5"
        }`}
      />
    </div>
  );
}

function ShareUrlDisplay({ reflectionId }: { reflectionId: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/reflection/${reflectionId}`
      : `/share/reflection/${reflectionId}`;
  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-1.5 pl-6 sm:pl-7">
      <code
        className="flex-1 text-[#a8a29e] bg-[#0f0e0c]/60 rounded-lg px-2 py-1.5 truncate font-mono"
        style={{ fontSize: "clamp(0.625rem, 1.3vw, 0.6875rem)" }}
      >
        {url}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="font-bold uppercase text-[#d4a373] hover:text-[#e6b984] px-2 py-1.5"
        style={{ fontSize: "clamp(0.625rem, 1.3vw, 0.6875rem)", letterSpacing: "0.15em" }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function AnimatedNumber({
  value,
  className,
  style,
  suffix,
}: {
  value: number;
  className?: string;
  style?: React.CSSProperties;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 900;
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <span className={className} style={style}>
      {display}
      {suffix ? <span className="text-[#d4a373]/60">{suffix}</span> : null}
    </span>
  );
}

function labelForStat(key: string): string {
  switch (key) {
    case "tasksCompleted":
      return "Tasks Closed";
    case "eventsAttended":
      return "Events Attended";
    case "streakDays":
      return "Day Streak";
    case "habitLogsCompleted":
      return "Habit Logs";
    default:
      return "Stat";
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
