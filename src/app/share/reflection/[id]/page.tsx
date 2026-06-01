import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Sparkles, Quote, Tag, Hash } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import Link from "next/link";
import { PublicReflectionSaveButton } from "./PublicReflectionSaveButton";
import { ScrollEnabler } from "./ScrollEnabler";

const COLORS = {
  gold: "#d4a373",
  goldLight: "#e6b984",
  goldDark: "#8a6a4a",
  bgFrom: "#1a1814",
  bgVia: "#15130f",
  bgTo: "#0a0907",
  text: "#f2efeb",
  textMuted: "#a8a29e",
  textDim: "#6e6864",
  cardBg: "rgba(40, 36, 30, 0.55)",
  cardBorder: "rgba(212, 163, 115, 0.20)",
  emerald: "#10b981",
  violet: "#8b5cf6",
  orange: "#f97316",
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PublicReflectionPage({ params }: PageProps) {
  const { id } = await params;

  let reflection: Doc<"reflections"> | null = null;
  try {
    reflection = await fetchQuery(api.reflections.getPublicReflection, {
      id: id as Id<"reflections">,
    });
  } catch (err) {
    console.error("Public reflection fetch failed:", err);
    reflection = null;
  }

  if (!reflection) {
    return (
      <>
        <ScrollEnabler />
        <PrivateState />
      </>
    );
  }

  return (
    <>
      <ScrollEnabler />
      <main
        style={{
          background: `linear-gradient(180deg, ${COLORS.bgFrom} 0%, ${COLORS.bgVia} 50%, ${COLORS.bgTo} 100%)`,
          minHeight: "100vh",
          color: COLORS.text,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
          position: "relative",
          overflowX: "hidden",
        }}
      >
        <AmbientGlow />
        <PageHeader type={reflection.type} periodLabel={reflection.periodLabel} />
        <div className="mx-auto max-w-2xl px-5 sm:px-8 py-10 sm:py-16 space-y-12 sm:space-y-20 relative">
          <HeroSection reflection={reflection} />
          <StatsSection reflection={reflection} />
          <FocusSection reflection={reflection} />
          <NarrativeSection reflection={reflection} />
          <div className="flex justify-center pt-2">
            <PublicReflectionSaveButton reflection={reflection} />
          </div>
          <PageFooter />
        </div>
      </main>
    </>
  );
}

function AmbientGlow() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(212,163,115,0.12) 0%, transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 100%, rgba(139,92,246,0.08) 0%, transparent 60%)",
        }}
      />
    </>
  );
}

function PageHeader({ type, periodLabel }: { type: string; periodLabel: string }) {
  return (
    <header
      className="sticky top-0 z-10 border-b backdrop-blur-xl"
      style={{
        borderColor: COLORS.cardBorder,
        background: "rgba(10, 9, 7, 0.7)",
      }}
    >
      <div className="mx-auto max-w-2xl px-5 sm:px-8 py-4 sm:py-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" style={{ color: COLORS.gold }}>
          <Sparkles className="w-3.5 h-3.5" />
          <span
            className="font-black uppercase truncate"
            style={{ fontSize: "clamp(0.625rem, 1.4vw, 0.75rem)", letterSpacing: "0.25em" }}
          >
            Dialogue • {capitalize(type)} Wrap
          </span>
        </div>
        <span
          className="font-bold uppercase truncate"
          style={{
            color: COLORS.textMuted,
            fontSize: "clamp(0.5625rem, 1.2vw, 0.6875rem)",
            letterSpacing: "0.15em",
          }}
        >
          {periodLabel}
        </span>
      </div>
    </header>
  );
}

