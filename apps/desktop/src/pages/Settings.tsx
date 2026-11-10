import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { checkForUpdates } from "../components/UpdateDialog";
import { Check, Cpu, ExternalLink, Gamepad2, Info, Paintbrush, RefreshCw, Rocket, Sparkles, User } from "lucide-react";
import { useApp } from "../state";
import { ACCENTS, THEMES, transitionProps, type Backdrop } from "../lib/appearance";
import { api } from "../lib/ipc";
import { useProfiles, useSystemInfo } from "../lib/queries";
import { open } from "../lib/links";
import { Button, Field, Glass, Segmented, Slider, Tabs, Toggle, inputClass } from "../components/ui";
import { ProfilesSection } from "../components/settings/ProfilesSection";
import { AccountSection } from "../components/settings/AccountSection";
import logo from "../assets/logo-glyph.svg";

type Tab = "appearance" | "launcher" | "profiles" | "account" | "about";

export function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "appearance";
  const { appearance } = useApp();
  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-2">
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 text-[30px] font-bold tracking-tight">Settings</motion.h1>
      <Tabs<Tab>
        className="glass mb-5 rounded-panel p-1.5"
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { id: "appearance", label: "Appearance", icon: Paintbrush },
          { id: "launcher", label: "Launcher", icon: Rocket },
          { id: "profiles", label: "Game profiles", icon: Gamepad2 },
          { id: "account", label: "Account", icon: User },
          { id: "about", label: "About", icon: Info },
        ]}
      />
      <AnimatePresence mode="wait">
        <motion.div key={tab} {...transitionProps(appearance, "tab")}>
          {tab === "appearance" && <AppearanceSection />}
          {tab === "launcher" && <LauncherSection />}
          {tab === "profiles" && <ProfilesSection />}
          {tab === "account" && <Glass className="p-6"><AccountSection /></Glass>}
          {tab === "about" && <AboutSection />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Glass className={`flex flex-col gap-4 p-5 ${className}`}>
      <h2 className="text-[16px] font-bold">{title}</h2>
      {children}
    </Glass>
  );
}

