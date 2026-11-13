import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRightLeft, Box, Compass, CornerDownLeft, Heart, Home, Moon, Package, Palette, Play, Plus, Search, Server, Settings, Sparkles, Sun, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { modrinth } from "../lib/clients";
import { useApp } from "../state";
import { CATEGORIES } from "../lib/categories";
import { compact } from "../lib/format";

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  image?: string;
  run: () => void;
}

/** Fuzzy-ish match: every query word must appear somewhere in the label/hint. */
const matches = (q: string, text: string) => q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.toLowerCase().includes(w));

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, instances, play, setNewInstanceOpen, openProject, appearance, setAppearance } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQ("");
      setActive(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [paletteOpen]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  const remote = useQuery({
    queryKey: ["palette", debounced],
    queryFn: () => modrinth.search({ query: debounced, facets: [["project_type:mod", "project_type:modpack", "project_type:shader", "project_type:resourcepack"]], limit: 8 }),
    enabled: paletteOpen && debounced.length >= 2,
  });

  const close = () => setPaletteOpen(false);
  const go = (path: string) => () => {
    navigate(path);
    close();
  };

  const items = useMemo<Item[]>(() => {
    const local: Item[] = [
      ...instances.flatMap((i) => [
        { id: `play-${i.id}`, group: "Instances", label: `Play ${i.name}`, hint: `${i.gameVersion} · ${i.loader}`, icon: Play, run: () => { play(i); close(); } },
        { id: `open-${i.id}`, group: "Instances", label: `Open ${i.name}`, hint: "Mods, worlds, settings", icon: Box, run: go(`/instance/${i.id}`) },
      ]),
      { id: "home", group: "Go to", label: "Home", icon: Home, run: go("/") },
      ...CATEGORIES.map((c) => ({ id: `d-${c.id}`, group: "Go to", label: `Discover ${c.label.toLowerCase()}`, icon: c.icon, run: go(`/discover/${c.id}`) })),
      { id: "fav", group: "Go to", label: "Favorites", icon: Heart, run: go("/favorites") },
      { id: "servers", group: "Go to", label: "Servers", icon: Server, run: go("/servers") },
      { id: "transfer", group: "Go to", label: "Transfer mods to a new version", icon: ArrowRightLeft, run: go("/transfer") },
      { id: "new", group: "Actions", label: "New instance", icon: Plus, run: () => { setNewInstanceOpen(true); close(); } },
      { id: "new-server", group: "Actions", label: "New server (play with friends)", icon: Users, run: go("/servers?new=1") },
      { id: "theme", group: "Actions", label: appearance.theme === "calcite" ? "Switch to dark theme" : "Switch to light theme", icon: appearance.theme === "calcite" ? Moon : Sun, run: () => setAppearance({ theme: appearance.theme === "calcite" ? "deepslate" : "calcite" }) },
      { id: "s-appearance", group: "Settings", label: "Appearance: theme, accent, glass, animations", icon: Palette, run: go("/settings?tab=appearance") },
      { id: "s-profiles", group: "Settings", label: "Game profiles: keybinds, FOV, video", icon: Sparkles, run: go("/settings?tab=profiles") },
      { id: "s-account", group: "Settings", label: "Account: skins, capes, name, stats, switch account", icon: Settings, run: go("/account") },
      { id: "s-launcher", group: "Settings", label: "Launcher: memory, Java, behaviour", icon: Settings, run: go("/settings?tab=launcher") },
    ];
    const filtered = q.trim() ? local.filter((i) => matches(q, `${i.label} ${i.hint ?? ""}`)) : local.filter((i) => i.group !== "Settings").slice(0, 12);
    const web: Item[] = (remote.data?.hits ?? []).map((h) => ({
      id: `mr-${h.project_id}`,
      group: "On Modrinth",
      label: h.title,
      hint: `${h.project_type} · ${compact(h.downloads)} downloads`,
      image: h.icon_url ?? undefined,
      icon: h.project_type === "modpack" ? Package : Compass,
      run: () => {
        const category = h.project_type === "modpack" ? "modpacks" : h.project_type === "shader" ? "shaders" : h.project_type === "resourcepack" ? "resourcepacks" : "mods";
        openProject({ source: "modrinth", id: h.project_id, slug: h.slug, title: h.title, description: h.description, iconUrl: h.icon_url ?? undefined, author: h.author, downloads: h.downloads, follows: h.follows, category });
        close();
      },
    }));
    return [...filtered, ...web];
  }, [instances, q, remote.data, appearance.theme]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      items[active]?.run();
    } else if (e.key === "Escape") {
      close();
    }
  };

  let lastGroup = "";
  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div className="fixed inset-0 z-50 flex justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 450, damping: 34 }}
            className="glass glass-strong relative flex max-h-[64vh] w-[640px] max-w-full flex-col overflow-hidden rounded-panel"
            role="dialog"
            aria-label="Search"
            onKeyDown={onKey}
          >
            <div className="flex items-center gap-3 border-b border-slate-line/70 px-5 py-4">
              <Search className="size-5 text-copper" aria-hidden />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search instances, mods, modpacks, settings…" className="flex-1 bg-transparent text-[16px] text-text placeholder:text-muted focus:outline-none" aria-label="Search" role="combobox" aria-expanded aria-controls="palette-list" />
              {remote.isFetching && <span className="size-4 animate-spin rounded-full border-2 border-copper border-r-transparent" />}
            </div>
            <div ref={listRef} id="palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
              {items.length === 0 && <p className="px-3 py-8 text-center text-[14px] text-muted">{debounced.length >= 2 ? "Nothing found." : "Type to search."}</p>}
              {items.map((it, idx) => {
                const header = it.group !== lastGroup ? it.group : null;
                lastGroup = it.group;
                const Icon = it.icon;
                return (
                  <div key={it.id}>
                    {header && <p className="px-3 pb-1 pt-3 text-[12px] text-muted">{header}</p>}
                    <button
                      type="button"
                      role="option"
                      aria-selected={idx === active}
                      data-index={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={it.run}
                      className={`relative flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-left ${idx === active ? "text-text" : "text-muted"}`}
                    >
                      {idx === active && <motion.span layoutId="palette-active" className="absolute inset-0 rounded-card bg-slate-raised" transition={{ type: "spring", stiffness: 600, damping: 40 }} />}
                      {it.image ? <img src={it.image} alt="" className="relative size-7 rounded-chip object-cover" /> : Icon ? <Icon className="relative size-[18px] text-copper" /> : null}
                      <span className="relative min-w-0 flex-1">
                        <span className="block truncate text-[14px]">{it.label}</span>
                        {it.hint && <span className="block truncate text-[12px] text-muted">{it.hint}</span>}
                      </span>
                      {idx === active && <CornerDownLeft className="relative size-4 text-muted" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-slate-line/70 px-5 py-2.5 text-[12px] text-muted">
              <span>↑↓ to move</span>
              <span>Enter to open</span>
              <span>Esc to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
