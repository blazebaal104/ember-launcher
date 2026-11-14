import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { ArrowRightLeft, Clock, Compass, Gauge, Globe2, Play, Plus, Square, Star } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useApp, type LaunchState } from "../state";
import { api, type Instance } from "../lib/ipc";
import { ago, loaderName } from "../lib/format";
import { prefetchProject, useDiscover } from "../lib/queries";
import { Badge, Button, Empty, Skeleton } from "../components/ui";
import { tr } from "../lib/i18n";

/** Deterministic colour pair per instance so each card has its own identity. */
export function instanceGradient(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 45% 28%), hsl(${(h + 50) % 360} 55% 16%))`;
}

export const playTime = (m = 0) => (m < 60 ? tr("{m} min", { m }) : tr("{h} h {m} min", { h: Math.floor(m / 60), m: m % 60 }));

function stageLabel(s?: LaunchState) {
  if (!s) return tr("Play");
  if (s.stage === "running") return tr("Running");
  if (s.stage === "java") return tr("Getting Java");
  if (s.stage === "files") return tr("Downloading {n0}%", { n0: Math.round((s.done / Math.max(1, s.total)) * 100) });
  return tr("Preparing");
}

export function PlayButton({ instance, big }: { instance: Instance; big?: boolean }) {
  const { launching, play, toast } = useApp();
  const s = launching[instance.id];
  const running = s?.stage === "running";
  const pct = s && s.stage === "files" ? s.done / Math.max(1, s.total) : s ? 0.15 : 0;
  return (
    <motion.button
      type="button"
      whileHover={{ scale: running ? 1 : 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => (running ? api.stop(instance.id).catch((e) => toast({ title: tr("Couldn't stop"), body: String(e), tone: "error" })) : !s && play(instance))}
      disabled={!!s && !running}
      className={`press press-accent ${running ? "" : "shine"} relative flex items-center gap-2 overflow-hidden rounded-card font-bold ${running ? "bg-slate-raised text-text" : "bg-copper text-on-accent"} ${big ? "px-8 py-3.5 text-[17px]" : "px-4 py-2 text-[14px]"}`}
    >
      {s && !running && <motion.span className="absolute inset-y-0 left-0 bg-white/20" animate={{ width: `${pct * 100}%` }} />}
      {running ? <Square className={big ? "size-5" : "size-4"} fill="currentColor" /> : <Play className={big ? "size-5" : "size-4"} fill="currentColor" />}
      <span className="relative">{running ? (big ? tr("Running · Stop") : tr("Stop")) : stageLabel(s)}</span>
    </motion.button>
  );
}

export function InstanceCard({ instance, index = 0 }: { instance: Instance; index?: number }) {
  const navigate = useNavigate();
  const { launching } = useApp();
  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.035, type: "spring", stiffness: 300, damping: 28 }}
      className="glass lift group flex cursor-pointer flex-col overflow-hidden rounded-panel"
      onClick={() => navigate(`/instance/${instance.id}`)}
    >
      <div className="relative h-24 overflow-hidden" style={{ background: instanceGradient(instance.name) }}>
        {instance.icon && <img src={instance.icon} alt="" className="absolute inset-0 size-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-110" />}
        <div className="block-grid absolute inset-0 opacity-40" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {instance.favorite && <Badge tone="gold"><Star className="size-3" fill="currentColor" /></Badge>}
          {launching[instance.id]?.stage === "running" && <Badge tone="accent">{tr("Running")}</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate text-[16px] font-bold">{instance.name}</h3>
        <p className="mt-0.5 text-[13px] text-muted">{instance.gameVersion} · {loaderName[instance.loader]}</p>
        <p className="text-[12px] text-muted">{ago(instance.lastPlayed)}{instance.playMinutes ? ` · ${playTime(instance.playMinutes)}` : ""}</p>
        <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <PlayButton instance={instance} />
          {instance.performanceBundle && <Gauge className="ml-auto size-4 text-copper" aria-label={tr("Performance stack")} />}
        </div>
      </div>
    </motion.li>
  );
}

export function Home() {
  const { instances, setNewInstanceOpen, openProject } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [hero, ...rest] = instances;
  const trending = useDiscover("modrinth", "mods", { sort: "follows", page: 0, gameVersion: hero?.gameVersion, loader: hero && hero.loader !== "vanilla" ? hero.loader : undefined });
  const totalMinutes = instances.reduce((s, i) => s + (i.playMinutes ?? 0), 0);

  if (!hero) {
    return (
      <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-6 px-10">
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="font-pixel text-[56px] leading-none">{tr("Let's build your first world")}</motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="max-w-[56ch] text-[16px] text-muted">
          {tr("Pick a Minecraft version. Ember sets up a mod loader, a tuned performance stack and the in-game menu for that exact version, in its own folder.")}
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="flex gap-3">
          <Button variant="primary" size="lg" icon={Plus} onClick={() => setNewInstanceOpen(true)}>{tr("New instance")}</Button>
          <Button size="lg" icon={Compass} onClick={() => navigate("/discover/modpacks")}>{tr("Browse modpacks")}</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-10 pt-2">
      {/* hero */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 26 }} className="glass relative overflow-hidden rounded-panel">
        <div className="absolute inset-0 opacity-60" style={{ background: instanceGradient(hero.name) }} />
        {hero.icon && <img src={hero.icon} alt="" className="absolute inset-0 size-full object-cover opacity-30 blur-[2px]" />}
        <div className="block-grid absolute inset-0 opacity-50" />
        <motion.div aria-hidden className="absolute -right-20 -top-20 size-80 rounded-full bg-copper/30 blur-3xl" animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 8, repeat: Infinity }} />
        <div className="relative flex flex-col gap-5 p-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[14px] text-white/70">{hero.lastPlayed ? tr("Last played {n0}", { n0: ago(hero.lastPlayed).toLowerCase() }) : tr("Ready for its first launch")}</p>
            <h1 className="mt-1 max-w-[16ch] font-pixel text-[54px] leading-[1.02] text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]">{hero.name}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge>{tr("Minecraft {gameVersion}", { gameVersion: hero.gameVersion })}</Badge>
              <Badge>{loaderName[hero.loader]}</Badge>
              {hero.performanceBundle && <Badge tone="accent"><Gauge className="size-3" /> {tr("Performance stack")}</Badge>}
              {hero.playMinutes ? <Badge><Clock className="size-3" /> {playTime(hero.playMinutes)}</Badge> : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="bg-black/20 text-white hover:bg-black/30" onClick={() => navigate(`/instance/${hero.id}`)}>{tr("Manage")}</Button>
            <PlayButton instance={hero} big />
          </div>
        </div>
      </motion.section>

      {/* quick actions */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { icon: Compass, title: tr("Discover"), text: tr("Mods, shaders, packs and more, installed in one click."), to: "/discover/mods" },
          { icon: Globe2, title: tr("Play with friends"), text: tr("Host your world or a server anyone can join."), to: "/servers" },
          { icon: ArrowRightLeft, title: tr("Move mods to a new version"), text: tr("Drop an old mods folder; Ember finds the new builds."), to: "/transfer" },
        ].map((a, i) => (
          <motion.button key={a.title} type="button" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.05 }} onClick={() => navigate(a.to)} className="glass lift press group flex items-start gap-3 rounded-panel p-4 text-left">
            <span className="grid size-10 shrink-0 place-items-center rounded-card bg-copper/15 text-copper transition-transform group-hover:scale-110 group-hover:rotate-6">
              <a.icon className="size-5" />
            </span>
            <span>
              <span className="block text-[15px] font-bold">{a.title}</span>
              <span className="block text-[13px] text-muted">{a.text}</span>
            </span>
          </motion.button>
        ))}
      </section>

      {/* instances */}
      <section aria-labelledby="inst-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="inst-h" className="text-[20px] font-bold tracking-tight">{tr("Your instances")}</h2>
          <span className="text-[13px] text-muted">{tr("{length} instances · {totalMinutes} played", { length: instances.length, totalMinutes: playTime(totalMinutes) })}</span>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
          {rest.map((i, idx) => <InstanceCard key={i.id} instance={i} index={idx} />)}
          <motion.li layout>
            <button type="button" onClick={() => setNewInstanceOpen(true)} className="press flex h-full min-h-[210px] w-full flex-col items-center justify-center gap-2 rounded-panel border-2 border-dashed border-slate-line text-muted hover:border-copper hover:text-copper">
              <Plus className="size-6" /> {tr("New instance")}
            </button>
          </motion.li>
        </ul>
      </section>

      {/* trending */}
      <section aria-labelledby="trend-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="trend-h" className="text-[20px] font-bold tracking-tight">{tr("Popular for {gameVersion}", { gameVersion: hero.gameVersion })}</h2>
          <button type="button" onClick={() => navigate("/discover/mods")} className="text-[13px] text-copper hover:underline">{tr("See all")}</button>
        </div>
        {trending.isLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : trending.data?.hits.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {trending.data.hits.slice(0, 8).map((h, i) => (
              <motion.button
                key={h.id}
                type="button"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                onMouseEnter={() => prefetchProject(qc, h.id)}
                onClick={() => openProject({ ...h, category: "mods" })}
                className="glass lift press flex items-center gap-3 rounded-panel p-3 text-left"
              >
                {h.iconUrl ? <img src={h.iconUrl} alt="" className="size-11 shrink-0 rounded-card object-cover" /> : <div className="size-11 shrink-0 rounded-card bg-slate-raised" />}
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{h.title}</span>
                  <span className="line-clamp-2 text-[12px] text-muted">{h.description}</span>
                </span>
              </motion.button>
            ))}
          </div>
        ) : (
          <Empty icon={Compass} title={tr("Couldn't load suggestions")}>{tr("Check your internet connection.")}</Empty>
        )}
      </section>
    </div>
  );
}
