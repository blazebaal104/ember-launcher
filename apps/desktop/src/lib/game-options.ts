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
  { key: "fov", label: "Field of view", group: "Video", kind: "slider", min: 30, max: 110, step: 1, unit: "°", def: "0.0", toUi: (r) => Math.round(70 + num(r, 0) * 40), fromUi: (v) => ((v - 70) / 40).toFixed(4), format: (v) => (v === 70 ? "Normal (70°)" : v === 110 ? "Quake Pro (110°)" : `${v}°`) },
  { key: "renderDistance", label: "Render distance", group: "Video", kind: "slider", min: 2, max: 32, step: 1, def: "12", toUi: (r) => num(r, 12), fromUi: String, format: (v) => `${v} chunks` },
  { key: "simulationDistance", label: "Simulation distance", group: "Video", kind: "slider", min: 5, max: 32, step: 1, def: "10", toUi: (r) => num(r, 10), fromUi: String, format: (v) => `${v} chunks` },
  { key: "maxFps", label: "Max framerate", group: "Video", kind: "slider", min: 10, max: 260, step: 10, def: "260", toUi: (r) => num(r, 260), fromUi: String, format: (v) => (v >= 260 ? "Unlimited" : `${v} fps`) },
  { key: "guiScale", label: "GUI scale", group: "Video", kind: "slider", min: 0, max: 6, step: 1, def: "0", toUi: (r) => num(r, 0), fromUi: String, format: (v) => (v === 0 ? "Auto" : `${v}×`) },
  { key: "gamma", label: "Brightness", group: "Video", kind: "slider", min: 0, max: 100, step: 5, def: "0.5", toUi: (r) => Math.round(num(r, 0.5) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => (v === 0 ? "Moody" : v === 100 ? "Bright" : `${v}%`) },
  { key: "particles", label: "Particles", group: "Video", kind: "choice", def: "0", choices: [{ value: "0", label: "All" }, { value: "1", label: "Decreased" }, { value: "2", label: "Minimal" }] },
  { key: "enableVsync", label: "VSync", group: "Video", kind: "toggle", def: "false", detail: "Caps FPS to your monitor; removes tearing but adds a little input delay." },
  { key: "fullscreen", label: "Start in fullscreen", group: "Video", kind: "toggle", def: "false" },
  { key: "bobView", label: "View bobbing", group: "Video", kind: "toggle", def: "true" },
  { key: "entityShadows", label: "Entity shadows", group: "Video", kind: "toggle", def: "true" },

  { key: "mouseSensitivity", label: "Mouse sensitivity", group: "Controls", kind: "slider", min: 0, max: 200, step: 1, def: "0.5", toUi: (r) => Math.round(num(r, 0.5) * 200), fromUi: (v) => (v / 200).toFixed(4), format: (v) => (v === 0 ? "Yawn" : v === 200 ? "Hyperspeed" : `${v}%`) },
  { key: "invertYMouse", label: "Invert mouse", group: "Controls", kind: "toggle", def: "false" },
  { key: "rawMouseInput", label: "Raw mouse input", group: "Controls", kind: "toggle", def: "true" },
  { key: "autoJump", label: "Auto-jump", group: "Controls", kind: "toggle", def: "false" },
  { key: "toggleCrouch", label: "Sneak mode: toggle", group: "Controls", kind: "toggle", def: "false" },
  { key: "toggleSprint", label: "Sprint mode: toggle", group: "Controls", kind: "toggle", def: "false" },

  { key: "soundCategory_master", label: "Master volume", group: "Sound", kind: "slider", min: 0, max: 100, step: 1, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },
  { key: "soundCategory_music", label: "Music", group: "Sound", kind: "slider", min: 0, max: 100, step: 1, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },
  { key: "soundCategory_hostile", label: "Hostile creatures", group: "Sound", kind: "slider", min: 0, max: 100, step: 1, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },
  { key: "soundCategory_player", label: "Players", group: "Sound", kind: "slider", min: 0, max: 100, step: 1, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },

  { key: "chatScale", label: "Chat text size", group: "Chat & accessibility", kind: "slider", min: 0, max: 100, step: 5, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },
  { key: "chatOpacity", label: "Chat opacity", group: "Chat & accessibility", kind: "slider", min: 10, max: 100, step: 5, def: "1.0", toUi: (r) => Math.round(num(r, 1) * 100), fromUi: (v) => (v / 100).toFixed(2), format: (v) => `${v}%` },
  { key: "darkMojangStudiosBackground", label: "Monochrome loading screen", group: "Chat & accessibility", kind: "toggle", def: "false" },
  { key: "hideLightningFlashes", label: "Hide lightning flashes", group: "Chat & accessibility", kind: "toggle", def: "false" },
  { key: "lang", label: "Language", group: "Chat & accessibility", kind: "choice", def: "en_us", choices: [["en_us", "English (US)"], ["en_gb", "English (UK)"], ["it_it", "Italiano"], ["es_es", "Español"], ["fr_fr", "Français"], ["de_de", "Deutsch"], ["pt_br", "Português (BR)"], ["pl_pl", "Polski"], ["nl_nl", "Nederlands"], ["ru_ru", "Русский"], ["ja_jp", "日本語"], ["zh_cn", "简体中文"]].map(([value, label]) => ({ value: value!, label: label! })) },
];

