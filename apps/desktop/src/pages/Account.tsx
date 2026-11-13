import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Check, Layers, Pause, Clock, Copy, Crown, Gamepad2, History, ImagePlus, LogOut, Pencil, Play, RefreshCw, RotateCcw, Save,
  Server, Shield, ShieldAlert, Shirt, Trash2, UserPlus, UserRound, Users, X,
} from "lucide-react";
import { useApp } from "../state";
import { api, type AccountDetails, type LibrarySkin } from "../lib/ipc";
import { transitionProps } from "../lib/appearance";
import { Badge, Button, Glass, Modal, Segmented, Skeleton, Tabs, inputClass } from "../components/ui";
import { CapeFront, SkinFront, SkinViewer, type Back, type Pose } from "../components/account/SkinViewer";
import { SignIn } from "../components/account/SignIn";

type Tab = "overview" | "skins" | "capes" | "name" | "servers" | "accounts";

const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : m < 60 * 48 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.round(m / 60)} h`);
const ago = (unix: number) => {
  const s = Date.now() / 1000 - unix;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} days ago`;
  return new Date(unix * 1000).toLocaleDateString();
};
const dashed = (uuid: string) => (uuid.length === 32 ? `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}` : uuid);

function readPng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * Everything about the signed-in Minecraft account, like the Account tab of the official
 * launcher and more: a 3D preview of how others see you, skins (with a library), capes,
 * name changes, play stats, server history and switching between accounts.
 */
