import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Gauge, Keyboard, Layers3, Plus, Sparkles } from "lucide-react";
import { api, type Channel, type HookReport, type Loader } from "../lib/ipc";
import { channelName, loaderName } from "../lib/format";
import { useProfiles, useVersions, useWorldPacks } from "../lib/queries";
import { useApp } from "../state";
import { applyWorldPack, summarise } from "../lib/worldpacks";
import { Button, Field, Modal, Toggle, inputClass } from "./ui";
import { tr } from "../lib/i18n";

const CHANNELS: Channel[] = ["release", "snapshot", "pre-release", "release-candidate"];
const LOADERS: Array<{ id: Loader; text: string }> = [
  { id: "fabric", text: tr("Most mods, fastest updates") },
  { id: "neoforge", text: tr("Big tech & magic mods") },
  { id: "quilt", text: tr("Runs Fabric mods too") },
  { id: "vanilla", text: tr("No mods at all") },
];

export function NewInstanceDialog() {
  const { newInstanceOpen, setNewInstanceOpen, refresh, settings, appearance, toast } = useApp();
  const navigate = useNavigate();
  const versions = useVersions();
  const profiles = useProfiles();
  const [channels, setChannels] = useState<Set<Channel>>(new Set(["release"]));
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [loader, setLoader] = useState<Loader>("fabric");
  const [perf, setPerf] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const [profile, setProfile] = useState<string>("");
  const packs = useWorldPacks();
  const [packId, setPackId] = useState("");
  const [packNote, setPackNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; reports: HookReport[] } | null>(null);

  useEffect(() => {
    if (!newInstanceOpen) return;
    setResult(null);
    setPackNote(null);
    setName("");
    setChannels(new Set(appearance.showSnapshots ? ["release", "snapshot"] : ["release"]));
    setProfile(profiles.data?.defaultProfile ?? "");
  }, [newInstanceOpen]);
  useEffect(() => setVersion((v) => v || versions.data?.find((x) => x.channel === "release")?.id || ""), [versions.data]);

  const shown = useMemo(() => (versions.data ?? []).filter((v) => channels.has(v.channel)), [versions.data, channels]);
  const toggle = (c: Channel) => setChannels((s) => {
    const n = new Set(s);
    if (n.has(c) && n.size > 1) n.delete(c);
    else n.add(c);
    return n;
  });

  const create = async () => {
    setBusy(true);
    try {
      const pack = packs.data?.find((p) => p.id === packId);
      const res = await api.createInstance({ name: name.trim() || `Minecraft ${version}`, gameVersion: version, loader, performanceBundle: perf && loader !== "vanilla", overlay, memoryMb: settings?.defaultMemoryMb ?? undefined, gameProfile: profile || pack?.gameProfile || null });
      if (pack) {
        try {
          setPackNote(`“${pack.name}”: ${summarise(await applyWorldPack(pack, res.instance))}`);
        } catch (e) {
          setPackNote(tr("“{name}” couldn't be added: {n1}", { name: pack.name, n1: e instanceof Error ? e.message : String(e) }));
        }
      }
      setResult({ id: res.instance.id, reports: res.reports });
      await refresh();
    } catch (e) {
      toast({ title: tr("Couldn't create the instance"), body: String(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const close = () => setNewInstanceOpen(false);

  if (result) {
    const installed = result.reports.flatMap((r) => r.installed);
    const notes = result.reports.flatMap((r) => [...r.skipped.map((s) => tr("Skipped {s}", { s })), ...r.warnings]);
    return (
      <Modal open={newInstanceOpen} onClose={close} title={tr("Ready to play")} footer={<><Button onClick={close}>{tr("Close")}</Button><Button variant="primary" onClick={() => { close(); navigate(`/instance/${result.id}`); }}>{tr("Open instance")}</Button></>}>
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-copper text-on-accent">
          <Check className="size-8" />
        </motion.div>
        {installed.length > 0 && (
          <>
            <p className="mb-2 text-[14px] text-muted">{tr("Set up for this exact version:")}</p>
            <ul className="flex flex-wrap gap-1.5">
              {installed.map((m, i) => <motion.li key={m} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }} className="rounded-chip bg-copper/12 px-2.5 py-1 text-[13px] text-copper">{m.split(" (")[0]}</motion.li>)}
            </ul>
          </>
        )}
        {packNote && <p className="mt-3 flex items-start gap-1.5 text-[13px] text-text"><Layers3 className="mt-0.5 size-4 shrink-0 text-copper" /> {packNote}</p>}
        {notes.map((n) => <p key={n} className="mt-3 text-[13px] text-gold">{n}</p>)}
      </Modal>
    );
  }

  return (
    <Modal open={newInstanceOpen} onClose={close} title={tr("New instance")} footer={<><Button onClick={close}>{tr("Cancel")}</Button><Button variant="primary" className="shine" icon={Plus} loading={busy} disabled={!version} onClick={create}>{tr("Create instance")}</Button></>}>
      <div className="flex flex-col gap-5">
        <Field label={tr("Name")}><input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Minecraft {version}", { version })} className={inputClass} autoFocus /></Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-muted">{tr("Version")}</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => <button key={c} type="button" aria-pressed={channels.has(c)} onClick={() => toggle(c)} className={`press rounded-chip px-2.5 py-1 text-[13px] ${channels.has(c) ? "bg-copper/15 text-copper" : "bg-slate-raised text-muted hover:text-text"}`}>{channelName[c]}</button>)}
          </div>
          <select value={version} onChange={(e) => setVersion(e.target.value)} className={inputClass}>
            {shown.map((v) => <option key={v.id} value={v.id}>{v.id}{v.channel !== "release" ? ` (${channelName[v.channel].toLowerCase()})` : ""}</option>)}
          </select>
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-muted">{tr("Mod loader")}</p>
          <div className="grid grid-cols-2 gap-2">
            {LOADERS.map((l) => (
              <button key={l.id} type="button" aria-pressed={loader === l.id} onClick={() => setLoader(l.id)} className={`press rounded-card border p-3 text-left ${loader === l.id ? "border-copper bg-copper/10" : "border-slate-line hover:border-muted"}`}>
                <span className="block text-[14px] font-bold">{loaderName[l.id]}</span>
                <span className="block text-[12px] text-muted">{l.text}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label={tr("Game settings profile")} hint={tr("Your keybinds, FOV and video settings. Edit profiles in Settings.")}>
          <select value={profile} onChange={(e) => setProfile(e.target.value)} className={inputClass}>
            <option value="">{tr("None (Minecraft defaults)")}</option>
            {(profiles.data?.profiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        {!!packs.data?.length && (
          <Field label={tr("World pack (optional)")} hint={tr("Adds your saved mix of mods, resource packs, data packs and shaders, matched to this version.")}>
            <select value={packId} onChange={(e) => setPackId(e.target.value)} className={inputClass}>
              <option value="">{tr("None")}</option>
              {packs.data.map((p) => <option key={p.id} value={p.id}>{tr("{name} ({length} items)", { name: p.name, length: p.items.length })}</option>)}
            </select>
          </Field>
        )}
        <div className="space-y-4 rounded-card bg-slate-raised/50 p-4">
          <Toggle checked={perf && loader !== "vanilla"} disabled={loader === "vanilla"} onChange={setPerf} label={tr("Performance stack")} detail={<span className="inline-flex items-center gap-1"><Gauge className="size-3.5" /> {tr("Sodium, Lithium, FerriteCore, ImmediatelyFast, Entity Culling and more.")}</span>} />
          <Toggle checked={overlay} onChange={setOverlay} label={tr("Ember in-game menu")} detail={<span className="inline-flex items-center gap-1"><Keyboard className="size-3.5" /> {tr("Right Shift in game: HUD, zoom, fullbright, 50+ tweaks.")}</span>} />
          {loader === "vanilla" && overlay && <p className="flex items-center gap-1.5 text-[13px] text-gold"><Sparkles className="size-3.5" /> {tr("The in-game menu needs a loader, so this instance will use Fabric.")}</p>}
        </div>
      </div>
    </Modal>
  );
}
