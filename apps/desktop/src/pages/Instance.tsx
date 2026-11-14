import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ArrowUpCircle, BookOpen, Box, Camera, Clock, Compass, FilePlus2, FolderOpen, Gauge, Layers3, Play, Plus, X, Globe2, Image, Layers, Package, Save, ScrollText, Search, Settings2, Sparkles, Star, Trash2 } from "lucide-react";
import { mrToResolved } from "@ember/content-engine";
import { useApp } from "../state";
import { transitionProps } from "../lib/appearance";
import { api, fileSrc, inTauri, type ContentFile, type Instance as Inst, type World, type WorldPack } from "../lib/ipc";
import { modrinth } from "../lib/clients";
import { ago, loaderName } from "../lib/format";
import { useContent, useProfiles, useSystemInfo, useWorldPacks } from "../lib/queries";
import { applyWorldPack, summarise } from "../lib/worldpacks";
import { installProject } from "../lib/install";
import { Badge, Button, Empty, Field, Glass, IconButton, Modal, Skeleton, Slider, Switch, Tabs, Toggle, inputClass } from "../components/ui";
import { AddContentPanel } from "../components/AddContentPanel";
import { Console } from "../components/Console";
import { PlayButton, instanceGradient, playTime } from "./Home";
import { locale, tr, trn } from "../lib/i18n";

type Tab = "overview" | "content" | "worlds" | "screenshots" | "settings" | "logs";

export function InstancePage() {
  const { id } = useParams();
  const { instances, appearance } = useApp();
  const inst = instances.find((i) => i.id === id);
  const [tab, setTab] = useState<Tab>("overview");
  if (!inst) return <div className="p-10"><Empty icon={Box} title={tr("Instance not found")}>{tr("It may have been deleted.")}</Empty></div>;
  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-2">
      <Header inst={inst} />
      <Tabs<Tab>
        className="glass mb-5 rounded-panel p-1.5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: tr("Overview"), icon: Gauge },
          { id: "content", label: tr("Mods"), icon: Layers },
          { id: "worlds", label: tr("Worlds"), icon: Globe2 },
          { id: "screenshots", label: tr("Screenshots"), icon: Camera },
          { id: "settings", label: tr("Settings"), icon: Settings2 },
          { id: "logs", label: tr("Logs"), icon: ScrollText },
        ]}
      />
      <AnimatePresence mode="wait">
        <motion.div key={tab} {...transitionProps(appearance, "tab")}>
          {tab === "overview" && <Overview inst={inst} go={setTab} />}
          {tab === "content" && <Content inst={inst} />}
          {tab === "worlds" && <Worlds inst={inst} />}
          {tab === "screenshots" && <Screenshots inst={inst} />}
          {tab === "settings" && <InstanceSettings inst={inst} />}
          {tab === "logs" && <Glass className="h-[60vh] p-4"><Console logKey={`game:${inst.id}`} /></Glass>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Header({ inst }: { inst: Inst }) {
  const { refresh } = useApp();
  const toggleFav = async () => {
    await api.updateInstance(inst.id, { favorite: !inst.favorite });
    refresh();
  };
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass relative mb-4 overflow-hidden rounded-panel">
      <div className="absolute inset-0 opacity-50" style={{ background: instanceGradient(inst.name) }} />
      {inst.icon && <img src={inst.icon} alt="" className="absolute inset-0 size-full object-cover opacity-25 blur-sm" />}
      <div className="block-grid absolute inset-0 opacity-40" />
      <div className="relative flex flex-wrap items-end justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center overflow-hidden rounded-panel bg-black/30 text-[26px] font-bold text-white">
            {inst.icon ? <img src={inst.icon} alt="" className="size-full object-cover" /> : inst.name.slice(0, 1)}
          </div>
          <div>
            <h1 className="font-pixel text-[38px] leading-none text-white">{inst.name}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>{tr("Minecraft {gameVersion}", { gameVersion: inst.gameVersion })}</Badge>
              <Badge>{loaderName[inst.loader]}{inst.loaderVersion ? ` ${inst.loaderVersion}` : ""}</Badge>
              {inst.source?.title && <Badge tone="gold"><Package className="size-3" /> {inst.source.title}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconButton icon={Star} label={inst.favorite ? tr("Unpin") : tr("Pin to top")} active={inst.favorite} onClick={toggleFav} className="bg-black/20 text-white" />
          <IconButton icon={FolderOpen} label={tr("Open folder")} onClick={() => api.openFolder(inst.id)} className="bg-black/20 text-white" />
          <PlayButton instance={inst} big />
        </div>
      </div>
    </motion.section>
  );
}

function Overview({ inst, go }: { inst: Inst; go: (t: Tab) => void }) {
  const mods = useContent(inst.id, "mods");
  const profiles = useProfiles();
  const profile = profiles.data?.profiles.find((p) => p.id === inst.gameProfile);
  const stats = [
    { label: tr("Played"), value: playTime(inst.playMinutes), icon: Clock },
    { label: tr("Last played"), value: ago(inst.lastPlayed), icon: Sparkles },
    { label: tr("Mods"), value: mods.data ? tr("{n} active", { n: mods.data.filter((m) => m.enabled).length }) : "…", icon: Layers },
    { label: tr("Memory"), value: `${(inst.memoryMb / 1024).toFixed(1)} GB`, icon: Gauge },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="grid grid-cols-2 gap-3 md:col-span-2">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass rounded-panel p-4">
            <s.icon className="size-4 text-copper" />
            <p className="mt-2 text-[22px] font-bold">{s.value}</p>
            <p className="text-[13px] text-muted">{s.label}</p>
          </motion.div>
        ))}
      </div>
      <Glass className="flex flex-col gap-3 p-5">
        <h3 className="text-[15px] font-bold">{tr("Game settings")}</h3>
        <p className="text-[13px] text-muted">{profile ? <>{trn(tr("Uses the {b} profile: your keybinds, FOV and video settings are applied"), { b: <b className="text-text">{profile.name}</b> })} {inst.profileEveryLaunch ? tr("every launch") : tr("on first launch")}.</> : tr("No settings profile. The game starts with Minecraft's defaults.")}</p>
        <Button size="sm" onClick={() => go("settings")}>{tr("Change")}</Button>
        <h3 className="mt-2 text-[15px] font-bold">{tr("In-game menu")}</h3>
        <p className="text-[13px] text-muted">{inst.overlay && (inst.loader === "fabric" || inst.loader === "quilt") ? tr("Press Right Shift in game for HUD, zoom, fullbright and 50+ more tweaks.") : tr("Available on Fabric and Quilt instances.")}</p>
      </Glass>
    </div>
  );
}

