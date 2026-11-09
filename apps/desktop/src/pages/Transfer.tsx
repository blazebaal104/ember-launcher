import { useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FileArchive, Upload } from "lucide-react";
import type { InspectedFile, Loader as EngineLoader, ResolvedFile, TransferEntry, TransferPlan, TransferProgress } from "@ember/content-engine";
import { transferEngine } from "../lib/clients";
import { api, inTauri, type GameVersion } from "../lib/ipc";
import { useApp } from "../state";
import InspectWorker from "../workers/inspect.worker?worker";

type Step = "drop" | "analyzing" | "review" | "installing" | "done";

export function Transfer() {
  const { instances, refresh } = useApp();
  const [step, setStep] = useState<Step>("drop");
  const [files, setFiles] = useState<InspectedFile[]>([]);
  const [reading, setReading] = useState(false);
  const [versions, setVersions] = useState<GameVersion[]>([]);
  const [into, setInto] = useState<string>("new");
  const [gameVersion, setGameVersion] = useState("");
  const [loader, setLoader] = useState<EngineLoader>("fabric");
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [plan, setPlan] = useState<TransferPlan | null>(null);
  const [choices, setChoices] = useState<Record<number, number | null>>({});
  const [result, setResult] = useState<{ installed: number; manual: ResolvedFile[]; instanceName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listVersions().then((v) => {
      setVersions(v);
      setGameVersion(v.find((x) => x.channel === "release")?.id ?? "");
    });
  }, []);

  const existing = instances.find((i) => i.id === into);
  const target = { gameVersion: existing?.gameVersion ?? gameVersion, loader: (existing && existing.loader !== "vanilla" ? existing.loader : loader) as EngineLoader };

  // ---- 1. read + inspect in a worker
  const ingest = async (list: FileList | File[]) => {
    const picked = [...list].filter((f) => /\.(jar|zip|mrpack)$/i.test(f.name));
    if (!picked.length) return;
    setReading(true);
    setError(null);
    const uploads = await Promise.all(picked.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    const worker = new InspectWorker();
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: InspectedFile[]; error?: string }>) => {
      if (e.data.ok) setFiles((prev) => dedupe([...prev, ...e.data.result!]));
      else setError(`Couldn't read those files: ${e.data.error}`);
      setReading(false);
      worker.terminate();
    };
    worker.postMessage({ files: uploads }, uploads.map((u) => u.bytes.buffer));
  };

  // ---- 2. build the plan
  const analyze = async () => {
    setStep("analyzing");
    setError(null);
    try {
      const engine = transferEngine(setProgress);
      setPlan(await engine.plan(files, target));
      setChoices({});
      setStep("review");
    } catch (e) {
      if (!inTauri) {
        setPlan(demoPlan(files, target));
        setStep("review");
        return;
      }
      setError(`The lookup failed: ${e}`);
      setStep("drop");
    }
  };

  // ---- 3. install
  const install = async () => {
    if (!plan) return;
    setStep("installing");
    try {
      const engine = transferEngine(setProgress);
      const final = inTauri ? await engine.finalize(plan, choices) : demoFinal(plan, choices);
      let instanceId = existing?.id;
      let instanceName = existing?.name ?? "";
      if (!instanceId) {
        instanceName = `Migrated to ${target.gameVersion}`;
        const created = await api.createInstance({ name: instanceName, gameVersion: target.gameVersion, loader: target.loader === "forge" ? "neoforge" : target.loader, performanceBundle: true, overlay: true });
        instanceId = created.instance.id;
      }
      const auto = final.filter((f) => f.url);
      const installed = await api.installFiles(instanceId, auto);
      setResult({ installed, manual: final.filter((f) => !f.url), instanceName });
      await refresh();
      setStep("done");
    } catch (e) {
      setError(`Install stopped: ${e}`);
      setStep("review");
    }
  };

  const groups = useMemo(() => {
    const g = { matched: [] as Array<[number, TransferEntry]>, alternative: [] as Array<[number, TransferEntry]>, obsolete: [] as Array<[number, TransferEntry]>, missing: [] as Array<[number, TransferEntry]> };
    plan?.entries.forEach((e, i) => {
      if (e.status === "matched") g.matched.push([i, e]);
      else if (e.status === "alternative") g.alternative.push([i, e]);
      else if (e.status === "obsolete") g.obsolete.push([i, e]);
      else g.missing.push([i, e]);
    });
    return g;
  }, [plan]);

  const installCount = groups.matched.length + groups.alternative.filter(([i]) => choices[i] !== null).length;

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight">Move mods to a new version</h1>
        <p className="mt-1 max-w-[68ch] text-muted">
          Drop your old mods folder, a zip, or a modpack. Ember finds each mod's build for the version you pick and suggests the closest replacement when one doesn't exist.
        </p>
      </header>

      {/* This really is a sequence, so the steps are numbered. */}
      <ol className="mb-8 flex gap-6 text-[14px]" aria-label="Progress">
        {["Add mods", "Choose target", "Review matches", "Install"].map((label, i) => {
          const current = { drop: files.length ? 1 : 0, analyzing: 2, review: 2, installing: 3, done: 3 }[step];
          return (
            <li key={label} className={`flex items-center gap-2 ${i <= current ? "text-text" : "text-muted"}`} aria-current={i === current ? "step" : undefined}>
              <span className={`grid size-6 place-items-center rounded-full text-[12px] font-bold ${i < current ? "bg-copper text-ink-950" : i === current ? "ring-2 ring-copper" : "bg-slate-raised"}`}>{i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {error && <p className="mb-4 rounded-card bg-redstone/10 px-4 py-3 text-[14px] text-redstone">{error}</p>}

      {(step === "drop" || step === "analyzing") && (
        <div className="space-y-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              ingest(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-panel border-2 border-dashed px-6 py-12 text-center transition-colors ${dragging ? "border-copper bg-copper/5" : "border-slate-line bg-slate-surface"}`}
          >
            <Upload className="size-7 text-copper" aria-hidden />
            <p className="text-[16px] font-medium">{reading ? "Reading files" : "Drop .jar files, a zipped mods folder, or a .mrpack here"}</p>
            <button type="button" onClick={() => input.current?.click()} className="rounded-card bg-slate-raised px-4 py-2 text-[14px] hover:bg-slate-line">
              Choose files
            </button>
            <input ref={input} type="file" multiple accept=".jar,.zip,.mrpack" className="sr-only" onChange={(e) => e.target.files && ingest(e.target.files)} />
          </div>

          {files.length > 0 && (
            <>
              <div className="rounded-panel border border-slate-line bg-slate-surface p-5">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-[16px] font-medium">{files.length} mods found</h2>
                  <button type="button" onClick={() => setFiles([])} className="text-[13px] text-muted hover:text-text">Clear</button>
                </div>
                <ul className="grid max-h-48 grid-cols-2 gap-x-6 gap-y-1 overflow-auto text-[14px] text-muted">
                  {files.map((f) => (
                    <li key={f.sha1 || f.fileName} className="flex items-center gap-2 truncate">
                      <FileArchive className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate text-text">{f.meta?.name ?? f.fileName}</span>
                      {f.meta?.version && <span className="shrink-0">{f.meta.version}</span>}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap items-end gap-3 rounded-panel border border-slate-line bg-slate-surface p-5">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[14px] text-muted">Install into</span>
                  <select value={into} onChange={(e) => setInto(e.target.value)} className="rounded-chip bg-slate-raised px-3 py-2 text-[14px]">
                    <option value="new">A new instance</option>
                    {instances.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.gameVersion})
                      </option>
                    ))}
                  </select>
                </label>
                {!existing && (
                  <>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[14px] text-muted">Minecraft version</span>
                      <select value={gameVersion} onChange={(e) => setGameVersion(e.target.value)} className="rounded-chip bg-slate-raised px-3 py-2 text-[14px]">
                        {versions.map((v) => (
                          <option key={v.id} value={v.id}>{v.id}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[14px] text-muted">Loader</span>
                      <select value={loader} onChange={(e) => setLoader(e.target.value as EngineLoader)} className="rounded-chip bg-slate-raised px-3 py-2 text-[14px]">
                        <option value="fabric">Fabric</option>
                        <option value="quilt">Quilt</option>
                        <option value="neoforge">NeoForge</option>
                      </select>
                    </label>
                  </>
                )}
                <button type="button" onClick={analyze} disabled={step === "analyzing" || !target.gameVersion} className="ml-auto rounded-card bg-copper px-5 py-2.5 font-medium text-ink-950 disabled:opacity-60">
                  {step === "analyzing" ? progressLabel(progress) : `Find builds for ${target.gameVersion}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {(step === "review" || step === "installing") && plan && (
        <div className="space-y-8">
          <Section title={`Ready to install (${groups.matched.length})`} hint="Same mod, built for your target version.">
            {groups.matched.map(([i, e]) => (
              <Row key={i} entry={e}>
                <span className="text-[13px] text-copper">{e.resolved?.versionNumber}</span>
                {e.note && <span className="block text-[12px] text-gold">{e.note}</span>}
              </Row>
            ))}
          </Section>

          {groups.alternative.length > 0 && (
            <Section title={`Needs your pick (${groups.alternative.length})`} hint={`No build for ${plan.target.gameVersion}. These are the closest replacements we found.`}>
              {groups.alternative.map(([i, e]) => (
                <li key={i} className="px-5 py-4">
                  <p className="text-[15px] font-medium">{name(e)}</p>
                  <fieldset className="mt-2 space-y-1.5">
                    <legend className="sr-only">Replacement for {name(e)}</legend>
                    {e.alternatives.map((a, ai) => (
                      <label key={a.file.projectId} className="flex cursor-pointer items-start gap-3 rounded-card px-3 py-2 hover:bg-slate-raised has-[:checked]:bg-slate-raised">
                        <input type="radio" name={`alt-${i}`} checked={(choices[i] ?? 0) === ai} onChange={() => setChoices((c) => ({ ...c, [i]: ai }))} className="mt-1 accent-copper" />
                        <span className="flex-1">
                          <span className="flex items-center gap-2 text-[14px]">
                            {a.file.projectName}
                            <span className="rounded-chip bg-slate-line px-1.5 py-0.5 text-[12px] text-muted">{{ successor: "Successor", fork: "Continued fork", similar: "Similar" }[a.kind]}</span>
                          </span>
                          <span className="block text-[13px] text-muted">{a.reason}</span>
                        </span>
                        <Confidence value={a.confidence} />
                      </label>
                    ))}
                    <label className="flex cursor-pointer items-center gap-3 rounded-card px-3 py-2 text-[14px] text-muted hover:bg-slate-raised">
                      <input type="radio" name={`alt-${i}`} checked={choices[i] === null} onChange={() => setChoices((c) => ({ ...c, [i]: null }))} className="accent-copper" />
                      Skip this mod
                    </label>
                  </fieldset>
                </li>
              ))}
            </Section>
          )}

          {groups.obsolete.length > 0 && (
            <Section title={`Not needed anymore (${groups.obsolete.length})`} hint="Their fixes are now part of the game.">
              {groups.obsolete.map(([i, e]) => (
                <Row key={i} entry={e}>
                  <span className="text-[13px] text-muted">{e.note}</span>
                </Row>
              ))}
            </Section>
          )}

          {groups.missing.length > 0 && (
            <Section title={`Couldn't carry over (${groups.missing.length})`} hint="Check these by hand. Unknown files may be private builds or renamed jars.">
              {groups.missing.map(([i, e]) => (
                <Row key={i} entry={e}>
                  <span className="text-[13px] text-redstone">{e.status === "unknown" ? "Not found on Modrinth or CurseForge" : e.note ?? "No build or alternative"}</span>
                </Row>
              ))}
            </Section>
          )}

          {plan.dependencies.length > 0 && <p className="text-[14px] text-muted">Also adding required libraries: {plan.dependencies.map((d) => d.projectName).join(", ")}.</p>}

          <div className="sticky bottom-0 -mx-8 flex items-center justify-between border-t border-slate-line bg-slate-base/95 px-8 py-4 backdrop-blur">
            <button type="button" onClick={() => setStep("drop")} className="text-[14px] text-muted hover:text-text">Back</button>
            <button type="button" onClick={install} disabled={step === "installing" || installCount === 0} className="rounded-card bg-copper px-6 py-3 font-medium text-ink-950 disabled:opacity-60">
              {step === "installing" ? "Installing" : `Install ${installCount} mods ${existing ? `into ${existing.name}` : `into a new ${target.gameVersion} instance`}`}
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="rounded-panel border border-slate-line bg-slate-surface p-8">
          <h2 className="font-pixel text-[32px]">Migrated</h2>
          <p className="mt-2 text-muted">
            {result.installed} mods installed into <span className="text-text">{result.instanceName}</span>.
          </p>
          {result.manual.length > 0 && (
            <div className="mt-5">
              <p className="text-[14px] text-gold">These authors only allow downloads from their own page:</p>
              <ul className="mt-2 space-y-1">
                {result.manual.map((f) => (
                  <li key={f.projectId}>
                    <button type="button" className="text-[14px] text-copper underline-offset-2 hover:underline" onClick={() => (inTauri ? openUrl(f.pageUrl) : window.open(f.pageUrl))}>
                      Download {f.projectName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={() => { setStep("drop"); setFiles([]); setPlan(null); }} className="mt-6 rounded-card bg-slate-raised px-4 py-2 text-[14px]">
            Move another set
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[18px] font-bold">{title}</h2>
      <p className="mb-3 text-[14px] text-muted">{hint}</p>
      <ul className="divide-y divide-slate-line rounded-panel border border-slate-line bg-slate-surface">{children}</ul>
    </section>
  );
}

function Row({ entry, children }: { entry: TransferEntry; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="min-w-0">
        <span className="block truncate text-[15px]">{name(entry)}</span>
        <span className="block truncate text-[12px] text-muted">{entry.input.fileName}</span>
      </span>
      <span className="shrink-0 text-right">{children}</span>
    </li>
  );
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="flex w-28 shrink-0 items-center gap-2" title={`${pct}% match`}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-line">
        <span className="block h-full rounded-full bg-copper" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 text-right text-[12px] tabular-nums text-muted">{pct}%</span>
    </span>
  );
}

const name = (e: TransferEntry) => e.identifiedAs?.name ?? e.input.meta?.name ?? e.input.fileName;

function progressLabel(p: TransferProgress | null) {
  if (!p) return "Starting";
  const what = { identify: "Identifying mods", resolve: "Finding builds", fallback: "Looking for replacements", dependencies: "Checking libraries", done: "Done" }[p.phase];
  return p.total > 1 ? `${what} ${p.done}/${p.total}` : what;
}

function dedupe(files: InspectedFile[]) {
  const seen = new Set<string>();
  return files.filter((f) => (seen.has(f.sha1) ? false : (seen.add(f.sha1), true)));
}

// ---------------------------------------------------------- browser demo only
function demoPlan(files: InspectedFile[], target: { gameVersion: string; loader: EngineLoader }): TransferPlan {
  const fake = (n: string): ResolvedFile => ({ source: "modrinth", projectId: n, projectName: n, versionId: n, versionNumber: `${n.toLowerCase()}-${target.gameVersion}`, fileName: `${n}.jar`, url: "https://cdn.modrinth.com/x", pageUrl: "https://modrinth.com" });
  const entries: TransferEntry[] = files.map((input, i) => {
    const kind = i % 5;
    if (kind === 3) return { input, status: "alternative", alternatives: [{ file: fake("Zoomify"), confidence: 0.95, kind: "successor", reason: "Ok Zoomer is no longer updated; Zoomify is maintained" }, { file: fake("Logical Zoom"), confidence: 0.54, kind: "similar", reason: "same categories, similar description" }] };
    if (kind === 4) return { input, status: "obsolete", alternatives: [], note: "Vanilla already does this" };
    return { input, status: "matched", resolved: fake(input.meta?.name ?? input.fileName), alternatives: [] };
  });
  return { target, entries, dependencies: [fake("Fabric API")], stats: { matched: 0, alternative: 0, obsolete: 0, unavailable: 0, unknown: 0 } };
}
function demoFinal(plan: TransferPlan, choices: Record<number, number | null>): ResolvedFile[] {
  return plan.entries.flatMap((e, i) => (e.status === "matched" && e.resolved ? [e.resolved] : e.status === "alternative" && choices[i] !== null ? [e.alternatives[choices[i] ?? 0]!.file] : []));
}