export function Account() {
  const { account, setAccount, appearance, toast } = useApp();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const details = useQuery({ queryKey: ["account-details", account?.uuid], queryFn: api.accountDetails, enabled: !!account, staleTime: 60_000, retry: 1 });
  const [preview, setPreview] = useState<{ skin: string; slim: boolean; name: string } | null>(null);
  const [pose, setPose] = useState<Pose>("idle");
  const [back, setBack] = useState<Back>("cape");
  const [spin, setSpin] = useState(false);
  const [paused, setPaused] = useState(false);
  const [layer, setLayer] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const set = (d: AccountDetails) => {
    qc.setQueryData(["account-details", account?.uuid], d);
    setPreview(null);
  };
  const run = async (what: string, fn: () => Promise<AccountDetails | void>) => {
    setBusy(true);
    try {
      const d = await fn();
      if (d) set(d);
      toast({ title: what, tone: "success" });
    } catch (e) {
      toast({ title: "That didn't work", body: String(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (!account) {
    return (
      <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-6">
        <Glass className="flex w-full flex-col items-center gap-4 p-8 text-center">
          <span className="grid size-14 place-items-center rounded-panel bg-copper/15 text-copper"><UserRound className="size-7" /></span>
          <h1 className="text-[24px] font-bold">Sign in to play</h1>
          <p className="max-w-[46ch] text-[15px] text-muted">Use the Microsoft account that owns Minecraft: Java Edition. Your password is only ever typed on Microsoft's own page.</p>
          <div className="w-full max-w-sm"><SignIn onDone={setAccount} /></div>
        </Glass>
      </div>
    );
  }

  const d = details.data;
  const skin = preview?.skin ?? d?.skinData ?? null;
  const slim = preview ? preview.slim : !!d?.slim;
  const name = d?.profile.name ?? account.username;

  return (
    <div className="mx-auto grid max-w-7xl gap-5 px-6 pb-10 pt-2 lg:grid-cols-[340px_1fr]">
      {/* ------------------------------------------------ 3D preview */}
      <Glass className="sticky top-2 flex h-[calc(100vh-110px)] min-h-[520px] flex-col overflow-hidden p-0 lg:self-start">
        <div
          className="relative m-3 flex-1 overflow-hidden rounded-panel border border-slate-line/60"
          style={{ backgroundColor: "rgb(255 255 255 / 0.02)", backgroundImage: "linear-gradient(45deg, rgb(255 255 255 / 0.04) 25%, transparent 25%, transparent 75%, rgb(255 255 255 / 0.04) 75%), linear-gradient(45deg, rgb(255 255 255 / 0.04) 25%, transparent 25%, transparent 75%, rgb(255 255 255 / 0.04) 75%)", backgroundSize: "28px 28px", backgroundPosition: "0 0, 14px 14px" }}
        >
          {skin ? (
            <SkinViewer skin={skin} slim={slim} cape={preview ? null : d?.capeData} back={back} pose={pose} name={preview ? preview.name : name} autoRotate={spin} resetKey={resetKey} paused={paused} outerLayer={layer} className="absolute inset-0" />
          ) : (
            <div className="absolute inset-0 grid place-items-center">{details.isLoading ? <Skeleton className="h-64 w-32" /> : <p className="px-6 text-center text-[14px] text-muted">Your skin couldn't be loaded.</p>}</div>
          )}
          {preview && (
            <div className="absolute inset-x-3 top-3 flex items-center justify-between rounded-card bg-slate-surface/90 px-3 py-2 text-[13px]">
              <span>Previewing <b>{preview.name}</b></span>
              <button type="button" onClick={() => setPreview(null)} className="text-muted hover:text-text" aria-label="Stop previewing"><X className="size-4" /></button>
            </div>
          )}
          {skin && (
            <div className="absolute right-2.5 top-2.5 flex flex-col gap-2" style={{ top: preview ? 52 : undefined }}>
              <button type="button" onClick={() => setPaused(!paused)} className="grid size-9 place-items-center rounded-card bg-slate-raised/90 text-text shadow hover:bg-slate-line" title={paused ? "Play animation" : "Pause animation"} aria-label={paused ? "Play animation" : "Pause animation"}>
                {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              </button>
              <button type="button" onClick={() => setLayer(!layer)} className={`grid size-9 place-items-center rounded-card shadow ${layer ? "bg-slate-raised/90 text-text hover:bg-slate-line" : "bg-copper text-on-accent"}`} title={layer ? "Hide outer layer (hat, jacket)" : "Show outer layer"} aria-label="Toggle outer skin layer">
                <Layers className="size-4" />
              </button>
            </div>
          )}
          <p className="pointer-events-none absolute bottom-2 w-full text-center text-[11px] text-muted">Drag to turn · Scroll to zoom</p>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-line/60 p-4">
          <Segmented<Pose> value={pose} onChange={setPose} options={[{ id: "idle", label: "Stand" }, { id: "walk", label: "Walk" }, { id: "run", label: "Run" }, { id: "wave", label: "Wave" }, { id: "crouch", label: "Sneak" }]} />
          <div className="flex items-center gap-2">
            {d?.capeData && !preview && (
              <Segmented<Back> value={back} onChange={setBack} options={[{ id: "cape", label: "Cape" }, { id: "elytra", label: "Elytra" }, { id: "none", label: "None" }]} />
            )}
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => setSpin(!spin)} className={`rounded-chip p-2 ${spin ? "bg-copper/20 text-copper" : "text-muted hover:bg-slate-raised hover:text-text"}`} title="Spin" aria-label="Spin"><RefreshCw className="size-4" /></button>
              <button type="button" onClick={() => setResetKey((k) => k + 1)} className="rounded-chip p-2 text-muted hover:bg-slate-raised hover:text-text" title="Reset view" aria-label="Reset view"><RotateCcw className="size-4" /></button>
            </div>
          </div>
        </div>
      </Glass>

      {/* ------------------------------------------------ details */}
      <div className="min-w-0">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex flex-wrap items-center gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-[30px] font-bold tracking-tight">{name}</h1>
              <Badge tone="accent">Java Edition</Badge>
            </div>
            <button type="button" onClick={() => navigator.clipboard?.writeText(dashed(account.uuid)).then(() => toast({ title: "UUID copied", tone: "success" }))} className="mt-0.5 flex items-center gap-1.5 font-mono text-[12px] text-muted hover:text-text" title="Copy UUID">
              {dashed(account.uuid)} <Copy className="size-3" />
            </button>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" icon={Users} onClick={() => setTab("accounts")}>Switch account</Button>
          </div>
        </motion.div>

        <Tabs<Tab>
          className="glass mb-5 rounded-panel p-1.5"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "overview", label: "Overview", icon: BarChart3 },
            { id: "skins", label: "Skins", icon: Shirt },
            { id: "capes", label: "Capes", icon: Crown, count: d?.profile.capes.length || undefined },
            { id: "name", label: "Name", icon: Pencil },
            { id: "servers", label: "Servers", icon: Server },
            { id: "accounts", label: "Accounts", icon: Users },
          ]}
        />
        {details.isError && tab !== "accounts" && (
          <Glass className="mb-4 flex items-center justify-between gap-3 p-4 text-[14px]">
            <span className="text-redstone">Couldn't load your profile from Minecraft: {String(details.error)}</span>
            <Button size="sm" onClick={() => details.refetch()}>Try again</Button>
          </Glass>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={tab} {...transitionProps(appearance, "tab")}>
            {tab === "overview" && <Overview d={d} />}
            {tab === "skins" && <Skins d={d} busy={busy} run={run} onPreview={setPreview} />}
            {tab === "capes" && <Capes d={d} busy={busy} run={run} />}
            {tab === "name" && <NameTab d={d} run={run} busy={busy} onRenamed={(n) => setAccount({ ...account, username: n })} />}
            {tab === "servers" && <Servers />}
            {tab === "accounts" && <Accounts />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

type Run = (what: string, fn: () => Promise<AccountDetails | void>) => Promise<void>;

function Card({ title, icon: Icon, children, className = "", action }: { title: string; icon?: typeof Clock; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <Glass className={`flex flex-col gap-3 p-5 ${className}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 text-copper" aria-hidden />}
        <h2 className="text-[15px] font-bold">{title}</h2>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </Glass>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Glass className="p-4">
      <div className="text-[12px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 truncate text-[22px] font-bold">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[12px] text-muted">{sub}</div>}
    </Glass>
  );
}

// ------------------------------------------------------------------ overview

function Overview({ d }: { d?: AccountDetails }) {
  const stats = useQuery({ queryKey: ["account-stats"], queryFn: api.accountStats, staleTime: 30_000 });
  const s = stats.data;
  const max = Math.max(1, ...(s?.days ?? [0]));
  const dayLabels = useMemo(() => Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 86400000).toLocaleDateString(undefined, { weekday: "narrow" })), []);
  const p = d?.privileges;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Time played" value={s ? fmtMinutes(s.totalMinutes) : "…"} sub={s ? `in ${s.instanceCount} instance${s.instanceCount === 1 ? "" : "s"}` : undefined} />
        <Stat label="Favourite version" value={s?.favouriteVersion ?? "None yet"} sub={s?.favouriteLoader ? `mostly ${s.favouriteLoader}` : undefined} />
        <Stat label="Most played" value={s?.mostPlayedInstance ?? "None yet"} sub={s?.lastPlayed ? `last played ${ago(s.lastPlayed)}` : undefined} />
        <Stat label="Sessions" value={s?.sessions ?? "…"} sub={s && s.longestSession > 0 ? `longest ${fmtMinutes(s.longestSession)}` : "on this account"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Last two weeks" icon={Clock} action={s && <span className="text-[12px] text-muted">{fmtMinutes(s.days.reduce((a, b) => a + b, 0))}</span>}>
          <div className="flex h-36 items-end gap-1.5">
            {(s?.days ?? Array(14).fill(0)).map((m, i) => (
              <div key={i} className="group flex flex-1 flex-col items-center gap-1">
                <div className="relative w-full flex-1">
                  <motion.div initial={{ height: 0 }} animate={{ height: `${(m / max) * 100}%` }} transition={{ delay: i * 0.02 }} className={`absolute bottom-0 w-full rounded-t-[4px] ${m > 0 ? "bg-copper/80 group-hover:bg-copper" : "bg-slate-line/60"}`} style={{ minHeight: 3 }} />
                  {m > 0 && <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-raised px-1.5 text-[11px] group-hover:block">{fmtMinutes(m)}</span>}
                </div>
                <span className="text-[10px] text-muted">{dayLabels[i]}</span>
              </div>
            ))}
          </div>
          {s && s.accountMinutes === 0 && <p className="text-[12px] text-muted">Ember started counting sessions for this account with this update. Play a game and it shows up here.</p>}
        </Card>

        <Card title="Versions you play" icon={Gamepad2}>
          {s?.versions.length ? (
            <div className="flex flex-col gap-2.5">
              {s.versions.map((v) => (
                <div key={v.name}>
                  <div className="flex justify-between text-[13px]"><span>{v.name}</span><span className="text-muted">{fmtMinutes(v.minutes)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-line/60"><div className="h-full rounded-full bg-copper" style={{ width: `${(v.minutes / (s.versions[0]?.minutes || 1)) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">Play a little and your versions show up here.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Multiplayer" icon={p?.bans.length ? ShieldAlert : Shield}>
          {p ? (
            <div className="flex flex-col gap-2 text-[14px]">
              <Privilege on={p.multiplayerServer} label="Join servers" />
              <Privilege on={p.multiplayerRealms} label="Play on Realms" />
              <Privilege on={p.onlineChat} label="Chat with other players" />
              {p.bans.map((b) => <p key={b} className="rounded-card bg-redstone/10 px-3 py-2 text-[13px] text-redstone">Your account has a {b}.</p>)}
              {(!p.multiplayerServer || !p.onlineChat) && <p className="text-[12px] text-muted">Turned off by your Microsoft family or privacy settings (account.xbox.com).</p>}
            </div>
          ) : (
            <Skeleton className="h-20" />
          )}
        </Card>
        <Card title="Profile" icon={UserRound}>
          <div className="flex flex-col gap-1.5 text-[14px]">
            <Row label="Skin" value={d ? (d.profile.skins.find((x) => x.state === "ACTIVE")?.alias ? `Default (${d.profile.skins.find((x) => x.state === "ACTIVE")?.alias})` : `Custom, ${d.slim ? "slim" : "classic"} arms`) : "…"} />
            <Row label="Cape" value={d ? (d.profile.capes.find((c) => c.state === "ACTIVE")?.alias ?? (d.profile.capes.length ? "Hidden" : "None owned")) : "…"} />
            <Row label="Capes owned" value={d ? String(d.profile.capes.length) : "…"} />
            <Row label="Name can change" value={d?.nameChange ? (d.nameChange.nameChangeAllowed ? "Yes, now" : nextNameChange(d.nameChange.changedAt) ?? "Not yet") : "…"} />
            {d?.nameChange?.createdAt && <Row label="Account created" value={new Date(d.nameChange.createdAt).toLocaleDateString()} />}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-line/40 py-1 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}

function Privilege({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`grid size-5 place-items-center rounded-full ${on ? "bg-copper/20 text-copper" : "bg-redstone/15 text-redstone"}`}>{on ? <Check className="size-3" /> : <X className="size-3" />}</span>
      {label}
    </div>
  );
}

function nextNameChange(changedAt?: string | null): string | null {
  if (!changedAt) return null;
  const next = new Date(changedAt).getTime() + 30 * 86400000;
  const days = Math.ceil((next - Date.now()) / 86400000);
  return days > 0 ? `in ${days} day${days === 1 ? "" : "s"} (${new Date(next).toLocaleDateString()})` : null;
}

// ------------------------------------------------------------------ skins

function Skins({ d, busy, run, onPreview }: { d?: AccountDetails; busy: boolean; run: Run; onPreview: (p: { skin: string; slim: boolean; name: string } | null) => void }) {
  const library = useQuery({ queryKey: ["skin-library"], queryFn: api.skinsList });
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ data: string; name: string } | null>(null);
  const [slim, setSlim] = useState(false);
  const [drag, setDrag] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refreshLib = () => qc.invalidateQueries({ queryKey: ["skin-library"] });
  const isDefault = !!d?.profile.skins.find((s) => s.state === "ACTIVE")?.alias;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".png")) return;
    const data = await readPng(f);
    setPending({ data, name: f.name.replace(/\.png$/i, "") });
    onPreview({ skin: data, slim, name: f.name.replace(/\.png$/i, "") });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="Your skin" icon={Shirt}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px] text-muted">Arms</span>
          <Segmented<"classic" | "slim">
            value={d?.slim ? "slim" : "classic"}
            onChange={(v) => !isDefault && run("Arm style changed", () => api.accountSetVariant(v === "slim"))}
            options={[{ id: "classic", label: "Classic (wide)" }, { id: "slim", label: "Slim" }]}
          />
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" icon={Save} disabled={busy || isDefault} onClick={() => run("Saved to your library", async () => { await api.skinSaveCurrent(); refreshLib(); })}>Save to library</Button>
            <Button size="sm" variant="ghost" icon={RotateCcw} disabled={busy || isDefault} onClick={() => run("Back to the default skin", api.accountResetSkin)}>Use default skin</Button>
          </div>
        </div>
      </Card>

      <Glass
        className={`flex flex-col items-center gap-3 border-2 border-dashed p-6 text-center transition-colors ${drag ? "border-copper bg-copper/5" : "border-slate-line/70"}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
      >
        <input ref={file} type="file" accept="image/png" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {!pending ? (
          <>
            <ImagePlus className="size-7 text-copper" aria-hidden />
            <p className="text-[15px] font-medium">Drop a skin PNG here</p>
            <p className="text-[13px] text-muted">64×64 pixels, from your computer or sites like NameMC and The Skindex. You'll see it on the left before wearing it.</p>
            <Button size="sm" onClick={() => file.current?.click()}>Choose file</Button>
          </>
        ) : (
          <div className="flex w-full flex-wrap items-center gap-4 text-left">
            <SkinFront skin={pending.data} slim={slim} size={72} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{pending.name}</p>
              <div className="mt-2">
                <Segmented<"classic" | "slim"> value={slim ? "slim" : "classic"} onChange={(v) => { setSlim(v === "slim"); onPreview({ skin: pending.data, slim: v === "slim", name: pending.name }); }} options={[{ id: "classic", label: "Classic" }, { id: "slim", label: "Slim" }]} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setPending(null); onPreview(null); }}>Cancel</Button>
              <Button size="sm" icon={Save} disabled={busy} onClick={() => run("Saved to your library", async () => { await api.skinSave(pending.name, pending.data, slim); refreshLib(); setPending(null); onPreview(null); })}>Save only</Button>
              <Button variant="primary" size="sm" icon={Shirt} loading={busy} onClick={() => run("Skin changed: it shows in game the next time you join", async () => { const r = await api.accountUploadSkin(pending.data, slim, pending.name); refreshLib(); setPending(null); return r; })}>Wear it</Button>
            </div>
          </div>
        )}
      </Glass>

      <Card title="Skin library" icon={History} action={<span className="text-[12px] text-muted">Saved on this computer</span>}>
        {library.data?.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
            {library.data.map((s: LibrarySkin) => (
              <div key={s.id} className="group flex flex-col items-center gap-2 rounded-card border border-slate-line/60 bg-slate-surface/60 p-3 hover:border-copper/60">
                <button type="button" onClick={() => onPreview({ skin: s.data, slim: s.slim, name: s.name })} title="Preview on the left" className="grid h-[84px] place-items-center">
                  <SkinFront skin={s.data} slim={s.slim} size={80} />
                </button>
                {renaming === s.id ? (
                  <input
                    autoFocus
                    defaultValue={s.name}
                    className={`${inputClass} !py-1 text-center text-[13px]`}
                    onBlur={(e) => { api.skinRename(s.id, e.target.value || s.name).then(refreshLib); setRenaming(null); }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <button type="button" onClick={() => setRenaming(s.id)} className="w-full truncate text-center text-[13px] hover:text-copper" title="Rename">{s.name}</button>
                )}
                <div className="flex w-full gap-1">
                  <Button size="sm" variant="primary" className="flex-1 !px-2" disabled={busy} onClick={() => run("Skin changed: it shows in game the next time you join", () => api.skinApply(s.id))}>Wear</Button>
                  <button type="button" onClick={() => api.skinDelete(s.id).then(refreshLib)} className="rounded-chip px-2 text-muted hover:bg-redstone/15 hover:text-redstone" aria-label={`Delete ${s.name}`}><Trash2 className="size-4" /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted">Skins you upload, or save with "Save to library", stay here so you can switch back any time.</p>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ capes

function Capes({ d, busy, run }: { d?: AccountDetails; busy: boolean; run: Run }) {
  if (!d) return <Skeleton className="h-40" />;
  const active = d.profile.capes.find((c) => c.state === "ACTIVE");
  if (!d.profile.capes.length) {
    return (
      <Glass className="p-6 text-[14px] text-muted">
        <p className="text-[16px] font-bold text-text">You don't own any capes</p>
        <p className="mt-1">Capes come from events and offers, like Minecon, Migrator (moving a Mojang account), or bonuses from buying Minecraft and some promotions. Ones you own show up here so you can pick which to wear.</p>
      </Glass>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
      <button type="button" disabled={busy} onClick={() => run("Cape hidden", () => api.accountSetCape(null))} className={`flex h-[150px] flex-col items-center justify-center gap-2 rounded-panel border p-3 ${!active ? "border-copper bg-copper/10" : "border-slate-line/60 bg-slate-surface/60 hover:border-copper/60"}`}>
        <X className="size-8 text-muted" />
        <span className="text-[13px]">No cape</span>
      </button>
      {d.profile.capes.map((c) => (
        <button key={c.id} type="button" disabled={busy} onClick={() => run(`Wearing ${c.alias ?? "cape"}`, () => api.accountSetCape(c.id))} className={`flex h-[150px] flex-col items-center justify-center gap-2 rounded-panel border p-3 ${c.state === "ACTIVE" ? "border-copper bg-copper/10" : "border-slate-line/60 bg-slate-surface/60 hover:border-copper/60"}`}>
          {d.capeImages[c.id] ? <CapeFront cape={d.capeImages[c.id] ?? ""} size={88} /> : <Crown className="size-8 text-muted" />}
          <span className="text-[13px]">{c.alias ?? "Cape"}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ name

function NameTab({ d, run, busy, onRenamed }: { d?: AccountDetails; run: Run; busy: boolean; onRenamed: (n: string) => void }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "AVAILABLE" | "DUPLICATE" | "NOT_ALLOWED" | "invalid">("idle");
  const [confirm, setConfirm] = useState(false);
  const allowed = d?.nameChange?.nameChangeAllowed ?? false;
  const next = nextNameChange(d?.nameChange?.changedAt);

  useEffect(() => {
    const n = name.trim();
    if (!n) return setStatus("idle");
    if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) return setStatus("invalid");
    setStatus("checking");
    const t = setTimeout(() => api.accountNameCheck(n).then((s) => setStatus(s as typeof status)).catch(() => setStatus("idle")), 450);
    return () => clearTimeout(t);
  }, [name]);

  const msg = {
    idle: null,
    checking: <span className="text-muted">Checking…</span>,
    AVAILABLE: <span className="text-copper">Available</span>,
    DUPLICATE: <span className="text-redstone">Someone already has this name</span>,
    NOT_ALLOWED: <span className="text-redstone">Not allowed</span>,
    invalid: <span className="text-redstone">3 to 16 characters: letters, numbers and _</span>,
  }[status];

  return (
    <div className="flex flex-col gap-4">
      <Card title="Change your name" icon={Pencil}>
        <p className="text-[14px] text-muted">Your name is what other players see above your head and in chat. You can change it once every 30 days, and your old name becomes free for others after a while.</p>
        <div className={`rounded-card px-4 py-3 text-[14px] ${allowed ? "bg-copper/10 text-copper" : "bg-slate-surface text-muted"}`}>
          {!d ? "Checking…" : allowed ? "You can change your name now." : next ? `You can change it again ${next}.` : "Name changes aren't available for this account right now."}
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-[240px] flex-1">
            <input className={inputClass} placeholder={d?.profile.name ?? "New name"} value={name} maxLength={16} onChange={(e) => setName(e.target.value)} disabled={!allowed} aria-label="New name" />
            <p className="mt-1.5 h-5 text-[13px]">{msg}</p>
          </div>
          <Button variant="primary" disabled={!allowed || status !== "AVAILABLE" || busy} onClick={() => setConfirm(true)}>Change name</Button>
        </div>
      </Card>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Change your name to ${name.trim()}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => { setConfirm(false); run(`You're now ${name.trim()}`, async () => { const r = await api.accountNameChange(name.trim()); onRenamed(r.profile.name); setName(""); return r; }); }}>Change it</Button>
          </>
        }
      >
        <p className="text-[14px] text-muted">You won't be able to change it again for 30 days. Servers that list you by name (whitelists, ranks) may need updating.</p>
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ servers

function Servers() {
  const stats = useQuery({ queryKey: ["account-stats"], queryFn: api.accountStats, staleTime: 30_000 });
  const { instances, play, toast } = useApp();
  const list = stats.data?.servers ?? [];
  if (!list.length) {
    return (
      <Glass className="p-6 text-[14px] text-muted">
        <p className="text-[16px] font-bold text-text">No servers yet</p>
        <p className="mt-1">Servers you join from Ember show up here, with when you last played and from which instance, so you can jump back in with one click.</p>
      </Glass>
    );
  }
  return (
    <Glass className="divide-y divide-slate-line/50 p-1.5">
      {list.map((s) => {
        const inst = instances.find((i) => i.id === s.instance);
        return (
          <div key={s.address + s.instance} className="flex items-center gap-3 rounded-card px-3 py-2.5 hover:bg-slate-raised/50">
            <span className="grid size-9 shrink-0 place-items-center rounded-card bg-slate-raised text-copper"><Server className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium">{s.address}</div>
              <div className="truncate text-[12px] text-muted">{ago(s.lastJoined)} · {s.joins} join{s.joins === 1 ? "" : "s"} · {s.instanceName} ({s.version})</div>
            </div>
            <button type="button" className="rounded-chip p-2 text-muted hover:bg-slate-raised hover:text-text" aria-label="Copy address" onClick={() => navigator.clipboard?.writeText(s.address).then(() => toast({ title: "Address copied", tone: "success" }))}><Copy className="size-4" /></button>
            {inst && <Button size="sm" variant="primary" icon={Play} onClick={() => play(inst, s.address)}>Play</Button>}
          </div>
        );
      })}
    </Glass>
  );
}

// ------------------------------------------------------------------ accounts

function Accounts() {
  const { setAccount, toast } = useApp();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["accounts"], queryFn: api.accountsList });
  const [adding, setAdding] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["account-details"] });
    qc.invalidateQueries({ queryKey: ["account-stats"] });
  };
  return (
    <div className="flex flex-col gap-4">
      <Glass className="divide-y divide-slate-line/50 p-1.5">
        {(list.data ?? []).map((a) => (
          <div key={a.uuid} className="flex items-center gap-3 rounded-card px-3 py-2.5">
            <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-card bg-copper/20 font-bold text-copper">
              {a.username.slice(0, 1).toUpperCase()}
              <img src={`https://mc-heads.net/avatar/${a.uuid}/40`} alt="" className="absolute inset-0 size-full [image-rendering:pixelated]" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[15px] font-medium">{a.username} {a.active && <Badge tone="accent">Playing as</Badge>} {a.needsSignIn && <Badge tone="gold">Sign in again</Badge>}</div>
              <div className="text-[12px] text-muted">Last used {a.lastUsed ? ago(a.lastUsed) : "never"}</div>
            </div>
            {!a.active && (
              <Button size="sm" onClick={async () => {
                try {
                  setAccount(await api.accountSwitch(a.uuid));
                  refresh();
                  toast({ title: `Playing as ${a.username}`, tone: "success" });
                } catch (e) {
                  toast({ title: "Couldn't switch", body: a.needsSignIn ? "This account needs you to sign in again: remove it and add it back." : String(e), tone: "error" });
                }
              }}>Switch</Button>
            )}
            <button type="button" className="rounded-chip p-2 text-muted hover:bg-redstone/15 hover:text-redstone" aria-label={`Remove ${a.username}`} title="Remove from Ember" onClick={async () => {
              await api.accountRemove(a.uuid);
              setAccount(await api.currentAccount().catch(() => null));
              refresh();
            }}>{a.active ? <LogOut className="size-4" /> : <Trash2 className="size-4" />}</button>
          </div>
        ))}
      </Glass>
      <Glass className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2"><UserPlus className="size-4 text-copper" /><h2 className="text-[15px] font-bold">Add another account</h2></div>
        <p className="text-[13px] text-muted">Sign in with another Microsoft account and switch between them here. Each account keeps its own skins, name and stats. Tip: if Microsoft signs you straight into the wrong account, use a private browser window.</p>
        {adding ? (
          <SignIn compact label="Continue" onDone={(acc) => { setAccount(acc); setAdding(false); refresh(); toast({ title: `Added ${acc.username}`, tone: "success" }); }} />
        ) : (
          <div><Button icon={UserPlus} onClick={() => setAdding(true)}>Add account</Button></div>
        )}
      </Glass>
    </div>
  );
}
