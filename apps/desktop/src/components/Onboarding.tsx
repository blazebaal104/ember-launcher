import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Box, Folder, Globe2, Heart, Keyboard, Users } from "lucide-react";
import logo from "../assets/logo-glyph.svg";
import { useApp } from "../state";
import { api } from "../lib/ipc";
import { Button } from "./ui";

/**
 * First-run tour: seven animated explainers drawn with code (no video files), so they
 * always match the user's theme and accent.
 */
const SLIDES: Array<{ title: string; text: string; art: React.ComponentType }> = [
  { title: "Welcome to Ember", text: "A fast Minecraft launcher for 1.21 and newer. Here's a 30-second tour of what it does for you.", art: WelcomeArt },
  { title: "Every instance is its own world", text: "Each instance has its own mods, worlds, packs and settings in its own folder. Nothing ever clashes, and you can open any folder in one click.", art: InstancesArt },
  { title: "Faster, automatically", text: "New instances get a tuned performance stack (Sodium, Lithium, FerriteCore and more) picked for that exact Minecraft version. Most players see 2–3× more FPS.", art: FpsArt },
  { title: "Discover anything, install in one click", text: "Mods, shaders, resource packs, data packs, modpacks and plugins. Ember picks the right file for your instance and explains what each one does.", art: DiscoverArt },
  { title: "Moving to a new version?", text: "Drop your old mods folder into Transfer. Ember finds each mod's new build, or the closest replacement when a mod was abandoned.", art: TransferArt },
  { title: "A menu inside the game", text: "Press Right Shift in game for zoom, fullbright, keystrokes, coordinates, minimap and 50+ more tweaks, with no extra mods to hunt down.", art: OverlayArt },
  { title: "Play with friends anywhere", text: "Share your singleplayer world with a public address, or run a full server with plugins from the Servers page.", art: GlobeArt },
];