function HeroSection({ reflection }: { reflection: Doc<"reflections"> }) {
  const stats = reflection.stats;
  const candidates: Array<{ key: string; value: number; label: string; suffix?: string }> = [
    { key: "tasks", value: stats.tasksCompleted, label: "Tasks Closed" },
    { key: "events", value: stats.eventsAttended, label: "Events Attended" },
    { key: "streak", value: stats.streakDays ?? 0, label: "Day Streak", suffix: "d" },
  ];
  const heroStat = candidates.reduce((max, c) => (c.value > max.value ? c : max));

  const periodHeadline =
    reflection.type === "weekly"
      ? "Your week, condensed."
      : reflection.type === "monthly"
        ? "Your month, in motion."
        : reflection.type === "yearly"
          ? "Your year, in review."
          : `${capitalize(reflection.type)} in review.`;

  const heroNumberFontSize = "clamp(5rem, 18vw, 9.5rem)";

  return (
    <section className="space-y-6 sm:space-y-8">
      <div className="flex items-center gap-1.5" style={{ color: COLORS.gold }}>
        <Hash className="w-3 h-3" />
        <span
          className="font-black uppercase"
          style={{ fontSize: "clamp(0.5625rem, 1.2vw, 0.6875rem)", letterSpacing: "0.3em" }}
        >
          {reflection.periodLabel}
        </span>
      </div>
      <h1
        className="font-black leading-[0.95]"
        style={{
          color: COLORS.text,
          fontSize: "clamp(2.5rem, 7.5vw, 4.5rem)",
          letterSpacing: "-0.04em",
        }}
      >
        {periodHeadline.split(",")[0]}
        <span style={{ color: COLORS.gold }}>
          {periodHeadline.includes(",") ? "," : ""}
        </span>
        <br />
        <span
          className="italic font-light"
          style={{ color: COLORS.gold, letterSpacing: "-0.02em" }}
        >
          {periodHeadline.split(",")[1]?.trim() ?? "in motion."}
        </span>
      </h1>

      <div className="flex flex-col items-center justify-center py-4 sm:py-6">
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(212,163,115,0.35) 0%, transparent 70%)",
            }}
          />
          <div
            className="relative font-black leading-none tabular-nums"
            style={{
              color: COLORS.text,
              fontSize: heroNumberFontSize,
              letterSpacing: "-0.06em",
            }}
          >
            {heroStat.value}
            {heroStat.suffix ? (
              <span style={{ color: "rgba(212,163,115,0.6)" }}>{heroStat.suffix}</span>
            ) : null}
          </div>
        </div>
        <div
          className="uppercase font-black mt-3 tracking-[0.3em]"
          style={{
            color: COLORS.textMuted,
            fontSize: "clamp(0.625rem, 1.4vw, 0.75rem)",
          }}
        >
          {heroStat.label}
        </div>
      </div>

      <div
        className="flex items-center gap-3 flex-wrap"
        style={{
          color: COLORS.textMuted,
          fontSize: "clamp(0.8125rem, 1.8vw, 0.9375rem)",
        }}
      >
        <span>
          <strong style={{ color: COLORS.text }}>{stats.tasksCompleted}</strong> task
          {stats.tasksCompleted === 1 ? "" : "s"} closed
        </span>
        <span style={{ color: COLORS.goldDark }}>·</span>
        <span>
          <strong style={{ color: COLORS.text }}>{stats.eventsAttended}</strong> event
          {stats.eventsAttended === 1 ? "" : "s"} attended
        </span>
        <span style={{ color: COLORS.goldDark }}>·</span>
        <span>
          <strong style={{ color: COLORS.text }}>{stats.streakDays ?? 0}</strong> day streak
        </span>
      </div>
    </section>
  );
}

