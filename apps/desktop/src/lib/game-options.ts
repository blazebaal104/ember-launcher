import { tr } from "./i18n";
/**
 * Game settings the profile editor knows how to show nicely. Each maps to an options.txt key.
 * Values are stored exactly as Minecraft writes them; `toUi`/`fromUi` convert for display.
 * Unknown keys are kept and editable in "Advanced", and keys a version doesn't know are ignored by the game.
 */
export type OptionDef =
  | { key: string; label: string; group: Group; kind: "slider"; min: number; max: number; step: number; unit?: string; toUi: (raw: string) => number; fromUi: (v: number) => string; format?: (v: number) => string; def: string; detail?: string }
  | { key: string; label: string; group: Group; kind: "toggle"; def: string; detail?: string }
  | { key: string; label: string; group: Group; kind: "choice"; choices: Array<{ value: string; label: string }>; def: string; detail?: string };

export type Group = "Video" | "Controls" | "Sound" | "Chat & accessibility";

const num = (raw: string, d: number) => (Number.isFinite(Number(raw)) ? Number(raw) : d);

export const OPTIONS: OptionDef[] = [
  { key: "fov", label: tr("Field of view"), group: "Video", kind: "slider", min: 30, max: 110, step: 1, unit: "°", def: "0.0", toUi: (r) => Math.round(70 + num(r, 0) * 40), fromUi: (v) => ((v - 70) / 40).toFixed(4), format: (v) => (v === 70 ? tr("Normal (70°)") : v === 110 ? tr("Quake Pro (110°)") : `${v}°`) },
  { key: "renderDistance", label: tr("Render distance"), group: "Video", kind: "slider", min: 2, max: 32, step: 1, def: "12", toUi: (r) => num(r, 12), fromUi: String, format: (v) => tr("{v} chunks", { v }) },
  { key: "simulationDistance", label: tr("Simulation distance"), group: "Video", kind: "slider", min: 5, max: 32, step: 1, def: "10", toUi: (r) => num(r, 10), fromUi: String, format: (v) => tr("{v} chunks", { v }) },
  { key: "maxFps", label: tr("Max framerate"), group: "Video", kind: "slider", min: 10, max: 260, step: 10, def: "260", toUi: (r) => num(r, 260), fromUi: String, format: (v) => (v >= 260 ? tr("Unlimited") : `${v} fps`) },
  { key: "guiScale", label: tr("GUI scale"), group: "Video", kind: "slider", min: 0, max: 6, step: 1, def: "0", toUi: (r) => num(r, 0), fromUi: String, format: (v) => (v === 0 ? tr("Auto") : `${v}×`) },
  { key: "gamma", label: tr("Brightness"), group: "Video", kind: "slider", min: 0, max: 100, step: 5, def: "0.5", toUi: (r) => Math.round(num(r, 0.5) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => (v === 0 ? tr("Moody") : v === 100 ? tr("Bright") : `${v}%`) },
  { key: "particles", label: tr("Particles"), group: "Video", kind: "choice", def: "0", choices: [{ value: "0", label: tr("All") }, { value: "1", label: tr("Decreased") }, { value: "2", label: tr("Minimal") }] },
  { key: "enableVsync", label: tr("VSync"), group: "Video", kind: "toggle", def: "false", detail: tr("Caps FPS to your monitor; removes tearing but adds a little input delay.") },
  { key: "fullscreen", label: tr("Start in fullscreen"), group: "Video", kind: "toggle", def: "false" },
  { key: "bobView", label: tr("View bobbing"), group: "Video", kind: "toggle", def: "true" },
  { key: "entityShadows", label: tr("Entity shadows"), group: "Video", kind: "toggle", def: "true" },

  { key: "mouseSensitivity", label: tr("Mouse sensitivity"), group: "Controls", kind: "slider", min: 0, max: 200, step: 1, def: "0.5", toUi: (r) => Math.round(num(r, 0.5) * 200), fromUi: (v) => (v / 200).toFixed(4), format: (v) => (v === 0 ? tr("Yawn") : v === 200 ? tr("Hyperspeed") : `${v}%`) },
  { key: "invertYMouse", label: tr("Invert mouse"), group: "Controls", kind: "toggle", def: "false" },
  { key: "rawMouseInput", label: tr("Raw mouse input"), group: "Controls", kind: "toggle", def: "true" },
  { key: "autoJump", label: tr("Auto-jump"), group: "Controls", kind: "toggle", def: "false" },
  { key: "toggleCrouch", label: tr("Sneak mode: toggle"), group: "Controls", kind: "toggle", def: "false" },
  { key: "toggleSprint", label: tr("Sprint mode: toggle"), group: "Controls", kind: "toggle", def: "false" },

  { key: "soundCategory_master", label: tr("Master volume"), group: "Sound", kind: "slider", min: 0, max: 100, step: 1, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },
  { key: "soundCategory_music", label: tr("Music"), group: "Sound", kind: "slider", min: 0, max: 100, step: 1, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },
  { key: "soundCategory_hostile", label: tr("Hostile creatures"), group: "Sound", kind: "slider", min: 0, max: 100, step: 1, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },
  { key: "soundCategory_player", label: tr("Players"), group: "Sound", kind: "slider", min: 0, max: 100, step: 1, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },

  { key: "chatScale", label: tr("Chat text size"), group: "Chat & accessibility", kind: "slider", min: 0, max: 100, step: 5, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },
  { key: "chatOpacity", label: tr("Chat opacity"), group: "Chat & accessibility", kind: "slider", min: 10, max: 100, step: 5, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },
  { key: "darkMojangStudiosBackground", label: tr("Monochrome loading screen"), group: "Chat & accessibility", kind: "toggle", def: "false" },
  { key: "hideLightningFlashes", label: tr("Hide lightning flashes"), group: "Chat & accessibility", kind: "toggle", def: "false" },
  { key: "lang", label: tr("Language"), group: "Chat & accessibility", kind: "choice", def: "en_us", choices: [["en_us", "English (US)"], ["en_gb", "English (UK)"], ["it_it", "Italiano"], ["es_es", "Español"], ["fr_fr", "Français"], ["de_de", "Deutsch"], ["pt_br", "Português (BR)"], ["pl_pl", "Polski"], ["nl_nl", "Nederlands"], ["ru_ru", "Русский"], ["ja_jp", "日本語"], ["zh_cn", "简体中文"]].map(([value, label]) => ({ value: value!, label: label! })) },
];

// ---------------------------------------------------------------- keybinds

export interface KeybindDef {
  id: string;
  label: string;
  group: "Movement" | "Gameplay" | "Inventory" | "Multiplayer" | "Misc" | "Hotbar" | "Ember overlay";
  def: string;
}

export const KEYBINDS: KeybindDef[] = [
  { id: "key.forward", label: tr("Walk forward"), group: "Movement", def: "key.keyboard.w" },
  { id: "key.left", label: tr("Strafe left"), group: "Movement", def: "key.keyboard.a" },
  { id: "key.back", label: tr("Walk backward"), group: "Movement", def: "key.keyboard.s" },
  { id: "key.right", label: tr("Strafe right"), group: "Movement", def: "key.keyboard.d" },
  { id: "key.jump", label: tr("Jump"), group: "Movement", def: "key.keyboard.space" },
  { id: "key.sneak", label: tr("Sneak"), group: "Movement", def: "key.keyboard.left.shift" },
  { id: "key.sprint", label: tr("Sprint"), group: "Movement", def: "key.keyboard.left.control" },
  { id: "key.attack", label: tr("Attack / destroy"), group: "Gameplay", def: "key.mouse.left" },
  { id: "key.use", label: tr("Use item / place block"), group: "Gameplay", def: "key.mouse.right" },
  { id: "key.pickItem", label: tr("Pick block"), group: "Gameplay", def: "key.mouse.middle" },
  { id: "key.inventory", label: tr("Open inventory"), group: "Inventory", def: "key.keyboard.e" },
  { id: "key.drop", label: tr("Drop item"), group: "Inventory", def: "key.keyboard.q" },
  { id: "key.swapOffhand", label: tr("Swap to off-hand"), group: "Inventory", def: "key.keyboard.f" },
  { id: "key.chat", label: tr("Open chat"), group: "Multiplayer", def: "key.keyboard.t" },
  { id: "key.command", label: tr("Open command"), group: "Multiplayer", def: "key.keyboard.slash" },
  { id: "key.playerlist", label: tr("List players"), group: "Multiplayer", def: "key.keyboard.tab" },
  { id: "key.screenshot", label: tr("Take screenshot"), group: "Misc", def: "key.keyboard.f2" },
  { id: "key.togglePerspective", label: tr("Toggle perspective"), group: "Misc", def: "key.keyboard.f5" },
  { id: "key.smoothCamera", label: tr("Cinematic camera"), group: "Misc", def: "key.keyboard.unknown" },
  { id: "key.fullscreen", label: tr("Toggle fullscreen"), group: "Misc", def: "key.keyboard.f11" },
  { id: "key.advancements", label: tr("Advancements"), group: "Misc", def: "key.keyboard.l" },
  ...Array.from({ length: 9 }, (_, i) => ({ id: `key.hotbar.${i + 1}`, label: tr("Hotbar slot {n0}", { n0: i + 1 }), group: "Hotbar" as const, def: `key.keyboard.${i + 1}` })),
  { id: "key.ember-overlay.menu", label: tr("Open Ember menu"), group: "Ember overlay", def: "key.keyboard.right.shift" },
  { id: "key.ember-overlay.zoom", label: tr("Zoom"), group: "Ember overlay", def: "key.keyboard.c" },
  { id: "key.ember-overlay.freelook", label: tr("Free look"), group: "Ember overlay", def: "key.keyboard.left.alt" },
  { id: "key.ember-overlay.snaplook", label: tr("Snap look behind"), group: "Ember overlay", def: "key.keyboard.unknown" },
  { id: "key.ember-overlay.copycoords", label: tr("Copy coordinates"), group: "Ember overlay", def: "key.keyboard.unknown" },
];

/** KeyboardEvent.code → Minecraft input name. */
const CODE_MAP: Record<string, string> = {
  Space: "space", Tab: "tab", Enter: "enter", Escape: "escape", Backspace: "backspace", CapsLock: "caps.lock",
  ShiftLeft: "left.shift", ShiftRight: "right.shift", ControlLeft: "left.control", ControlRight: "right.control",
  AltLeft: "left.alt", AltRight: "right.alt", MetaLeft: "left.win", MetaRight: "right.win",
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Backquote: "grave.accent", Minus: "minus", Equal: "equal", BracketLeft: "left.bracket", BracketRight: "right.bracket",
  Backslash: "backslash", Semicolon: "semicolon", Quote: "apostrophe", Comma: "comma", Period: "period", Slash: "slash",
  Insert: "insert", Delete: "delete", Home: "home", End: "end", PageUp: "page.up", PageDown: "page.down",
  NumpadAdd: "keypad.add", NumpadSubtract: "keypad.subtract", NumpadMultiply: "keypad.multiply", NumpadDivide: "keypad.divide",
  NumpadEnter: "keypad.enter", NumpadDecimal: "keypad.decimal",
};

export function codeToMc(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return `key.keyboard.${code.slice(3).toLowerCase()}`;
  if (/^Digit[0-9]$/.test(code)) return `key.keyboard.${code.slice(5)}`;
  if (/^F([1-9]|1[0-9]|2[0-5])$/.test(code)) return `key.keyboard.${code.toLowerCase()}`;
  if (/^Numpad[0-9]$/.test(code)) return `key.keyboard.keypad.${code.slice(6)}`;
  return CODE_MAP[code] ? `key.keyboard.${CODE_MAP[code]}` : null;
}

export function mouseToMc(button: number): string {
  return ["key.mouse.left", "key.mouse.middle", "key.mouse.right", "key.mouse.4", "key.mouse.5"][button] ?? `key.mouse.${button + 1}`;
}

/** "key.keyboard.left.shift" → "Left Shift". */
export function prettyKey(name: string | undefined): string {
  if (!name || name === "key.keyboard.unknown") return tr("Not bound");
  const m = name.match(/^key\.(keyboard|mouse)\.(.+)$/);
  if (!m) return name;
  const [, kind, rest] = m;
  if (kind === "mouse") return { left: tr("Left click"), right: tr("Right click"), middle: tr("Middle click") }[rest!] ?? tr("Mouse {rest}", { rest });
  return rest!
    .split(".")
    .map((w) => (w.length <= 3 && /^f\d+$|^\w$/.test(w) ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ")
    .replace("Keypad", "Numpad");
}
