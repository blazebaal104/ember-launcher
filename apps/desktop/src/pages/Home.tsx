import { useEffect, useState } from "react";
import { FolderOpen, Gauge, Layers, Play, Plus } from "lucide-react";
import { api, errorCode, onEvent, type Instance } from "../lib/ipc";
import { ago, loaderName } from "../lib/format";
import { useApp } from "../state";

interface LaunchState {
  stage: string;
  done: number;
  total: number;
}

export function Home() {
  const { instances, setNewInstanceOpen } = useApp();
  const [launching, setLaunching] = useState<Record<string, LaunchState>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const un = onEvent<LaunchState & { instanceId: string }>("launch-progress", (p) => setLaunching((s) => ({ ...s, [p.instanceId]: p })));
    const unExit = onEvent<{ instanceId: string }>("game-exit", (p) =>
      setLaunching((s) => {
        const { [p.instanceId]: _gone, ...rest } = s;
        return rest;
      }),
    );
    return () => {
      un.then((f) => f());
      unExit.then((f) => f());
    };
  }, []);

  const play = async (i: Instance) => {
    setError(null);
    setLaunching((s) => ({ ...s, [i.id]: { stage: "preparing", done: 0, total: 1 } }));
    try {
      await api.launch(i.id);
    } catch (e) {
      const c = errorCode(e);
      setError(
        c === "not_signed_in" || c === "no_client_id"
          ? "Sign in with your Microsoft account first (bottom left) so Minecraft knows it's you."
          : c === "app_not_approved"
            ? "Your Azure app is still waiting for Mojang's approval. Check Settings."
            : `${i.name} didn't start: ${e}`,
      );
      setLaunching(({ [i.id]: _x, ...rest }) => rest);
    }
  };

  const [hero, ...rest] = instances;

  if (!hero) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-4 px-12">
        <h1 className="font-pixel text-5xl text-text">Make your first instance</h1>
        <p className="max-w-[56ch] text-muted">
          Pick a Minecraft version. Ember sets up Fabric and a tuned performance stack for that exact version, in its own folder.
        </p>
        <button type="button" onClick={() => setNewInstanceOpen(true)} className="flex items-center gap-2 rounded-card bg-copper px-5 py-3 font-medium text-ink-950">
          <Plus className="size-4" aria-hidden /> New instance
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-8 py-8">
      {/* Hero: the one bold element on the screen */}
      <section aria-label="Continue playing" className="block-grid relative overflow-hidden rounded-panel border border-slate-line bg-slate-surface px-8 py-9">
        <p className="text-[14px] text-muted">{hero.lastPlayed ? `Last played ${ago(hero.lastPlayed).toLowerCase()}` : "Ready for its first launch"}</p>
        <h1 className="mt-2 max-w-[18ch] font-pixel text-[56px] leading-[1.02] text-text">{hero.name}</h1>
        <div className="mt-5 flex flex-wrap gap-2">
          <Chip>Minecraft {hero.gameVersion}</Chip>
          <Chip>{loaderName[hero.loader]}</Chip>
          {hero.performanceBundle && <Chip tone="copper">Performance stack</Chip>}
          {hero.overlay && <Chip>In-game menu: Right Shift</Chip>}
        </div>
        <div className="mt-8 flex items-center gap-3">
          <PlayButton state={launching[hero.id]} onClick={() => play(hero)} big />
          <button type="button" onClick={() => api.openFolder(hero.id)} className="flex items-center gap-2 rounded-card px-4 py-3 text-[14px] text-muted hover:bg-slate-raised hover:text-text">
            <FolderOpen className="size-4" aria-hidden /> Open folder
          </button>
        </div>
        {error && <p className="mt-4 text-[14px] text-redstone">{error}</p>}
      </section>

      <section aria-labelledby="library-h">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="library-h" className="text-[20px] font-bold tracking-tight">Your instances</h2>
          <span className="text-[13px] text-muted">Each one has its own mods, worlds and settings</span>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
          {rest.map((i) => (
            <li key={i.id} className="flex flex-col rounded-card border border-slate-line bg-slate-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[16px] font-medium leading-snug">{i.name}</h3>
                {i.performanceBundle && <Gauge className="size-4 shrink-0 text-copper" aria-label="Performance stack installed" />}
              </div>
              <p className="mt-1 text-[13px] text-muted">
                {i.gameVersion}, {loaderName[i.loader]}
              </p>
              <p className="text-[13px] text-muted">{ago(i.lastPlayed)}</p>
              <div className="mt-4 flex items-center gap-2">
                <PlayButton state={launching[i.id]} onClick={() => play(i)} />
                <button type="button" aria-label={`Open ${i.name} folder`} onClick={() => api.openFolder(i.id)} className="rounded-chip p-2 text-muted hover:bg-slate-raised hover:text-text">
                  <FolderOpen className="size-4" aria-hidden />
                </button>
                <button type="button" aria-label={`Open ${i.name} mods folder`} onClick={() => api.openFolder(i.id, "mods")} className="rounded-chip p-2 text-muted hover:bg-slate-raised hover:text-text">
                  <Layers className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setNewInstanceOpen(true)} className="flex h-full min-h-[148px] w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-slate-line text-muted hover:border-copper hover:text-copper">
              <Plus className="size-5" aria-hidden /> New instance
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "copper" }) {
  return (
    <span className={`rounded-chip px-2.5 py-1 text-[13px] ${tone === "copper" ? "bg-copper/15 text-copper" : "bg-slate-raised text-muted"}`}>{children}</span>
  );
}

function PlayButton({ state, onClick, big }: { state?: LaunchState; onClick: () => void; big?: boolean }) {
  const label =
    !state ? "Play" : state.stage === "running" ? "Running" : state.stage === "java" ? "Getting Java" : state.stage === "files" ? `Downloading ${Math.round((state.done / Math.max(1, state.total)) * 100)}%` : "Preparing";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!state}
      className={`flex items-center gap-2 rounded-card bg-copper font-medium text-ink-950 hover:bg-copper/90 disabled:bg-copper-deep disabled:text-text ${big ? "px-7 py-3 text-[16px]" : "px-4 py-2 text-[14px]"}`}
    >
      <Play className={big ? "size-5" : "size-4"} fill="currentColor" aria-hidden /> {label}
    </button>
  );
}