function StatsSection({ reflection }: { reflection: Doc<"reflections"> }) {
  const s = reflection.stats;
  const items: Array<{
    label: string;
    value: number;
    color: string;
    bg: string;
    border: string;
    hint?: string;
  }> = [
    {
      label: "Tasks Done",
      value: s.tasksCompleted,
      color: COLORS.emerald,
      bg: "rgba(16,185,129,0.06)",
      border: "rgba(16,185,129,0.18)",
      hint: `${s.tasksCreated} created`,
    },
    {
      label: "Events",
      value: s.eventsAttended,
      color: COLORS.violet,
      bg: "rgba(139,92,246,0.06)",
      border: "rgba(139,92,246,0.18)",
      hint: "Attended",
    },
    {
      label: "Active Days",
      value: s.streakDays ?? 0,
      color: COLORS.orange,
      bg: "rgba(249,115,22,0.06)",
      border: "rgba(249,115,22,0.18)",
      hint: "In a row",
    },
  ];
  if (s.habitLogsCompleted !== undefined) {
    items.push({
      label: "Habits",
      value: s.habitLogsCompleted,
      color: COLORS.gold,
      bg: "rgba(212,163,115,0.06)",
      border: "rgba(212,163,115,0.20)",
      hint: s.habitStreakDays ? `${s.habitStreakDays}d streak` : "Logged",
    });
  }
  return (
    <section className="space-y-5 sm:space-y-7">
      <div>
        <div
          className="font-black uppercase mb-2"
          style={{
            color: COLORS.gold,
            fontSize: "clamp(0.5625rem, 1.2vw, 0.6875rem)",
            letterSpacing: "0.3em",
          }}
        >
          Snapshot
        </div>
        <h2
          className="font-black leading-[0.95]"
          style={{
            color: COLORS.text,
            fontSize: "clamp(2rem, 6vw, 3.25rem)",
            letterSpacing: "-0.04em",
          }}
        >
          The numbers<span style={{ color: COLORS.gold }}>.</span>
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl p-4 sm:p-5 space-y-2"
            style={{ background: item.bg, border: `1px solid ${item.border}` }}
          >
            <div
              className="font-black uppercase opacity-80"
              style={{
                color: item.color,
                fontSize: "clamp(0.5rem, 1.1vw, 0.625rem)",
                letterSpacing: "0.22em",
              }}
            >
              {item.label}
            </div>
            <div
              className="font-black leading-none tabular-nums"
              style={{
                color: COLORS.text,
                fontSize: "clamp(2.25rem, 7vw, 3.5rem)",
                letterSpacing: "-0.04em",
              }}
            >
              {item.value}
            </div>
            {item.hint && (
              <div
                style={{
                  color: COLORS.textMuted,
                  fontSize: "clamp(0.625rem, 1.3vw, 0.75rem)",
                }}
              >
                {item.hint}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function FocusSection({ reflection }: { reflection: Doc<"reflections"> }) {
  const categories = reflection.stats.topCategories ?? [];
  const totalTasks = Math.max(reflection.stats.tasksCompleted, 1);
  if (categories.length === 0) {
    return null;
  }
  return (
    <section className="space-y-5 sm:space-y-7">
      <div>
        <div
          className="font-black uppercase mb-2 flex items-center gap-1.5"
          style={{
            color: COLORS.gold,
            fontSize: "clamp(0.5625rem, 1.2vw, 0.6875rem)",
            letterSpacing: "0.3em",
          }}
        >
          <Tag className="w-3 h-3" />
          Focus Domains
        </div>
        <h2
          className="font-black leading-[0.95]"
          style={{
            color: COLORS.text,
            fontSize: "clamp(2rem, 6vw, 3.25rem)",
            letterSpacing: "-0.04em",
          }}
        >
          Where your
          <br />
          <span className="italic font-light" style={{ color: COLORS.gold }}>
            energy
          </span>{" "}
          went.
        </h2>
        <p
          className="mt-2"
          style={{
            color: COLORS.textMuted,
            fontSize: "clamp(0.75rem, 1.6vw, 0.875rem)",
          }}
        >
          Top focus areas across {totalTasks} task{totalTasks === 1 ? "" : "s"}.
        </p>
      </div>
      <div className="space-y-3 sm:space-y-4">
        {categories.map((cat, i) => {
          const pct = Math.round((1 / categories.length) * 100);
          return (
            <div key={cat} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="font-bold capitalize"
                  style={{
                    color: COLORS.text,
                    fontSize: "clamp(0.875rem, 2vw, 1.0625rem)",
                  }}
                >
                  {cat}
                </span>
                <span
                  className="font-black shrink-0"
                  style={{
                    color: i === 0 ? COLORS.gold : COLORS.textMuted,
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
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background:
                      i === 0
                        ? "linear-gradient(90deg, #d4a373, #e6b984, #f0c89a)"
                        : "linear-gradient(90deg, rgba(212,163,115,0.6), rgba(212,163,115,0.4))",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NarrativeSection({ reflection }: { reflection: Doc<"reflections"> }) {
  return (
    <section className="space-y-5 sm:space-y-6">
      <div>
        <div
          className="font-black uppercase mb-2 flex items-center gap-1.5"
          style={{
            color: COLORS.gold,
            fontSize: "clamp(0.5625rem, 1.2vw, 0.6875rem)",
            letterSpacing: "0.3em",
          }}
        >
          <Quote className="w-3 h-3" />
          The story
        </div>
        <h2
          className="font-black leading-[0.95]"
          style={{
            color: COLORS.text,
            fontSize: "clamp(2rem, 6vw, 3.25rem)",
            letterSpacing: "-0.04em",
          }}
        >
          In the{" "}
          <span
            className="italic font-light"
            style={{ color: COLORS.gold }}
          >
            agent&apos;s
          </span>
          <br />
          words.
        </h2>
      </div>
      <div
        className="relative rounded-2xl p-5 sm:p-7"
        style={{
          background:
            "linear-gradient(135deg, rgba(40,36,30,0.7) 0%, rgba(26,24,20,0.6) 100%)",
          border: `1px solid ${COLORS.cardBorder}`,
        }}
      >
        <div
          className="absolute -top-3 -left-1 font-black leading-none select-none pointer-events-none"
          style={{
            color: "rgba(212,163,115,0.15)",
            fontSize: "clamp(5rem, 12vw, 7rem)",
          }}
          aria-hidden
        >
          &ldquo;
        </div>
        <div
          className="prose prose-invert max-w-none"
          style={{
            color: COLORS.text,
            fontSize: "clamp(0.9375rem, 2.1vw, 1.0625rem)",
            lineHeight: 1.65,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              p: ({ children }) => (
                <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
              ),
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
                <li className="leading-relaxed">{children}</li>
              ),
              strong: ({ children }) => (
                <strong style={{ color: COLORS.gold, fontWeight: 700 }}>
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em style={{ color: COLORS.goldLight }}>{children}</em>
              ),
              h1: ({ children }) => (
                <h1
                  className="font-black mt-4 mb-2"
                  style={{ fontSize: "1.5em", color: COLORS.text }}
                >
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2
                  className="font-black mt-3 mb-2"
                  style={{ fontSize: "1.3em", color: COLORS.text }}
                >
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3
                  className="font-bold mt-3 mb-1"
                  style={{ fontSize: "1.1em", color: COLORS.text }}
                >
                  {children}
                </h3>
              ),
              code: ({
                className,
                children,
                ...props
              }: React.ComponentPropsWithoutRef<"code">) => {
                const isInline = !className;
                if (isInline) {
                  return (
                    <code
                      className="px-1.5 py-0.5 rounded font-mono"
                      style={{
                        background: "rgba(15,14,12,0.7)",
                        color: COLORS.gold,
                        fontSize: "0.9em",
                      }}
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
      </div>
    </section>
  );
}

function PageFooter() {
  return (
    <footer className="pt-6 pb-12 sm:pb-16 text-center space-y-2">
      <div
        className="font-black uppercase"
        style={{
          color: COLORS.goldDark,
          fontSize: "clamp(0.625rem, 1.4vw, 0.75rem)",
          letterSpacing: "0.4em",
        }}
      >
        Made with Dialogue
      </div>
      <div
        style={{
          color: COLORS.textDim,
          fontSize: "clamp(0.6875rem, 1.5vw, 0.8125rem)",
        }}
      >
        Personal productivity, sovereign and private.
      </div>
    </footer>
  );
}

function PrivateState() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-6"
      style={{
        background: `linear-gradient(135deg, ${COLORS.bgFrom} 0%, ${COLORS.bgVia} 50%, ${COLORS.bgTo} 100%)`,
        color: COLORS.text,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div className="text-center max-w-sm space-y-4">
        <div
          className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
          style={{ background: "rgba(212,163,115,0.1)" }}
        >
          <Sparkles className="w-5 h-5" style={{ color: COLORS.gold }} />
        </div>
        <h1
          className="font-black"
          style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", letterSpacing: "-0.02em" }}
        >
          This reflection is private
        </h1>
        <p
          style={{
            color: COLORS.textMuted,
            fontSize: "clamp(0.875rem, 1.9vw, 0.9375rem)",
            lineHeight: 1.55,
          }}
        >
          The owner hasn&apos;t shared this wrap publicly, or the link is no
          longer valid.
        </p>
        <Link
          href="/"
          className="inline-block mt-2 px-4 py-2.5 rounded-xl font-bold uppercase tracking-widest transition-colors"
          style={{
            background: COLORS.gold,
            color: "#0f0e0c",
            fontSize: "clamp(0.625rem, 1.4vw, 0.75rem)",
            letterSpacing: "0.18em",
          }}
        >
          Open Dialogue
        </Link>
      </div>
    </main>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
