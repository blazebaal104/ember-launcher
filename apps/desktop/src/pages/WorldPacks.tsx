import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Box, Check, Copy, Database, Image, Layers3, Loader2, Package, Pencil, Plus, Search, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { api, type Instance, type PackCategory, type PackItem, type WorldPack } from "../lib/ipc";
import { useDiscover, useWorldPacks } from "../lib/queries";
import { applyWorldPack, packFromInstance, summarise } from "../lib/worldpacks";
import { compact } from "../lib/format";
import { useApp } from "../state";
import { Badge, Button, Empty, Field, IconButton, Modal, Segmented, Skeleton, inputClass, selectClass } from "../components/ui";
import { tr } from "../lib/i18n";

export const CAT_META: Record<PackCategory, { label: string; icon: typeof Box }> = {
  mods: { label: tr("Mods"), icon: Box },
  resourcepacks: { label: tr("Resource packs"), icon: Image },
  datapacks: { label: tr("Data packs"), icon: Database },
  shaders: { label: tr("Shaders"), icon: Sparkles },
};


export function WorldPacks() {
  const packs = useWorldPacks();
  const qc = useQueryClient();
  const { instances, toast, dismiss } = useApp();
  const [editing, setEditing] = useState<WorldPack | null>(null);
  const [applying, setApplying] = useState<WorldPack | null>(null);
  const [capture, setCapture] = useState(false);

  const save = async (list: WorldPack[]) => {
    await api.saveWorldPacks(list);
    qc.setQueryData(["worldPacks"], list);
  };
  const upsert = async (p: WorldPack) => {
    const list = packs.data ?? [];
    await save(list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]);
  };
  const remove = async (p: WorldPack) => {
    await save((packs.data ?? []).filter((x) => x.id !== p.id));
    toast({ title: tr("Deleted “{name}”", { name: p.name }), tone: "info" });
  };
  const duplicate = (p: WorldPack) => upsert({ ...p, id: crypto.randomUUID(), name: `${p.name} (copy)`, created: Date.now() });

  const newPack = (): WorldPack => ({ id: crypto.randomUUID(), name: "", description: "", items: [], created: Date.now() });

  const doCapture = async (inst: Instance, name: string) => {
    setCapture(false);
    const t = toast({ title: tr("Reading {name}…", { name: inst.name }), tone: "progress" });
    try {
      const p = await packFromInstance(inst, name || tr("{name} pack", { name: inst.name }));
      dismiss(t);
      setEditing(p);
    } catch (e) {
      dismiss(t);
      toast({ title: tr("Couldn't read that instance"), body: String(e), tone: "error" });
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-2">
      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-bold tracking-tight">{tr("World packs")}</h1>
          <p className="mt-1 max-w-[70ch] text-muted">
            {tr("Your own mix of mods, resource packs, data packs and shaders (with their settings). Packs aren't tied to a version: when you apply one, Ember picks the right build of everything for that instance.")}
          </p>
        </div>
        <Button icon={Copy} onClick={() => setCapture(true)} disabled={!instances.length}>{tr("From an instance")}</Button>
        <Button variant="primary" icon={Plus} onClick={() => setEditing(newPack())}>{tr("New pack")}</Button>
      </motion.header>

      {packs.isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-52" />)}</div>
      ) : !packs.data?.length ? (
        <Empty icon={Layers3} title={tr("No world packs yet")} action={<Button variant="primary" icon={Plus} onClick={() => setEditing(newPack())}>{tr("Make your first pack")}</Button>}>
          {tr("Bundle your favourite setup once, then drop it onto any instance, or pick it when you create a new one.")}
        </Empty>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {packs.data.map((p, i) => (
            <PackCard key={p.id} pack={p} index={i} onApply={() => setApplying(p)} onEdit={() => setEditing(p)} onDelete={() => remove(p)} onDuplicate={() => duplicate(p)} />
          ))}
        </ul>
      )}

      <PackEditor pack={editing} onClose={() => setEditing(null)} onSave={async (p) => { await upsert(p); setEditing(null); toast({ title: tr("Saved “{name}”", { name: p.name }), tone: "success" }); }} />
      <ApplyDialog pack={applying} onClose={() => setApplying(null)} />
      <CaptureDialog open={capture} onClose={() => setCapture(false)} onPick={doCapture} />
    </div>
  );
}