export function Onboarding() {
  const { tourOpen, setTourOpen, settings, setSettings } = useApp();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  useEffect(() => {
    if (tourOpen) setI(0);
  }, [tourOpen]);
  const finish = async () => {
    setTourOpen(false);
    if (settings && !settings.onboarded) setSettings(await api.saveSettings({ ...settings, onboarded: true }));
  };
  const go = (n: number) => {
    setDir(n > i ? 1 : -1);
    setI(n);
  };
  useEffect(() => {
    if (!tourOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") i < SLIDES.length - 1 ? go(i + 1) : finish();
      if (e.key === "ArrowLeft" && i > 0) go(i - 1);
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const slide = SLIDES[i]!;

  return (
    <AnimatePresence>
      {tourOpen && (
        <motion.div className="fixed inset-0 z-[70] grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
          <motion.div initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }} className="glass glass-strong relative w-[760px] max-w-full overflow-hidden rounded-panel" role="dialog" aria-label="Welcome tour">
            <div className="relative h-[300px] overflow-hidden border-b border-slate-line/60 bg-slate-base/40">
              <div className="block-grid absolute inset-0 opacity-60" />
              <AnimatePresence mode="wait" custom={dir}>
                <motion.div key={i} custom={dir} initial={{ opacity: 0, x: dir * 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -60 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="absolute inset-0 grid place-items-center">
                  {/* Rendered as a component (not called as a function): some illustrations use hooks. */}
                  <slide.art />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="p-8">
              <AnimatePresence mode="wait">
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                  <h2 className="font-pixel text-[30px] leading-tight">{slide.title}</h2>
                  <p className="mt-2 max-w-[60ch] text-[15px] text-muted">{slide.text}</p>
                </motion.div>
              </AnimatePresence>
              <div className="mt-8 flex items-center justify-between">
                <div className="flex gap-1.5">
                  {SLIDES.map((_, n) => (
                    <button key={n} type="button" aria-label={`Step ${n + 1}`} onClick={() => go(n)} className="h-2 rounded-full bg-slate-line transition-all" style={{ width: n === i ? 28 : 8, background: n === i ? "var(--accent)" : undefined }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={finish}>Skip</Button>
                  {i > 0 && <Button icon={ArrowLeft} onClick={() => go(i - 1)}>Back</Button>}
                  {i < SLIDES.length - 1 ? <Button variant="primary" onClick={() => go(i + 1)}>Next <ArrowRight className="size-4" /></Button> : <Button variant="primary" onClick={finish}>Let's play</Button>}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- animated illustrations

function WelcomeArt() {
  return (
    <div className="relative">
      <motion.div className="absolute inset-0 -m-16 rounded-full bg-copper/30 blur-3xl" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 3, repeat: Infinity }} />
      <motion.img src={logo} alt="" className="relative h-44" initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0, y: [0, -10, 0] }} transition={{ scale: { type: "spring" }, y: { duration: 3, repeat: Infinity, ease: "easeInOut" } }} />
      {[...Array(8)].map((_, n) => (
        <motion.span key={n} className="absolute size-2.5 bg-copper" style={{ left: "50%", top: "40%" }} animate={{ x: Math.cos((n / 8) * Math.PI * 2) * 140, y: Math.sin((n / 8) * Math.PI * 2) * 100, opacity: [0, 1, 0], rotate: 90 }} transition={{ duration: 2.4, repeat: Infinity, delay: n * 0.15 }} />
      ))}
    </div>
  );
}

function InstancesArt() {
  const items = ["Survival", "PvP", "Create"];
  return (
    <div className="flex gap-6">
      {items.map((name, n) => (
        <motion.div key={name} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 * n, type: "spring" }} className="flex flex-col items-center gap-3">
          <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.5, repeat: Infinity, delay: n * 0.4 }} className="glass grid size-28 place-items-center rounded-panel">
            <Folder className="size-12 text-copper" />
          </motion.div>
          <div className="flex gap-1">
            {[...Array(3)].map((_, k) => <motion.div key={k} className="size-6 rounded-[4px] bg-slate-raised" animate={{ scale: [0.8, 1, 0.8] }} transition={{ duration: 1.6, repeat: Infinity, delay: k * 0.2 + n * 0.3 }}><Box className="m-1 size-4 text-muted" /></motion.div>)}
          </div>
          <span className="text-[13px] font-medium">{name}</span>
        </motion.div>
      ))}
    </div>
  );
}

function FpsArt() {
  const [fps, setFps] = useState(58);
  useEffect(() => {
    let v = 58;
    const t = setInterval(() => {
      v = Math.min(240, v + Math.round(6 + Math.random() * 12));
      setFps(v);
      if (v >= 240) clearInterval(t);
    }, 60);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-end gap-10">
      <div className="text-center">
        <p className="font-pixel text-[64px] leading-none text-copper tabular-nums">{fps}</p>
        <p className="text-[13px] text-muted">FPS</p>
      </div>
      <div className="flex h-40 items-end gap-2">
        {[0.25, 0.4, 0.55, 0.7, 0.85, 1].map((h, n) => <motion.div key={n} className="w-8 rounded-t-[6px] bg-copper" initial={{ height: 6 }} animate={{ height: `${h * 100}%` }} transition={{ delay: 0.15 + n * 0.12, type: "spring", stiffness: 120 }} style={{ opacity: 0.4 + h * 0.6 }} />)}
      </div>
    </div>
  );
}

function DiscoverArt() {
  return (
    <div className="relative grid grid-cols-3 gap-3">
      {[...Array(6)].map((_, n) => (
        <motion.div key={n} initial={{ opacity: 0, scale: 0.6, rotate: -8 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: n * 0.1, type: "spring" }} className="glass flex w-36 items-center gap-2 rounded-card p-2.5">
          <div className="size-9 rounded-chip" style={{ background: `hsl(${n * 55 + 150} 50% 45%)` }} />
          <div className="flex-1 space-y-1"><div className="h-2 rounded bg-slate-line" /><div className="h-2 w-2/3 rounded bg-slate-line" /></div>
          {n === 1 && <motion.span animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.2 }}><Heart className="size-4 text-redstone" fill="currentColor" /></motion.span>}
        </motion.div>
      ))}
    </div>
  );
}

function TransferArt() {
  const rows = [["Ok Zoomer", "Zoomify"], ["OptiFine", "Sodium + Iris"], ["Mod Menu", "Mod Menu"]];
  return (
    <div className="flex flex-col gap-3">
      {rows.map(([a, b], n) => (
        <motion.div key={a} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: n * 0.3 }} className="flex items-center gap-4">
          <div className="glass w-36 rounded-card px-3 py-2 text-center text-[13px] text-muted line-through decoration-redstone/60">{a}</div>
          <motion.div className="h-0.5 w-20 origin-left bg-copper" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: n * 0.3 + 0.3, duration: 0.5 }} />
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: n * 0.3 + 0.7 }} className="w-40 rounded-card bg-copper/15 px-3 py-2 text-center text-[13px] font-medium text-copper ring-1 ring-copper/40">{b}</motion.div>
        </motion.div>
      ))}
    </div>
  );
}

