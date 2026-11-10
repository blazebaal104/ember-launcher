import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Box, Check, Earth, ExternalLink, Loader2, Puzzle, Rocket, Upload, Users } from "lucide-react";
import { mrToResolved, pickBestVersion } from "@ember/content-engine";
import { api, type ServerKind } from "../../lib/ipc";
import { modrinth } from "../../lib/clients";
import { open as openLink } from "../../lib/links";
import { useSystemInfo, useVersions } from "../../lib/queries";
import { useApp } from "../../state";
import { Badge, Button, Field, Modal, Slider, Toggle, inputClass, selectClass } from "../ui";

type Purpose = "friends" | "modded" | "plugins";

const PURPOSES: Array<{ id: Purpose; title: string; text: string; icon: typeof Users; kind: ServerKind }> = [
  { id: "friends", title: "Just play with friends", text: "Fastest and simplest. Friends join with a normal, unmodded game.", icon: Users, kind: "paper" },
  { id: "modded", title: "Modded", text: "Fabric mods on the server. Can copy the server-side mods from one of your instances.", icon: Box, kind: "fabric" },
  { id: "plugins", title: "Plugins", text: "EssentialsX, WorldEdit, LuckPerms and friends. Players still join unmodded.", icon: Puzzle, kind: "paper" },
];

