import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Heart, LayoutGrid, List, Loader2, Search, Sparkles, Trophy } from "lucide-react";
import type { ContentCategory, ContentHit, ContentSource } from "@ember/content-engine";
import { CATEGORIES, categoryById } from "../lib/categories";
import { curseforge } from "../lib/clients";
import { ago, compact } from "../lib/format";
import { api } from "../lib/ipc";
import { compatibleInstances, installProject } from "../lib/install";
import { PAGE_SIZE, isInstalled, prefetchDiscover, prefetchProject, useDiscover, useFavorites, useInstalled, useServers, type DiscoverOpts, type InstalledSet } from "../lib/queries";
import { useApp } from "../state";
import { Empty, IconButton, Segmented, Skeleton, inputClass, selectClass } from "../components/ui";
import { click } from "../lib/sounds";

type Sort = DiscoverOpts["sort"];
const SORT_LABEL: Record<Sort, string> = { relevance: "Best match", downloads: "Most downloaded", follows: "Most loved", updated: "Recently updated" };

export function Discover() {
  const { category: catParam } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const cat = categoryById(catParam);
  const qc = useQueryClient();
  const { instances, appearance, setAppearance, openProject, toast } = useApp();

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(query);
  const [source, setSource] = useState<ContentSource>("modrinth");
  const [sort, setSort] = useState<Sort>(cat.id === "modpacks" ? "follows" : "downloads");
  const [pages, setPages] = useState(1);
  const targets = useMemo(() => compatibleInstances(cat.id, instances), [cat.id, instances]);
  const [targetId, setTargetId] = useState(params.get("instance") ?? "");
  const target = targets.find((i) => i.id === targetId) ?? targets[0];
  const forInstance = cat.id !== "plugins" && cat.id !== "modpacks";

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    setSort(cat.id === "modpacks" ? "follows" : "downloads");
    setPages(1);
  }, [cat.id]);
  useEffect(() => setPages(1), [debounced, sort, source, target?.id]);
  useEffect(() => {
    if (debounced) setSort("relevance");
  }, [debounced]);

  const optsFor = (category: ContentCategory, page: number): DiscoverOpts => ({
    query: category === cat.id ? debounced || undefined : undefined,
    gameVersion: category !== "plugins" && category !== "modpacks" ? target?.gameVersion : undefined,
    loader: category === "mods" && target && target.loader !== "vanilla" ? target.loader : undefined,
    sort: category === cat.id ? sort : category === "modpacks" ? "follows" : "downloads",
    page,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-2">
      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <h1 className="text-[30px] font-bold tracking-tight">Discover</h1>
        <p className="mt-1 text-muted">{cat.blurb}</p>
      </motion.header>

      {/* category tabs: hovering one prefetches its results, so switching is instant */}
      <div className="glass mb-4 flex flex-wrap gap-1 rounded-panel p-1.5" role="tablist">
        {CATEGORIES.map((c) => {
          const active = c.id === cat.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onMouseEnter={() => prefetchDiscover(qc, source, c.id, optsFor(c.id, 0))}
              onClick={() => {
                click();
                navigate(`/discover/${c.id}`);
              }}
              className={`press relative flex flex-1 items-center justify-center gap-2 rounded-card px-3 py-2.5 text-[14px] ${active ? "text-on-accent" : "text-muted hover:text-text"}`}
            >
              {active && <motion.span layoutId="discover-tab" className="absolute inset-0 rounded-card bg-copper" transition={{ type: "spring", stiffness: 450, damping: 36 }} />}
              <c.icon className="relative size-4" aria-hidden />
              <span className="relative whitespace-nowrap">{c.label}</span>
            </button>
          );
        })}
      </div>

      {/* filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setParams((p) => {
                p.set("q", e.target.value);
                return p;
              }, { replace: true });
            }}
            placeholder={`Search ${cat.label.toLowerCase()}`}
            aria-label={`Search ${cat.label}`}
            className={`${inputClass} pl-9`}
          />
        </div>
        {forInstance && targets.length > 0 && (
          <select aria-label="Show results that work with" value={target?.id} onChange={(e) => setTargetId(e.target.value)} className={selectClass}>
            {targets.map((i) => <option key={i.id} value={i.id}>For {i.name} ({i.gameVersion})</option>)}
          </select>
        )}
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={selectClass}>
          {(debounced ? (["relevance", "downloads", "follows", "updated"] as Sort[]) : (["downloads", "follows", "updated"] as Sort[])).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
        </select>
        {curseforge && <Segmented<ContentSource> value={source} onChange={setSource} options={[{ id: "modrinth", label: "Modrinth" }, { id: "curseforge", label: "CurseForge" }]} />}
        <IconButton icon={appearance.discoverLayout === "grid" ? List : LayoutGrid} label={appearance.discoverLayout === "grid" ? "List view" : "Grid view"} onClick={() => setAppearance({ discoverLayout: appearance.discoverLayout === "grid" ? "list" : "grid" })} />
      </div>

      {forInstance && target && params.get("instance") === target.id && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-center gap-3 rounded-panel border border-copper/30 bg-copper/10 px-4 py-3 text-[14px]">
          <Download className="size-4 text-copper" />
          <span className="flex-1">Adding to <b>{target.name}</b> ({target.gameVersion}{target.loader !== "vanilla" ? `, ${target.loader}` : ""}). Only things that work with it are shown; ones it already has are marked <b>Installed</b>.</span>
          <button type="button" className="press rounded-chip px-3 py-1 text-[13px] text-muted hover:text-text" onClick={() => navigate(`/instance/${target.id}`)}>Back to instance</button>
        </motion.div>
      )}
      {cat.id === "modpacks" && !debounced && sort === "follows" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-center gap-3 rounded-panel border border-gold/30 bg-gold/8 px-4 py-3 text-[14px]">
          <Trophy className="size-5 text-gold" /> The best-loved modpacks on Modrinth, ranked by how many players follow them. Install creates a ready-to-play instance.
        </motion.div>
      )}
      {cat.id === "shaders" && <Hint>Installing a shader also adds <b>Iris</b> to the instance when it's missing, so it just works.</Hint>}
      {cat.id === "plugins" && <Hint>Plugins run on a <b>Paper server</b>. Install them straight onto one of your servers from the Servers page.</Hint>}

      <Results
        key={`${cat.id}-${source}`}
        category={cat.id}
        source={source}
        pages={pages}
        optsFor={(p) => optsFor(cat.id, p)}
        onMore={() => setPages((p) => p + 1)}
        target={target}
        onOpen={(h) => openProject({ ...h, category: cat.id, instanceId: forInstance ? target?.id : undefined })}
        toast={toast}
      />
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 rounded-panel bg-slate-raised/60 px-4 py-3 text-[14px] text-muted"><Sparkles className="mr-1.5 inline size-4 text-copper" />{children}</p>;
}

function Results({ category, source, pages, optsFor, onMore, target, onOpen, toast }: {
  category: ContentCategory;
  source: ContentSource;
  pages: number;
  optsFor: (page: number) => DiscoverOpts;
  onMore: () => void;
  target?: ReturnType<typeof compatibleInstances>[number];
  onOpen: (h: ContentHit) => void;
  toast: ReturnType<typeof useApp>["toast"];
}) {
  const { appearance } = useApp();
  const pageQueries = Array.from({ length: pages }, (_, p) => p);
  const sentinel = useRef<HTMLDivElement>(null);
  const first = useDiscover(source, category, optsFor(0));
  const installed = useInstalled(category !== "plugins" && category !== "modpacks" && category !== "datapacks" ? target?.id : undefined).data;
  const total = first.data?.total ?? 0;
  const hasMore = pages * PAGE_SIZE < total;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && onMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onMore, pages]);

  if (first.isError) return <Empty icon={Search} title="Couldn't reach Modrinth">Check your connection and try again.</Empty>;

  return (
    <>
      <p className="mb-3 text-[13px] text-muted" aria-live="polite">
        {first.isLoading ? "Loading…" : `${compact(total)} results${target && category !== "plugins" && category !== "modpacks" ? ` for ${target.gameVersion}` : ""}`}
        {first.isFetching && !first.isLoading && <Loader2 className="ml-2 inline size-3.5 animate-spin" />}
      </p>
      <div className={appearance.discoverLayout === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3" : "flex flex-col gap-2"}>
        {first.isLoading
          ? [...Array(9)].map((_, i) => <Skeleton key={i} className={appearance.discoverLayout === "grid" ? "h-[184px]" : "h-20"} />)
          : pageQueries.map((p) => <ResultPage key={p} page={p} category={category} source={source} opts={optsFor(p)} target={target} installed={installed} onOpen={onOpen} toast={toast} />)}
      </div>
      {hasMore && <div ref={sentinel} className="flex justify-center py-6 text-muted"><Loader2 className="size-5 animate-spin" /></div>}
    </>
  );
}

function ResultPage({ page, category, source, opts, target, installed, onOpen, toast }: { page: number; category: ContentCategory; source: ContentSource; opts: DiscoverOpts; target?: ReturnType<typeof compatibleInstances>[number]; installed?: InstalledSet; onOpen: (h: ContentHit) => void; toast: ReturnType<typeof useApp>["toast"] }) {
  const q = useDiscover(source, category, opts);
  if (!q.data) return null;
  return (
    <>
      {q.data.hits.map((h, i) => <ProjectCard key={`${page}-${h.id}`} hit={h} index={i} category={category} target={target} installed={isInstalled(installed, h)} onOpen={onOpen} toast={toast} />)}
    </>
  );
}

export function ProjectCard({ hit, index, category, target, installed, onOpen, toast }: { hit: ContentHit; index: number; category: ContentCategory; target?: ReturnType<typeof compatibleInstances>[number]; installed?: boolean; onOpen: (h: ContentHit) => void; toast: ReturnType<typeof useApp>["toast"] }) {
  const qc = useQueryClient();
  const { appearance, refresh, dismiss } = useApp();
  const favs = useFavorites();
  const servers = useServers();
  const [busyState, setState] = useState<"idle" | "busy" | "done">("idle");
  const state = installed && busyState === "idle" ? "done" : busyState;
  const isFav = (favs.data ?? []).some((f) => f.id === hit.id);
  const grid = appearance.discoverLayout === "grid";
  const paper = (servers.data ?? []).filter((s) => s.kind === "paper");

  const quickInstall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hit.source !== "modrinth") return onOpen(hit);
    if (category === "datapacks" || (category === "plugins" && paper.length !== 1) || (category !== "modpacks" && category !== "plugins" && !target)) return onOpen(hit);
    setState("busy");
    const t = toast({ title: `Installing ${hit.title}`, tone: "progress" });
    try {
      const summary = await installProject(category, hit, { instance: target, server: paper[0] });
      setState("done");
      if (category === "modpacks") refresh();
      qc.invalidateQueries({ queryKey: ["content"] });
      toast({ title: `${hit.title} installed`, body: summary, tone: "success", action: { label: "What does it do?", run: () => onOpen(hit) } });
    } catch (err) {
      setState("idle");
      toast({ title: `Couldn't install ${hit.title}`, body: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      dismiss(t);
    }
  };

  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    click();
    const list = await api.toggleFavorite({ source: hit.source, id: hit.id, slug: hit.slug, title: hit.title, iconUrl: hit.iconUrl, category, description: hit.description });
    qc.setQueryData(["favorites"], list);
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.025, type: "spring", stiffness: 320, damping: 30 }}
      onMouseEnter={() => hit.source === "modrinth" && prefetchProject(qc, hit.id)}
      onClick={() => onOpen(hit)}
      className={`glass lift group relative cursor-pointer overflow-hidden rounded-panel ${grid ? "flex flex-col p-4" : "flex items-center gap-4 p-3"}`}
    >
      <motion.div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-copper/0 blur-2xl transition-colors duration-500 group-hover:bg-copper/25" />
      <div className={`flex ${grid ? "items-start gap-3" : "min-w-0 flex-1 items-center gap-4"}`}>
        {hit.iconUrl ? <motion.img layoutId={`icon-${hit.id}`} src={hit.iconUrl} alt="" loading="lazy" className="size-14 shrink-0 rounded-card bg-slate-raised object-cover transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-2" /> : <div className="size-14 shrink-0 rounded-card bg-slate-raised" />}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold">{hit.title}</h3>
          <p className="truncate text-[12px] text-muted">by {hit.author}</p>
          {!grid && <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{hit.description}</p>}
        </div>
      </div>
      {grid && <p className="relative mt-3 line-clamp-2 min-h-[40px] text-[13px] text-muted">{hit.description}</p>}
      <div className={`relative flex items-center gap-3 text-[12px] text-muted ${grid ? "mt-3" : ""}`}>
        <span className="flex items-center gap-1"><Download className="size-3.5" /> {compact(hit.downloads)}</span>
        {grid && <span className="flex items-center gap-1"><Heart className="size-3.5" /> {compact(hit.follows)}</span>}
        {!grid && <span className="truncate">Updated {ago(hit.updatedAt)}</span>}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={toggleFav} aria-label={isFav ? "Remove from favorites" : "Add to favorites"} className="press grid size-8 place-items-center rounded-chip hover:bg-slate-raised">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={String(isFav)} initial={{ scale: 0.4, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.4 }} transition={{ type: "spring", stiffness: 600, damping: 18 }}>
                <Heart className={`size-4 ${isFav ? "text-redstone" : ""}`} fill={isFav ? "currentColor" : "none"} />
              </motion.span>
            </AnimatePresence>
          </button>
          <button type="button" onClick={quickInstall} disabled={state !== "idle"} title={installed && target ? `Already in ${target.name}` : undefined} className={`press press-accent flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip px-3 py-1.5 text-[13px] font-medium ${state === "done" ? "bg-copper/15 text-copper" : "bg-copper text-on-accent"}`}>
            {state === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : state === "done" ? <Check className="size-3.5" /> : <Download className="size-3.5" />}
            {state === "done" ? "Installed" : "Install"}
          </button>
        </span>
      </div>
    </motion.article>
  );
}