// ---------------------------------------------------------------- content

const DIRS = [
  { id: "mods", label: tr("Mods"), icon: Box },
  { id: "resourcepacks", label: tr("Resource packs"), icon: Image },
  { id: "shaderpacks", label: tr("Shaders"), icon: Sparkles },
] as const;
type Dir = (typeof DIRS)[number]["id"];

function Content({ inst }: { inst: Inst }) {
  const [dir, setDir] = useState<Dir>("mods");
  const q = useContent(inst.id, dir);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast, openProject } = useApp();
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const category = dir === "mods" ? "mods" : dir === "shaderpacks" ? "shaders" : "resourcepacks";
  const [updates, setUpdates] = useState<Record<string, { versionId: string; number: string; file: ReturnType<typeof mrToResolved> }> | null>(null);
  const [checking, setChecking] = useState(false);
  const list = (q.data ?? []).filter((f) => !filter || `${f.name ?? ""} ${f.fileName} ${f.description ?? ""}`.toLowerCase().includes(filter.toLowerCase()));
  const reload = () => qc.invalidateQueries({ queryKey: ["content", inst.id] });

  const toggle = async (f: ContentFile) => {
    await api.setContentEnabled(inst.id, dir, f.fileName, !f.enabled);
    reload();
  };
  const remove = async (f: ContentFile) => {
    await api.deleteContent(inst.id, dir, f.fileName);
    toast({ title: tr("Removed {n0}", { n0: f.name ?? f.fileName }), tone: "info" });
    reload();
  };
  /** Find the file on Modrinth by hash and open its explanation. */
  const explain = async (f: ContentFile) => {
    try {
      const byHash = await modrinth.versionsFromHashes([f.sha1]);
      const v = byHash[f.sha1];
      if (!v) return toast({ title: tr("Not on Modrinth"), body: f.description ?? tr("This file isn't listed on Modrinth, so there's no page to show."), tone: "info" });
      const p = await modrinth.project(v.project_id);
      if (p) openProject({ source: "modrinth", id: p.id, slug: p.slug, title: p.title, description: p.description, iconUrl: p.icon_url ?? undefined, downloads: p.downloads, follows: p.followers, category: dir === "mods" ? "mods" : dir === "shaderpacks" ? "shaders" : "resourcepacks" });
    } catch (e) {
      toast({ title: tr("Couldn't look it up"), body: String(e), tone: "error" });
    }
  };
  const checkUpdates = async () => {
    setChecking(true);
    try {
      const enabled = (q.data ?? []).filter((f) => f.enabled && f.sha1);
      const loaders = dir === "mods" ? (inst.loader === "quilt" ? ["quilt", "fabric"] : [inst.loader]) : dir === "shaderpacks" ? ["iris", "optifine"] : ["minecraft"];
      const latest = await modrinth.latestVersionsFromHashes(enabled.map((f) => f.sha1), loaders, [inst.gameVersion]);
      const found: NonNullable<typeof updates> = {};
      for (const f of enabled) {
        const v = latest[f.sha1];
        if (v && !v.files.some((x) => x.hashes.sha1 === f.sha1)) found[f.fileName] = { versionId: v.id, number: v.version_number, file: mrToResolved(v, f.name ?? f.fileName) };
      }
      setUpdates(found);
      toast({ title: Object.keys(found).length ? tr("{length} updates available", { length: Object.keys(found).length }) : tr("Everything is up to date"), tone: Object.keys(found).length ? "info" : "success" });
    } finally {
      setChecking(false);
    }
  };
  const applyUpdates = async () => {
    if (!updates) return;
    for (const [oldName, u] of Object.entries(updates)) {
      await api.installFiles(inst.id, [u.file], dir);
      if (u.file.fileName !== oldName) await api.deleteContent(inst.id, dir, oldName);
    }
    toast({ title: tr("Updated {length} files", { length: Object.keys(updates).length }), tone: "success" });
    setUpdates(null);
    reload();
  };
  const addFiles = async () => {
    if (!inTauri) return;
    const picked = await openDialog({ multiple: true, filters: [{ name: dir === "mods" ? "Mods" : "Packs", extensions: dir === "mods" ? ["jar"] : ["zip"] }] });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (!paths.length) return;
    const n = await api.importContent(inst.id, dir, paths as string[]);
    toast({ title: tr("Added {n} file{n1}", { n, n1: n === 1 ? "" : "s" }), tone: "success" });
    reload();
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs<Dir> value={dir} onChange={(d) => { setDir(d); setUpdates(null); }} tabs={DIRS.map((d) => ({ ...d, count: d.id === dir ? q.data?.length : undefined }))} />
        <Button variant="primary" className="ml-auto" icon={adding ? X : Plus} onClick={() => setAdding((a) => !a)}>{adding ? tr("Done adding") : tr("Add {n0}", { n0: DIRS.find((d) => d.id === dir)!.label.toLowerCase() })}</Button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tr("Filter installed {n0}", { n0: DIRS.find((d) => d.id === dir)!.label.toLowerCase() })} className={`${inputClass} pl-9`} />
        </div>
        <Button icon={ArrowUpCircle} loading={checking} onClick={checkUpdates}>{tr("Check updates")}</Button>
        <Button icon={FilePlus2} onClick={addFiles}>{tr("Add files")}</Button>
        <PackButton inst={inst} />
        <Button icon={Compass} onClick={() => navigate(`/discover/${category}?instance=${inst.id}`)}>{tr("Browse all")}</Button>
      </div>
      <AnimatePresence initial={false}>
        {adding && <AddContentPanel key={dir} inst={inst} category={category} onClose={() => setAdding(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {updates && Object.keys(updates).length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-4 flex items-center justify-between gap-3 overflow-hidden rounded-panel border border-copper/30 bg-copper/10 px-4 py-3 text-[14px]">
            <span>{tr("{length} updates for {gameVersion} are ready.", { length: Object.keys(updates).length, gameVersion: inst.gameVersion })}</span>
            <Button variant="primary" size="sm" onClick={applyUpdates}>{tr("Update all")}</Button>
          </motion.div>
        )}
      </AnimatePresence>
      {q.isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : list.length === 0 ? (
        <Empty icon={DIRS.find((d) => d.id === dir)!.icon} title={filter ? tr("No matches") : tr("No {n0} yet", { n0: DIRS.find((d) => d.id === dir)!.label.toLowerCase() })} action={!adding ? <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>{tr("Add some")}</Button> : undefined}>
          {tr("Everything here goes only into “{name}”.", { name: inst.name })}
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((f, i) => (
            <motion.li key={f.fileName} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 15) * 0.02 }} className={`glass lift group flex items-center gap-4 rounded-panel p-3 ${f.enabled ? "" : "opacity-55"}`}>
              {f.icon ? <img src={f.icon} alt="" className="size-11 shrink-0 rounded-card object-cover [image-rendering:pixelated]" /> : <div className="grid size-11 shrink-0 place-items-center rounded-card bg-slate-raised text-muted"><Box className="size-5" /></div>}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[15px] font-medium">
                  {f.name ?? f.fileName.replace(/\.(jar|zip)(\.disabled)?$/, "")}
                  {f.version && <span className="text-[12px] font-normal text-muted">{f.version}</span>}
                  {f.fromBundle && <Badge tone="accent"><Gauge className="size-3" /> {tr("Performance")}</Badge>}
                  {updates?.[f.fileName] && <Badge tone="gold">{tr("Update: {number}", { number: updates[f.fileName]!.number })}</Badge>}
                </p>
                <p className="truncate text-[13px] text-muted">{f.description ?? f.fileName}</p>
              </div>
              <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                <IconButton icon={BookOpen} label={tr("What does it do?")} onClick={() => explain(f)} />
                <IconButton icon={Trash2} label={tr("Remove")} onClick={() => remove(f)} />
              </div>
              <Switch checked={f.enabled} onChange={() => toggle(f)} label={f.enabled ? tr("Enabled (click to turn off)") : tr("Disabled (click to turn on)")} />
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Apply one of the user's world packs to this instance. */
function PackButton({ inst }: { inst: Inst }) {
  const packs = useWorldPacks();
  const navigate = useNavigate();
  const { toast, dismiss } = useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const apply = async (p: WorldPack) => {
    setBusy(p.id);
    const t = toast({ title: tr("Adding “{name}”", { name: p.name }), tone: "progress" });
    try {
      const r = await applyWorldPack(p, inst);
      qc.invalidateQueries({ queryKey: ["content", inst.id] });
      toast({ title: tr("“{name}” added", { name: p.name }), body: summarise(r), tone: "success" });
      setOpen(false);
    } catch (e) {
      toast({ title: tr("Couldn't apply the pack"), body: String(e), tone: "error" });
    } finally {
      dismiss(t);
      setBusy(null);
    }
  };
  return (
    <>
      <Button icon={Layers3} onClick={() => setOpen(true)}>{tr("World pack")}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={tr("Add a world pack to {name}", { name: inst.name })}>
        {packs.data?.length ? (
          <ul className="flex flex-col gap-2">
            {packs.data.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-card bg-slate-raised/50 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{p.name}</p>
                  <p className="truncate text-[12px] text-muted">{tr("{length} items", { length: p.items.length })}{p.description ? ` · ${p.description}` : ""}</p>
                </div>
                <Button size="sm" variant="primary" icon={Plus} loading={busy === p.id} disabled={!!busy} onClick={() => apply(p)}>{tr("Add")}</Button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={Layers3} title={tr("No world packs yet")} action={<Button variant="primary" onClick={() => navigate("/packs")}>{tr("Make one")}</Button>}>{tr("A world pack is your own reusable mix of mods, resource packs, data packs and shaders.")}</Empty>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- worlds (+ share online)

function Worlds({ inst }: { inst: Inst }) {
  const worlds = useQuery({ queryKey: ["worlds", inst.id], queryFn: () => api.listWorlds(inst.id) });
  const mods = useContent(inst.id, "mods");
  const { toast } = useApp();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const hasE4mc = (mods.data ?? []).some((m) => /e4mc/i.test(`${m.name} ${m.fileName}`) && m.enabled);
  const canShare = inst.loader !== "vanilla";

  const enableSharing = async () => {
    setBusy(true);
    try {
      await installProject("mods", { id: "e4mc", slug: "e4mc", title: "e4mc" }, { instance: inst });
      qc.invalidateQueries({ queryKey: ["content", inst.id, "mods"] });
      toast({ title: tr("World sharing is on"), body: tr("In game: Esc → Open to LAN → Start. A public address appears in chat; send it to your friends."), tone: "success" });
    } catch (e) {
      toast({ title: tr("Couldn't enable sharing"), body: e instanceof Error ? e.message : String(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Glass className="relative overflow-hidden p-5">
        <motion.div aria-hidden className="absolute -right-10 -top-10 size-48 rounded-full bg-copper/20 blur-3xl" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 6, repeat: Infinity }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid size-12 place-items-center rounded-card bg-copper/15 text-copper"><Globe2 className="size-6" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold">{tr("Let friends join from anywhere")}</h3>
            <p className="max-w-[70ch] text-[13px] text-muted">
              {hasE4mc
                ? tr("Sharing is on. In game press Esc → Open to LAN → Start. A public address (like something.e4mc.link) appears in chat. Friends paste it into Multiplayer → Direct Connection. No router setup, and they don't need any mods.")
                : canShare
                  ? tr("One click adds e4mc to this instance. Then Open to LAN gives you a public address anyone can join, even friends on a plain unmodded game.")
                  : tr("Needs a mod loader. Create a Fabric, Quilt or NeoForge instance to share worlds online.")}
            </p>
          </div>
          {canShare && !hasE4mc && <Button variant="primary" icon={Globe2} loading={busy} onClick={enableSharing}>{tr("Turn on sharing")}</Button>}
          {hasE4mc && <Badge tone="accent">{tr("Sharing ready")}</Badge>}
        </div>
      </Glass>
      {worlds.isLoading ? <Skeleton className="h-40" /> : worlds.data?.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {worlds.data.map((w, i) => <WorldCard key={w.folder} w={w} i={i} inst={inst} />)}
        </ul>
      ) : <Empty icon={Globe2} title={tr("No worlds yet")}>{tr("Play this instance and create a world; it'll show up here.")}</Empty>}
      <div><Button icon={FolderOpen} onClick={() => api.openFolder(inst.id, "saves")}>{tr("Open saves folder")}</Button></div>
    </div>
  );
}

const MODE_TONE: Record<string, "accent" | "gold" | "neutral"> = { creative: "gold", survival: "accent" };

/** A world with its in-game snapshot, details from level.dat, and one-click play. */
function WorldCard({ w, i, inst }: { w: World; i: number; inst: Inst }) {
  const { play, launching } = useApp();
  const [open, setOpen] = useState(false);
  const info = w.info;
  const busy = !!launching[inst.id];
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass lift group overflow-hidden rounded-panel">
      <button type="button" onClick={() => setOpen((o) => !o)} className="relative block h-32 w-full overflow-hidden text-left" style={!w.icon ? { background: instanceGradient(w.folder) } : undefined} aria-expanded={open}>
        {w.icon ? <img src={w.icon} alt="" className="size-full object-cover transition-transform duration-500 [image-rendering:pixelated] group-hover:scale-110" /> : <div className="block-grid absolute inset-0 opacity-40" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2">
          <p className="truncate text-[15px] font-bold text-white drop-shadow">{info?.name || w.folder}</p>
          {info?.days != null && <span className="shrink-0 rounded-chip bg-black/50 px-2 py-0.5 text-[11px] text-white">{tr("Day {n0}", { n0: info.days.toLocaleString(locale()) })}</span>}
        </div>
      </button>
      <div className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {info?.gameMode && <Badge tone={MODE_TONE[info.gameMode] ?? "neutral"}>{info.hardcore ? tr("Hardcore") : info.gameMode[0]!.toUpperCase() + info.gameMode.slice(1)}</Badge>}
          {info?.difficulty && !info.hardcore && <Badge>{info.difficulty[0]!.toUpperCase() + info.difficulty.slice(1)}</Badge>}
          {info?.cheats && <Badge>{tr("Cheats")}</Badge>}
          {info?.version && <Badge>{info.version}</Badge>}
        </div>
        <p className="mt-1.5 text-[12px] text-muted">{tr("Played {n0} · {n1} MB", { n0: ago(new Date(w.modified * 1000).toISOString()), n1: w.sizeMb.toFixed(1) })}</p>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                <dt className="text-muted">{tr("Folder")}</dt><dd className="truncate" data-selectable>{w.folder}</dd>
                {info?.seed && <><dt className="text-muted">{tr("Seed")}</dt><dd className="truncate font-mono" data-selectable>{info.seed}</dd></>}
              </dl>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" icon={Play} disabled={busy} onClick={() => play(inst, undefined, w.folder)}>{tr("Play")}</Button>
          <Button size="sm" icon={FolderOpen} onClick={() => api.openFolder(inst.id, `saves/${w.folder}`)}>{tr("Folder")}</Button>
        </div>
      </div>
    </motion.li>
  );
}

function Screenshots({ inst }: { inst: Inst }) {
  const shots = useQuery({ queryKey: ["shots", inst.id], queryFn: () => api.listScreenshots(inst.id) });
  const [view, setView] = useState<string | null>(null);
  if (shots.isLoading) return <Skeleton className="h-60" />;
  if (!shots.data?.length) return <Empty icon={Camera} title={tr("No screenshots yet")}>{tr("Press F2 in game to take one.")}</Empty>;
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {shots.data.map((s, i) => (
          <motion.button key={s.path} type="button" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i, 20) * 0.02 }} onClick={() => setView(s.path)} className="lift overflow-hidden rounded-panel">
            <img src={fileSrc(s.path)} alt={s.fileName} loading="lazy" className="aspect-video w-full object-cover" />
          </motion.button>
        ))}
      </div>
      <Modal open={!!view} onClose={() => setView(null)} title={tr("Screenshot")} width="w-[1000px]">
        {view && <img src={fileSrc(view)} alt="" className="w-full rounded-card" />}
        <div className="mt-3"><Button icon={FolderOpen} onClick={() => api.openFolder(inst.id, "screenshots")}>{tr("Open folder")}</Button></div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- settings

function InstanceSettings({ inst }: { inst: Inst }) {
  const { refresh, toast } = useApp();
  const navigate = useNavigate();
  const sys = useSystemInfo();
  const profiles = useProfiles();
  const qc = useQueryClient();
  const [name, setName] = useState(inst.name);
  const [memory, setMemory] = useState(inst.memoryMb);
  const [jvm, setJvm] = useState(inst.jvmArgs.join(" "));
  const [confirm, setConfirm] = useState(false);
  const maxMem = Math.max(2048, Math.min(32768, Math.floor(((sys.data?.totalMemoryMb ?? 8192) * 0.75) / 512) * 512));
  useEffect(() => { setName(inst.name); setMemory(inst.memoryMb); setJvm(inst.jvmArgs.join(" ")); }, [inst.id]);
  const dirty = name !== inst.name || memory !== inst.memoryMb || jvm !== inst.jvmArgs.join(" ");
  const save = async () => {
    await api.updateInstance(inst.id, { name, memoryMb: memory, jvmArgs: jvm.split(/\s+/).filter(Boolean) });
    await refresh();
    toast({ title: tr("Saved"), tone: "success" });
  };
  const setProfile = async (pid: string | null) => {
    await api.updateInstance(inst.id, { gameProfile: pid });
    refresh();
  };
  const saveAsProfile = async () => {
    try {
      const store = await api.profileFromInstance(inst.id, tr("{name} settings", { name: inst.name }));
      qc.setQueryData(["profiles"], store);
      toast({ title: tr("Saved as a profile"), body: tr("Find it in Settings → Game profiles."), tone: "success" });
    } catch (e) {
      toast({ title: tr("Couldn't save"), body: String(e), tone: "error" });
    }
  };
  const del = async () => {
    await api.deleteInstance(inst.id);
    await refresh();
    navigate("/");
    toast({ title: tr("Deleted {name}", { name: inst.name }), tone: "info" });
  };
  const advice = useMemo(() => (memory < 3072 ? tr("Tight for modded play.") : memory > 8192 ? tr("Only big modpacks need this much.") : tr("A good amount for most setups.")), [memory]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Glass className="flex flex-col gap-4 p-5">
        <h3 className="text-[16px] font-bold">{tr("General")}</h3>
        <Field label={tr("Name")}><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <Slider label={tr("Memory")} value={memory} onChange={setMemory} min={1024} max={maxMem} step={512} format={(v) => `${(v / 1024).toFixed(1)} GB`} detail={advice} />
        <Field label={tr("Extra Java arguments")} hint={tr("Advanced. Separate with spaces.")}><input value={jvm} onChange={(e) => setJvm(e.target.value)} placeholder="-XX:+UseZGC" className={`${inputClass} font-[ui-monospace,monospace]`} /></Field>
        <div><Button variant="primary" icon={Save} disabled={!dirty} onClick={save}>{tr("Save changes")}</Button></div>
      </Glass>
      <Glass className="flex flex-col gap-4 p-5">
        <h3 className="text-[16px] font-bold">{tr("Game settings profile")}</h3>
        <p className="text-[13px] text-muted">{tr("Keybinds, FOV, video and sound settings you made once in Settings → Game profiles.")}</p>
        <select value={inst.gameProfile ?? ""} onChange={(e) => setProfile(e.target.value || null)} className={inputClass}>
          <option value="">{tr("None (Minecraft defaults)")}</option>
          {(profiles.data?.profiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Toggle checked={!!inst.profileEveryLaunch} onChange={async (v) => { await api.updateInstance(inst.id, { profileEveryLaunch: v }); refresh(); }} label={tr("Apply every launch")} detail={tr("Otherwise only once, so in-game changes are kept.")} />
        <Button icon={Save} onClick={saveAsProfile}>{tr("Save this instance's in-game settings as a profile")}</Button>
      </Glass>
      <Glass className="flex flex-col gap-3 p-5 md:col-span-2">
        <h3 className="text-[16px] font-bold">{tr("Folders")}</h3>
        <div className="flex flex-wrap gap-2">
          {["", "mods", "config", "saves", "resourcepacks", "shaderpacks", "screenshots", "logs"].map((s) => <Button key={s || "root"} size="sm" icon={FolderOpen} onClick={() => api.openFolder(inst.id, s || undefined)}>{s || tr("Instance folder")}</Button>)}
        </div>
      </Glass>
      <Glass className="flex items-center justify-between gap-4 border-redstone/25 p-5 md:col-span-2">
        <div>
          <h3 className="text-[16px] font-bold">{tr("Delete instance")}</h3>
          <p className="text-[13px] text-muted">{tr("Removes its folder, including worlds and screenshots. This can't be undone.")}</p>
        </div>
        <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>{tr("Delete")}</Button>
      </Glass>
      <Modal open={confirm} onClose={() => setConfirm(false)} title={tr("Delete {name}?", { name: inst.name })} footer={<><Button onClick={() => setConfirm(false)}>{tr("Cancel")}</Button><Button variant="danger" icon={Trash2} onClick={del}>{tr("Delete forever")}</Button></>}>
        <p className="text-muted">{tr("All worlds, mods and screenshots in this instance will be deleted.")}</p>
      </Modal>
    </div>
  );
}
