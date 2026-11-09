import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, ExternalLink, Heart } from "lucide-react";
import { mrToResolved, pickBestVersion, type ContentHit, type ContentSource } from "@ember/content-engine";
import { categoryById } from "../lib/categories";
import { curseforge, modrinth } from "../lib/clients";
import { compact, ago } from "../lib/format";
import { api, inTauri, type Instance } from "../lib/ipc";
import { useApp } from "../state";

type Sort = "relevance" | "downloads" | "follows" | "updated";

export function Discover() {
  const { category: catParam } = useParams();
  const [params] = useSearchParams();
  const cat = categoryById(catParam);
  const { instances } = useApp();

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [source, setSource] = useState<ContentSource>("modrinth");
  const [target, setTarget] = useState<string>("");
  const [sort, setSort] = useState<Sort>(cat.id === "modpacks" ? "follows" : "downloads");
  const [hits, setHits] = useState<ContentHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  const instance: Instance | undefined = instances.find((i) => i.id === target) ?? instances[0];
  const clientSide = cat.id !== "plugins" && cat.id !== "modpacks";

  useEffect(() => setQuery(params.get("q") ?? ""), [params]);
  useEffect(() => setSort(cat.id === "modpacks" ? "follows" : "downloads"), [cat.id]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const opts = {
        query: query || undefined,
        gameVersion: clientSide ? instance?.gameVersion : undefined,
        loader: cat.id === "mods" && instance && instance.loader !== "vanilla" ? instance.loader : undefined,
        sort: (sort === "follows" && source === "curseforge" ? "downloads" : sort) as "relevance" | "downloads" | "updated",
        limit: 24,
      };
      try {
        const res = source === "curseforge" && curseforge ? await curseforge.search(cat.id, opts) : await modrinth.discover(cat.id, { ...opts, sort });
        if (!cancelled) {
          setHits(res.hits);
          setTotal(res.total);
        }
      } catch (e) {
        if (cancelled) return;
        if (!inTauri) {
          setHits(DEMO_HITS);
          setTotal(DEMO_HITS.length);
        } else setError(`Couldn't load ${cat.label.toLowerCase()}: ${e}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cat.id, query, source, sort, instance?.id, clientSide]);

  const install = async (hit: ContentHit) => {
    if (!instance) return;
    setStatus((s) => ({ ...s, [hit.id]: "Finding a build" }));
    try {
      const loaders = cat.id === "mods" ? (instance.loader === "quilt" ? ["quilt", "fabric"] : [instance.loader]) : undefined;
      const best = pickBestVersion(await modrinth.projectVersions(hit.id, loaders, [instance.gameVersion]));
      if (!best) {
        setStatus((s) => ({ ...s, [hit.id]: `No build for ${instance.gameVersion}` }));
        return;
      }
      const file = mrToResolved(best, hit.title, hit.slug);
      setStatus((s) => ({ ...s, [hit.id]: "Installing" }));
      await api.installFiles(instance.id, [file], cat.dir);
      setStatus((s) => ({ ...s, [hit.id]: "Installed" }));
    } catch (e) {
      setStatus((s) => ({ ...s, [hit.id]: `Failed: ${e}` }));
    }
  };

  const sorts: Sort[] = useMemo(() => (query ? ["relevance", "downloads", "follows", "updated"] : ["downloads", "follows", "updated"]), [query]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6">
        <h1 className="text-[28px] font-bold tracking-tight">{cat.label}</h1>
        <p className="mt-1 max-w-[70ch] text-muted">{cat.blurb}</p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${cat.label.toLowerCase()}`}
          aria-label={`Search ${cat.label}`}
          className="min-w-64 flex-1 rounded-chip bg-slate-surface px-3 py-2 text-[14px] placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-copper"
        />
        {clientSide && instances.length > 0 && (
          <select aria-label="Install into" value={instance?.id} onChange={(e) => setTarget(e.target.value)} className="rounded-chip bg-slate-surface px-3 py-2 text-[14px]">
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                For {i.name} ({i.gameVersion})
              </option>
            ))}
          </select>
        )}
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-chip bg-slate-surface px-3 py-2 text-[14px]">
          {sorts.map((s) => (
            <option key={s} value={s}>
              {{ relevance: "Best match", downloads: "Most downloaded", follows: "Most followed", updated: "Recently updated" }[s]}
            </option>
          ))}
        </select>
        <div className="flex rounded-chip bg-slate-surface p-0.5" role="group" aria-label="Source">
          {(["modrinth", "curseforge"] as ContentSource[]).map((s) => (
            <button key={s} type="button" aria-pressed={source === s} disabled={s === "curseforge" && !curseforge} onClick={() => setSource(s)} className={`rounded-[5px] px-3 py-1.5 text-[13px] disabled:opacity-40 ${source === s ? "bg-slate-raised text-text" : "text-muted"}`}>
              {s === "modrinth" ? "Modrinth" : "CurseForge"}
            </button>
          ))}
        </div>
      </div>

      {cat.id === "plugins" && <p className="mb-4 rounded-card bg-slate-surface px-4 py-3 text-[14px] text-muted">Plugins run on a server (Paper, Purpur, Velocity), not in your game, so they open on the project page for download.</p>}
      {error && <p className="mb-4 text-redstone">{error}</p>}
      <p className="mb-3 text-[13px] text-muted" aria-live="polite">{loading ? "Loading" : `${compact(total)} results${clientSide && instance ? ` that work with ${instance.gameVersion}` : ""}`}</p>

      <ul className="divide-y divide-slate-line overflow-hidden rounded-panel border border-slate-line bg-slate-surface">
        {hits.map((h, idx) => (
          <li key={h.id} className="flex items-start gap-4 px-5 py-4">
            {cat.id === "modpacks" && sort === "follows" && !query && <span className="w-6 pt-3 text-right text-[14px] tabular-nums text-muted">{idx + 1}</span>}
            {h.iconUrl ? <img src={h.iconUrl} alt="" className="size-12 shrink-0 rounded-card bg-slate-raised object-cover" /> : <div className="size-12 shrink-0 rounded-card bg-slate-raised" aria-hidden />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="text-[16px] font-medium">{h.title}</h3>
                <span className="text-[13px] text-muted">by {h.author}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 max-w-[75ch] text-[14px] text-muted">{h.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                <span className="flex items-center gap-1"><Download className="size-3.5" aria-hidden /> {compact(h.downloads)}</span>
                <span className="flex items-center gap-1"><Heart className="size-3.5" aria-hidden /> {compact(h.follows)}</span>
                <span>Updated {ago(h.updatedAt).toLowerCase()}</span>
                {h.categories.slice(0, 3).map((c) => (
                  <span key={c} className="rounded-chip bg-slate-raised px-2 py-0.5">{c}</span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {clientSide && source === "modrinth" && instance ? (
                <button type="button" onClick={() => install(h)} disabled={status[h.id] === "Installed" || status[h.id] === "Installing"} className="rounded-card bg-copper px-4 py-2 text-[14px] font-medium text-ink-950 disabled:bg-slate-raised disabled:text-muted">
                  {status[h.id] === "Installed" ? "Installed" : "Install"}
                </button>
              ) : (
                <button type="button" onClick={() => (inTauri ? openUrl(h.pageUrl) : window.open(h.pageUrl))} className="flex items-center gap-1.5 rounded-card bg-slate-raised px-4 py-2 text-[14px]">
                  <ExternalLink className="size-4" aria-hidden /> Open page
                </button>
              )}
              {status[h.id] && status[h.id] !== "Installed" && <span className="max-w-48 text-right text-[12px] text-muted">{status[h.id]}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DEMO_HITS: ContentHit[] = [
  ["Sodium", "jellysquid3", "The fastest and most compatible rendering optimization mod for Minecraft.", 98e6, 31e3, ["optimization"]],
  ["Iris Shaders", "coderbot", "A modern shader pack loader for Minecraft intended to be compatible with existing OptiFine shader packs.", 71e6, 22e3, ["decoration", "optimization"]],
  ["Lithium", "jellysquid3", "No-compromises game logic optimization mod.", 54e6, 15e3, ["optimization"]],
  ["Zoomify", "isXander", "A zoom mod with infinite customizability.", 12e6, 4e3, ["utility"]],
  ["Xaero's Minimap", "xaero96", "Displays your position, nearby terrain, players, mobs, items and waypoints.", 40e6, 9e3, ["adventure", "utility"]],
].map(([title, author, description, downloads, follows, categories], i) => ({
  source: "modrinth", id: `demo${i}`, slug: String(title).toLowerCase(), title: String(title), author: String(author), description: String(description),
  downloads: Number(downloads), follows: Number(follows), categories: categories as string[], gameVersions: ["26.2"],
  updatedAt: new Date(Date.now() - (i + 2) * 864e5).toISOString(), pageUrl: "https://modrinth.com",
}));
