import { Doc } from "../../convex/_generated/dataModel";

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;

const COLORS = {
  bgFrom: "#1a1814",
  bgVia: "#15130f",
  bgTo: "#0a0907",
  gold: "#d4a373",
  goldLight: "#e6b984",
  goldDark: "#8a6a4a",
  text: "#f2efeb",
  textMuted: "#a8a29e",
  textDim: "#6e6864",
  cardBg: "rgba(40, 36, 30, 0.6)",
  cardBorder: "rgba(212, 163, 115, 0.2)",
  emerald: "#10b981",
  violet: "#8b5cf6",
  orange: "#f97316",
  quote: "#e6b984",
  quoteBg: "rgba(212, 163, 115, 0.08)",
  quoteBorder: "rgba(212, 163, 115, 0.3)",
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export interface ExportOptions {
  width?: number;
  height?: number;
  filename?: string;
}

export async function exportReflectionAsImage(
  reflection: Doc<"reflections">,
  options: ExportOptions = {},
): Promise<void> {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const filename =
    options.filename ??
    `dialogue-${reflection.type}-${reflection.periodStartStr ?? String(reflection.periodStart)}.png`;

  const svg = buildReflectionSvg(reflection, width, height);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob = await canvasToBlob(canvas);
    triggerDownload(pngBlob, filename);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load SVG into image"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob returned null"));
    }, "image/png");
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildReflectionSvg(
  r: Doc<"reflections">,
  width: number,
  height: number,
): string {
  const heroStat = pickHeroStat(r);
  const stats = r.stats;
  const categories = stats.topCategories ?? [];
  const highlights = extractHighlights(r.summary);
  const userWords = r.userReflection
    ? stripMarkdown(r.userReflection).trim()
    : null;

  const sections: string[] = [];

  sections.push(renderBackground(width, height));
  sections.push(renderHeader(width, r.periodLabel, r.type));

  let y = 460;
  sections.push(renderHeroStat(width, y, heroStat.value, heroStat.label, heroStat.color));
  y += 250;

  sections.push(
    renderSecondaryStats(width, y, [
      { label: "Events", value: stats.eventsAttended, color: COLORS.violet },
      { label: "Streak", value: `${stats.streakDays ?? 0}d`, color: COLORS.orange },
      {
        label: "Habits",
        value: String(stats.habitLogsCompleted ?? 0),
        color: COLORS.gold,
      },
    ]),
  );
  y += 180;

  if (categories.length > 0) {
    sections.push(renderFocusBars(width, y, categories));
    y += 40 + categories.length * 56 + 20;
  }

  if (highlights.length > 0) {
    sections.push(renderHighlights(width, y, highlights));
    y += 40 + Math.min(highlights.length, 3) * 48 + 20;
  }

  if (userWords) {
    sections.push(renderUserQuote(width, y, userWords));
  }

  sections.push(renderFooter(width, height));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...sections,
    `</svg>`,
  ].join("");
}

function renderBackground(w: number, h: number): string {
  return `
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${COLORS.bgFrom}" />
        <stop offset="50%" stop-color="${COLORS.bgVia}" />
        <stop offset="100%" stop-color="${COLORS.bgTo}" />
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="20%" r="60%">
        <stop offset="0%" stop-color="${COLORS.gold}" stop-opacity="0.18" />
        <stop offset="100%" stop-color="${COLORS.gold}" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="bottomGlow" cx="50%" cy="100%" r="50%">
        <stop offset="0%" stop-color="${COLORS.emerald}" stop-opacity="0.06" />
        <stop offset="100%" stop-color="${COLORS.emerald}" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)" />
    <rect width="${w}" height="${h}" fill="url(#glow)" />
    <rect width="${w}" height="${h}" fill="url(#bottomGlow)" />
  `;
}

function renderHeader(w: number, periodLabel: string, type: string): string {
  return `
    <g font-family="${FONT_STACK}">
      <text x="${w / 2}" y="150" text-anchor="middle" fill="${COLORS.gold}" font-size="22" font-weight="900" letter-spacing="10">
        DIALOGUE · ${type.toUpperCase()} WRAP
      </text>
      <line x1="${w / 2 - 60}" y1="180" x2="${w / 2 + 60}" y2="180" stroke="${COLORS.goldDark}" stroke-width="2" />
      <text x="${w / 2}" y="240" text-anchor="middle" fill="${COLORS.textMuted}" font-size="36" font-weight="700" letter-spacing="1">
        ${escapeXml(periodLabel)}
      </text>
    </g>
  `;
}

function renderHeroStat(
  w: number,
  y: number,
  value: number | string,
  label: string,
  color: string,
): string {
  return `
    <g font-family="${FONT_STACK}">
      <text x="${w / 2}" y="${y}" text-anchor="middle" fill="${color}" font-size="240" font-weight="900" letter-spacing="-6">
        ${value}
      </text>
      <text x="${w / 2}" y="${y + 60}" text-anchor="middle" fill="${COLORS.textMuted}" font-size="28" font-weight="800" letter-spacing="8">
        ${label.toUpperCase()}
      </text>
    </g>
  `;
}

