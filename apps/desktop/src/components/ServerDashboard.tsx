import { motion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, CheckCircle2, Cloud, CloudRain, Copy, Cpu, Crown, Gauge, Loader2, MemoryStick, MessageSquare, Moon, Play, RefreshCw, Save, Sun, Timer, UserMinus, Users, Wifi, XCircle } from "lucide-react";
import { api, type ServerLive, type ServerSample, type ServerView } from "../lib/ipc";
import { useApp } from "../state";
import { Badge, Button, Glass, IconButton, Segmented, inputClass } from "./ui";

const fmtUptime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
};

/** Live overview of a running server: health charts, who's online, quick controls, join address. */
export function ServerDashboard({ s, onStart, starting }: { s: ServerView; onStart: () => void; starting: boolean }) {
  const live = useQuery({ queryKey: ["serverLive", s.id], queryFn: () => api.serverLive(s.id), refetchInterval: s.running ? 2000 : false, enabled: s.running });
  const { toast } = useApp();
  const run = (cmd: string, done?: string) =>
    api.serverCommand(s.id, cmd).then(
      () => done && toast({ title: done, tone: "success" }),
      (e) => toast({ title: "Command failed", body: String(e), tone: "error" }),
    );

  if (!s.running) {
    return (
      <Glass className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-copper/15 text-copper"><Play className="size-7" /></span>
        <h3 className="text-[18px] font-bold">The server is offline</h3>
        <p className="max-w-[60ch] text-[14px] text-muted">Start it to see live CPU, memory and player charts here, manage players, change time and weather, and get the address friends use to join. Ember also tries to set up your router so friends outside your home can connect.</p>
        <Button variant="primary" size="lg" className="shine" icon={Play} loading={starting} onClick={onStart}>Start server</Button>
      </Glass>
    );
  }

  const l = live.data;
  const last = l?.samples.at(-1);
  return (
    <div className="flex flex-col gap-4">
      {/* headline tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile icon={l?.ready ? CheckCircle2 : Loader2} spin={!l?.ready} label="Status" value={l?.ready ? "Online" : "Starting…"} tone={l?.ready ? "good" : undefined} />
        <Tile icon={Users} label="Players" value={`${l?.players.length ?? 0}`} />
        <Tile icon={Cpu} label="CPU" value={last ? `${last.cpu.toFixed(0)}%` : "–"} />
        <Tile icon={MemoryStick} label="Memory" value={last ? `${(last.memoryMb / 1024).toFixed(1)} / ${(s.memoryMb / 1024).toFixed(0)} GB` : "–"} />
        <Tile icon={Timer} label="Uptime" value={s.uptimeSecs != null ? fmtUptime(s.uptimeSecs) : "–"} />
      </div>

      {/* charts */}
      <div className="grid gap-3 md:grid-cols-3">
        <ChartCard title="CPU" unit="%" samples={l?.samples ?? []} pick={(x) => x.cpu} max={100} fmt={(v) => `${v.toFixed(0)}%`} />
        <ChartCard title="Memory" unit="GB" samples={l?.samples ?? []} pick={(x) => x.memoryMb / 1024} max={s.memoryMb / 1024} fmt={(v) => `${v.toFixed(2)} GB`} />
        <ChartCard title="Players online" unit="" samples={l?.samples ?? []} pick={(x) => x.players} max={Math.max(4, ...(l?.samples ?? []).map((x) => x.players + 1))} fmt={(v) => `${v.toFixed(0)}`} step />
      </div>
      {!!l?.lagWarnings && (
        <p className="flex items-start gap-2 rounded-panel border border-gold/30 bg-gold/10 px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold" />
          <span>The server fell behind {l.lagWarnings}× ({l.lastLag?.replace(/^Can't keep up! Is the server overloaded\? /, "")}). Lowering the view distance in Settings or giving it more memory helps.</span>
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-[1.1fr_1fr]">
        <Players s={s} live={l} run={run} />
        <div className="flex flex-col gap-3">
          <JoinCard s={s} live={l} />
          <Controls run={run} />
        </div>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, tone, spin }: { icon: typeof Cpu; label: string; value: string; tone?: "good"; spin?: boolean }) {
  return (
    <div className="glass rounded-panel p-4">
      <p className="flex items-center gap-1.5 text-[12px] text-muted"><Icon className={`size-3.5 ${tone === "good" ? "text-copper" : ""} ${spin ? "animate-spin" : ""}`} /> {label}</p>
      <p className="mt-1 text-[20px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** A single-series area chart with a hover crosshair. One series, so the title names it (no legend). */
function ChartCard({ title, samples, pick, max, fmt, step }: { title: string; unit: string; samples: ServerSample[]; pick: (s: ServerSample) => number; max: number; fmt: (v: number) => string; step?: boolean }) {
  const W = 300;
  const H = 90;
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const pts = useMemo(() => {
    if (samples.length < 2) return [];
    const t0 = samples[0]!.t;
    const span = Math.max(1, samples.at(-1)!.t - t0);
    return samples.map((s) => ({ x: ((s.t - t0) / span) * W, y: H - Math.min(1, pick(s) / (max || 1)) * (H - 6) - 3, v: pick(s), t: s.t }));
  }, [samples, pick, max]);
  const line = pts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : step ? `H${p.x}V${p.y}` : `L${p.x},${p.y}`)).join("");
  const area = pts.length ? `${line}L${W},${H}L0,${H}Z` : "";
  const cur = hover != null ? pts[hover] : pts.at(-1);

  return (
    <div className="glass rounded-panel p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[13px] font-medium text-muted">{title}</p>
        <p className="text-[15px] font-bold tabular-nums">{cur ? fmt(cur.v) : "–"}</p>
      </div>
      {pts.length ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-[90px] w-full overflow-visible"
          role="img"
          aria-label={`${title}, last 5 minutes`}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            pts.forEach((p, i) => Math.abs(p.x - x) < Math.abs(pts[best]!.x - x) && (best = i));
            setHover(best);
          }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.5].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
          <path d={area} fill={`url(#g${id})`} />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {cur && hover != null && <line x1={cur.x} x2={cur.x} y1="0" y2={H} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
      ) : (
        <div className="grid h-[90px] place-items-center text-[12px] text-muted">Collecting data…</div>
      )}
      <p className="mt-1 text-[11px] text-muted">{hover != null && cur ? `${Math.round((pts.at(-1)!.t - cur.t) / 60 * 10) / 10} min ago` : "Last 5 minutes"}</p>
    </div>
  );
}

function Players({ s, live, run }: { s: ServerView; live?: ServerLive | null; run: (cmd: string, done?: string) => Promise<unknown> }) {
  const [msg, setMsg] = useState("");
  const players = live?.players ?? [];
  return (
    <Glass className="flex flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="flex-1 text-[15px] font-bold">Who's online</h3>
        <IconButton icon={RefreshCw} label="Refresh list" onClick={() => run("list")} />
      </div>
      {players.length ? (
        <ul className="flex flex-col gap-1.5">
          {players.map((p) => (
            <motion.li key={p} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="group flex items-center gap-3 rounded-card bg-slate-raised/50 p-2">
              <img src={`https://mc-heads.net/avatar/${encodeURIComponent(p)}/32`} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} className="size-8 rounded bg-slate-line [image-rendering:pixelated]" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{p}</span>
              <span className="flex gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                <IconButton icon={Crown} label={`Make ${p} an operator`} onClick={() => run(`op ${p}`, `${p} is now an operator`)} />
                <IconButton icon={Gauge} label={`Creative mode for ${p}`} onClick={() => run(`gamemode creative ${p}`, `${p} is in creative`)} />
                <IconButton icon={Sun} label={`Survival mode for ${p}`} onClick={() => run(`gamemode survival ${p}`, `${p} is in survival`)} />
                <IconButton icon={UserMinus} label={`Kick ${p}`} onClick={() => run(`kick ${p}`, `Kicked ${p}`)} />
                <IconButton icon={Ban} label={`Ban ${p}`} onClick={() => run(`ban ${p}`, `Banned ${p}`)} />
              </span>
            </motion.li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-[13px] text-muted">{live?.ready ? "Nobody's here yet. Share the address on the right." : "Players appear here once the server is up."}</p>
      )}
      <form
        className="mt-auto flex gap-2 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (msg.trim()) run(`say ${msg.trim()}`);
          setMsg("");
        }}
      >
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message everyone on the server" className={inputClass} />
        <Button type="submit" icon={MessageSquare}>Send</Button>
      </form>
      <p className="mt-1 text-[11px] text-muted">{s.kind === "paper" ? "Paper" : s.kind === "fabric" ? "Fabric" : "Vanilla"} server · commands run as the console</p>
    </Glass>
  );
}

function JoinCard({ s, live }: { s: ServerView; live?: ServerLive | null }) {
  const { toast } = useApp();
  const n = live?.network;
  const port = s.port === 25565 ? "" : `:${s.port}`;
  const copy = (t: string) => {
    navigator.clipboard?.writeText(t);
    toast({ title: "Copied", body: t, tone: "success" });
  };
  const Addr = ({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Wifi }) => (
    <button type="button" onClick={() => copy(value)} className="press flex w-full items-center gap-3 rounded-card bg-slate-raised px-3 py-2.5 text-left">
      <Icon className="size-4 shrink-0 text-copper" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-muted">{label}</span>
        <span className="block truncate font-[ui-monospace,monospace] text-[14px]">{value}</span>
      </span>
      <Copy className="size-4 text-muted" />
    </button>
  );
  return (
    <Glass className="p-4">
      <h3 className="mb-2 text-[15px] font-bold">How friends join</h3>
      <div className="flex flex-col gap-2">
        {n?.publicIp && n.upnp && !n.sharedIp && <Addr label="From anywhere (router set up automatically)" value={`${n.publicIp}${port}`} icon={Cloud} />}
        {n?.lanIp && <Addr label="Same Wi-Fi" value={`${n.lanIp}${port}`} icon={Wifi} />}
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[12px] text-muted">
        {n?.checking ? <><Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" /> Setting up your router…</>
          : n?.upnp && !n.sharedIp ? <><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-copper" /> Port {s.port} is forwarded on your router while the server runs, and closed again when it stops.</>
          : n?.sharedIp ? <><XCircle className="mt-0.5 size-3.5 shrink-0 text-gold" /> Your internet provider shares your public address, so direct joins can't work. Use playit.gg in the Invite friends tab.</>
          : <><XCircle className="mt-0.5 size-3.5 shrink-0 text-gold" /> Your router didn't allow automatic setup{n?.upnpError ? ` (${n.upnpError})` : ""}. Friends on your Wi-Fi can join; for others, see Invite friends.</>}
      </p>
    </Glass>
  );
}

function Controls({ run }: { run: (cmd: string, done?: string) => Promise<unknown> }) {
  const [difficulty, setDifficulty] = useState<"peaceful" | "easy" | "normal" | "hard">("normal");
  return (
    <Glass className="p-4">
      <h3 className="mb-3 text-[15px] font-bold">Quick controls</h3>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" icon={Sun} onClick={() => run("time set day", "It's day")}>Day</Button>
        <Button size="sm" icon={Moon} onClick={() => run("time set night", "It's night")}>Night</Button>
        <Button size="sm" icon={Cloud} onClick={() => run("weather clear", "Clear skies")}>Clear weather</Button>
        <Button size="sm" icon={CloudRain} onClick={() => run("weather rain", "It's raining")}>Rain</Button>
        <Button size="sm" icon={Save} onClick={() => run("save-all", "World saved")}>Save world</Button>
        <Button size="sm" icon={Users} onClick={() => run("whitelist on", "Whitelist on: only listed players can join")}>Whitelist on</Button>
      </div>
      <p className="mb-1.5 mt-3 text-[12px] text-muted">Difficulty</p>
      <Segmented value={difficulty} onChange={(d) => { setDifficulty(d); run(`difficulty ${d}`, `Difficulty: ${d}`); }} options={[{ id: "peaceful", label: "Peaceful" }, { id: "easy", label: "Easy" }, { id: "normal", label: "Normal" }, { id: "hard", label: "Hard" }]} />
      <div className="mt-3"><Badge>Tip: type any command in the Console tab</Badge></div>
    </Glass>
  );
}
