import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Ban, Check, Crown, Download, FolderOpen, Gauge, Loader2, Map as MapIcon, Pause, Play, Plus, RotateCcw, Search, ShieldCheck, Sparkles, Trash2, Upload, UserMinus, X, Zap } from "lucide-react";
import { api, type Addons, type Backup, type ServerLive, type ServerView } from "../../lib/ipc";
import { installToServer } from "../../lib/install";
import { compact } from "../../lib/format";
import { useDiscover } from "../../lib/queries";
import { useApp } from "../../state";
import { Badge, Button, Empty, Field, Glass, IconButton, Modal, Segmented, Skeleton, Slider, Switch, Toggle, inputClass, selectClass } from "../ui";
import { locale, tr, trn } from "../../lib/i18n";

const ago = (secs: number) => {
  const d = Date.now() / 1000 - secs;
  if (d < 90) return tr("just now");
  if (d < 3600) return tr("{n} min ago", { n: Math.round(d / 60) });
  if (d < 86400) return tr("{n} h ago", { n: Math.round(d / 3600) });
  return tr("{n} days ago", { n: Math.round(d / 86400) });
};

const REASON: Record<string, string> = { auto: tr("Daily"), manual: tr("Manual"), "before-restore": tr("Before restore"), "before-reset": tr("Before reset"), "before-import": tr("Before import"), "before-c2me": tr("Before faster generation") };

function useRun(s: ServerView) {
  const { toast } = useApp();
  return (cmd: string, done?: string) =>
    api.serverCommand(s.id, cmd).then(
      () => done && toast({ title: done, tone: "success" }),
      (e) => toast({ title: tr("Couldn't do that"), body: String(e), tone: "error" }),
    );
}

// ------------------------------------------------------------------ players