function Mosaic({ items }: { items: PackItem[] }) {
  const icons = items.filter((i) => i.iconUrl).slice(0, 4);
  return (
    <div className="grid size-16 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-card bg-slate-raised">
      {icons.length ? icons.map((i) => <img key={i.projectId} src={i.iconUrl!} alt="" className="size-full object-cover" />) : <Package className="col-span-2 row-span-2 m-auto size-7 text-muted" />}
    </div>
  );
}

function PackCard({ pack, index, onApply, onEdit, onDelete, onDuplicate }: { pack: WorldPack; index: number; onApply: () => void; onEdit: () => void; onDelete: () => void; onDuplicate: () => void }) {
  const counts = (Object.keys(CAT_META) as PackCategory[]).map((c) => [c, pack.items.filter((i) => i.category === c).length] as const).filter(([, n]) => n > 0);
  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="glass lift group flex flex-col rounded-panel p-4">
      <div className="flex items-start gap-3">
        <Mosaic items={pack.items} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-bold">{pack.name}</h3>
          <p className="line-clamp-2 text-[13px] text-muted">{pack.description || tr("{n} items", { n: pack.items.length })}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {counts.map(([c, n]) => {
          const M = CAT_META[c];
          return <Badge key={c}><M.icon className="size-3" /> {n} {M.label.toLowerCase()}</Badge>;
        })}
        {pack.shaderConfig && <Badge tone="accent"><Wand2 className="size-3" /> {tr("Shader settings")}</Badge>}
      </div>
      <div className="mt-auto flex items-center gap-1 pt-4">
        <Button variant="primary" size="sm" icon={Plus} onClick={onApply}>{tr("Add to instance")}</Button>
        <span className="ml-auto flex gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
          <IconButton icon={Pencil} label={tr("Edit")} onClick={onEdit} />
          <IconButton icon={Copy} label={tr("Duplicate")} onClick={onDuplicate} />
          <IconButton icon={Trash2} label={tr("Delete")} onClick={onDelete} />
        </span>
      </div>
    </motion.li>
  );
}

// ---------------------------------------------------------------- editor