function OverlayArt() {
  const keys = ["W", "A", "S", "D"];
  const [down, setDown] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDown((d) => (d + 1) % 4), 450);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative h-56 w-[440px] overflow-hidden rounded-panel border border-slate-line" style={{ background: "linear-gradient(#5aa0e6, #9fd0ff 55%, #5c8c3c 55%, #3f6b2a)" }}>
      <div className="absolute left-3 top-3 space-y-1 font-pixel text-[13px]">
        {["240 FPS", "X 128  Y 64  Z -42", "Plains"].map((t, n) => <motion.div key={t} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: n * 0.15 }} className="rounded bg-black/45 px-2 py-0.5 text-white">{t}</motion.div>)}
      </div>
      <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1">
        <span />
        <Key k="W" on={keys[down] === "W"} />
        <span />
        {["A", "S", "D"].map((k) => <Key key={k} k={k} on={keys[down] === k} />)}
      </div>
      <motion.div className="glass absolute right-3 top-3 w-40 rounded-card p-2.5 text-[12px]" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5 }}>
        <p className="mb-1 flex items-center gap-1 font-bold"><Keyboard className="size-3.5 text-copper" /> Right Shift</p>
        {["Zoom", "Fullbright", "Minimap"].map((f) => <p key={f} className="flex justify-between text-muted">{f}<span className="text-copper">On</span></p>)}
      </motion.div>
      <div className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-white" />
      <div className="absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 bg-white" />
    </div>
  );
}

function Key({ k, on }: { k: string; on: boolean }) {
  return <motion.span animate={{ backgroundColor: on ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.45)", color: on ? "#111" : "#fff" }} className="grid size-7 place-items-center rounded font-pixel text-[12px]">{k}</motion.span>;
}

function GlobeArt() {
  const dots = [[-110, -40], [90, -70], [120, 50], [-80, 70], [10, -100]];
  return (
    <div className="relative grid size-64 place-items-center">
      <motion.div className="absolute inset-0 rounded-full border-2 border-copper/40" animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} style={{ borderStyle: "dashed" }} />
      <Globe2 className="size-28 text-copper" />
      {dots.map(([x, y], n) => (
        <motion.div key={n} className="absolute grid size-9 place-items-center rounded-full bg-slate-raised ring-2 ring-copper" style={{ x, y }} initial={{ scale: 0 }} animate={{ scale: [0, 1.15, 1] }} transition={{ delay: 0.2 + n * 0.2 }}>
          <Users className="size-4 text-copper" />
        </motion.div>
      ))}
    </div>
  );
}
