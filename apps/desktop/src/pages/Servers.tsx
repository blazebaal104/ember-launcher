import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, ExternalLink, FolderOpen, Globe2, Play, Plus, Puzzle, RotateCw, ScrollText, Server, Settings2, Square, UserPlus, Users } from "lucide-react";
import { useApp } from "../state";
import { api, onEvent, type ServerKind } from "../lib/ipc";
import { useServers } from "../lib/queries";
import { open } from "../lib/links";
import { Badge, Button, Empty, Glass, IconButton, Modal, Skeleton, Tabs } from "../components/ui";
import { CreateWizard } from "../components/server/CreateWizard";
import { InvitePanel } from "../components/server/InvitePanel";
import { ServerMods, ServerPlayers, ServerSettings, ServerWorld } from "../components/server/ServerTabs";
import { Console } from "../components/Console";
import { ServerDashboard } from "../components/ServerDashboard";
import { transitionProps } from "../lib/appearance";
import { instanceGradient } from "./Home";
import { tr, trn } from "../lib/i18n";

const KIND_INFO: Record<ServerKind, { label: string; text: string }> = {
  paper: { label: tr("Paper"), text: tr("Highly optimised, runs plugins (EssentialsX, WorldEdit, LuckPerms…). Best for most friend servers.") },
  fabric: { label: tr("Fabric"), text: tr("Runs Fabric mods. Comes with Lithium, FerriteCore, Krypton and ModernFix for speed.") },
  vanilla: { label: tr("Vanilla"), text: tr("Plain Minecraft, exactly as Mojang ships it.") },
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
          <h1 className="text-[30px] font-bold tracking-tight">{tr("Play with friends")}</h1>
          <p className="mt-1 max-w-[70ch] text-muted">{tr("Two ways to play together: share a singleplayer world in one click, or run a dedicated server that stays up while you play.")}</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>{tr("New server")}</Button>
      </motion.header>

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <Glass className="relative overflow-hidden p-5">
          <motion.div aria-hidden className="absolute -right-8 -top-8 size-40 rounded-full bg-copper/25 blur-3xl" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <Globe2 className="relative size-6 text-copper" />
          <h2 className="relative mt-2 text-[17px] font-bold">{tr("Share your world")}</h2>
          <p className="relative mt-1 text-[13px] text-muted">{trn(tr("Open an instance → Worlds → {b}. In game, “Open to LAN” then gives a public address anyone can join, even friends without mods. Nothing to set up on your router."), { b: <b>{tr("Turn on sharing")}</b> })}</p>
        </Glass>
        <Glass className="relative overflow-hidden p-5">
          <Server className="size-6 text-copper" />
          <h2 className="mt-2 text-[17px] font-bold">{tr("Dedicated server")}</h2>
          <p className="mt-1 text-[13px] text-muted">{trn(tr("A real server on this PC with plugins or mods, backups and its own dashboard. {b} on the server page gets everyone in, wherever they are."), { b: <b>{tr("Invite friends")}</b> })}</p>
        </Glass>
      </div>

      {servers.isLoading ? <Skeleton className="h-40" /> : servers.data?.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {servers.data.map((s, i) => (
            <motion.li key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} onClick={() => navigate(`/servers/${s.id}`)} className="glass lift cursor-pointer overflow-hidden rounded-panel">
              <div className="relative h-20" style={{ background: instanceGradient(s.name) }}>
                <div className="block-grid absolute inset-0 opacity-40" />
                <span className="absolute right-3 top-3">{s.running ? <Badge tone="accent"><span className="size-1.5 animate-pulse rounded-full bg-copper" /> {tr("Online")}</Badge> : <Badge>{tr("Offline")}</Badge>}</span>
              </div>
              <div className="p-4">
                <h3 className="truncate text-[16px] font-bold">{s.name}</h3>
                <p className="text-[13px] text-muted">{tr("{label} {gameVersion} · port {port}", { label: KIND_INFO[s.kind].label, gameVersion: s.gameVersion, port: s.port })}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      ) : <Empty icon={Users} title={tr("No servers yet")} action={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>{tr("Create one")}</Button>}>{tr("A server keeps a shared world for you and your friends.")}</Empty>}

      <CreateWizard open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

type STab = "overview" | "players" | "mods" | "world" | "console" | "settings";

function ServerDetail({ id }: { id: string }) {
  const servers = useServers();
  const s = servers.data?.find((x) => x.id === id);
  const [tab, setTab] = useState<STab>("overview");
  const [invite, setInvite] = useState(false);
  const { appearance, toast } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [eulaOpen, setEulaOpen] = useState(false);
  const [busy, setBusy] = useState<null | "start" | "stop" | "restart">(null);
  const live = useQuery({ queryKey: ["serverLive", id], queryFn: () => api.serverLive(id), refetchInterval: s?.running ? 2000 : false, enabled: !!s?.running });
  const addons = useQuery({ queryKey: ["serverAddons", id], queryFn: () => api.serverAddons(id), enabled: !!s });
  useEffect(() => {
    const off = onEvent<{ serverId: string; code?: number | null }>("server-exit", (e) => {
      if (e.serverId !== id) return;
      qc.invalidateQueries({ queryKey: ["servers"] });
      setBusy((b) => (b === "restart" ? b : null));
    });
    return () => void off.then((u) => u());
  }, [id]);
  if (servers.isLoading) return <div className="p-10"><Skeleton className="h-60" /></div>;
  if (!s) return <div className="p-10"><Empty icon={Server} title={tr("Server not found")} /></div>;

  const refresh = () => qc.invalidateQueries({ queryKey: ["servers"] });
  const start = async () => {
    if (!s.eulaAccepted) return setEulaOpen(true);
    setBusy("start");
    try {
      await api.startServer(s.id);
      toast({ title: tr("{name} is starting", { name: s.name }), tone: "info" });
    } catch (e) {
      toast({ title: tr("Couldn't start"), body: String(e), tone: "error" });
    } finally {
      setBusy(null);
      refresh();
    }
  };
  const stop = async () => {
    setBusy("stop");
    await api.stopServer(s.id).catch((e) => toast({ title: tr("Couldn't stop"), body: String(e), tone: "error" }));
    refresh();
  };
  const restart = async () => {
    setBusy("restart");
    try {
      await api.restartServer(s.id);
      toast({ title: tr("{name} restarted", { name: s.name }), tone: "success" });
    } catch (e) {
      toast({ title: tr("Couldn't restart"), body: String(e), tone: "error" });
    } finally {
      setBusy(null);
      refresh();
    }
  };
  const l = live.data;
  const status = !s.running ? (busy === "start" ? "Starting…" : "Offline") : l?.stopping ? "Stopping…" : l?.ready ? "Online" : "Starting…";
  const tabs: Array<{ id: STab; label: string; icon: typeof Activity }> = [
    { id: "overview", label: tr("Overview"), icon: Activity },
    { id: "players", label: tr("Players"), icon: Users },
    { id: "mods", label: s.kind === "paper" ? tr("Plugins") : tr("Mods"), icon: Puzzle },
    { id: "world", label: tr("World"), icon: Globe2 },
    { id: "console", label: tr("Console"), icon: ScrollText },
    { id: "settings", label: tr("Settings"), icon: Settings2 },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-2">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass relative mb-4 overflow-hidden rounded-panel">
        <div className="absolute inset-0 opacity-50" style={{ background: instanceGradient(s.name) }} />
        <div className="block-grid absolute inset-0 opacity-40" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 p-6">
          <div className="min-w-0">
            <button type="button" onClick={() => navigate("/servers")} className="text-[13px] text-white/70 hover:text-white">{tr("← All servers")}</button>
            <h1 className="mt-1 truncate font-pixel text-[38px] leading-none text-white">{s.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 text-[12px] ${status === "Online" ? "bg-copper/20 text-copper" : "bg-black/30 text-white/80"}`}>
                <span className={`size-2 rounded-full ${status === "Online" ? "animate-pulse bg-copper" : s.running ? "animate-pulse bg-gold" : "bg-white/40"}`} /> {tr(status)}
              </span>
              {s.running && <Badge><Users className="size-3" /> {l?.players.length ?? 0} {tr("online")}</Badge>}
              <Badge>{KIND_INFO[s.kind].label} {s.gameVersion}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <IconButton icon={FolderOpen} label={tr("Open server folder")} onClick={() => api.openServerFolder(s.id)} />
            <Button icon={UserPlus} className="bg-black/25 text-white" onClick={() => setInvite(true)}>{tr("Invite friends")}</Button>
            {s.running ? (
              <>
                <Button icon={RotateCw} loading={busy === "restart"} disabled={!!busy || l?.stopping} onClick={restart}>{tr("Restart")}</Button>
                <Button variant="secondary" icon={Square} loading={busy === "stop" || l?.stopping} disabled={busy === "restart"} onClick={stop}>{tr("Stop")}</Button>
              </>
            ) : (
              <Button variant="primary" size="lg" className="shine" icon={Play} loading={busy === "start"} onClick={start}>{tr("Start server")}</Button>
            )}
          </div>
        </div>
      </motion.section>
      <Tabs<STab> className="glass mb-5 rounded-panel p-1.5" value={tab} onChange={setTab} tabs={tabs} />
      <AnimatePresence mode="wait">
        <motion.div key={tab} {...transitionProps(appearance, "tab")}>
          {tab === "overview" && <ServerDashboard s={s} onStart={start} starting={busy === "start"} onInvite={() => setInvite(true)} onWorld={() => setTab("world")} />}
          {tab === "players" && <ServerPlayers s={s} live={l} />}
          {tab === "mods" && <ServerMods s={s} />}
          {tab === "world" && <ServerWorld s={s} live={l} onRestart={refresh} />}
          {tab === "console" && <Glass className="h-[58vh] p-4"><Console logKey={`server:${s.id}`} onCommand={(c) => api.serverCommand(s.id, c).catch((e) => toast({ title: tr("Command failed"), body: String(e), tone: "error" }))} placeholder={s.running ? tr("Command, e.g. op YourName · time set day · tp Steve Alex") : tr("Start the server to send commands")} /></Glass>}
          {tab === "settings" && <ServerSettings s={s} addons={addons.data} onAddonsChange={() => addons.refetch()} />}
        </motion.div>
      </AnimatePresence>
      <InvitePanel s={s} live={l} open={invite} onClose={() => setInvite(false)} />
      <Modal open={eulaOpen} onClose={() => setEulaOpen(false)} title={tr("One thing before the first start")} footer={<><Button onClick={() => setEulaOpen(false)}>{tr("Not now")}</Button><Button variant="primary" icon={CheckCircle2} onClick={async () => { await api.acceptEula(s.id); setEulaOpen(false); refresh(); start(); }}>{tr("I agree, start the server")}</Button></>}>
        <p className="text-[14px]">{tr("Mojang requires everyone who runs a Minecraft server to accept the Minecraft End User License Agreement.")}</p>
        <button type="button" onClick={() => open("https://aka.ms/MinecraftEULA")} className="mt-3 flex items-center gap-1.5 text-[14px] text-copper hover:underline"><ExternalLink className="size-4" /> {tr("Read the EULA")}</button>
      </Modal>
    </div>
  );
}
