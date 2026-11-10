import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Cloud, Copy, ExternalLink, Globe2, Home, Loader2, MessageSquare, Router, Sparkles, Wifi, XCircle } from "lucide-react";
import { api, type ServerLive, type ServerView } from "../../lib/ipc";
import { open } from "../../lib/links";
import { useApp } from "../../state";
import { Badge, Button, Modal, Toggle } from "../ui";

/**
 * "Invite friends": picks the best way for friends to join and walks through it.
 * Same Wi-Fi → LAN address. Router allowed it (UPnP) → public address. Otherwise playit.gg,
 * linked once with a browser approval; Ember then creates the tunnel and runs it with the server.
 */
export function InvitePanel({ s, live, open: isOpen, onClose }: { s: ServerView; live?: ServerLive | null; open: boolean; onClose: () => void }) {
  const { toast } = useApp();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["playitStatus"], queryFn: api.playitStatus, enabled: isOpen });
  const tunnel = useQuery({ queryKey: ["playitTunnel", s.id], queryFn: () => api.playitTunnel(s.id), enabled: isOpen && !!status.data?.connected && !!s.playit, refetchInterval: (q) => (s.running && !q.state.data?.address ? 4000 : false), retry: 1 });
  const [claim, setClaim] = useState<{ code: string; url: string } | null>(null);
  const [claimState, setClaimState] = useState<"idle" | "waiting" | "approved" | "error">("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const polling = useRef(false);

  const n = live?.network;
  const port = s.port === 25565 ? "" : `:${s.port}`;
  const routerAddr = n?.upnp && !n.sharedIp && n.publicIp ? `${n.publicIp}${port}` : null;
  const playitAddr = live?.playit.address ?? tunnel.data?.address ?? null;
  const shareAddr = playitAddr ?? routerAddr;

  const copy = (t: string, label = "Copied") => {
    navigator.clipboard?.writeText(t);
    toast({ title: label, body: t, tone: "success" });
  };

  // Poll playit.gg while the user approves in the browser.
  useEffect(() => {
    if (!claim || claimState !== "waiting" || polling.current) return;
    polling.current = true;
    let stop = false;
    const started = Date.now();
    (async () => {
      while (!stop && Date.now() - started < 10 * 60_000) {
        try {
          const st = await api.playitClaimPoll(claim.code);
          if (st === "approved") {
            setClaimState("approved");
            await api.updateServer(s.id, { playit: true });
            await qc.invalidateQueries({ queryKey: ["servers"] });
            await qc.invalidateQueries({ queryKey: ["playitStatus"] });
            toast({ title: "playit.gg connected", body: s.running ? "Restart the server to bring the tunnel online." : "It starts with the server from now on.", tone: "success" });
            break;
          }
          if (st === "rejected") {
            setClaimState("error");
            setClaimError("The request was declined on playit.gg.");
            break;
          }
        } catch (e) {
          setClaimError(String(e));
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      polling.current = false;
    })();
    return () => {
      stop = true;
      polling.current = false;
    };
  }, [claim, claimState]);

  const connect = async () => {
    setClaimError(null);
    try {
      const c = await api.playitClaimStart();
      setClaim(c);
      setClaimState("waiting");
    } catch (e) {
      setClaimState("error");
      setClaimError(String(e));
    }
  };

  const invite = shareAddr
    ? `Join my Minecraft server!\nAddress: ${shareAddr}\nVersion: Java ${s.gameVersion}${s.kind === "fabric" ? " (Fabric, ask me for the mods)" : ""}\nMultiplayer → Add Server → paste the address.`
    : "";

  return (
    <Modal open={isOpen} onClose={onClose} title={`Invite friends to ${s.name}`} width="w-[760px]">
      <div className="flex flex-col gap-4">
        {/* The address to share, front and centre */}
        <AnimatePresence initial={false}>
          {shareAddr ? (
            <motion.div key="addr" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-panel border border-copper/30 bg-copper/10 p-4">
              <p className="flex items-center gap-1.5 text-[13px] text-muted"><CheckCircle2 className="size-4 text-copper" /> Friends anywhere can join with</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-[ui-monospace,monospace] text-[22px] font-bold" data-selectable>{shareAddr}</span>
                <Button variant="primary" className="shine" icon={Copy} onClick={() => copy(shareAddr, "Address copied")}>Copy address</Button>
                <Button icon={MessageSquare} onClick={() => copy(invite, "Invite message copied")}>Copy invite message</Button>
              </div>
              <p className="mt-2 text-[12px] text-muted">{playitAddr ? "Through playit.gg. The address stays the same every time, so friends can save it." : "Through your router. Your public address can change if your internet provider changes it."}</p>
            </motion.div>
          ) : !s.running && s.playit ? (
            <motion.p key="off" className="rounded-panel bg-slate-raised/60 p-4 text-[14px] text-muted">Start the server and the address appears here.</motion.p>
          ) : null}
        </AnimatePresence>

        {/* 1. Same Wi-Fi */}
        <Method icon={Home} title="Friends at your place (same Wi-Fi)" state="ok">
          {n?.lanIp ? (
            <button type="button" onClick={() => copy(`${n.lanIp}${port}`)} className="press mt-2 flex w-full items-center justify-between rounded-card bg-slate-raised px-3 py-2 font-[ui-monospace,monospace] text-[14px]">{n.lanIp}{port}<Copy className="size-4 text-muted" /></button>
          ) : (
            <p className="mt-1 text-[13px] text-muted">Start the server to see the address. You join it yourself with <b>localhost</b>.</p>
          )}
        </Method>

        {/* 2. Router */}
        <Method icon={Router} title="Through your router (automatic)" state={!s.running ? "idle" : n?.checking ? "busy" : routerAddr ? "ok" : "bad"}>
          <p className="mt-1 text-[13px] text-muted">
            {!s.running
              ? "When the server starts, Ember asks your router to let friends in."
              : n?.checking
                ? "Asking your router…"
                : routerAddr
                  ? "Your router opened the way automatically."
                  : n?.sharedIp
                    ? "Your internet provider shares one public address between homes, so this can't work. Use playit.gg below."
                    : `Your router didn't allow it${n?.upnpError ? ` (${n.upnpError})` : ""}. Use playit.gg below. It works almost everywhere.`}
          </p>
        </Method>

        {/* 3. playit.gg */}
        <Method icon={Cloud} title="playit.gg (works from anywhere)" badge={!routerAddr ? <Badge tone="accent">Recommended</Badge> : undefined} state={playitAddr ? "ok" : status.data?.connected && s.playit ? (live?.playit.state === "error" ? "bad" : "busy") : "idle"}>
          {!status.data ? (
            <Loader2 className="mt-2 size-4 animate-spin text-muted" />
          ) : !status.data.bundled ? (
            <ManualPlayit port={s.port} />
          ) : !status.data.connected ? (
            <div className="mt-2">
              {claimState === "waiting" ? (
                <div className="flex flex-col gap-2 rounded-card bg-slate-raised/60 p-3">
                  <p className="flex items-center gap-2 text-[14px]"><Loader2 className="size-4 animate-spin text-copper" /> Waiting for you to approve in your browser…</p>
                  <ol className="ml-5 list-decimal text-[13px] text-muted">
                    <li>Sign in or create a free account (Google or Discord works).</li>
                    <li>Press <b>Approve</b> / <b>Add agent</b>. Ember notices by itself.</li>
                  </ol>
                  <div className="flex gap-2">
                    <Button size="sm" icon={ExternalLink} onClick={() => claim && open(claim.url)}>Open the page again</Button>
                    <Button size="sm" onClick={() => { setClaim(null); setClaimState("idle"); }}>Cancel</Button>
                  </div>
                  {claimError && <p className="text-[12px] text-gold">{claimError}</p>}
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-muted">A free service that gives your server a permanent address, no router settings needed. One-time setup, about a minute.</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="primary" className="shine" icon={Sparkles} onClick={connect}>Connect playit.gg</Button>
                    {claimError && <span className="text-[12px] text-gold">{claimError}</span>}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              <Toggle checked={!!s.playit} onChange={async (v) => { await api.updateServer(s.id, { playit: v }); qc.invalidateQueries({ queryKey: ["servers"] }); if (s.running) toast({ title: "Restart the server to apply", tone: "info" }); }} label="Use playit.gg for this server" detail="Starts and stops together with the server." />
              {s.playit && (
                <p className="text-[13px] text-muted">
                  {playitAddr ? <>Online at <b className="text-text">{playitAddr}</b>.</>
                    : live?.playit.state === "error" ? <span className="text-gold">{live.playit.error}</span>
                    : s.running ? (live?.playit.error ? `Connecting… (${live.playit.error})` : "Connecting…")
                    : tunnel.isFetching ? "Preparing your address…"
                    : tunnel.error ? <span className="text-gold">{String(tunnel.error)}</span>
                    : "Ready. The tunnel comes online when the server starts."}
                </p>
              )}
              <button type="button" className="self-start text-[12px] text-muted underline-offset-2 hover:text-text hover:underline" onClick={async () => { await api.playitDisconnect(); qc.invalidateQueries({ queryKey: ["playitStatus"] }); }}>Disconnect playit.gg from Ember</button>
            </div>
          )}
        </Method>

        <div className="rounded-panel bg-slate-raised/40 p-4 text-[13px]">
          <p className="mb-1 font-medium">How friends join</p>
          <ol className="ml-5 list-decimal space-y-0.5 text-muted">
            <li>Open Minecraft <b className="text-text">Java {s.gameVersion}</b>{s.kind === "fabric" ? " with the same mods as the server" : ""}.</li>
            <li>Multiplayer → <b className="text-text">Add Server</b> → paste the address → Done.</li>
            <li>Double-click the server. {s.kind === "paper" || s.kind === "vanilla" ? "No mods needed." : ""}</li>
          </ol>
        </div>
      </div>
    </Modal>
  );
}

function Method({ icon: Icon, title, state, badge, children }: { icon: typeof Wifi; title: string; state: "ok" | "bad" | "busy" | "idle"; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-slate-line/60 p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-copper" />
        <p className="flex-1 text-[15px] font-bold">{title}</p>
        {badge}
        {state === "ok" ? <Check className="size-5 text-copper" /> : state === "bad" ? <XCircle className="size-5 text-gold" /> : state === "busy" ? <Loader2 className="size-4 animate-spin text-muted" /> : null}
      </div>
      {children}
    </div>
  );
}

/** Fallback when the playit program isn't bundled: clear, one-action steps. */
function ManualPlayit({ port }: { port: number }) {
  return (
    <ol className="mt-2 ml-5 list-decimal space-y-1.5 text-[13px] text-muted">
      <li><Button size="sm" icon={ExternalLink} onClick={() => open("https://playit.gg/download")}>Download playit.gg</Button> and run it.</li>
      <li>It opens a page: sign in and approve.</li>
      <li>On <button type="button" className="text-copper hover:underline" onClick={() => open("https://playit.gg/account/tunnels")}>playit.gg/account/tunnels</button> add a tunnel: type <b>Minecraft Java</b>, local address <b>127.0.0.1:{port}</b>.</li>
      <li>Share the address it shows (like <i>name.joinmc.link</i>). Keep playit running while you play.</li>
    </ol>
  );
}

export { Globe2 as InviteIcon };
