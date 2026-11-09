import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Loader2, Search, X } from "lucide-react";
import type { ContentCategory, ContentHit } from "@ember/content-engine";
import type { Instance } from "../lib/ipc";
import { installProject } from "../lib/install";
import { compact } from "../lib/format";
import { isInstalled, useDiscover, useInstalled } from "../lib/queries";
import { useApp } from "../state";
import { IconButton, Skeleton, inputClass } from "./ui";

/**
 * Search-and-add right inside an instance: results are already filtered to its game
 * version and loader, things it already has show "Installed", one click adds the rest
 * (with dependencies).
 */
export function AddContentPanel({ inst, category, onClose }: { inst: Instance; category: ContentCategory; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);
  const results = useDiscover("modrinth", category, {
    query: debounced || undefined,
    gameVersion: inst.gameVersion,
    loader: category === "mods" && inst.loader !== "vanilla" ? inst.loader : undefined,
    sort: debounced ? "relevance" : "downloads",
    page: 0,
  });
  const installed = useInstalled(inst.id).data;
  const noun = category === "mods" ? "mods" : category === "shaders" ? "shaders" : "resource packs";

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="mb-4 overflow-hidden">
      <div className="glass rounded-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()} placeholder={`Search ${noun} for ${inst.gameVersion}${category === "mods" ? ` (${inst.loader})` : ""}`} className={`${inputClass} pl-9`} />
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
          {results.isLoading
            ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-16" />)
            : (results.data?.hits ?? []).map((h) => <Row key={h.id} hit={h} inst={inst} category={category} installed={isInstalled(installed, h)} />)}
          {results.data && results.data.hits.length === 0 && <p className="col-span-full py-6 text-center text-[14px] text-muted">Nothing for {inst.gameVersion} matches “{debounced}”.</p>}
        </div>
      </div>
    </motion.div>
  );
}

function Row({ hit, inst, category, installed }: { hit: ContentHit; inst: Instance; category: ContentCategory; installed: boolean }) {
  const { openProject, toast } = useApp();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const done = installed || justAdded;

  const add = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const summary = await installProject(category, hit, { instance: inst });
      setJustAdded(true);
      toast({ title: `${hit.title} added`, body: summary, tone: "success" });
      qc.invalidateQueries({ queryKey: ["content", inst.id] });
    } catch (err) {
      toast({ title: `Couldn't add ${hit.title}`, body: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openProject({ ...hit, category, instanceId: inst.id })}
      onKeyDown={(e) => e.key === "Enter" && openProject({ ...hit, category, instanceId: inst.id })}
      className="flex cursor-pointer items-center gap-3 rounded-card bg-slate-raised/50 p-2.5 transition-colors hover:bg-slate-raised"
    >
      {hit.iconUrl ? <img src={hit.iconUrl} alt="" loading="lazy" className="size-11 shrink-0 rounded-card object-cover" /> : <div className="size-11 shrink-0 rounded-card bg-slate-line" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{hit.title}</p>
        <p className="truncate text-[12px] text-muted">{hit.description}</p>
      </div>
      <span className="hidden shrink-0 text-[12px] tabular-nums text-muted sm:block">{compact(hit.downloads)}</span>
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.span key="done" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex shrink-0 items-center gap-1 rounded-chip bg-copper/15 px-2.5 py-1.5 text-[12px] font-medium text-copper">
            <Check className="size-3.5" /> Installed
          </motion.span>
        ) : (
          <motion.button key="add" type="button" onClick={add} disabled={busy} className="press press-accent flex shrink-0 items-center gap-1 rounded-chip bg-copper px-2.5 py-1.5 text-[12px] font-medium text-on-accent">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Add
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