function renderSecondaryStats(
  w: number,
  y: number,
  items: Array<{ label: string; value: number | string; color: string }>,
): string {
  const colWidth = w / items.length;
  const boxes = items
    .map((item, i) => {
      const cx = colWidth * i + colWidth / 2;
      return `
        <g font-family="${FONT_STACK}">
          <rect x="${cx - 130}" y="${y - 55}" width="260" height="130" rx="20"
            fill="${COLORS.cardBg}" stroke="${COLORS.cardBorder}" stroke-width="1.5" />
          <text x="${cx}" y="${y + 12}" text-anchor="middle" fill="${item.color}" font-size="52" font-weight="900">
            ${item.value}
          </text>
          <text x="${cx}" y="${y + 52}" text-anchor="middle" fill="${COLORS.textMuted}" font-size="16" font-weight="700" letter-spacing="3">
            ${item.label.toUpperCase()}
          </text>
        </g>
      `;
    })
    .join("");
  return boxes;
}

function renderFocusBars(
  w: number,
  y: number,
  categories: string[],
): string {
  const padding = w * 0.12;
  const barWidth = w - padding * 2;
  const slotHeight = 56;
  const items = categories
    .map((cat, i) => {
      const pct = Math.round((1 / categories.length) * 100);
      const ry = y + 40 + i * slotHeight;
      return `
        <g font-family="${FONT_STACK}">
          <text x="${padding}" y="${ry + 12}" fill="${COLORS.text}" font-size="24" font-weight="600">
            ${escapeXml(cat)}
          </text>
          <text x="${w - padding}" y="${ry + 12}" text-anchor="end" fill="${COLORS.gold}" font-size="24" font-weight="800">
            ${pct}%
          </text>
          <rect x="${padding}" y="${ry + 24}" width="${barWidth}" height="6" rx="3" fill="${COLORS.textDim}" opacity="0.25" />
          <rect x="${padding}" y="${ry + 24}" width="${(barWidth * pct) / 100}" height="6" rx="3" fill="${COLORS.gold}" />
        </g>
      `;
    })
    .join("");
  return `
    <g font-family="${FONT_STACK}">
      <text x="${w / 2}" y="${y}" text-anchor="middle" fill="${COLORS.gold}" font-size="16" font-weight="900" letter-spacing="6">
        FOCUS DOMAINS
      </text>
      ${items}
    </g>
  `;
}

function renderHighlights(w: number, y: number, highlights: string[]): string {
  const padding = w * 0.1;
  const maxItems = 3;
  const items = highlights
    .slice(0, maxItems)
    .map((h, i) => {
      const ry = y + 40 + i * 48;
      const truncated = h.length > 70 ? `${h.slice(0, 67)}…` : h;
      return `
        <g font-family="${FONT_STACK}">
          <circle cx="${padding + 10}" cy="${ry + 4}" r="4" fill="${COLORS.gold}" />
          <text x="${padding + 30}" y="${ry + 10}" fill="${COLORS.text}" font-size="20" font-weight="500">
            ${escapeXml(truncated)}
          </text>
        </g>
      `;
    })
    .join("");
  return `
    <g font-family="${FONT_STACK}">
      <text x="${w / 2}" y="${y}" text-anchor="middle" fill="${COLORS.gold}" font-size="18" font-weight="900" letter-spacing="8">
        KEY HIGHLIGHTS
      </text>
      ${items}
    </g>
  `;
}

function renderUserQuote(w: number, y: number, text: string): string {
  const padding = w * 0.07;
  const boxWidth = w - padding * 2;
  const lineHeight = 42;
  const fontSize = 26;
  const maxLines = 5;
  const lines = wrapText(text, 38).slice(0, maxLines);
  const labelHeight = 50;
  const boxHeight = labelHeight + 20 + lines.length * lineHeight + 30;
  const boxTop = y + 20;

  const renderedLines = lines
    .map(
      (line, i) =>
        `<text x="${w / 2}" y="${boxTop + labelHeight + 30 + i * lineHeight}" text-anchor="middle" fill="${COLORS.quote}" font-size="${fontSize}" font-weight="500" font-style="italic">${escapeXml(line)}</text>`,
    )
    .join("");

  return `
    <g font-family="${FONT_STACK}">
      <rect x="${padding}" y="${boxTop}" width="${boxWidth}" height="${boxHeight}" rx="20"
        fill="${COLORS.quoteBg}" stroke="${COLORS.quoteBorder}" stroke-width="2" />
      <text x="${w / 2}" y="${boxTop + 38}" text-anchor="middle" fill="${COLORS.gold}" font-size="18" font-weight="900" letter-spacing="6">
        HOW THIS FELT
      </text>
      ${renderedLines}
    </g>
  `;
}

function renderFooter(w: number, h: number): string {
  return `
    <g font-family="${FONT_STACK}">
      <text x="${w / 2}" y="${h - 50}" text-anchor="middle" fill="${COLORS.textDim}" font-size="16" font-weight="700" letter-spacing="4">
        MADE WITH DIALOGUE
      </text>
    </g>
  `;
}

function pickHeroStat(r: Doc<"reflections">): {
  value: number;
  label: string;
  color: string;
} {
  const s = r.stats;
  const candidates = [
    { value: s.tasksCompleted, label: "Tasks Completed", color: COLORS.emerald },
    {
      value: s.eventsAttended,
      label: "Events Attended",
      color: COLORS.violet,
    },
    {
      value: s.habitLogsCompleted ?? 0,
      label: "Habits Logged",
      color: COLORS.gold,
    },
    {
      value: s.streakDays ?? 0,
      label: "Active Days",
      color: COLORS.orange,
    },
  ];
  return candidates.reduce((a, b) => (b.value > a.value ? b : a));
}

function extractHighlights(summary: string): string[] {
  const cleaned = stripMarkdown(summary);
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 200);

  if (sentences.length === 0) return [];

  return sentences.slice(0, 3);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/---+/g, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxCharsPerLine) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