// ---------------------------------------------------------------- keybinds

export interface KeybindDef {
  id: string;
  label: string;
  group: "Movement" | "Gameplay" | "Inventory" | "Multiplayer" | "Misc" | "Hotbar" | "Ember overlay";
  def: string;
}

export const KEYBINDS: KeybindDef[] = [
  { id: "key.forward", label: "Walk forward", group: "Movement", def: "key.keyboard.w" },
  { id: "key.left", label: "Strafe left", group: "Movement", def: "key.keyboard.a" },
  { id: "key.back", label: "Walk backward", group: "Movement", def: "key.keyboard.s" },
  { id: "key.right", label: "Strafe right", group: "Movement", def: "key.keyboard.d" },
  { id: "key.jump", label: "Jump", group: "Movement", def: "key.keyboard.space" },
  { id: "key.sneak", label: "Sneak", group: "Movement", def: "key.keyboard.left.shift" },
  { id: "key.sprint", label: "Sprint", group: "Movement", def: "key.keyboard.left.control" },
  { id: "key.attack", label: "Attack / destroy", group: "Gameplay", def: "key.mouse.left" },
  { id: "key.use", label: "Use item / place block", group: "Gameplay", def: "key.mouse.right" },
  { id: "key.pickItem", label: "Pick block", group: "Gameplay", def: "key.mouse.middle" },
  { id: "key.inventory", label: "Open inventory", group: "Inventory", def: "key.keyboard.e" },
  { id: "key.drop", label: "Drop item", group: "Inventory", def: "key.keyboard.q" },
  { id: "key.swapOffhand", label: "Swap to off-hand", group: "Inventory", def: "key.keyboard.f" },
  { id: "key.chat", label: "Open chat", group: "Multiplayer", def: "key.keyboard.t" },
  { id: "key.command", label: "Open command", group: "Multiplayer", def: "key.keyboard.slash" },
  { id: "key.playerlist", label: "List players", group: "Multiplayer", def: "key.keyboard.tab" },
  { id: "key.screenshot", label: "Take screenshot", group: "Misc", def: "key.keyboard.f2" },
  { id: "key.togglePerspective", label: "Toggle perspective", group: "Misc", def: "key.keyboard.f5" },
  { id: "key.smoothCamera", label: "Cinematic camera", group: "Misc", def: "key.keyboard.unknown" },
  { id: "key.fullscreen", label: "Toggle fullscreen", group: "Misc", def: "key.keyboard.f11" },
  { id: "key.advancements", label: "Advancements", group: "Misc", def: "key.keyboard.l" },
  ...Array.from({ length: 9 }, (_, i) => ({ id: `key.hotbar.${i + 1}`, label: `Hotbar slot ${i + 1}`, group: "Hotbar" as const, def: `key.keyboard.${i + 1}` })),
  { id: "key.ember-overlay.menu", label: "Open Ember menu", group: "Ember overlay", def: "key.keyboard.right.shift" },
  { id: "key.ember-overlay.zoom", label: "Zoom", group: "Ember overlay", def: "key.keyboard.c" },
  { id: "key.ember-overlay.freelook", label: "Free look", group: "Ember overlay", def: "key.keyboard.left.alt" },
  { id: "key.ember-overlay.snaplook", label: "Snap look behind", group: "Ember overlay", def: "key.keyboard.unknown" },
  { id: "key.ember-overlay.copycoords", label: "Copy coordinates", group: "Ember overlay", def: "key.keyboard.unknown" },
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
  if (!name || name === "key.keyboard.unknown") return "Not bound";
  const m = name.match(/^key\.(keyboard|mouse)\.(.+)$/);
  if (!m) return name;
  const [, kind, rest] = m;
  if (kind === "mouse") return { left: "Left click", right: "Right click", middle: "Middle click" }[rest!] ?? `Mouse ${rest}`;
  return rest!
    .split(".")
    .map((w) => (w.length <= 3 && /^f\d+$|^\w$/.test(w) ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ")
    .replace("Keypad", "Numpad");
}
