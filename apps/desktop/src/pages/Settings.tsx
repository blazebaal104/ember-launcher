import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { checkForUpdates } from "../components/UpdateDialog";
import { Check, Cpu, ExternalLink, Gamepad2, Info, Paintbrush, RefreshCw, Rocket, Sparkles } from "lucide-react";
import { useApp } from "../state";
import { ACCENTS, THEMES, transitionProps, type Backdrop } from "../lib/appearance";
import { api } from "../lib/ipc";
import { useProfiles, useSystemInfo } from "../lib/queries";
import { open } from "../lib/links";
import { LanguageSetting } from "../components/LanguagePicker";
import { Button, Field, Glass, Segmented, Slider, Tabs, Toggle, inputClass } from "../components/ui";
import { ProfilesSection } from "../components/settings/ProfilesSection";
import logo from "../assets/logo-glyph.svg";
import { tr } from "../lib/i18n";

type Tab = "appearance" | "launcher" | "profiles" | "about";

export function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "appearance";
  const { appearance } = useApp();
  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-2">
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 text-[30px] font-bold tracking-tight">{tr("Settings")}</motion.h1>
      <Tabs<Tab>
        className="glass mb-5 rounded-panel p-1.5"
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { id: "appearance", label: tr("Appearance"), icon: Paintbrush },
          { id: "launcher", label: tr("Launcher"), icon: Rocket },
          { id: "profiles", label: tr("Game profiles"), icon: Gamepad2 },
          { id: "about", label: tr("About"), icon: Info },
        ]}
      />
      <AnimatePresence mode="wait">
        <motion.div key={tab} {...transitionProps(appearance, "tab")}>
          {tab === "appearance" && <AppearanceSection />}
          {tab === "launcher" && <LauncherSection />}
          {tab === "profiles" && <ProfilesSection />}
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
      <Card title={tr("Theme")} className="md:col-span-2">
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
                {tr(t.name)}
                {a.theme === t.id && <Check className="size-4 text-copper" />}
              </div>
            </motion.button>
          ))}
        </div>
      </Card>

      <Card title={tr("Accent colour")}>
        <div className="flex flex-wrap gap-2.5">
          {ACCENTS.map((c) => (
            <motion.button key={c.value} type="button" whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={() => set({ accent: c.value })} title={tr(c.name)} aria-label={tr(c.name)} className="relative size-10 rounded-full shadow-lg" style={{ background: c.value, boxShadow: a.accent === c.value ? `0 0 0 3px var(--base), 0 0 0 5px ${c.value}` : undefined }}>
              {a.accent === c.value && <Check className="absolute inset-0 m-auto size-5" style={{ color: "var(--on-accent)" }} />}
            </motion.button>
          ))}
          <label className="press relative grid size-10 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-slate-line text-muted hover:border-copper" title={tr("Custom colour")}>
            <Paintbrush className="size-4" />
            <input type="color" value={a.accent} onChange={(e) => set({ accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
        <p className="text-[13px] text-muted">{tr("Named after Minecraft materials. The custom picker takes any colour.")}</p>
      </Card>

      <Card title={tr("Liquid glass")}>
        <Toggle checked={a.glass} onChange={(v) => set({ glass: v })} label={tr("Glass panels")} detail={tr("Frosted, see-through panels over the animated background.")} />
        <Slider label={tr("Glass strength")} value={Math.round(a.glassStrength * 100)} onChange={(v) => set({ glassStrength: v / 100 })} min={0} max={100} format={(v) => (v < 30 ? tr("Subtle") : v > 70 ? tr("Very glassy") : tr("Balanced"))} />
      </Card>

      <Card title={tr("Background")}>
        <div className="grid grid-cols-2 gap-2">
          {(["aurora", "embers", "nebula", "grid", "solid"] as Backdrop[]).map((b) => (
            <button key={b} type="button" onClick={() => set({ backdrop: b })} className={`press rounded-card border px-3 py-3 text-left text-[14px] ${a.backdrop === b ? "border-copper bg-copper/10" : "border-slate-line hover:border-muted"}`}>
              {b === "aurora" ? tr("Aurora + embers (animated)") : b === "embers" ? tr("Rising embers (animated)") : b === "nebula" ? tr("Nebula") : b === "grid" ? tr("Block grid") : tr("Solid")}
            </button>
          ))}
        </div>
      </Card>

      <Card title={tr("Motion")}>
        <Segmented value={a.motion} onChange={(v) => set({ motion: v })} options={[{ id: "full", label: tr("Full") }, { id: "reduced", label: tr("Reduced") }, { id: "off", label: tr("Off") }]} />
        <div>
          <p className="mb-2 text-[14px] font-medium">{tr("Page & tab transition")}</p>
          <Segmented value={a.transition} onChange={(v) => set({ transition: v })} options={[{ id: "slide", label: tr("Slide") }, { id: "fade", label: tr("Fade") }, { id: "zoom", label: tr("Zoom") }, { id: "none", label: tr("None") }]} />
        </div>
        <div>
          <p className="mb-2 text-[14px] font-medium">{tr("Transition speed")}</p>
          <Segmented value={a.transitionSpeed} onChange={(v) => set({ transitionSpeed: v })} options={[{ id: "instant", label: tr("Instant") }, { id: "fast", label: tr("Fast") }, { id: "normal", label: tr("Normal") }, { id: "smooth", label: tr("Smooth") }]} />
        </div>
        <Slider label={tr("Other animations")} value={a.motionSpeed} onChange={(v) => set({ motionSpeed: v })} min={0.5} max={2} step={0.1} format={(v) => (v < 0.9 ? tr("Relaxed") : v > 1.2 ? tr("Snappy") : tr("Normal"))} />
        <Toggle checked={a.sounds} onChange={(v) => set({ sounds: v })} label={tr("Interface sounds")} detail={tr("Soft clicks and chimes.")} />
      </Card>

      <Card title={tr("Layout & text")}>
        <Slider label={tr("Corner roundness")} value={a.radius} onChange={(v) => set({ radius: v })} min={2} max={22} format={(v) => `${v}px`} />
        <Slider label={tr("Text size")} value={Math.round(a.textScale * 100)} onChange={(v) => set({ textScale: v / 100 })} min={90} max={120} step={5} format={(v) => `${v}%`} />
        <Toggle checked={a.sidebarCollapsed} onChange={(v) => set({ sidebarCollapsed: v })} label={tr("Compact sidebar")} />
        <Toggle checked={a.showSnapshots} onChange={(v) => set({ showSnapshots: v })} label={tr("Show snapshots by default")} detail={tr("When creating instances.")} />
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
      <Card title={tr("Language")} className="md:col-span-2">
        <LanguageSetting />
      </Card>
      <Card title={tr("When a game starts")}>
        <Segmented value={(settings?.onLaunch ?? "keep") as "keep" | "minimize" | "close"} onChange={(v) => save({ onLaunch: v })} options={[{ id: "keep", label: tr("Keep open") }, { id: "minimize", label: tr("Minimize") }, { id: "close", label: tr("Close") }]} />
        <p className="text-[13px] text-muted">{tr("Minimize is handy: Ember comes back when you quit the game.")}</p>
      </Card>
      <Card title={tr("New instances")}>
        <Slider label={tr("Default memory")} value={memory} onChange={setMemory} min={1024} max={maxMem} step={512} format={(v) => `${(v / 1024).toFixed(1)} GB`} detail={sys.data ? tr("This PC has {n0} GB of RAM.", { n0: (sys.data.totalMemoryMb / 1024).toFixed(0) }) : undefined} />
        <Field label={tr("Default game settings profile")}>
          <select value={profiles.data?.defaultProfile ?? ""} onChange={async (e) => api.setDefaultProfile(e.target.value || null)} className={inputClass}>
            <option value="">{tr("None")}</option>
            {(profiles.data?.profiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div><Button variant="primary" onClick={() => save({ defaultMemoryMb: memory }).then(() => toast({ title: tr("Saved"), tone: "success" }))}>{tr("Save")}</Button></div>
      </Card>
      <Card title={tr("Java")} className="md:col-span-2">
        <p className="text-[13px] text-muted"><Cpu className="mr-1 inline size-4 text-copper" /> {tr("Ember downloads the exact Java each Minecraft version needs (21 for 1.21.x, 25 for 26.x). You never have to install Java yourself.")}</p>
        <Field label={tr("Extra Java arguments for every instance")} hint={tr("Advanced. Leave empty unless you know you need something.")}>
          <input value={jvm} onChange={(e) => setJvm(e.target.value)} placeholder={tr("-XX:+UseZGC -XX:+ZGenerational")} className={`${inputClass} font-[ui-monospace,monospace]`} />
        </Field>
        <div><Button onClick={() => save({ defaultJvmArgs: jvm.split(/\s+/).filter(Boolean) }).then(() => toast({ title: tr("Saved"), tone: "success" }))}>{tr("Save Java arguments")}</Button></div>
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
      <h2 className="font-pixel text-[40px] leading-none">{tr("Ember")}</h2>
      <p className="text-muted">{tr("Version")} {ver.data ? `${ver.data.version}${ver.data.build ? ` (build ${ver.data.build})` : ""}` : "…"} {tr("· Minecraft 1.21 and newer")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" icon={RefreshCw} onClick={checkForUpdates}>{tr("Check for updates")}</Button>
        <Button icon={Sparkles} onClick={() => setTourOpen(true)}>{tr("Show the tour again")}</Button>
        <Button icon={ExternalLink} onClick={() => open("https://github.com/blazebaal104/ember-launcher")}>{tr("Source code")}</Button>
      </div>
      <div className="w-full max-w-[420px]"><LanguageSetting /></div>
      <p className="max-w-[60ch] text-[13px] text-muted">{tr("Not affiliated with Mojang or Microsoft. Content comes from Modrinth and CurseForge and belongs to its authors.")}</p>
    </Glass>
  );
}