function AppearanceSection() {
  const { appearance: a, setAppearance: set } = useApp();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Theme" className="md:col-span-2">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {THEMES.map((t) => (
            <motion.button key={t.id} type="button" whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => set({ theme: t.id })} className={`relative overflow-hidden rounded-card border-2 text-left ${a.theme === t.id ? "border-copper" : "border-slate-line hover:border-muted"}`}>
              {/* live mini-preview of the theme */}
              <div className="h-24 p-2" style={{ background: t.swatch[0] }}>
                <div className="flex h-full gap-1.5">
                  <div className="w-1/4 rounded-[5px]" style={{ background: t.swatch[1] }} />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="h-1/2 rounded-[5px]" style={{ background: t.swatch[1] }} />
                    <div className="flex flex-1 gap-1.5"><div className="flex-1 rounded-[5px]" style={{ background: t.swatch[1] }} /><div className="w-1/3 rounded-[5px]" style={{ background: a.accent }} /></div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between bg-slate-raised px-3 py-2 text-[13px] font-medium">
                {t.name}
                {a.theme === t.id && <Check className="size-4 text-copper" />}
              </div>
            </motion.button>
          ))}
        </div>
      </Card>

      <Card title="Accent colour">
        <div className="flex flex-wrap gap-2.5">
          {ACCENTS.map((c) => (
            <motion.button key={c.value} type="button" whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={() => set({ accent: c.value })} title={c.name} aria-label={c.name} className="relative size-10 rounded-full shadow-lg" style={{ background: c.value, boxShadow: a.accent === c.value ? `0 0 0 3px var(--base), 0 0 0 5px ${c.value}` : undefined }}>
              {a.accent === c.value && <Check className="absolute inset-0 m-auto size-5" style={{ color: "var(--on-accent)" }} />}
            </motion.button>
          ))}
          <label className="press relative grid size-10 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-slate-line text-muted hover:border-copper" title="Custom colour">
            <Paintbrush className="size-4" />
            <input type="color" value={a.accent} onChange={(e) => set({ accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
        <p className="text-[13px] text-muted">Named after Minecraft materials. The custom picker takes any colour.</p>
      </Card>

      <Card title="Liquid glass">
        <Toggle checked={a.glass} onChange={(v) => set({ glass: v })} label="Glass panels" detail="Frosted, see-through panels over the animated background." />
        <Slider label="Glass strength" value={Math.round(a.glassStrength * 100)} onChange={(v) => set({ glassStrength: v / 100 })} min={0} max={100} format={(v) => (v < 30 ? "Subtle" : v > 70 ? "Very glassy" : "Balanced")} />
      </Card>

      <Card title="Background">
        <div className="grid grid-cols-2 gap-2">
          {(["aurora", "embers", "nebula", "grid", "solid"] as Backdrop[]).map((b) => (
            <button key={b} type="button" onClick={() => set({ backdrop: b })} className={`press rounded-card border px-3 py-3 text-left text-[14px] ${a.backdrop === b ? "border-copper bg-copper/10" : "border-slate-line hover:border-muted"}`}>
              {b === "aurora" ? "Aurora + embers (animated)" : b === "embers" ? "Rising embers (animated)" : b === "nebula" ? "Nebula" : b === "grid" ? "Block grid" : "Solid"}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Motion">
        <Segmented value={a.motion} onChange={(v) => set({ motion: v })} options={[{ id: "full", label: "Full" }, { id: "reduced", label: "Reduced" }, { id: "off", label: "Off" }]} />
        <div>
          <p className="mb-2 text-[14px] font-medium">Page & tab transition</p>
          <Segmented value={a.transition} onChange={(v) => set({ transition: v })} options={[{ id: "slide", label: "Slide" }, { id: "fade", label: "Fade" }, { id: "zoom", label: "Zoom" }, { id: "none", label: "None" }]} />
        </div>
        <div>
          <p className="mb-2 text-[14px] font-medium">Transition speed</p>
          <Segmented value={a.transitionSpeed} onChange={(v) => set({ transitionSpeed: v })} options={[{ id: "instant", label: "Instant" }, { id: "fast", label: "Fast" }, { id: "normal", label: "Normal" }, { id: "smooth", label: "Smooth" }]} />
        </div>
        <Slider label="Other animations" value={a.motionSpeed} onChange={(v) => set({ motionSpeed: v })} min={0.5} max={2} step={0.1} format={(v) => (v < 0.9 ? "Relaxed" : v > 1.2 ? "Snappy" : "Normal")} />
        <Toggle checked={a.sounds} onChange={(v) => set({ sounds: v })} label="Interface sounds" detail="Soft clicks and chimes." />
      </Card>

      <Card title="Layout & text">
        <Slider label="Corner roundness" value={a.radius} onChange={(v) => set({ radius: v })} min={2} max={22} format={(v) => `${v}px`} />
        <Slider label="Text size" value={Math.round(a.textScale * 100)} onChange={(v) => set({ textScale: v / 100 })} min={90} max={120} step={5} format={(v) => `${v}%`} />
        <Toggle checked={a.sidebarCollapsed} onChange={(v) => set({ sidebarCollapsed: v })} label="Compact sidebar" />
        <Toggle checked={a.showSnapshots} onChange={(v) => set({ showSnapshots: v })} label="Show snapshots by default" detail="When creating instances." />
      </Card>
    </div>
  );
}

function LauncherSection() {
  const { settings, setSettings, toast } = useApp();
  const sys = useSystemInfo();
  const profiles = useProfiles();
  const [memory, setMemory] = useState(settings?.defaultMemoryMb ?? 4096);
  const [jvm, setJvm] = useState((settings?.defaultJvmArgs ?? []).join(" "));
  useEffect(() => {
    if (settings) {
      setMemory(settings.defaultMemoryMb ?? 4096);
      setJvm((settings.defaultJvmArgs ?? []).join(" "));
    }
  }, [settings?.defaultMemoryMb]);
  const maxMem = Math.max(2048, Math.min(32768, Math.floor(((sys.data?.totalMemoryMb ?? 8192) * 0.75) / 512) * 512));
  const save = async (patch: Partial<NonNullable<typeof settings>>) => {
    if (!settings) return;
    setSettings(await api.saveSettings({ ...settings, ...patch }));
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="When a game starts">
        <Segmented value={(settings?.onLaunch ?? "keep") as "keep" | "minimize" | "close"} onChange={(v) => save({ onLaunch: v })} options={[{ id: "keep", label: "Keep open" }, { id: "minimize", label: "Minimize" }, { id: "close", label: "Close" }]} />
        <p className="text-[13px] text-muted">Minimize is handy: Ember comes back when you quit the game.</p>
      </Card>
      <Card title="New instances">
        <Slider label="Default memory" value={memory} onChange={setMemory} min={1024} max={maxMem} step={512} format={(v) => `${(v / 1024).toFixed(1)} GB`} detail={sys.data ? `This PC has ${(sys.data.totalMemoryMb / 1024).toFixed(0)} GB of RAM.` : undefined} />
        <Field label="Default game settings profile">
          <select value={profiles.data?.defaultProfile ?? ""} onChange={async (e) => api.setDefaultProfile(e.target.value || null)} className={inputClass}>
            <option value="">None</option>
            {(profiles.data?.profiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div><Button variant="primary" onClick={() => save({ defaultMemoryMb: memory }).then(() => toast({ title: "Saved", tone: "success" }))}>Save</Button></div>
      </Card>
      <Card title="Java" className="md:col-span-2">
        <p className="text-[13px] text-muted"><Cpu className="mr-1 inline size-4 text-copper" /> Ember downloads the exact Java each Minecraft version needs (21 for 1.21.x, 25 for 26.x). You never have to install Java yourself.</p>
        <Field label="Extra Java arguments for every instance" hint="Advanced. Leave empty unless you know you need something.">
          <input value={jvm} onChange={(e) => setJvm(e.target.value)} placeholder="-XX:+UseZGC -XX:+ZGenerational" className={`${inputClass} font-[ui-monospace,monospace]`} />
        </Field>
        <div><Button onClick={() => save({ defaultJvmArgs: jvm.split(/\s+/).filter(Boolean) }).then(() => toast({ title: "Saved", tone: "success" }))}>Save Java arguments</Button></div>
      </Card>
    </div>
  );
}

function AboutSection() {
  const { setTourOpen } = useApp();
  const ver = useQuery({ queryKey: ["appVersion"], queryFn: api.appVersion, staleTime: Infinity });
  return (
    <Glass className="flex flex-col items-center gap-4 p-10 text-center">
      <motion.img src={logo} alt="" className="h-28 drop-shadow-[0_0_30px_var(--accent)]" animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
      <h2 className="font-pixel text-[40px] leading-none">Ember</h2>
      <p className="text-muted">Version {ver.data ? `${ver.data.version}${ver.data.build ? ` (build ${ver.data.build})` : ""}` : "…"} · Minecraft 1.21 and newer</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" icon={RefreshCw} onClick={checkForUpdates}>Check for updates</Button>
        <Button icon={Sparkles} onClick={() => setTourOpen(true)}>Show the tour again</Button>
        <Button icon={ExternalLink} onClick={() => open("https://github.com/blazebaal104/ember-launcher")}>Source code</Button>
      </div>
      <p className="max-w-[60ch] text-[13px] text-muted">Not affiliated with Mojang or Microsoft. Content comes from Modrinth and CurseForge and belongs to its authors.</p>
    </Glass>
  );
}
