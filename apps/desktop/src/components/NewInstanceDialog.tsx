import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { api, type Channel, type GameVersion, type HookReport, type Loader } from "../lib/ipc";
import { channelName, loaderName } from "../lib/format";
import { useApp } from "../state";

const CHANNELS: Channel[] = ["release", "snapshot", "pre-release", "release-candidate"];

export function NewInstanceDialog() {
  const { newInstanceOpen, setNewInstanceOpen, refresh } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [versions, setVersions] = useState<GameVersion[]>([]);
  const [channels, setChannels] = useState<Set<Channel>>(new Set(["release"]));
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [loader, setLoader] = useState<Loader>("fabric");
  const [perf, setPerf] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<HookReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (newInstanceOpen && !d.open) {
      d.showModal();
      setReports(null);
      setError(null);
      api.listVersions().then((v) => {
        setVersions(v);
        setVersion((cur) => cur || v.find((x) => x.channel === "release")?.id || "");
      });
    } else if (!newInstanceOpen && d.open) d.close();
  }, [newInstanceOpen]);

  const shown = useMemo(() => versions.filter((v) => channels.has(v.channel)), [versions, channels]);

  const toggle = (c: Channel) =>
    setChannels((s) => {
      const n = new Set(s);
      if (n.has(c) && n.size > 1) n.delete(c);
      else n.add(c);
      return n;
    });

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createInstance({ name: name.trim() || `Minecraft ${version}`, gameVersion: version, loader, performanceBundle: perf, overlay });
      setReports(res.reports);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={() => setNewInstanceOpen(false)}
      className="m-auto w-[560px] max-w-[92vw] rounded-panel border border-slate-line bg-slate-surface p-0 text-text backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between border-b border-slate-line px-6 py-4">
        <h2 className="text-[18px] font-bold">New instance</h2>
        <button type="button" aria-label="Close" onClick={() => setNewInstanceOpen(false)} className="rounded-chip p-1.5 text-muted hover:bg-slate-raised hover:text-text">
          <X className="size-4" />
        </button>
      </div>

      {reports ? (
        <div className="space-y-4 px-6 py-5">
          <p className="text-[15px]">Instance created.</p>
          {reports.map((r) => (
            <div key={r.hook} className="space-y-2 text-[14px]">
              {r.installed.length > 0 && (
                <p className="text-muted">
                  Added for this version: <span className="text-text">{r.installed.join(", ")}</span>
                </p>
              )}
              {r.skipped.map((s) => (
                <p key={s} className="text-muted">Skipped {s}</p>
              ))}
              {r.warnings.map((w) => (
                <p key={w} className="text-gold">{w}</p>
              ))}
            </div>
          ))}
          <div className="flex justify-end">
            <button type="button" onClick={() => setNewInstanceOpen(false)} className="rounded-card bg-copper px-4 py-2 font-medium text-ink-950">Done</button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-5 px-6 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-[14px] text-muted">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Minecraft ${version}`} className="w-full rounded-chip bg-slate-raised px-3 py-2 placeholder:text-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-copper" />
          </label>

          <fieldset>
            <legend className="mb-1.5 text-[14px] text-muted">Version</legend>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => (
                <button key={c} type="button" aria-pressed={channels.has(c)} onClick={() => toggle(c)} className={`rounded-chip px-2.5 py-1 text-[13px] ${channels.has(c) ? "bg-copper/15 text-copper" : "bg-slate-raised text-muted hover:text-text"}`}>
                  {channelName[c]}
                </button>
              ))}
            </div>
            <select value={version} onChange={(e) => setVersion(e.target.value)} className="w-full rounded-chip bg-slate-raised px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-copper">
              {shown.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                  {v.channel !== "release" ? ` (${channelName[v.channel].toLowerCase()})` : ""}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-[14px] text-muted">Mod loader</legend>
            <div className="grid grid-cols-4 gap-1.5">
              {(["fabric", "quilt", "neoforge", "vanilla"] as Loader[]).map((l) => (
                <button key={l} type="button" aria-pressed={loader === l} onClick={() => setLoader(l)} className={`rounded-chip py-2 text-[14px] ${loader === l ? "bg-slate-raised text-text ring-1 ring-copper" : "bg-slate-raised/50 text-muted hover:text-text"}`}>
                  {loaderName[l]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3">
            <Toggle checked={perf} onChange={setPerf} title="Performance stack" detail="Sodium, Lithium, FerriteCore, ImmediatelyFast, Entity Culling and more, matched to this exact version." />
            <Toggle checked={overlay} onChange={setOverlay} title="Ember in-game menu" detail="HUD, zoom, fullbright, crosshairs and 50+ other tweaks. Open with Right Shift." />
            {loader === "vanilla" && (perf || overlay) && <p className="text-[13px] text-gold">Both need a mod loader, so this instance will use Fabric.</p>}
          </div>

          {error && <p className="text-[14px] text-redstone">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setNewInstanceOpen(false)} className="rounded-card px-4 py-2 text-muted hover:text-text">Cancel</button>
            <button type="submit" disabled={busy || !version} className="rounded-card bg-copper px-4 py-2 font-medium text-ink-950 disabled:opacity-60">
              {busy ? "Creating" : "Create instance"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

function Toggle({ checked, onChange, title, detail }: { checked: boolean; onChange: (v: boolean) => void; title: string; detail: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-copper ${checked ? "bg-copper" : "bg-slate-line"}`}>
        <span className={`size-4 rounded-full bg-text transition-transform ${checked ? "translate-x-4" : ""}`} />
      </span>
      <span>
        <span className="block text-[14px] font-medium">{title}</span>
        <span className="block text-[13px] text-muted">{detail}</span>
      </span>
    </label>
  );
}