export function ServerPlayers({ s, live }: { s: ServerView; live?: ServerLive | null }) {
  const lists = useQuery({ queryKey: ["serverPlayers", s.id], queryFn: () => api.serverPlayers(s.id), refetchInterval: s.running ? 4000 : false });
  const run = useRun(s);
  const qc = useQueryClient();
  const refresh = () => setTimeout(() => qc.invalidateQueries({ queryKey: ["serverPlayers", s.id] }), 700);
  const online = live?.players ?? [];
  const l = lists.data;
  const act = (cmd: string, msg: string) => run(cmd, msg).then(refresh);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Glass className="p-5 md:col-span-2">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex-1 text-[16px] font-bold">{trn(tr("Online now {span}"), { span: <span className="text-muted">({online.length})</span> })}</h3>
          {!s.running && <Badge>{tr("Server offline")}</Badge>}
        </div>
        {online.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {online.map((p) => (
              <li key={p} className="group flex items-center gap-3 rounded-card bg-slate-raised/50 p-2">
                <Avatar name={p} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{p}{l?.ops.includes(p) && <Crown className="ml-1.5 inline size-3.5 text-gold" />}</span>
                <span className="flex gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                  <IconButton icon={Sparkles} label={tr("Creative for {p}", { p })} onClick={() => run(`gamemode creative ${p}`, tr("{p}: creative", { p }))} />
                  <IconButton icon={Gauge} label={tr("Survival for {p}", { p })} onClick={() => run(`gamemode survival ${p}`, tr("{p}: survival", { p }))} />
                  <IconButton icon={UserMinus} label={tr("Kick {p}", { p })} onClick={() => run(`kick ${p}`, tr("Kicked {p}", { p }))} />
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-muted">{s.running ? tr("Nobody online right now.") : tr("Start the server to see who's online.")}</p>}
      </Glass>

      <NameList title={tr("Operators")} detail={tr("Can use commands like /gamemode and /tp.")} icon={Crown} names={l?.ops} disabled={!s.running} onAdd={(n) => act(`op ${n}`, tr("{n} is an operator", { n }))} onRemove={(n) => act(`deop ${n}`, tr("{n} is no longer an operator", { n }))} />
      <NameList
        title={tr("Whitelist")}
        detail={tr("When on, only these players can join.")}
        icon={ShieldCheck}
        names={l?.whitelist}
        disabled={!s.running}
        onAdd={(n) => act(`whitelist add ${n}`, tr("{n} added to the whitelist", { n }))}
        onRemove={(n) => act(`whitelist remove ${n}`, tr("{n} removed", { n }))}
        header={<Switch checked={!!l?.whitelistOn} disabled={!s.running} label={tr("Whitelist only")} onChange={(v) => act(`whitelist ${v ? "on" : "off"}`, v ? tr("Whitelist on") : tr("Whitelist off"))} />}
      />
      <NameList title={tr("Banned")} detail={tr("Can't join until unbanned.")} icon={Ban} names={l?.banned} disabled={!s.running} onAdd={(n) => act(`ban ${n}`, tr("Banned {n}", { n }))} onRemove={(n) => act(`pardon ${n}`, tr("Unbanned {n}", { n }))} addLabel={tr("Ban")} />
      {!s.running && <p className="text-[12px] text-muted md:col-span-2">{tr("Changes go through the server, so start it to edit these lists.")}</p>}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return <img src={`https://mc-heads.net/avatar/${encodeURIComponent(name)}/32`} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} className="size-8 rounded bg-slate-line [image-rendering:pixelated]" />;
}

function NameList({ title, detail, icon: Icon, names, onAdd, onRemove, disabled, header, addLabel = tr("Add") }: { title: string; detail: string; icon: typeof Crown; names?: string[]; onAdd: (n: string) => void; onRemove: (n: string) => void; disabled?: boolean; header?: React.ReactNode; addLabel?: string }) {
  const [name, setName] = useState("");
  const valid = /^[A-Za-z0-9_]{3,16}$/.test(name);
  return (
    <Glass className="flex flex-col p-5">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="size-4 text-copper" />
        <h3 className="flex-1 text-[15px] font-bold">{title}</h3>
        {header}
      </div>
      <p className="mb-3 text-[12px] text-muted">{detail}</p>
      <ul className="mb-3 flex max-h-48 flex-col gap-1 overflow-y-auto">
        {names?.length ? names.map((n) => (
          <li key={n} className="group flex items-center gap-2 rounded-card px-1 py-1 hover:bg-slate-raised/50">
            <Avatar name={n} />
            <span className="flex-1 truncate text-[14px]">{n}</span>
            <button type="button" disabled={disabled} aria-label={tr("Remove {n}", { n })} onClick={() => onRemove(n)} className="rounded p-1 text-muted opacity-0 hover:text-text group-hover:opacity-100 disabled:hidden"><X className="size-4" /></button>
          </li>
        )) : <li className="text-[13px] text-muted">{tr("Nobody yet.")}</li>}
      </ul>
      <form className="mt-auto flex gap-2" onSubmit={(e) => { e.preventDefault(); if (valid) { onAdd(name); setName(""); } }}>
        <input value={name} onChange={(e) => setName(e.target.value.trim())} placeholder={tr("Player name")} disabled={disabled} className={inputClass} />
        <Button type="submit" icon={Plus} disabled={disabled || !valid}>{addLabel}</Button>
      </form>
    </Glass>
  );
}

// ------------------------------------------------------------------ mods / plugins

export function ServerMods({ s }: { s: ServerView }) {
  const files = useQuery({ queryKey: ["serverContent", s.id], queryFn: () => api.serverContent(s.id) });
  const qc = useQueryClient();
  const { toast } = useApp();
  const [adding, setAdding] = useState(true);
  const noun = s.kind === "paper" ? "plugins" : "mods";
  if (s.kind === "vanilla") return <Empty icon={Download} title={tr("Vanilla servers can't run add-ons")}>{tr("Create a Paper server for plugins, or a Fabric server for mods.")}</Empty>;
  const reload = () => qc.invalidateQueries({ queryKey: ["serverContent", s.id] });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-panel border border-copper/30 bg-copper/10 px-4 py-3 text-[14px]">
        <Download className="size-4 text-copper" />
        <span className="flex-1">{trn(tr("Installing to {b} ("), { b: <b>{s.name}</b> })}{s.kind === "paper" ? tr("Paper") : tr("Fabric")} {s.gameVersion}). {s.running && <span className="text-muted">{tr("Restart the server after adding {noun}.", { noun })}</span>}</span>
        <Button size="sm" icon={FolderOpen} onClick={() => api.openServerFolder(s.id)}>{tr("Folder")}</Button>
        <Button size="sm" variant="primary" icon={adding ? X : Plus} onClick={() => setAdding((a) => !a)}>{adding ? tr("Done") : tr("Add {noun}", { noun })}</Button>
      </div>
      <AnimatePresence initial={false}>{adding && <AddToServer s={s} installed={files.data ?? []} onAdded={reload} />}</AnimatePresence>
      <Glass className="p-4">
        <p className="mb-2 text-[13px] font-medium text-muted">{tr("On this server (")}{files.data?.length ?? 0})</p>
        {files.isLoading ? <Skeleton className="h-24" /> : files.data?.length ? (
          <ul className="flex flex-col gap-1.5">
            {files.data.map((f) => (
              <li key={f.fileName} className="flex items-center gap-3 rounded-card bg-slate-raised/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{f.name ?? f.fileName.replace(/\.jar(\.disabled)?$/, "")} {f.version && <span className="text-[12px] text-muted">{f.version}</span>}</p>
                  {f.description && <p className="truncate text-[12px] text-muted">{f.description}</p>}
                </div>
                <IconButton icon={Trash2} label={tr("Remove")} onClick={async () => { await api.deleteServerContent(s.id, f.fileName); reload(); toast({ title: tr("Removed"), body: f.name ?? f.fileName, tone: "info" }); }} />
                <Switch checked={f.enabled} label={f.enabled ? tr("On (click to turn off)") : tr("Off (click to turn on)")} onChange={async (v) => { await api.setServerContentEnabled(s.id, f.fileName, v); reload(); }} />
              </li>
            ))}
          </ul>
        ) : <p className="py-4 text-center text-[13px] text-muted">{tr("No {noun} yet.", { noun })}</p>}
      </Glass>
    </div>
  );
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

function AddToServer({ s, installed, onAdded }: { s: ServerView; installed: { name?: string | null; fileName: string }[]; onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDeb(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const category = s.kind === "paper" ? "plugins" : "mods";
  const results = useDiscover("modrinth", category, { query: deb || undefined, gameVersion: s.gameVersion, loader: s.kind === "fabric" ? "fabric" : undefined, sort: deb ? "relevance" : "downloads", page: 0 });
  const names = new Set(installed.flatMap((f) => [norm(f.name ?? ""), norm(f.fileName.replace(/[-_]?\d.*$/, ""))]).filter(Boolean));
  const has = (title: string, slug: string) => names.has(norm(title)) || names.has(norm(slug));

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <Glass className="p-4">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search {category} for {n1} {gameVersion}", { category, n1: s.kind === "paper" ? "Paper" : "Fabric", gameVersion: s.gameVersion })} className={`${inputClass} pl-9`} />
        </div>
        <div className="grid max-h-[380px] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
          {results.isLoading ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-16" />) : (results.data?.hits ?? []).map((h) => <AddRow key={h.id} s={s} hit={h} installed={has(h.title, h.slug)} onAdded={onAdded} />)}
          {results.data && !results.data.hits.length && <p className="col-span-full py-6 text-center text-[13px] text-muted">{tr("Nothing for {gameVersion} matches “{deb}”.", { gameVersion: s.gameVersion, deb })}</p>}
        </div>
      </Glass>
    </motion.div>
  );
}

function AddRow({ s, hit, installed, onAdded }: { s: ServerView; hit: { id: string; slug: string; title: string; description: string; iconUrl?: string; downloads: number }; installed: boolean; onAdded: () => void }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      toast({ title: `${hit.title}`, body: await installToServer(s, hit), tone: "success" });
      setDone(true);
      onAdded();
    } catch (e) {
      toast({ title: tr("Couldn't add {title}", { title: hit.title }), body: e instanceof Error ? e.message : String(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-card bg-slate-raised/50 p-2.5">
      {hit.iconUrl ? <img src={hit.iconUrl} alt="" loading="lazy" className="size-11 shrink-0 rounded-card object-cover" /> : <div className="size-11 shrink-0 rounded-card bg-slate-line" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{hit.title}</p>
        <p className="truncate text-[12px] text-muted">{hit.description}</p>
      </div>
      <span className="hidden text-[12px] tabular-nums text-muted sm:block">{compact(hit.downloads)}</span>
      {installed || done ? (
        <span className="flex items-center gap-1 rounded-chip bg-copper/15 px-2.5 py-1.5 text-[12px] font-medium text-copper"><Check className="size-3.5" /> {tr("Installed")}</span>
      ) : (
        <button type="button" disabled={busy} onClick={add} className="press press-accent flex items-center gap-1 rounded-chip bg-copper px-2.5 py-1.5 text-[12px] font-medium text-on-accent disabled:opacity-40">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} {tr("Add")}
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ world

export function ServerWorld({ s, live, onRestart }: { s: ServerView; live?: ServerLive | null; onRestart: () => void }) {
  const world = useQuery({ queryKey: ["serverWorld", s.id], queryFn: () => api.serverWorld(s.id) });
  const qc = useQueryClient();
  const { toast, instances } = useApp();
  const [radius, setRadius] = useState(3000);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; action: () => Promise<void> }>(null);
  const [importing, setImporting] = useState(false);
  const reload = () => qc.invalidateQueries({ queryKey: ["serverWorld", s.id] });
  const pg = live?.pregen;
  const w = world.data;

  const guard = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast({ title: ok, tone: "success" });
      reload();
    } catch (e) {
      toast({ title: tr("Couldn't do that"), body: e instanceof Error ? e.message : String(e), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const startPregen = () =>
    guard("pregen", async () => {
      const r = await api.pregen(s.id, "start", radius);
      if (r === "restart") toast({ title: tr("Chunky was added"), body: tr("Restart the server and pre-generation starts by itself."), tone: "info" });
      else if (r === "queued") toast({ title: tr("Queued"), body: tr("Pre-generation starts as soon as the server is up."), tone: "info" });
      else toast({ title: tr("Pre-generating"), body: tr("{radius} blocks around spawn.", { radius }), tone: "success" });
    });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Glass className="p-5">
        <div className="flex items-center gap-2">
          <MapIcon className="size-5 text-copper" />
          <h3 className="flex-1 text-[16px] font-bold">{w?.info.name || w?.levelName || tr("World")}</h3>
          {w?.exists ? <Badge>{tr("{n0} GB", { n0: (w.sizeMb / 1024).toFixed(w.sizeMb > 1024 ? 1 : 2) })}</Badge> : <Badge>{tr("Not created yet")}</Badge>}
        </div>
        {w?.exists ? (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            {w.info.gameMode && <><dt className="text-muted">{tr("Mode")}</dt><dd className="capitalize">{w.info.hardcore ? tr("Hardcore") : w.info.gameMode}</dd></>}
            {w.info.difficulty && <><dt className="text-muted">{tr("Difficulty")}</dt><dd className="capitalize">{w.info.difficulty}</dd></>}
            {w.info.days != null && <><dt className="text-muted">{tr("Day")}</dt><dd>{w.info.days.toLocaleString(locale())}</dd></>}
            {w.info.seed && <><dt className="text-muted">{tr("Seed")}</dt><dd className="truncate font-mono" data-selectable>{w.info.seed}</dd></>}
          </dl>
        ) : <p className="mt-2 text-[13px] text-muted">{tr("The world is created the first time the server starts, or you can bring one of yours.")}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button icon={Upload} disabled={s.running} onClick={() => setImporting(true)}>{tr("Use one of my worlds")}</Button>
          <Button icon={RotateCcw} disabled={s.running || !w?.exists} onClick={() => setConfirm({ title: tr("Start a fresh world?"), body: tr("The current world is backed up first, then a new one generates on the next start."), action: () => guard("reset", () => api.resetWorld(s.id), tr("World reset")) })}>{tr("New world")}</Button>
        </div>
        {s.running && <p className="mt-2 text-[12px] text-muted">{tr("Stop the server to swap or reset the world.")}</p>}
      </Glass>

      <Glass className="p-5">
        <div className="flex items-center gap-2">
          <Zap className="size-5 text-copper" />
          <h3 className="flex-1 text-[16px] font-bold">{tr("Pre-generate")}</h3>
          {pg && <Badge tone={pg.state === "running" ? "accent" : "neutral"}>{pg.state === "running" ? tr("Running") : pg.state === "paused" ? tr("Paused") : pg.state === "done" ? tr("Finished") : tr("Cancelled")}</Badge>}
        </div>
        <p className="mt-1 text-[13px] text-muted">{tr("Generates the land ahead of time, so exploring never waits for new chunks.")}</p>
        {pg && pg.state !== "cancelled" ? (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-slate-line"><motion.div className="h-full rounded-full bg-copper" animate={{ width: `${pg.percent}%` }} /></div>
            <p className="mt-1.5 flex justify-between text-[12px] tabular-nums text-muted">
              <span>{tr("{n0}% · {chunks} chunks", { n0: pg.percent.toFixed(1), chunks: compact(pg.chunks) })}</span>
              <span>{pg.state === "done" ? tr("Done") : `${pg.rate ? `${pg.rate.toFixed(0)}/s · ` : ""}${pg.eta ? tr("{eta} left", { eta: pg.eta }) : ""}`}</span>
            </p>
            {pg.state !== "done" && (
              <div className="mt-3 flex gap-2">
                {pg.state === "running" ? <Button size="sm" icon={Pause} onClick={() => guard("p", () => api.pregen(s.id, "pause"))}>{tr("Pause")}</Button> : <Button size="sm" icon={Play} onClick={() => guard("p", () => api.pregen(s.id, "continue"))}>{tr("Continue")}</Button>}
                <Button size="sm" icon={X} onClick={() => guard("p", () => api.pregen(s.id, "cancel"))}>{tr("Cancel")}</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <Slider label={tr("Size")} value={radius} onChange={setRadius} min={500} max={10000} step={500} format={(v) => tr("{a} × {a} blocks", { a: (v * 2).toLocaleString(locale()) })} detail={tr("About {n0}k chunks, roughly {n1} min on a fast PC.", { n0: Math.round((((radius * 2) / 16) ** 2) / 1000), n1: Math.max(1, Math.round((((radius * 2) / 16) ** 2) / 100 / 60)) })} />
            {w?.pendingPregen ? (
              <p className="flex items-center gap-2 text-[13px]"><Loader2 className="size-4 animate-spin text-copper" /> {tr("Starts when the server is up ({pendingPregen} blocks).", { pendingPregen: w.pendingPregen })} <button type="button" className="text-muted underline" onClick={() => guard("c", () => api.pregen(s.id, "cancel"))}>{tr("Cancel")}</button></p>
            ) : (
              <Button variant="primary" icon={Zap} loading={busy === "pregen"} onClick={startPregen} disabled={s.kind === "vanilla"}>{s.running ? tr("Start pre-generating") : tr("Pre-generate on next start")}</Button>
            )}
            {s.kind === "vanilla" && <p className="text-[12px] text-muted">{tr("Needs a Fabric or Paper server.")}</p>}
          </div>
        )}
      </Glass>

      <Glass className="p-5 md:col-span-2">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Archive className="size-5 text-copper" />
          <h3 className="flex-1 text-[16px] font-bold">{tr("Backups")}</h3>
          <Button size="sm" icon={FolderOpen} onClick={() => api.openBackups(s.id)}>{tr("Folder")}</Button>
          <Button size="sm" variant="primary" icon={Archive} loading={busy === "backup"} disabled={!w?.exists} onClick={() => guard("backup", () => api.backupServer(s.id), tr("Backup saved"))}>{tr("Back up now")}</Button>
        </div>
        {w?.backups.length ? (
          <ul className="flex flex-col gap-1.5">
            {w.backups.map((b: Backup) => (
              <li key={b.file} className="flex items-center gap-3 rounded-card bg-slate-raised/40 px-3 py-2 text-[13px]">
                <span className="w-40 shrink-0">{new Date(b.created * 1000).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })}</span>
                <span className="text-muted">{ago(b.created)}</span>
                <Badge>{REASON[b.reason] ?? b.reason}</Badge>
                <span className="ml-auto tabular-nums text-muted">{tr("{n0} MB", { n0: b.sizeMb.toFixed(0) })}</span>
                <Button size="sm" icon={RotateCcw} disabled={s.running} onClick={() => setConfirm({ title: tr("Restore this backup?"), body: tr("The world goes back to {n0}. The current world is backed up first, so nothing is lost.", { n0: new Date(b.created * 1000).toLocaleString(locale()) }), action: () => guard("restore", () => api.restoreBackup(s.id, b.file), tr("Backup restored")) })}>{tr("Restore")}</Button>
                <IconButton icon={Trash2} label={tr("Delete backup")} onClick={() => guard("del", () => api.deleteBackup(s.id, b.file))} />
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-muted">{tr("No backups yet.")} {s.autoBackup !== false ? tr("A daily one is taken automatically when the server starts.") : ""}</p>}
      </Glass>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ""} footer={<><Button onClick={() => setConfirm(null)}>{tr("Cancel")}</Button><Button variant="primary" onClick={async () => { const c = confirm; setConfirm(null); await c?.action(); }}>{tr("Continue")}</Button></>}>
        <p className="text-[14px]">{confirm?.body}</p>
      </Modal>
      <ImportWorld s={s} open={importing} onClose={() => setImporting(false)} onDone={() => { reload(); onRestart(); }} instances={instances} />
    </div>
  );
}

function ImportWorld({ s, open, onClose, onDone, instances }: { s: ServerView; open: boolean; onClose: () => void; onDone: () => void; instances: { id: string; name: string; gameVersion: string }[] }) {
  const [inst, setInst] = useState("");
  const [world, setWorld] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();
  useEffect(() => setInst((x) => x || instances[0]?.id || ""), [instances]);
  const worlds = useQuery({ queryKey: ["worlds", inst], queryFn: () => api.listWorlds(inst), enabled: open && !!inst });
  useEffect(() => setWorld(worlds.data?.[0]?.folder ?? ""), [worlds.data]);
  const i = instances.find((x) => x.id === inst);
  const go = async () => {
    setBusy(true);
    try {
      await api.importWorld(s.id, inst, world);
      toast({ title: tr("World copied in"), body: tr("Your old server world was backed up first. Start the server to play it."), tone: "success" });
      onClose();
      onDone();
    } catch (e) {
      toast({ title: tr("Couldn't copy the world"), body: String(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={tr("Use one of my worlds")} footer={<><Button onClick={onClose}>{tr("Cancel")}</Button><Button variant="primary" icon={Upload} loading={busy} disabled={!world} onClick={go}>{tr("Copy into the server")}</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label={tr("From instance")}><select value={inst} onChange={(e) => setInst(e.target.value)} className={selectClass}>{instances.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.gameVersion})</option>)}</select></Field>
        <Field label={tr("World")}>
          <select value={world} onChange={(e) => setWorld(e.target.value)} className={selectClass} disabled={!worlds.data?.length}>
            {(worlds.data ?? []).map((w) => <option key={w.folder} value={w.folder}>{w.info?.name || w.folder}</option>)}
          </select>
        </Field>
        {worlds.data && !worlds.data.length && <p className="text-[13px] text-muted">{tr("That instance has no worlds yet.")}</p>}
        {i && i.gameVersion !== s.gameVersion && <p className="rounded-card bg-gold/10 px-3 py-2 text-[13px]">{tr("This world is from {gameVersion} and the server runs {gameVersion2}. Newer servers upgrade old worlds fine; older servers can't open newer worlds.", { gameVersion: i.gameVersion, gameVersion2: s.gameVersion })}</p>}
        <p className="text-[12px] text-muted">{tr("Your singleplayer world isn't changed; the server gets a copy.")}</p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ settings

export function ServerSettings({ s, addons, onAddonsChange }: { s: ServerView; addons?: Addons; onAddonsChange: () => void }) {
  const props = useQuery({ queryKey: ["props", s.id], queryFn: () => api.serverProperties(s.id) });
  const sys = useQuery({ queryKey: ["system"], queryFn: api.systemInfo, staleTime: Infinity });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(false);
  const [extraBusy, setExtraBusy] = useState<string | null>(null);
  const { toast } = useApp();
  const qc = useQueryClient();
  useEffect(() => props.data && setDraft(props.data), [props.data]);
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const bool = (k: string, def = false) => (draft[k] ?? String(def)) === "true";
  const dirty = !!props.data && JSON.stringify(props.data) !== JSON.stringify(draft);
  const patch = async (p: Parameters<typeof api.updateServer>[1]) => {
    await api.updateServer(s.id, p);
    qc.invalidateQueries({ queryKey: ["servers"] });
  };
  const save = async () => {
    const saved = await api.setServerProperties(s.id, draft);
    qc.setQueryData(["props", s.id], saved);
    toast({ title: tr("Saved"), body: s.running ? tr("Restart the server to apply.") : undefined, tone: "success" });
  };
  const extra = async (key: keyof Addons, on: boolean) => {
    setExtraBusy(key);
    try {
      const ok = await api.setServerAddon(s.id, key, on);
      if (!ok) toast({ title: tr("Not available yet"), body: tr("There's no build for {gameVersion} yet. Try again after an update.", { gameVersion: s.gameVersion }), tone: "info" });
      else toast({ title: on ? tr("Turned on") : tr("Turned off"), body: s.running ? tr("Restart the server to apply.") : undefined, tone: "success" });
      onAddonsChange();
    } catch (e) {
      toast({ title: tr("Couldn't change that"), body: String(e), tone: "error" });
    } finally {
      setExtraBusy(null);
    }
  };
  const maxMem = Math.max(2048, Math.min(32768, Math.floor(((sys.data?.totalMemoryMb ?? 8192) * 0.6) / 512) * 512));
  const [mem, setMem] = useState(s.memoryMb);
  useEffect(() => {
    if (mem === s.memoryMb) return;
    const t = setTimeout(() => patch({ memoryMb: mem }), 500);
    return () => clearTimeout(t);
  }, [mem]);
  if (props.isLoading) return <Skeleton className="h-60" />;

  return (
    <div className="flex flex-col gap-4">
      <Section title={tr("Gameplay")}>
        <Field label={tr("Game mode")}><select value={draft.gamemode ?? "survival"} onChange={(e) => set("gamemode", e.target.value)} className={selectClass}>{["survival", "creative", "adventure", "spectator"].map((x) => <option key={x} value={x}>{x[0]!.toUpperCase() + x.slice(1)}</option>)}</select></Field>
        <Field label={tr("Difficulty")}><select value={draft.difficulty ?? "normal"} onChange={(e) => set("difficulty", e.target.value)} className={selectClass}>{["peaceful", "easy", "normal", "hard"].map((x) => <option key={x} value={x}>{x[0]!.toUpperCase() + x.slice(1)}</option>)}</select></Field>
        <Slider label={tr("Max players")} value={Number(draft["max-players"] ?? 10)} onChange={(v) => set("max-players", String(v))} min={1} max={100} />
        <Slider label={tr("Spawn protection")} value={Number(draft["spawn-protection"] ?? 16)} onChange={(v) => set("spawn-protection", String(v))} min={0} max={64} format={(v) => (v ? tr("{v} blocks", { v }) : tr("Off"))} detail={tr("Only operators can build this close to spawn.")} />
        <Toggle checked={bool("pvp", true)} onChange={(v) => set("pvp", String(v))} label={tr("Player vs player")} />
        <Toggle checked={bool("hardcore")} onChange={(v) => set("hardcore", String(v))} label={tr("Hardcore")} detail={tr("One life: players are banned when they die.")} />
        <Toggle checked={bool("allow-flight")} onChange={(v) => set("allow-flight", String(v))} label={tr("Allow flight")} detail={tr("Needed by some mods and plugins.")} />
      </Section>

      <Section title={tr("Performance")}>
        <Slider label={tr("Max render distance")} value={Number(draft["view-distance"] ?? 16)} onChange={(v) => set("view-distance", String(v))} min={4} max={32} format={(v) => tr("{v} chunks", { v })} detail={tr("Each player chooses their own render distance up to this. Higher uses more server memory.")} />
        <Slider label={tr("Simulation distance")} value={Number(draft["simulation-distance"] ?? 8)} onChange={(v) => set("simulation-distance", String(v))} min={3} max={16} format={(v) => tr("{v} chunks", { v })} detail={tr("How far away farms, mobs and redstone keep working. The expensive one: 6 to 8 is plenty.")} />
        <Slider label={tr("Memory")} value={mem} onChange={setMem} min={1024} max={maxMem} step={512} format={(v) => `${(v / 1024).toFixed(1)} GB`} detail={tr("4 GB suits ~10 players; add more for big modpacks.")} />
        <div className="flex flex-col gap-4">
          <ExtraToggle label={tr("Faster world generation (C2ME)")} detail={s.kind === "fabric" ? tr("Uses all your CPU cores to generate terrain, often 2 to 4 times faster. Experimental: a backup is taken first.") : tr("For Fabric servers. Paper already does this.")} checked={!!addons?.c2me} disabled={s.kind !== "fabric"} busy={extraBusy === "c2me"} onChange={(v) => extra("c2me", v)} />
          <ExtraToggle label={tr("Far view for players (Voxy)")} detail={tr("Sends distant terrain to players who have Voxy, so they see hundreds of chunks away.")} checked={!!addons?.voxy} disabled={s.kind === "vanilla"} busy={extraBusy === "voxy"} onChange={(v) => extra("voxy", v)} />
        </div>
      </Section>

      <Section title={tr("Looking after the server")}>
        <Toggle checked={s.autoBackup !== false} onChange={(v) => patch({ autoBackup: v })} label={tr("Daily backup")} detail={tr("Backs up the world when the server starts, once a day. Keeps the last 5.")} />
        <Toggle checked={s.restartOnCrash !== false} onChange={(v) => patch({ restartOnCrash: v })} label={tr("Restart if it crashes")} detail={tr("Starts it again once and tells you why it stopped.")} />
        <Field label={tr("Stop when everyone leaves")}>
          <Segmented value={String(s.stopWhenEmptyMins ?? 0)} onChange={(v) => patch({ stopWhenEmptyMins: Number(v) })} options={[{ id: "0", label: tr("Never") }, { id: "15", label: tr("15 min") }, { id: "30", label: tr("30 min") }, { id: "60", label: tr("1 hour") }]} />
        </Field>
        <Toggle checked={s.autoNetwork !== false} onChange={(v) => patch({ autoNetwork: v })} label={tr("Set up my router automatically")} detail={tr("Opens the server's port on your router (UPnP) while it runs.")} />
      </Section>

      <Section title={tr("In the server list")}>
        <Field label={tr("Message under the name")}><input value={draft.motd ?? ""} onChange={(e) => set("motd", e.target.value)} className={inputClass} maxLength={120} /></Field>
        <MotdPreview name={s.name} motd={draft.motd ?? ""} players={Number(draft["max-players"] ?? 10)} />
      </Section>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={Check} disabled={!dirty} onClick={save}>{tr("Save settings")}</Button>
        {dirty && <Button onClick={() => props.data && setDraft(props.data)}>{tr("Undo changes")}</Button>}
        <button type="button" onClick={() => setAdvanced((a) => !a)} className="ml-auto text-[13px] text-muted hover:text-text">{advanced ? tr("Hide") : tr("Show")} {tr("all properties")}</button>
      </div>
      <AnimatePresence initial={false}>
        {advanced && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Glass className="grid gap-2 p-4 md:grid-cols-2">
              {Object.keys(draft).sort().map((k) => (
                <label key={k} className="flex items-center gap-2 text-[12px]">
                  <span className="w-48 shrink-0 truncate font-mono text-muted" title={k}>{k}</span>
                  <input value={draft[k]} onChange={(e) => set(k, e.target.value)} className={`${inputClass} py-1 text-[12px]`} />
                </label>
              ))}
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Glass className="p-5">
      <h3 className="mb-4 text-[15px] font-bold">{title}</h3>
      <div className="grid gap-5 md:grid-cols-2">{children}</div>
    </Glass>
  );
}

function ExtraToggle({ label, detail, checked, disabled, busy, onChange }: { label: string; detail: string; checked: boolean; disabled?: boolean; busy?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? "opacity-50" : ""}`}>
      <span className="min-w-0"><span className="block text-[14px] font-medium">{label}</span><span className="block text-[13px] text-muted">{detail}</span></span>
      <span className="mt-0.5">{busy ? <Loader2 className="size-5 animate-spin text-copper" /> : <Switch checked={checked} disabled={disabled} label={label} onChange={onChange} />}</span>
    </div>
  );
}

/** Minecraft colour codes (§a etc.) rendered roughly like the in-game server list. */
const MC_COLORS: Record<string, string> = { "0": "#000", "1": "#00a", "2": "#0a0", "3": "#0aa", "4": "#a00", "5": "#a0a", "6": "#fa0", "7": "#aaa", "8": "#555", "9": "#55f", a: "#5f5", b: "#5ff", c: "#f55", d: "#f5f", e: "#ff5", f: "#fff" };

function MotdPreview({ name, motd, players }: { name: string; motd: string; players: number }) {
  const parts: { text: string; color: string }[] = [];
  let color = "#aaa";
  for (const seg of motd.replace(/\\u00a7/g, "§").split(/(§[0-9a-fk-or])/i)) {
    const m = /^§([0-9a-fk-or])$/i.exec(seg);
    if (m) color = MC_COLORS[m[1]!.toLowerCase()] ?? (m[1]!.toLowerCase() === "r" ? "#aaa" : color);
    else if (seg) parts.push({ text: seg, color });
  }
  return (
    <div className="flex items-center gap-3 rounded-card bg-black/60 p-3 font-pixel text-[14px] md:col-span-2">
      <div className="grid size-12 place-items-center rounded bg-slate-line text-[20px]">🌍</div>
      <div className="min-w-0 flex-1">
        <p className="flex justify-between text-white"><span>{name}</span><span className="text-[#aaa]">0/{players}</span></p>
        <p className="truncate">{parts.length ? parts.map((p, i) => <span key={i} style={{ color: p.color }}>{p.text}</span>) : <span className="text-[#aaa]">{tr("A Minecraft Server")}</span>}</p>
      </div>
    </div>
  );
}
