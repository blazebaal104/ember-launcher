/**
 * Appearance preferences: stored in the launcher's settings.json (`ui`) and applied as CSS
 * variables on <html>, so every change shows instantly.
 */

export type ThemeId = "deepslate" | "midnight" | "oled" | "calcite";
export type MotionLevel = "full" | "reduced" | "off";
export type Backdrop = "aurora" | "embers" | "grid" | "nebula" | "solid";
export type TransitionStyle = "fade" | "slide" | "zoom" | "none";
export type TransitionSpeed = "instant" | "fast" | "normal" | "smooth";
export type Density = "comfortable" | "compact";

export interface Appearance {
  theme: ThemeId;
  accent: string;
  glass: boolean;
  glassStrength: number; // 0..1
  radius: number; // px
  motion: MotionLevel;
  motionSpeed: number; // 0.5 .. 2 (multiplies durations inversely)
  backdrop: Backdrop;
  density: Density;
  textScale: number; // 0.9 .. 1.2
  sidebarCollapsed: boolean;
  sounds: boolean;
  showSnapshots: boolean;
  discoverLayout: "grid" | "list";
  /** How pages and tabs change. */
  transition: TransitionStyle;
  transitionSpeed: TransitionSpeed;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "deepslate",
  accent: "#4fb8a0",
  glass: true,
  glassStrength: 0.6,
  radius: 12,
  motion: "full",
  motionSpeed: 1,
  backdrop: "aurora",
  density: "comfortable",
  textScale: 1,
  sidebarCollapsed: false,
  sounds: false,
  showSnapshots: false,
  discoverLayout: "grid",
  transition: "slide",
  transitionSpeed: "fast",
};

/** Accent presets named after Minecraft materials. */
export const ACCENTS: Array<{ name: string; value: string }> = [
  { name: "Oxidised copper", value: "#4fb8a0" },
  { name: "Amethyst", value: "#a07cf0" },
  { name: "Diamond", value: "#5cc8f2" },
  { name: "Emerald", value: "#3ccf6e" },
  { name: "Gold", value: "#e8b931" },
  { name: "Redstone", value: "#ef4f5a" },
  { name: "Copper", value: "#e07c4c" },
  { name: "Cherry", value: "#f08cb8" },
];

export const THEMES: Array<{ id: ThemeId; name: string; swatch: [string, string] }> = [
  { id: "deepslate", name: "Deepslate", swatch: ["#171a20", "#2a2f3b"] },
  { id: "midnight", name: "Midnight", swatch: ["#0f1220", "#20263d"] },
  { id: "oled", name: "Obsidian (OLED)", swatch: ["#000000", "#17171a"] },
  { id: "calcite", name: "Calcite (light)", swatch: ["#efede8", "#ffffff"] },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** Darker variant for pressed / disabled states. */
export function deepen(hex: string, amount = 0.38) {
  const [r, g, b] = hexToRgb(hex);
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/** Black or white text on the accent, whichever reads better. */
export function onColor(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.35 ? "#0d1512" : "#ffffff";
}

export function normalise(raw: unknown): Appearance {
  const a = { ...DEFAULT_APPEARANCE, ...(raw && typeof raw === "object" ? (raw as Partial<Appearance>) : {}) };
  a.glassStrength = Math.min(1, Math.max(0, Number(a.glassStrength) || 0));
  a.radius = Math.min(22, Math.max(2, Number(a.radius) || 12));
  a.motionSpeed = Math.min(2, Math.max(0.5, Number(a.motionSpeed) || 1));
  a.textScale = Math.min(1.2, Math.max(0.9, Number(a.textScale) || 1));
  if (!["fade", "slide", "zoom", "none"].includes(a.transition)) a.transition = DEFAULT_APPEARANCE.transition;
  if (!["instant", "fast", "normal", "smooth"].includes(a.transitionSpeed)) a.transitionSpeed = DEFAULT_APPEARANCE.transitionSpeed;
  if (!/^#[0-9a-f]{6}$/i.test(a.accent)) a.accent = DEFAULT_APPEARANCE.accent;
  return a;
}

export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = a.theme;
  root.dataset.motion = a.motion;
  root.dataset.density = a.density;
  const s = root.style;
  s.setProperty("--accent", a.accent);
  s.setProperty("--accent-deep", deepen(a.accent));
  s.setProperty("--on-accent", onColor(a.accent));
  s.setProperty("--radius", `${a.radius}px`);
  s.setProperty("--glass-opacity", a.glass ? String(0.82 - a.glassStrength * 0.5) : "1");
  s.setProperty("--glass-blur", a.glass ? `${Math.round(8 + a.glassStrength * 26)}px` : "0px");
  s.setProperty("--motion", a.motion === "off" ? "0.001" : a.motion === "reduced" ? String(0.5 / a.motionSpeed) : String(1 / a.motionSpeed));
  s.setProperty("--text-scale", String(a.textScale));
}

/** Duration multiplier for JS (motion library) animations. */
export const motionFactor = (a: Appearance) => (a.motion === "off" ? 0 : a.motion === "reduced" ? 0.5 / a.motionSpeed : 1 / a.motionSpeed);

const SPEED: Record<TransitionSpeed, number> = { instant: 0, fast: 0.12, normal: 0.22, smooth: 0.4 };

/**
 * Motion props for switching pages and tabs. Only opacity and transform are animated (never
 * filters), and transforms end at exactly "none", so text is crisp once the change settles.
 */
export function transitionProps(a: Appearance, depth: "page" | "tab" = "page") {
  const style = a.motion === "off" ? "none" : a.transition;
  const base = SPEED[a.transitionSpeed] * (depth === "tab" ? 0.85 : 1);
  if (style === "none" || base === 0) {
    return { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 1, transition: { duration: 0 } }, transition: { duration: 0 } };
  }
  const d = depth === "tab" ? 6 : 12;
  const from =
    style === "slide" ? { opacity: 0, x: d * 1.4 } : style === "zoom" ? { opacity: 0, scale: 0.985 } : { opacity: 0 };
  const to = style === "slide" ? { opacity: 1, x: 0 } : style === "zoom" ? { opacity: 1, scale: 1 } : { opacity: 1 };
  const out =
    style === "slide" ? { opacity: 0, x: -d } : style === "zoom" ? { opacity: 0, scale: 1.01 } : { opacity: 0 };
  return {
    initial: from,
    animate: to,
    exit: { ...out, transition: { duration: base * 0.6, ease: [0.4, 0, 1, 1] as const } },
    transition: { duration: base, ease: [0.2, 0.8, 0.2, 1] as const },
    // Drop the leftover transform once settled so the browser re-rasterises text at full sharpness.
    transformTemplate: (latest: { x?: unknown; scale?: unknown }, generated: string) => {
      const x = parseFloat(String(latest.x ?? 0));
      const sc = parseFloat(String(latest.scale ?? 1));
      return Math.abs(x) < 0.01 && Math.abs(sc - 1) < 0.0005 ? "none" : generated;
    },
  };
}
