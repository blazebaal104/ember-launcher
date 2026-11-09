import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Compass, Copy, ExternalLink, FolderOpen, Globe2, Play, Plus, Puzzle, Router, ScrollText, Server, Settings2, Square, Trash2, Users, Wifi } from "lucide-react";
import { useApp } from "../state";
import { api, type ServerKind, type ServerView } from "../lib/ipc";
import { useServers, useSystemInfo, useVersions } from "../lib/queries";
import { open } from "../lib/links";
import { Badge, Button, Empty, Field, Glass, Modal, Segmented, Skeleton, Slider, Tabs, Toggle, inputClass } from "../components/ui";
import { Console } from "../components/Console";
import { instanceGradient } from "./Home";

const KIND_INFO: Record<ServerKind, { label: string; text: string }> = {
  paper: { label: "Paper", text: "Fast, and runs plugins (EssentialsX, WorldEdit, LuckPerms…). Best for most friend servers." },
  fabric: { label: "Fabric", text: "Runs Fabric mods. Everyone joining needs the same mods." },
  vanilla: { label: "Vanilla", text: "Plain Minecraft, exactly as Mojang ships it." },
};

export function Servers() {
  const { id } = useParams();
  return id ? <ServerDetail id={id} /> : <ServerList />;
}

function ServerList() {
  const servers = useServers();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get("new") === "1");
  useEffect(() => {
    if (params.get("new") === "1") setParams({}, { replace: true });
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-2">
      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight">Play with friends</h1>
          <p className="mt-1 max-w-[70ch] text-muted">Two ways to play together: share a singleplayer world in one click, or run a dedicated server that stays up while you play.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New server</Button>
      </motion.header>

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <Glass className="relative overflow-hidden p-5">
          <motion.div aria-hidden className="absolute -right-8 -top-8 size-40 rounded-full bg-copper/25 blur-3xl" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <Globe2 className="relative size-6 text-copper" />
          <h2 className="relative mt-2 text-[17px] font-bold">Share your world</h2>
          <p className="relative mt-1 text-[13px] text-muted">Open an instance → Worlds → <b>Turn on sharing</b>. In game, “Open to LAN” then gives a public address anyone can join, even friends without mods. Nothing to set up on your router.</p>
        </Glass>
        <Glass className="relative overflow-hidden p-5">
          <Server className="size-6 text-copper" />
          <h2 className="mt-2 text-[17px] font-bold">Dedicated server</h2>
          <p className="mt-1 text-[13px] text-muted">A real server on this PC with plugins or mods, its own console and settings. Friends on your Wi-Fi join right away; for friends elsewhere, the server page shows how to open it to the internet.</p>
        </Glass>
      </div>

      {servers.isLoading ? <Skeleton className="h-40" /> : servers.data?.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {servers.data.map((s, i) => (
            <motion.li key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} onClick={() => navigate(`/servers/${s.id}`)} className="glass lift cursor-pointer overflow-hidden rounded-panel">
              <div className="relative h-20" style={{ background: instanceGradient(s.name) }}>
                <div className="block-grid absolute inset-0 opacity-40" />
                <span className="absolute right-3 top-3">{s.running ? <Badge tone="accent"><span className="size-1.5 animate-pulse rounded-full bg-copper" /> Online</Badge> : <Badge>Offline</Badge>}</span>
              </div>
              <div className="p-4">
                <h3 className="truncate text-[16px] font-bold">{s.name}</h3>
                <p className="text-[13px] text-muted">{KIND_INFO[s.kind].label} {s.gameVersion} · port {s.port}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      ) : <Empty icon={Users} title="No servers yet" action={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Create one</Button>}>A server keeps a shared world for you and your friends.</Empty>}

      <CreateServer open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateServer({ open: isOpen, onClose }: { open: boolean; onClose: () => void }) {
  const versions = useVersions();
  const sys = useSystemInfo();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useApp();
  const releases = (versions.data ?? []).filter((v) => v.channel === "release");
  const [name, setName] = useState("Friends SMP");
  const [kind, setKind] = useState<ServerKind>("paper");
  const [version, setVersion] = useState("");
  const [memory, setMemory] = useState(4096);
  const [players, setPlayers] = useState(10);
  const [gamemode, setGamemode] = useState("survival");
  const [difficulty, setDifficulty] = useState("normal");
  const [busy, setBusy] = useState(false);
  useEffect(() => setVersion((v) => v || releases[0]?.id || ""), [releases]);
  const maxMem = Math.max(2048, Math.min(16384, Math.floor(((sys.data?.totalMemoryMb ?? 8192) * 0.5) / 512) * 512));

  const create = async () => {
    setBusy(true);
    try {
      const s = await api.createServer({ name, kind, gameVersion: version, memoryMb: memory, maxPlayers: players, gamemode, difficulty });
      qc.invalidateQueries({ queryKey: ["servers"] });
      onClose();
      navigate(`/servers/${s.id}`);
    } catch (e) {
      toast({ title: "Couldn't create the server", body: String(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="New server" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={Plus} loading={busy} disabled={!version || !name.trim()} onClick={create}>Create server</Button></>}>
      <div className="flex flex-col gap-5">
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">Type</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(KIND_INFO) as ServerKind[]).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`press rounded-card border p-3 text-left ${kind === k ? "border-copper bg-copper/10" : "border-slate-line hover:border-muted"}`}>
                <span className="flex items-center gap-1.5 text-[14px] font-bold">{KIND_INFO[k].label}{k === "paper" && <Badge tone="accent">Recommended</Badge>}</span>
                <span className="mt-1 block text-[12px] text-muted">{KIND_INFO[k].text}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label="Minecraft version">
          <select value={version} onChange={(e) => setVersion(e.target.value)} className={inputClass}>{releases.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}</select>
        </Field>
        <Slider label="Memory" value={memory} onChange={setMemory} min={1024} max={maxMem} step={512} format={(v) => `${(v / 1024).toFixed(1)} GB`} detail="4 GB is plenty for up to ~10 players without heavy mods." />
        <Slider label="Max players" value={players} onChange={setPlayers} min={2} max={50} format={(v) => `${v}`} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Game mode"><select value={gamemode} onChange={(e) => setGamemode(e.target.value)} className={inputClass}>{["survival", "creative", "adventure"].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Difficulty"><select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={inputClass}>{["peaceful", "easy", "normal", "hard"].map((d) => <option key={d}>{d}</option>)}</select></Field>
        </div>
      </div>
    </Modal>
  );
}

type STab = "console" | "settings" | "addons" | "share";

function ServerDetail({ id }: { id: string }) {
  const servers = useServers();
  const s = servers.data?.find((x) => x.id === id);
  const [tab, setTab] = useState<STab>("console");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useApp();
  const [eulaOpen, setEulaOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (servers.isLoading) return <div className="p-10"><Skeleton className="h-60" /></div>;
  if (!s) return <div className="p-10"><Empty icon={Server} title="Server not found" /></div>;

  const start = async () => {
    if (!s.eulaAccepted) return setEulaOpen(true);
    setBusy(true);
    try {
      await api.startServer(s.id);
      toast({ title: `${s.name} is starting`, body: "The first start downloads the server and generates the world. Watch the console.", tone: "info" });
    } catch (e) {
      toast({ title: "Couldn't start", body: String(e), tone: "error" });
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["servers"] });
    }
  };
  const stop = async () => {
    await api.stopServer(s.id).catch(() => {});
    qc.invalidateQueries({ queryKey: ["servers"] });
  };

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-2">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass relative mb-4 overflow-hidden rounded-panel">
        <div className="absolute inset-0 opacity-50" style={{ background: instanceGradient(s.name) }} />
        <div className="block-grid absolute inset-0 opacity-40" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 p-6">
          <div>
            <button type="button" onClick={() => navigate("/servers")} className="text-[13px] text-white/70 hover:text-white">← All servers</button>
            <h1 className="mt-1 font-pixel text-[38px] leading-none text-white">{s.name}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>{KIND_INFO[s.kind].label} {s.gameVersion}</Badge>
              <Badge>Port {s.port}</Badge>
              {s.running ? <Badge tone="accent">Online</Badge> : <Badge>Offline</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button icon={FolderOpen} className="bg-black/20 text-white" onClick={() => api.openServerFolder(s.id)}>Folder</Button>
            {s.running ? <Button variant="secondary" icon={Square} onClick={stop}>Stop</Button> : <Button variant="primary" size="lg" icon={Play} loading={busy} onClick={start}>Start server</Button>}
          </div>
        </div>
      </motion.section>
      <Tabs<STab> className="glass mb-5 rounded-panel p-1.5" value={tab} onChange={setTab} tabs={[{ id: "console", label: "Console", icon: ScrollText }, { id: "settings", label: "Settings", icon: Settings2 }, { id: "addons", label: s.kind === "paper" ? "Plugins" : "Mods", icon: Puzzle }, { id: "share", label: "Invite friends", icon: Globe2 }]} />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          {tab === "console" && <Glass className="h-[58vh] p-4"><Console logKey={`server:${s.id}`} onCommand={(c) => api.serverCommand(s.id, c).catch((e) => toast({ title: "Command failed", body: String(e), tone: "error" }))} placeholder={s.running ? "Command, e.g. op YourName · whitelist add Friend · time set day" : "Start the server to send commands"} /></Glass>}
          {tab === "settings" && <ServerSettings s={s} />}
          {tab === "addons" && <Addons s={s} />}
          {tab === "share" && <Share s={s} />}
        </motion.div>
      </AnimatePresence>
      <Modal open={eulaOpen} onClose={() => setEulaOpen(false)} title="One thing before the first start" footer={<><Button onClick={() => setEulaOpen(false)}>Not now</Button><Button variant="primary" icon={CheckCircle2} onClick={async () => { await api.acceptEula(s.id); setEulaOpen(false); qc.invalidateQueries({ queryKey: ["servers"] }); start(); }}>I agree, start the server</Button></>}>
        <p className="text-[14px]">Mojang requires everyone who runs a Minecraft server to accept the Minecraft End User License Agreement.</p>
        <button type="button" onClick={() => open("https://aka.ms/MinecraftEULA")} className="mt-3 flex items-center gap-1.5 text-[14px] text-copper hover:underline"><ExternalLink className="size-4" /> Read the EULA</button>
      </Modal>
    </div>
  );
}

function ServerSettings({ s }: { s: ServerView }) {
  const props = useQuery({ queryKey: ["props", s.id], queryFn: () => api.serverProperties(s.id) });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const { toast } = useApp();
  const qc = useQueryClient();
  useEffect(() => props.data && setDraft(props.data), [props.data]);
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const save = async () => {
    const saved = await api.setServerProperties(s.id, draft);
    qc.setQueryData(["props", s.id], saved);
    qc.invalidateQueries({ queryKey: ["servers"] });
    toast({ title: "Saved", body: s.running ? "Restart the server to apply." : undefined, tone: "success" });
  };
  if (props.isLoading) return <Skeleton className="h-60" />;
  const bool = (k: string) => (draft[k] ?? "false") === "true";
  return (
    <Glass className="grid gap-5 p-6 md:grid-cols-2">
      <Field label="Message of the day (shown in the server list)"><input value={draft.motd ?? ""} onChange={(e) => set("motd", e.target.value)} className={inputClass} /></Field>
      <Field label="Port"><input value={draft["server-port"] ?? "25565"} onChange={(e) => set("server-port", e.target.value.replace(/\D/g, ""))} className={inputClass} /></Field>
      <Field label="Game mode"><select value={draft.gamemode ?? "survival"} onChange={(e) => set("gamemode", e.target.value)} className={inputClass}>{["survival", "creative", "adventure", "spectator"].map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Difficulty"><select value={draft.difficulty ?? "normal"} onChange={(e) => set("difficulty", e.target.value)} className={inputClass}>{["peaceful", "easy", "normal", "hard"].map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Slider label="Max players" value={Number(draft["max-players"] ?? 10)} onChange={(v) => set("max-players", String(v))} min={1} max={100} />
      <Slider label="View distance" value={Number(draft["view-distance"] ?? 10)} onChange={(v) => set("view-distance", String(v))} min={3} max={32} format={(v) => `${v} chunks`} />
      <Toggle checked={bool("pvp") || draft.pvp === undefined} onChange={(v) => set("pvp", String(v))} label="Player vs player" />
      <Toggle checked={bool("white-list")} onChange={(v) => set("white-list", String(v))} label="Whitelist only" detail="Add players with the console: whitelist add Name" />
      <Toggle checked={draft["online-mode"] !== "false"} onChange={(v) => set("online-mode", String(v))} label="Require real Minecraft accounts" detail="Keep this on. Turning it off lets anyone join with any name." />
      <Toggle checked={bool("allow-flight")} onChange={(v) => set("allow-flight", String(v))} label="Allow flight" detail="Needed by some mods/plugins." />
      <div className="md:col-span-2"><Button variant="primary" onClick={save}>Save settings</Button></div>
    </Glass>
  );
}

function Addons({ s }: { s: ServerView }) {
  const navigate = useNavigate();
  if (s.kind === "vanilla") return <Empty icon={Puzzle} title="Vanilla servers can't load add-ons">Create a Paper server for plugins or a Fabric server for mods.</Empty>;
  return (
    <Glass className="flex flex-wrap items-center gap-4 p-6">
      <Puzzle className="size-8 text-copper" />
      <div className="min-w-0 flex-1">
        <h3 className="text-[16px] font-bold">{s.kind === "paper" ? "Plugins" : "Server mods"}</h3>
        <p className="text-[13px] text-muted">{s.kind === "paper" ? "Browse plugins and install them straight onto this server. Popular picks: EssentialsX, LuckPerms, WorldEdit, Chunky." : "Server-side mods go in the mods folder. Players need the same mods in their instance."}</p>
      </div>
      <Button icon={FolderOpen} onClick={() => api.openServerFolder(s.id)}>Open folder</Button>
      <Button variant="primary" icon={Compass} onClick={() => navigate(s.kind === "paper" ? "/discover/plugins" : "/discover/mods")}>Browse {s.kind === "paper" ? "plugins" : "mods"}</Button>
    </Glass>
  );
}

function Share({ s }: { s: ServerView }) {
  const net = useQuery({ queryKey: ["net"], queryFn: api.networkInfo });
  const [method, setMethod] = useState<"playit" | "router">("playit");
  const { toast } = useApp();
  const lan = net.data?.lanIp ? `${net.data.lanIp}${s.port === 25565 ? "" : `:${s.port}`}` : null;
  const copy = (t: string) => {
    navigator.clipboard?.writeText(t);
    toast({ title: "Copied", body: t, tone: "success" });
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Glass className="p-5">
        <Wifi className="size-6 text-copper" />
        <h3 className="mt-2 text-[16px] font-bold">Same Wi-Fi / network</h3>
        <p className="mt-1 text-[13px] text-muted">Friends at your place join with this address (Multiplayer → Add Server). You join with <b>localhost</b>.</p>
        {lan && <button type="button" onClick={() => copy(lan)} className="press mt-3 flex w-full items-center justify-between rounded-card bg-slate-raised px-4 py-3 font-[ui-monospace,monospace] text-[15px]">{lan}<Copy className="size-4 text-muted" /></button>}
      </Glass>
      <Glass className="p-5">
        <Globe2 className="size-6 text-copper" />
        <h3 className="mt-2 text-[16px] font-bold">Friends anywhere in the world</h3>
        <div className="mt-3"><Segmented value={method} onChange={setMethod} options={[{ id: "playit", label: "playit.gg (easiest)" }, { id: "router", label: "Port forwarding", icon: Router }]} /></div>
        {method === "playit" ? (
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-[13px] text-muted">
            <li>Download the free playit.gg program and run it while the server is on.</li>
            <li>It shows a link: open it and sign in to claim the agent.</li>
            <li>Add a <b>Minecraft Java</b> tunnel pointing to <b>localhost:{s.port}</b>.</li>
            <li>Share the address playit gives you (like <i>something.joinmc.link</i>). It stays the same every time.</li>
            <li><Button size="sm" variant="primary" icon={ExternalLink} onClick={() => open("https://playit.gg/download")}>Get playit.gg</Button></li>
          </ol>
        ) : (
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-[13px] text-muted">
            <li>Open your router's admin page (often 192.168.1.1) and find “Port forwarding”.</li>
            <li>Forward TCP port <b>{s.port}</b> to this PC ({net.data?.lanIp ?? "your LAN IP"}).</li>
            <li>Allow Java through Windows Firewall when asked.</li>
            <li>Friends join with your public IP (search “what is my IP”).</li>
          </ol>
        )}
      </Glass>
    </div>
  );
}