/** Three steps: what kind → the world → performance. Then it creates, sets up and starts. */
export function CreateWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const versions = useVersions();
  const sys = useSystemInfo();
  const { instances, toast } = useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const releases = useMemo(() => (versions.data ?? []).filter((v) => v.channel === "release"), [versions.data]);

  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState<Purpose>("friends");
  const [advancedKind, setAdvancedKind] = useState<ServerKind | null>(null);
  const [fromInstance, setFromInstance] = useState("");
  const [name, setName] = useState("Friends SMP");
  const [version, setVersion] = useState("");
  const [worldMode, setWorldMode] = useState<"new" | "import">("new");
  const [seed, setSeed] = useState("");
  const [gamemode, setGamemode] = useState("survival");
  const [difficulty, setDifficulty] = useState("normal");
  const [importInst, setImportInst] = useState("");
  const [importWorld, setImportWorld] = useState("");
  const [memory, setMemory] = useState(4096);
  const [pregen, setPregen] = useState(true);
  const [radius, setRadius] = useState(2000);
  const [c2me, setC2me] = useState(false);
  const [voxy, setVoxy] = useState(false);
  const [eula, setEula] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const kind: ServerKind = advancedKind ?? PURPOSES.find((p) => p.id === purpose)!.kind;
  const sourceInst = instances.find((i) => i.id === fromInstance);
  useEffect(() => setVersion((v) => v || releases[0]?.id || ""), [releases]);
  useEffect(() => { if (sourceInst) setVersion(sourceInst.gameVersion); }, [sourceInst]);
  useEffect(() => setImportInst((x) => x || instances[0]?.id || ""), [instances]);
  const worlds = useQuery({ queryKey: ["worlds", importInst], queryFn: () => api.listWorlds(importInst), enabled: open && worldMode === "import" && !!importInst });
  useEffect(() => setImportWorld(worlds.data?.[0]?.folder ?? ""), [worlds.data]);
  const voxyAvailable = useQuery({
    queryKey: ["voxyServer", kind, version],
    enabled: open && step === 2 && kind !== "vanilla" && !!version,
    queryFn: async () => !!pickBestVersion(await modrinth.projectVersions("voxy-server-side", kind === "paper" ? ["paper"] : ["fabric"], [version]).catch(() => [])),
    staleTime: 10 * 60_000,
  });
  const maxMem = Math.max(2048, Math.min(32768, Math.floor(((sys.data?.totalMemoryMb ?? 8192) * 0.6) / 512) * 512));
  const recommended = Math.min(maxMem, purpose === "modded" ? 6144 : 4096);
  useEffect(() => setMemory(recommended), [recommended]);

  const reset = () => {
    setStep(0);
    setProgress(null);
    setEula(false);
  };
  const close = () => {
    if (progress) return;
    reset();
    onClose();
  };

  const canNext = step === 0 ? true : step === 1 ? !!name.trim() && !!version && (worldMode === "new" || !!importWorld) : eula;

  const create = async () => {
    try {
      setProgress("Creating the server…");
      const s = await api.createServer({ name: name.trim(), kind, gameVersion: version, memoryMb: memory, gamemode, difficulty, seed: worldMode === "new" ? seed || undefined : undefined, pregenRadius: pregen && kind !== "vanilla" ? radius : undefined });
      await api.acceptEula(s.id);
      if (worldMode === "import" && importWorld) {
        setProgress("Copying your world…");
        await api.importWorld(s.id, importInst, importWorld);
      }
      if (purpose === "modded" && sourceInst && kind === "fabric") {
        setProgress(`Copying server-side mods from ${sourceInst.name}…`);
        await copyServerMods(s.id, sourceInst.id, version).catch((e) => toast({ title: "Some mods weren't copied", body: String(e), tone: "info" }));
      }
      if (c2me && kind === "fabric") {
        setProgress("Adding faster world generation…");
        await api.setServerAddon(s.id, "c2me", true).catch(() => {});
      }
      if (voxy && kind !== "vanilla") {
        setProgress("Adding far view…");
        await api.setServerAddon(s.id, "voxy", true).catch(() => {});
      }
      setProgress("Starting… (the first start downloads the server)");
      await api.startServer(s.id);
      await qc.invalidateQueries({ queryKey: ["servers"] });
      toast({ title: `${s.name} is starting`, body: "Open Invite friends to get the address to share.", tone: "success" });
      reset();
      onClose();
      navigate(`/servers/${s.id}`);
    } catch (e) {
      setProgress(null);
      toast({ title: "Couldn't set up the server", body: e instanceof Error ? e.message : String(e), tone: "error" });
      qc.invalidateQueries({ queryKey: ["servers"] });
    }
  };

  const titles = ["What kind of server?", "The world", "Performance"];
  return (
    <Modal
      open={open}
      onClose={close}
      title={`New server · ${titles[step]}`}
      width="w-[720px]"
      footer={progress ? (
        <p className="flex flex-1 items-center gap-2 text-[14px]"><Loader2 className="size-4 animate-spin text-copper" /> {progress}</p>
      ) : (
        <>
          <div className="mr-auto flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-copper" : "w-1.5 bg-slate-line"}`} />)}</div>
          {step > 0 && <Button icon={ArrowLeft} onClick={() => setStep(step - 1)}>Back</Button>}
          {step < 2 ? <Button variant="primary" icon={ArrowRight} disabled={!canNext} onClick={() => setStep(step + 1)}>Next</Button> : <Button variant="primary" className="shine" icon={Rocket} disabled={!canNext} onClick={create}>Create and start</Button>}
        </>
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.14 }}>
          {step === 0 && (
            <div className="flex flex-col gap-3">
              {PURPOSES.map((p) => (
                <button key={p.id} type="button" onClick={() => { setPurpose(p.id); setAdvancedKind(null); }} className={`press flex items-center gap-4 rounded-panel border p-4 text-left ${purpose === p.id && !advancedKind ? "border-copper bg-copper/10" : "border-slate-line hover:border-muted"}`}>
                  <span className={`grid size-11 shrink-0 place-items-center rounded-card ${purpose === p.id ? "bg-copper text-on-accent" : "bg-slate-raised text-copper"}`}><p.icon className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[15px] font-bold">{p.title}{p.id === "friends" && <Badge tone="accent">Most people</Badge>}</span>
                    <span className="block text-[13px] text-muted">{p.text}</span>
                  </span>
                  {purpose === p.id && !advancedKind && <Check className="size-5 text-copper" />}
                </button>
              ))}
              {purpose === "modded" && (
                <Field label="Copy mods from an instance (optional)" hint="Its version is used, and its mods that also run on servers are added.">
                  <select value={fromInstance} onChange={(e) => setFromInstance(e.target.value)} className={selectClass}>
                    <option value="">Don't copy, I'll add mods later</option>
                    {instances.filter((i) => i.loader === "fabric").map((i) => <option key={i.id} value={i.id}>{i.name} ({i.gameVersion})</option>)}
                  </select>
                </Field>
              )}
              <details className="text-[13px] text-muted">
                <summary className="cursor-pointer select-none hover:text-text">Advanced: pick the server software</summary>
                <div className="mt-2 flex gap-2">
                  {(["paper", "fabric", "vanilla"] as ServerKind[]).map((k) => (
                    <button key={k} type="button" onClick={() => setAdvancedKind(k)} className={`press rounded-chip border px-3 py-1.5 capitalize ${advancedKind === k ? "border-copper text-text" : "border-slate-line"}`}>{k}</button>
                  ))}
                </div>
              </details>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Server name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={48} className={inputClass} /></Field>
                <Field label="Minecraft version">
                  <select value={version} onChange={(e) => setVersion(e.target.value)} disabled={!!sourceInst} className={selectClass}>{releases.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}</select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([["new", Earth, "A new world", "Generated fresh on first start."], ["import", Upload, "One of my worlds", "Copy a singleplayer world from an instance."]] as const).map(([id, Icon, t, d]) => (
                  <button key={id} type="button" onClick={() => setWorldMode(id)} className={`press flex items-start gap-3 rounded-panel border p-3 text-left ${worldMode === id ? "border-copper bg-copper/10" : "border-slate-line hover:border-muted"}`}>
                    <Icon className="mt-0.5 size-5 text-copper" />
                    <span><span className="block text-[14px] font-bold">{t}</span><span className="block text-[12px] text-muted">{d}</span></span>
                  </button>
                ))}
              </div>
              {worldMode === "new" ? (
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Seed (optional)"><input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Random" className={inputClass} /></Field>
                  <Field label="Game mode"><select value={gamemode} onChange={(e) => setGamemode(e.target.value)} className={selectClass}>{["survival", "creative", "adventure"].map((g) => <option key={g} value={g}>{g[0]!.toUpperCase() + g.slice(1)}</option>)}</select></Field>
                  <Field label="Difficulty"><select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={selectClass}>{["peaceful", "easy", "normal", "hard"].map((d) => <option key={d} value={d}>{d[0]!.toUpperCase() + d.slice(1)}</option>)}</select></Field>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Instance"><select value={importInst} onChange={(e) => setImportInst(e.target.value)} className={selectClass}>{instances.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.gameVersion})</option>)}</select></Field>
                  <Field label="World">
                    <select value={importWorld} onChange={(e) => setImportWorld(e.target.value)} className={selectClass} disabled={!worlds.data?.length}>
                      {(worlds.data ?? []).map((w) => <option key={w.folder} value={w.folder}>{w.info?.name || w.folder}</option>)}
                    </select>
                  </Field>
                  {worlds.data && !worlds.data.length && <p className="col-span-2 text-[13px] text-muted">That instance has no worlds yet.</p>}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <Slider label="Memory" value={memory} onChange={setMemory} min={1024} max={maxMem} step={512} format={(v) => `${(v / 1024).toFixed(1)} GB`} detail={`${(recommended / 1024).toFixed(0)} GB recommended for ${purpose === "modded" ? "a modded server" : "up to ~10 players"}.`} />
              {kind !== "vanilla" && (
                <div className="rounded-panel bg-slate-raised/40 p-4">
                  <Toggle checked={pregen} onChange={setPregen} label="Pre-generate the world" detail="Generates the land ahead of time on first start, so exploring never waits for chunks." />
                  {pregen && <div className="mt-3"><Slider label="Size" value={radius} onChange={setRadius} min={500} max={6000} step={500} format={(v) => `${(v * 2).toLocaleString()} × ${(v * 2).toLocaleString()} blocks`} /></div>}
                </div>
              )}
              {kind === "fabric" && <Toggle checked={c2me} onChange={setC2me} label="Faster world generation (C2ME)" detail="Uses all CPU cores for terrain generation. Experimental; Ember backs up before turning it on later." />}
              {kind !== "vanilla" && (
                <Toggle checked={voxy && !!voxyAvailable.data} disabled={!voxyAvailable.data} onChange={setVoxy} label="Far view for players (Voxy)" detail={voxyAvailable.isLoading ? "Checking availability…" : voxyAvailable.data ? "Players with Voxy see terrain hundreds of chunks away." : `Not available for ${version} yet.`} />
              )}
              <label className="flex cursor-pointer items-start gap-3 rounded-panel border border-slate-line p-3 text-[13px]">
                <input type="checkbox" checked={eula} onChange={(e) => setEula(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
                <span>I agree to the <button type="button" onClick={() => openLink("https://aka.ms/MinecraftEULA")} className="inline-flex items-center gap-1 text-copper hover:underline">Minecraft EULA <ExternalLink className="size-3" /></button>, which Mojang requires for running a server.</span>
              </label>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}

/** Copy an instance's mods that also run on servers (Modrinth says server_side isn't "unsupported"). */
async function copyServerMods(serverId: string, instanceId: string, gameVersion: string) {
  const files = (await api.listContent(instanceId, "mods")).filter((f) => f.enabled && f.sha1);
  if (!files.length) return;
  const byHash = await modrinth.versionsFromHashes(files.map((f) => f.sha1));
  const ids = [...new Set(Object.values(byHash).map((v) => v.project_id))];
  const projects = await Promise.all(ids.map((id) => modrinth.project(id).catch(() => null)));
  const serverSide = projects.filter((p): p is NonNullable<typeof p> => !!p && p.server_side !== "unsupported" && !["fabric-api"].includes(p.slug));
  const resolved = await Promise.all(
    serverSide.map(async (p) => {
      const best = pickBestVersion(await modrinth.projectVersions(p.id, ["fabric"], [gameVersion]).catch(() => []));
      return best ? mrToResolved(best, p.title, p.slug) : null;
    }),
  );
  const ok = resolved.filter((r): r is NonNullable<typeof r> => !!r);
  if (ok.length) await api.serverInstallFiles(serverId, ok);
}
