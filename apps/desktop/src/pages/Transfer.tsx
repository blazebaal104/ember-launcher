import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, CheckCircle2, ExternalLink, FileArchive, HelpCircle, Package, RotateCcw, Sparkles, Upload, XCircle } from "lucide-react";
import type { InspectedFile, Loader as EngineLoader, ResolvedFile, TransferEntry, TransferPlan, TransferProgress } from "@ember/content-engine";
import { transferEngine } from "../lib/clients";
import { api, inTauri } from "../lib/ipc";
import { open } from "../lib/links";
import { useVersions } from "../lib/queries";
import { useApp } from "../state";
import { Badge, Button, Glass, Ring, inputClass } from "../components/ui";
import InspectWorker from "../workers/inspect.worker?worker";
import { tr, trn } from "../lib/i18n";

type Step = 0 | 1 | 2 | 3;
const STEPS = [tr("Add mods"), tr("Choose target"), tr("Review"), tr("Done")];
const PHASE: Record<TransferProgress["phase"], string> = { identify: tr("Identifying your mods"), resolve: tr("Finding new builds"), fallback: tr("Looking for replacements"), dependencies: tr("Adding required libraries"), done: tr("Done") };

export function Transfer() {
  const { instances, refresh, toast } = useApp();
  const versions = useVersions();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);
  const [files, setFiles] = useState<InspectedFile[]>([]);
  const [reading, setReading] = useState(false);
  const [into, setInto] = useState("new");
  const [gameVersion, setGameVersion] = useState("");
  const [loader, setLoader] = useState<EngineLoader>("fabric");
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [plan, setPlan] = useState<TransferPlan | null>(null);
  const [choices, setChoices] = useState<Record<number, number | null>>({});
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<{ installed: number; manual: ResolvedFile[]; instanceId: string; name: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const releases = (versions.data ?? []).filter((v) => v.channel === "release");
  const existing = instances.find((i) => i.id === into);
  const target = { gameVersion: existing?.gameVersion ?? (gameVersion || releases[0]?.id || ""), loader: (existing && existing.loader !== "vanilla" ? existing.loader : loader) as EngineLoader };

  const ingest = async (list: FileList | File[]) => {
    const picked = [...list].filter((f) => /\.(jar|zip|mrpack)$/i.test(f.name));
    if (!picked.length) return toast({ title: tr("Nothing to read"), body: tr("Drop .jar files, a zipped mods folder or a .mrpack."), tone: "error" });
    setReading(true);
    const uploads = await Promise.all(picked.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    const worker = new InspectWorker();
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: InspectedFile[]; error?: string }>) => {
      if (e.data.ok) {
        setFiles((prev) => {
          const seen = new Set(prev.map((f) => f.sha1 || f.fileName));
          return [...prev, ...e.data.result!.filter((f) => !seen.has(f.sha1 || f.fileName))];
        });
        setStep(1);
      } else toast({ title: tr("Couldn't read those files"), body: e.data.error, tone: "error" });
      setReading(false);
      worker.terminate();
    };
    worker.postMessage({ files: uploads }, uploads.map((u) => u.bytes.buffer));
  };

  const analyze = async () => {
    setProgress({ phase: "identify", done: 0, total: files.length });
    try {
      const p = await transferEngine(setProgress).plan(files, target);
      setPlan(p);
      setChoices({});
      setStep(2);
    } catch (e) {
      toast({ title: tr("The lookup failed"), body: String(e), tone: "error" });
    } finally {
      setProgress(null);
    }
  };

  const install = async () => {
    if (!plan) return;
    setInstalling(true);
    try {
      const final = await transferEngine(setProgress).finalize(plan, choices);
      let instanceId = existing?.id;
      let name = existing?.name ?? "";
      if (!instanceId) {
        name = tr("Migrated to {gameVersion}", { gameVersion: target.gameVersion });
        const created = await api.createInstance({ name, gameVersion: target.gameVersion, loader: target.loader === "forge" ? "neoforge" : target.loader, performanceBundle: true, overlay: true });
        instanceId = created.instance.id;
      }
      const installed = await api.installFiles(instanceId, final.filter((f) => f.url));
      setResult({ installed, manual: final.filter((f) => !f.url), instanceId, name });
      await refresh();
      setStep(3);
    } catch (e) {
      toast({ title: tr("Install stopped"), body: String(e), tone: "error" });
    } finally {
      setInstalling(false);
      setProgress(null);
    }
  };

  const groups = useMemo(() => {
    const g = { matched: [] as Array<[number, TransferEntry]>, alternative: [] as Array<[number, TransferEntry]>, obsolete: [] as Array<[number, TransferEntry]>, missing: [] as Array<[number, TransferEntry]> };
    plan?.entries.forEach((e, i) => (e.status === "matched" ? g.matched : e.status === "alternative" ? g.alternative : e.status === "obsolete" ? g.obsolete : g.missing).push([i, e]));
    return g;
  }, [plan]);
  const installCount = groups.matched.length + groups.alternative.filter(([i]) => choices[i] !== null).length + (plan?.dependencies.length ?? 0);
  const reset = () => { setStep(0); setFiles([]); setPlan(null); setResult(null); };

  return (
    <div className="mx-auto max-w-5xl px-6 pb-28 pt-2">
      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-[30px] font-bold tracking-tight">{tr("Transfer mods")}</h1>
        <p className="mt-1 max-w-[68ch] text-muted">{tr("Bring your mods to a new Minecraft version. Ember identifies every file, finds its new build, and suggests the closest replacement when a mod was abandoned.")}</p>
      </motion.header>

      {/* animated stepper (this content really is a sequence) */}
      <ol className="glass mb-6 flex items-center gap-2 rounded-panel p-3" aria-label={tr("Progress")}>
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <motion.span animate={{ backgroundColor: i < step ? "var(--accent)" : i === step ? "color-mix(in oklab, var(--accent) 22%, transparent)" : "var(--raised)", scale: i === step ? 1.1 : 1 }} className={`grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold ${i < step ? "text-on-accent" : i === step ? "text-copper" : "text-muted"}`}>
              {i < step ? <Check className="size-4" /> : i + 1}
            </motion.span>
            <span className={`text-[14px] ${i <= step ? "text-text" : "text-muted"}`}>{label}</span>
            {i < STEPS.length - 1 && <div className="mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-slate-line"><motion.div className="h-full bg-copper" animate={{ width: i < step ? "100%" : "0%" }} transition={{ duration: 0.5 }} /></div>}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        {step <= 1 && (
          <motion.div key="drop" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex flex-col gap-4">
            <motion.div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); ingest(e.dataTransfer.files); }}
              animate={{ scale: dragging ? 1.015 : 1, borderColor: dragging ? "var(--accent)" : "var(--line)" }}
              className="glass relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-panel border-2 border-dashed px-6 py-14 text-center"
            >
              <motion.div className="pointer-events-none absolute inset-0 bg-copper/10" animate={{ opacity: dragging ? 1 : 0 }} />
              <div className="relative h-20 w-40">
                {[0, 1, 2].map((n) => (
                  <motion.div key={n} className="absolute left-1/2 top-0 grid size-14 place-items-center rounded-card bg-slate-raised ring-1 ring-slate-line" style={{ x: "-50%" }} animate={{ x: ["-50%", `${-50 + (n - 1) * 70}%`, "-50%"], y: [0, n === 1 ? -12 : 0, 0], rotate: [0, (n - 1) * 10, 0] }} transition={{ duration: 3, repeat: Infinity, delay: n * 0.15, ease: "easeInOut" }}>
                    <FileArchive className="size-7 text-copper" />
                  </motion.div>
                ))}
              </div>
              <p className="relative text-[17px] font-bold">{reading ? tr("Reading your files…") : tr("Drop your old mods here")}</p>
              <p className="relative text-[14px] text-muted">{tr(".jar files, a zipped mods folder, or a modpack (.mrpack, CurseForge zip)")}</p>
              <Button className="relative" icon={Upload} onClick={() => input.current?.click()} loading={reading}>{tr("Choose files")}</Button>
              <input ref={input} type="file" multiple accept=".jar,.zip,.mrpack" className="sr-only" onChange={(e) => e.target.files && ingest(e.target.files)} />
            </motion.div>

            {files.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 md:grid-cols-[1fr_320px]">
                <Glass className="p-5">
                  <div className="mb-3 flex items-baseline justify-between"><h2 className="text-[16px] font-bold">{tr("{length} mods found", { length: files.length })}</h2><button type="button" onClick={reset} className="text-[13px] text-muted hover:text-text">{tr("Clear")}</button></div>
                  <ul className="grid max-h-64 grid-cols-2 gap-1.5 overflow-auto">
                    {files.map((f, i) => (
                      <motion.li key={f.sha1 || f.fileName} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 30) * 0.015 }} className="flex items-center gap-2 truncate rounded-chip bg-slate-raised/60 px-2.5 py-1.5 text-[13px]">
                        <FileArchive className="size-3.5 shrink-0 text-copper" />
                        <span className="truncate">{f.meta?.name ?? f.fileName}</span>
                        {f.meta?.version && <span className="shrink-0 text-muted">{f.meta.version}</span>}
                      </motion.li>
                    ))}
                  </ul>
                </Glass>
                <Glass className="flex flex-col gap-3 p-5">
                  <h2 className="text-[16px] font-bold">{tr("Move them to")}</h2>
                  <select value={into} onChange={(e) => setInto(e.target.value)} className={inputClass} aria-label={tr("Install into")}>
                    <option value="new">{tr("A new instance")}</option>
                    {instances.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.gameVersion})</option>)}
                  </select>
                  {!existing && (
                    <>
                      <select value={target.gameVersion} onChange={(e) => setGameVersion(e.target.value)} className={inputClass} aria-label={tr("Minecraft version")}>{releases.map((v) => <option key={v.id} value={v.id}>{tr("Minecraft {id}", { id: v.id })}</option>)}</select>
                      <select value={loader} onChange={(e) => setLoader(e.target.value as EngineLoader)} className={inputClass} aria-label={tr("Loader")}>
                        <option value="fabric">{tr("Fabric")}</option><option value="quilt">{tr("Quilt")}</option><option value="neoforge">{tr("NeoForge")}</option>
                      </select>
                    </>
                  )}
                  <Button variant="primary" size="lg" className="mt-auto" disabled={!!progress || !target.gameVersion} onClick={analyze} icon={progress ? undefined : Sparkles} loading={!!progress}>
                    {progress ? `${PHASE[progress.phase]}${progress.total > 1 ? ` ${progress.done}/${progress.total}` : ""}` : tr("Find builds for {gameVersion}", { gameVersion: target.gameVersion })}
                  </Button>
                </Glass>
              </motion.div>
            )}
          </motion.div>
        )}

        {step === 2 && plan && (
          <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { n: groups.matched.length, label: tr("Ready"), tone: "text-copper", icon: CheckCircle2 },
                { n: groups.alternative.length, label: tr("Need your pick"), tone: "text-gold", icon: HelpCircle },
                { n: groups.obsolete.length, label: tr("No longer needed"), tone: "text-muted", icon: Sparkles },
                { n: groups.missing.length, label: tr("Couldn't carry over"), tone: "text-redstone", icon: XCircle },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.06 }} className="glass rounded-panel p-4">
                  <s.icon className={`size-5 ${s.tone}`} />
                  <p className="mt-1 text-[28px] font-bold tabular-nums">{s.n}</p>
                  <p className="text-[13px] text-muted">{s.label}</p>
                </motion.div>
              ))}
            </div>

            {groups.alternative.length > 0 && (
              <Section title={tr("Pick a replacement")} hint={tr("These have no build for {gameVersion}. Ember found the closest matches: pick one or skip.", { gameVersion: plan.target.gameVersion })}>
                {groups.alternative.map(([i, e]) => (
                  <motion.li key={i} layout className="glass rounded-panel p-4">
                    <p className="mb-3 flex items-center gap-2 text-[15px] font-bold"><span className="text-muted line-through decoration-redstone/50">{label(e)}</span><ArrowRight className="size-4 text-copper" /> ?</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {e.alternatives.map((a, ai) => {
                        const picked = (choices[i] ?? 0) === ai;
                        return (
                          <motion.button key={a.file.projectId} type="button" whileHover={{ y: -2 }} onClick={() => setChoices((c) => ({ ...c, [i]: ai }))} className={`flex items-center gap-3 rounded-card border p-3 text-left ${picked ? "border-copper bg-copper/10" : "border-slate-line hover:border-muted"}`}>
                            <Ring value={a.confidence} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 text-[14px] font-medium">{a.file.projectName}<Badge tone={a.kind === "successor" ? "accent" : a.kind === "fork" ? "gold" : "neutral"}>{{ successor: "Successor", fork: tr("Continued fork"), similar: "Similar" }[a.kind]}</Badge></span>
                              <span className="block text-[12px] text-muted">{a.reason}</span>
                            </span>
                            {picked && <Check className="size-5 shrink-0 text-copper" />}
                          </motion.button>
                        );
                      })}
                      <button type="button" onClick={() => setChoices((c) => ({ ...c, [i]: null }))} className={`rounded-card border p-3 text-left text-[14px] ${choices[i] === null ? "border-copper bg-copper/10" : "border-dashed border-slate-line text-muted hover:border-muted"}`}>{tr("Skip this mod")}</button>
                    </div>
                  </motion.li>
                ))}
              </Section>
            )}

            <Section title={tr("Ready to install")} hint={tr("Same mod, built for your target version.")}>
              <div className="grid gap-2 md:grid-cols-2">
                {groups.matched.map(([i, e], n) => (
                  <motion.li key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(n, 20) * 0.02 }} className="glass flex items-center gap-3 rounded-card p-3">
                    <CheckCircle2 className="size-5 shrink-0 text-copper" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium">{label(e)}</span><span className="block truncate text-[12px] text-muted">{e.resolved?.versionNumber}</span></span>
                    {e.note && <Badge tone="gold">{tr("Manual download")}</Badge>}
                  </motion.li>
                ))}
              </div>
            </Section>

            {groups.obsolete.length > 0 && (
              <Section title={tr("No longer needed")} hint={tr("Their improvements are part of Minecraft now.")}>
                {groups.obsolete.map(([i, e]) => <li key={i} className="glass rounded-card p-3 text-[14px]"><b>{label(e)}</b> <span className="text-muted">{e.note}</span></li>)}
              </Section>
            )}
            {groups.missing.length > 0 && (
              <Section title={tr("Couldn't carry over")} hint={tr("Check these by hand. Unknown files may be private builds or renamed jars.")}>
                {groups.missing.map(([i, e]) => <li key={i} className="glass flex items-center justify-between gap-3 rounded-card p-3 text-[14px]"><span className="truncate">{label(e)}</span><span className="shrink-0 text-[12px] text-redstone">{e.status === "unknown" ? tr("Not on Modrinth or CurseForge") : e.note ?? tr("No build or replacement")}</span></li>)}
              </Section>
            )}
            {plan.dependencies.length > 0 && <p className="text-[14px] text-muted"><Package className="mr-1 inline size-4 text-copper" /> {tr("Also adding required libraries: {n0}.", { n0: plan.dependencies.map((d) => d.projectName).join(", ") })}</p>}

            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass glass-strong fixed bottom-5 left-1/2 z-30 flex w-[min(720px,90vw)] -translate-x-1/2 items-center gap-3 rounded-panel p-3 pl-5">
              <span className="flex-1 text-[14px]">{tr("{installCount} files →", { installCount })} {existing ? existing.name : tr("new {gameVersion} instance", { gameVersion: target.gameVersion })}</span>
              <Button variant="ghost" icon={RotateCcw} onClick={() => setStep(1)}>{tr("Back")}</Button>
              <Button variant="primary" loading={installing} disabled={installCount === 0} onClick={install}>{tr("Install {installCount}", { installCount })}</Button>
            </motion.div>
          </motion.div>
        )}

        {step === 3 && result && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="glass flex flex-col items-center gap-4 rounded-panel p-10 text-center">
            <motion.div initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="grid size-20 place-items-center rounded-full bg-copper text-on-accent"><Check className="size-10" /></motion.div>
            <h2 className="font-pixel text-[34px]">{tr("Migrated")}</h2>
            <p className="text-muted">{trn(tr("{installed} files installed into {b}."), { installed: result.installed, b: <b className="text-text">{result.name}</b> })}</p>
            {result.manual.length > 0 && (
              <div className="rounded-card bg-gold/10 p-4 text-left">
                <p className="text-[14px] text-gold">{tr("These authors only allow downloads from their own page:")}</p>
                <ul className="mt-2 space-y-1">{result.manual.map((f) => <li key={f.projectId}><button type="button" className="flex items-center gap-1 text-[14px] text-copper hover:underline" onClick={() => open(f.pageUrl)}><ExternalLink className="size-3.5" /> {f.projectName}</button></li>)}</ul>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={reset} icon={RotateCcw}>{tr("Move another set")}</Button>
              <Button variant="primary" onClick={() => navigate(`/instance/${result.instanceId}`)}>{tr("Open instance")}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!inTauri && step === 0 && <p className="mt-4 text-[12px] text-muted">{tr("Demo mode: lookups need internet access to Modrinth.")}</p>}
    </div>
  );
}

const label = (e: TransferEntry) => e.identifiedAs?.name ?? e.input.meta?.name ?? e.input.fileName;

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[18px] font-bold">{title}</h2>
      <p className="mb-3 text-[14px] text-muted">{hint}</p>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}
