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
  const summarySnippet = trimForSnippet(r.summary, 220);

  const sections: string[] = [];

  sections.push(renderBackground(width, height));
  sections.push(renderHeader(width, r.periodLabel, r.type));
  sections.push(
    renderHeroStat(width, 460, heroStat.value, heroStat.label, heroStat.color),
  );
  sections.push(
    renderSecondaryStats(
      width,
      880,
      [
        { label: "Events", value: stats.eventsAttended, color: COLORS.violet },
        { label: "Streak", value: `${stats.streakDays ?? 0}d`, color: COLORS.orange },
        {
          label: "Habits",
          value: String(stats.habitLogsCompleted ?? 0),
          color: COLORS.gold,
        },
      ],
    ),
  );
  sections.push(renderFocusBars(width, 1120, categories));
  sections.push(renderSummary(width, 1480, summarySnippet));
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
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)" />
    <rect width="${w}" height="${h}" fill="url(#glow)" />
  `;
}

function renderHeader(w: number, periodLabel: string, type: string): string {
  return `
    <g font-family="${FONT_STACK}">
      <text x="${w / 2}" y="180" text-anchor="middle" fill="${COLORS.gold}" font-size="22" font-weight="900" letter-spacing="6">
        ✨ DIALOGUE • ${type.toUpperCase()} WRAP
      </text>
      <line x1="${w / 2 - 80}" y1="210" x2="${w / 2 + 80}" y2="210" stroke="${COLORS.goldDark}" stroke-width="2" />
      <text x="${w / 2}" y="280" text-anchor="middle" fill="${COLORS.textMuted}" font-size="36" font-weight="700" letter-spacing="2">
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
      <text x="${w / 2}" y="${y}" text-anchor="middle" fill="${color}" font-size="280" font-weight="900" letter-spacing="-8">
        ${value}
      </text>
      <text x="${w / 2}" y="${y + 70}" text-anchor="middle" fill="${COLORS.textMuted}" font-size="32" font-weight="800" letter-spacing="8">
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
          <rect x="${cx - 130}" y="${y - 60}" width="260" height="140" rx="24"
            fill="${COLORS.cardBg}" stroke="${COLORS.cardBorder}" stroke-width="2" />
          <text x="${cx}" y="${y + 8}" text-anchor="middle" fill="${item.color}" font-size="56" font-weight="900">
            ${item.value}
          </text>
          <text x="${cx}" y="${y + 56}" text-anchor="middle" fill="${COLORS.textMuted}" font-size="18" font-weight="700" letter-spacing="3">
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
  if (categories.length === 0) {
    return `
      <g font-family="${FONT_STACK}">
        <text x="${w / 2}" y="${y + 30}" text-anchor="middle" fill="${COLORS.textDim}" font-size="22" font-style="italic">
          No focus categories recorded
        </text>
      </g>
    `;
  }
  const slotHeight = 50;
  const padding = w * 0.12;
  const barWidth = w - padding * 2;
  const items = categories
    .map((cat, i) => {
      const pct = Math.round((1 / categories.length) * 100);
      const ry = y + i * slotHeight;
      return `
        <g font-family="${FONT_STACK}">
          <text x="${padding}" y="${ry + 22}" fill="${COLORS.text}" font-size="22" font-weight="700" text-transform="capitalize">
            ${escapeXml(cat)}
          </text>
          <text x="${w - padding}" y="${ry + 22}" text-anchor="end" fill="${COLORS.gold}" font-size="22" font-weight="900">
            ${pct}%
          </text>
          <rect x="${padding}" y="${ry + 32}" width="${barWidth}" height="6" rx="3" fill="${COLORS.textDim}" opacity="0.3" />
          <rect x="${padding}" y="${ry + 32}" width="${(barWidth * pct) / 100}" height="6" rx="3" fill="${COLORS.gold}" />
        </g>
      `;
    })
    .join("");
  return `
    <g font-family="${FONT_STACK}">
      <text x="${w / 2}" y="${y - 30}" text-anchor="middle" fill="${COLORS.gold}" font-size="20" font-weight="900" letter-spacing="6">
        FOCUS DOMAINS
      </text>
      ${items}
    </g>
  `;
}

function renderSummary(w: number, y: number, text: string): string {
  const padding = w * 0.1;
  const lineHeight = 32;
  const lines = wrapText(text, 48);
  const rendered = lines
    .map(
      (line, i) =>
        `<text x="${w / 2}" y="${y + i * lineHeight}" text-anchor="middle" fill="${COLORS.text}" font-size="22" font-weight="500" font-style="italic">${escapeXml(line)}</text>`,
    )
    .join("");
  return `
    <g font-family="${FONT_STACK}">
      <line x1="${w / 2 - 40}" y1="${y - 30}" x2="${w / 2 + 40}" y2="${y - 30}" stroke="${COLORS.goldDark}" stroke-width="2" />
      ${rendered}
      <text x="${padding}" y="0" fill="transparent">.</text>
    </g>
  `;
}

function renderFooter(w: number, h: number): string {
  return `
    <g font-family="${FONT_STACK}">
      <text x="${w / 2}" y="${h - 60}" text-anchor="middle" fill="${COLORS.textDim}" font-size="18" font-weight="700" letter-spacing="4">
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

function trimForSnippet(text: string, maxChars: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxChars)}…`;
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
  return lines.slice(0, 5);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
