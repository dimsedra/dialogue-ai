export function hexToRgb(hex: string): string {
  const c = hex.replace("#", "");
  return `${parseInt(c.substring(0, 2), 16)}, ${parseInt(c.substring(2, 4), 16)}, ${parseInt(c.substring(4, 6), 16)}`;
}

export interface PageStyleSettings {
  url?: string;
  storageId?: string;
  opacity: number;
  blur: number;
  grain: number;
  vfxEnabled: boolean;
  vfxColor: string;
  cardBg: string;
  cardOpacity: number;
  cardBlur: number;
  cardBorder: string;
  primaryText: string;
  secondaryText: string;
  accentColor: string;
  cardStyle: "glass" | "solid";
}

export const COLOR_DEFAULTS = {
  vfxColor: "#d4a373",
  cardBg: "#1a1814",
  cardBorder: "#2a2723",
  primaryText: "#f2efeb",
  secondaryText: "#a8a29e",
  accentColor: "#d4a373",
} as const;

export const DASHBOARD_DEFAULTS: PageStyleSettings = {
  opacity: 30,
  blur: 0,
  grain: 0,
  vfxEnabled: true,
  ...COLOR_DEFAULTS,
  cardOpacity: 100,
  cardBlur: 0,
  cardStyle: "glass",
};

export function getCardBgStyle(settings: PageStyleSettings) {
  return settings.cardStyle === "solid"
    ? {
        backgroundColor: settings.cardBg,
        borderColor: settings.cardBorder,
        backdropFilter: "none" as const,
      }
    : {
        backgroundColor: `rgba(${hexToRgb(settings.cardBg)}, ${
          settings.cardBlur > 0
            ? Math.min(settings.cardOpacity / 100, 0.7)
            : settings.cardOpacity / 100
        })`,
        borderColor: settings.cardBorder,
        backdropFilter: settings.cardBlur > 0 ? `blur(${settings.cardBlur / 5}px)` : "none",
      };
}