function PackEditor({ pack, onClose, onSave }: { pack: WorldPack | null; onClose: () => void; onSave: (p: WorldPack) => Promise<void> }) {
  const [draft, setDraft] = useState<WorldPack | null>(pack);
  const [cat, setCat] = useState<PackCategory>("mods");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(pack), [pack]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);
  const results = useDiscover("modrinth", cat, { query: debounced || undefined, sort: debounced ? "relevance" : "downloads", page: 0 });
  const chosen = useMemo(() => new Set(draft?.items.map((i) => i.projectId)), [draft]);
  if (!draft) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  const toggle = (h: { id: string; slug: string; title: string; iconUrl?: string }) =>
    setDraft((d) =>
      d && (chosen.has(h.id)
        ? { ...d, items: d.items.filter((i) => i.projectId !== h.id) }
        : { ...d, items: [...d.items, { projectId: h.id, slug: h.slug, title: h.title, iconUrl: h.iconUrl, category: cat }] }),
    );

  return (
    <Modal
      open={!!pack}
      onClose={onClose}
      title={pack && pack.name ? tr("Edit “{name}”", { name: pack.name }) : tr("New world pack")}
      width="w-[920px]"
      footer={<>
        <Button onClick={onClose}>{tr("Cancel")}</Button>
        <Button variant="primary" icon={Check} loading={saving} disabled={!draft.name.trim() || !draft.items.length} onClick={async () => { setSaving(true); try { await onSave({ ...draft, name: draft.name.trim() }); } finally { setSaving(false); } }}>{tr("Save pack")}</Button>
      </>}
    >
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label={tr("Name")}><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={tr("Cozy survival")} className={inputClass} autoFocus /></Field>
            <Field label={tr("Description")}><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={tr("What it's for")} className={inputClass} /></Field>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Segmented<PackCategory> value={cat} onChange={setCat} options={(Object.keys(CAT_META) as PackCategory[]).map((c) => ({ id: c, label: CAT_META[c].label, icon: CAT_META[c].icon }))} />
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Search {n0} on Modrinth", { n0: CAT_META[cat].label.toLowerCase() })} className={`${inputClass} pl-9`} />
          </div>
          <div className="flex max-h-[380px] flex-col gap-1.5 overflow-y-auto pr-1">
            {results.isLoading ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-14" />) : (results.data?.hits ?? []).map((h) => {
              const on = chosen.has(h.id);
              return (
                <button key={h.id} type="button" onClick={() => toggle(h)} className={`flex items-center gap-3 rounded-card p-2 text-left transition-colors ${on ? "bg-copper/12 ring-1 ring-copper/40" : "bg-slate-raised/50 hover:bg-slate-raised"}`}>
                  {h.iconUrl ? <img src={h.iconUrl} alt="" loading="lazy" className="size-10 rounded-card object-cover" /> : <div className="size-10 rounded-card bg-slate-line" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{h.title}</span>
                    <span className="block truncate text-[12px] text-muted">{h.description}</span>
                  </span>
                  <span className="text-[12px] tabular-nums text-muted">{compact(h.downloads)}</span>
                  <span className={`grid size-7 place-items-center rounded-full ${on ? "bg-copper text-on-accent" : "bg-slate-line text-muted"}`}>{on ? <Check className="size-4" /> : <Plus className="size-4" />}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex min-h-0 flex-col rounded-panel bg-slate-raised/40 p-3">
          <p className="mb-2 text-[13px] font-medium text-muted">{tr("In this pack ({length})", { length: draft.items.length })}</p>
          <div className="flex max-h-[470px] flex-col gap-3 overflow-y-auto">
            {(Object.keys(CAT_META) as PackCategory[]).map((c) => {
              const list = draft.items.filter((i) => i.category === c);
              if (!list.length) return null;
              const M = CAT_META[c];
              return (
                <div key={c}>
                  <p className="mb-1 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-muted"><M.icon className="size-3.5" /> {M.label}</p>
                  <AnimatePresence initial={false}>
                    {list.map((i) => (
                      <motion.div key={i.projectId} layout initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 py-1">
                        {i.iconUrl ? <img src={i.iconUrl} alt="" className="size-6 rounded" /> : <div className="size-6 rounded bg-slate-line" />}
                        <span className="min-w-0 flex-1 truncate text-[13px]">{i.title}</span>
                        <button type="button" aria-label={tr("Remove {title}", { title: i.title })} onClick={() => setDraft({ ...draft, items: draft.items.filter((x) => x.projectId !== i.projectId) })} className="rounded p-1 text-muted hover:bg-slate-line hover:text-text"><X className="size-3.5" /></button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              );
            })}
            {!draft.items.length && <p className="py-6 text-center text-[13px] text-muted">{tr("Pick things on the left. Fabric API, Cloth Config and Mod Menu are added to Fabric instances automatically.")}</p>}
          </div>
          {draft.shaderConfig && (
            <div className="mt-3 flex items-center gap-2 rounded-card bg-copper/10 p-2 text-[12px]">
              <Wand2 className="size-4 shrink-0 text-copper" />
              <span className="flex-1">{tr("Includes your shader settings; they're applied with the shader.")}</span>
              <button type="button" className="text-muted hover:text-text" onClick={() => setDraft({ ...draft, shaderConfig: null })}>{tr("Remove")}</button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- apply

function ApplyDialog({ pack, onClose }: { pack: WorldPack | null; onClose: () => void }) {
  const { instances, toast, dismiss } = useApp();
  const qc = useQueryClient();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setTarget((t) => t || instances[0]?.id || ""), [instances]);
  const inst = instances.find((i) => i.id === target);

  const go = async () => {
    if (!pack || !inst) return;
    setBusy(tr("Starting…"));
    const t = toast({ title: tr("Adding “{name}” to {name2}", { name: pack.name, name2: inst.name }), tone: "progress" });
    try {
      const r = await applyWorldPack(pack, inst, (d, n) => setBusy(tr("Finding builds for {gameVersion}… {d}/{n}", { gameVersion: inst.gameVersion, d, n })));
      qc.invalidateQueries({ queryKey: ["content", inst.id] });
      toast({ title: tr("“{name}” added to {name2}", { name: pack.name, name2: inst.name }), body: summarise(r), tone: r.added.length || r.alreadyThere.length ? "success" : "error" });
      onClose();
    } catch (e) {
      toast({ title: tr("Couldn't apply the pack"), body: e instanceof Error ? e.message : String(e), tone: "error" });
    } finally {
      dismiss(t);
      setBusy(null);
    }
  };

  return (
    <Modal open={!!pack} onClose={onClose} title={tr("Add “{n0}” to an instance", { n0: pack?.name ?? "" })} footer={<><Button onClick={onClose}>{tr("Cancel")}</Button><Button variant="primary" className="shine" icon={busy ? Loader2 : Plus} loading={!!busy} disabled={!inst} onClick={go}>{tr("Add pack")}</Button></>}>
      {instances.length ? (
        <div className="flex flex-col gap-3">
          <Field label={tr("Instance")}>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={selectClass}>
              {instances.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.gameVersion}, {i.loader})</option>)}
            </select>
          </Field>
          <p className="text-[13px] text-muted">
            {tr("Everything is matched to")} {inst ? tr("Minecraft {gameVersion}{n1}", { gameVersion: inst.gameVersion, n1: inst.loader !== "vanilla" ? tr(" on {loader}", { loader: inst.loader }) : "" }) : tr("the instance's version")}{tr(". Things it already has are skipped, and anything without a build for this version is listed afterwards. Resource packs and the shader are switched on the next time you play.")}
          </p>
          {inst?.loader === "vanilla" && pack?.items.some((i) => i.category === "mods" || i.category === "shaders") && <p className="rounded-card bg-gold/10 px-3 py-2 text-[13px]">{tr("This instance is vanilla, so the pack's mods and shaders will be skipped.")}</p>}
          {busy && <p className="text-[13px] text-copper">{busy}</p>}
        </div>
      ) : <p className="text-muted">{tr("Create an instance first.")}</p>}
    </Modal>
  );
}

function CaptureDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (inst: Instance, name: string) => void }) {
  const { instances } = useApp();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  useEffect(() => setId((x) => x || instances[0]?.id || ""), [instances]);
  const inst = instances.find((i) => i.id === id);
  return (
    <Modal open={open} onClose={onClose} title={tr("Make a pack from an instance")} footer={<><Button onClick={onClose}>{tr("Cancel")}</Button><Button variant="primary" icon={Copy} disabled={!inst} onClick={() => inst && onPick(inst, name)}>{tr("Continue")}</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label={tr("Instance")}>
          <select value={id} onChange={(e) => setId(e.target.value)} className={selectClass}>
            {instances.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.gameVersion})</option>)}
          </select>
        </Field>
        <Field label={tr("Pack name")}><input value={name} onChange={(e) => setName(e.target.value)} placeholder={inst ? tr("{name} pack", { name: inst.name }) : ""} className={inputClass} /></Field>
        <p className="text-[13px] text-muted">{tr("Copies its mods, resource packs, data packs and shader, plus your current shader settings. You can tweak it before saving.")}</p>
      </div>
    </Modal>
  );
}
