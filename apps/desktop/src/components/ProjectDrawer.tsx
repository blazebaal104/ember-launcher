import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Download, ExternalLink, GalleryHorizontal, Heart, History, Monitor, Server as ServerIcon, X } from "lucide-react";
import type { ContentCategory } from "@ember/content-engine";
import { useApp, type ProjectRef } from "../state";
import { isInstalled, useFavorites, useInstalled, useProject, useProjectVersions, useServers } from "../lib/queries";
import { renderMarkdown } from "../lib/markdown";
import { compatibleInstances, installProject } from "../lib/install";
import { api, inTauri, type World } from "../lib/ipc";
import { open } from "../lib/links";
import { compact, ago } from "../lib/format";
import { Badge, Button, IconButton, Skeleton, Tabs, inputClass } from "./ui";
import { useQueryClient } from "@tanstack/react-query";
import { tr } from "../lib/i18n";

type Tab = "about" | "gallery" | "versions";

export function ProjectDrawer() {
  const { project, openProject } = useApp();
  return (
    <AnimatePresence>
      {project && (
        <motion.div className="fixed inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => openProject(null)} />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="glass glass-strong absolute bottom-3 right-3 top-3 flex w-[min(720px,92vw)] flex-col overflow-hidden rounded-panel"
            role="dialog"
            aria-label={project.title}
          >
            {/* The project is passed as a prop so the closing animation still has it after it's cleared. */}
            <DrawerBody key={project.id} project={project} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({ project: ref }: { project: ProjectRef }) {
  const { openProject, instances, toast, dismiss, refresh } = useApp();
  const qc = useQueryClient();
  const category = (ref.category ?? "mods") as ContentCategory;
  const isModrinth = ref.source === "modrinth";
  const projectQ = useProject(isModrinth ? ref.id : undefined);
  const versionsQ = useProjectVersions(isModrinth ? ref.id : undefined);
  const favs = useFavorites();
  const servers = useServers();
  const [tab, setTab] = useState<Tab>("about");
  const [busy, setBusy] = useState(false);
  const p = projectQ.data;

  const targets = useMemo(() => compatibleInstances(category, instances), [category, instances]);
  const [instanceId, setInstanceId] = useState(() => (ref.instanceId && targets.some((t) => t.id === ref.instanceId) ? ref.instanceId : targets[0]?.id ?? ""));
  const instance = targets.find((i) => i.id === instanceId);
  const pluginServers = (servers.data ?? []).filter((s) => s.kind === "paper");
  const installedSet = useInstalled(category === "mods" || category === "resourcepacks" || category === "shaders" ? instance?.id : undefined).data;
  const alreadyIn = !!instance && isInstalled(installedSet, ref);
  const [serverId, setServerId] = useState("");
  useEffect(() => setServerId((cur) => cur || pluginServers[0]?.id || ""), [pluginServers]);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [world, setWorld] = useState("");
  useEffect(() => {
    if (category !== "datapacks" || !instance) return;
    api.listWorlds(instance.id).then((w) => {
      setWorlds(w);
      setWorld(w[0]?.folder ?? "");
    });
  }, [category, instance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openProject(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openProject]);

  const isFav = (favs.data ?? []).some((f) => f.id === ref.id);
  const toggleFav = async () => {
    const list = await api.toggleFavorite({ source: ref.source, id: ref.id, slug: ref.slug, title: ref.title, iconUrl: ref.iconUrl, category, description: ref.description });
    qc.setQueryData(["favorites"], list);
    toast({ title: isFav ? tr("Removed from favorites") : tr("Added to favorites"), tone: "info" });
  };

  const install = async () => {
    setBusy(true);
    const t = toast({ title: tr("Installing {title}", { title: ref.title }), tone: "progress" });
    try {
      const summary = await installProject(category, { id: ref.id, slug: ref.slug, title: ref.title, iconUrl: ref.iconUrl }, { instance, server: pluginServers.find((s) => s.id === serverId), world });
      toast({ title: tr("{title} installed", { title: ref.title }), body: summary, tone: "success" });
      if (category === "modpacks") refresh();
      qc.invalidateQueries({ queryKey: ["content"] });
    } catch (e) {
      toast({ title: tr("Couldn't install {title}", { title: ref.title }), body: e instanceof Error ? e.message : String(e), tone: "error" });
    } finally {
      setBusy(false);
      dismiss(t);
    }
  };

  const html = useMemo(() => (p?.body ? renderMarkdown(p.body) : ""), [p?.body]);
  const gallery = p?.gallery ?? [];
  const pageUrl = ref.pageUrl ?? `https://modrinth.com/project/${ref.slug}`;

  const installTargetUi =
    category === "modpacks" ? (
      <p className="text-[13px] text-muted">{tr("Creates a new instance with everything the pack needs.")}</p>
    ) : category === "plugins" ? (
      pluginServers.length ? (
        <select aria-label={tr("Server")} value={serverId} onChange={(e) => setServerId(e.target.value)} className={inputClass}>
          {pluginServers.map((s) => <option key={s.id} value={s.id}>{tr("{name} (Paper {gameVersion})", { name: s.name, gameVersion: s.gameVersion })}</option>)}
        </select>
      ) : (
        <p className="text-[13px] text-muted">{tr("Plugins run on a Paper server. Create one in Servers first.")}</p>
      )
    ) : targets.length ? (
      <div className="flex flex-col gap-2">
        <select aria-label={tr("Instance")} value={instanceId} onChange={(e) => setInstanceId(e.target.value)} className={inputClass}>
          {targets.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.gameVersion}, {i.loader})</option>)}
        </select>
        {category === "datapacks" && (worlds.length ? (
          <select aria-label={tr("World")} value={world} onChange={(e) => setWorld(e.target.value)} className={inputClass}>
            {worlds.map((w) => <option key={w.folder} value={w.folder}>{tr("World: {folder}", { folder: w.folder })}</option>)}
          </select>
        ) : <p className="text-[13px] text-muted">{tr("This instance has no worlds yet. Play once and create a world first.")}</p>)}
      </div>
    ) : (
      <p className="text-[13px] text-muted">{category === "mods" || category === "shaders" ? tr("Needs an instance with a mod loader (Fabric, Quilt or NeoForge).") : tr("Create an instance first.")}</p>
    );

  const canInstall = isModrinth && (category === "modpacks" || (category === "plugins" ? !!serverId : !!instance && (category !== "datapacks" || !!world)));

  return (
    <>
      {/* header */}
      <div className="relative shrink-0 overflow-hidden border-b border-slate-line/70">
        {gallery[0] && <img src={gallery.find((g) => g.featured)?.url ?? gallery[0].url} alt="" className="absolute inset-0 size-full object-cover opacity-25 blur-sm" />}
        <div className="relative flex items-start gap-4 p-6">
          {ref.iconUrl ? <motion.img layoutId={`icon-${ref.id}`} src={ref.iconUrl} alt="" className="size-20 shrink-0 rounded-panel bg-slate-raised object-cover shadow-lg" /> : <div className="size-20 shrink-0 rounded-panel bg-slate-raised" />}
          <div className="min-w-0 flex-1">
            <h2 className="text-[24px] font-bold leading-tight">{ref.title}</h2>
            {ref.author && <p className="text-[14px] text-muted">{tr("by {author}", { author: ref.author })}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {ref.downloads !== undefined && <Badge><Download className="size-3" /> {compact(ref.downloads)}</Badge>}
              {ref.follows !== undefined && <Badge><Heart className="size-3" /> {compact(ref.follows)}</Badge>}
              {p?.client_side && p.client_side !== "unsupported" && <Badge><Monitor className="size-3" /> {tr("Client")}</Badge>}
              {p?.server_side && p.server_side !== "unsupported" && <Badge><ServerIcon className="size-3" /> {tr("Server")}</Badge>}
              {p?.license && <Badge>{p.license.name || p.license.id}</Badge>}
            </div>
          </div>
          <IconButton icon={Heart} label={isFav ? tr("Remove from favorites") : tr("Add to favorites")} active={isFav} onClick={toggleFav} />
          <IconButton icon={X} label={tr("Close")} onClick={() => openProject(null)} />
        </div>
      </div>

      {/* install bar */}
      <div className="shrink-0 border-b border-slate-line/70 bg-slate-raised/30 px-6 py-4">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">{installTargetUi}</div>
          {isModrinth ? (
            alreadyIn ? (
              <div className="flex flex-col items-end gap-1">
                <Button variant="secondary" size="lg" icon={Check} disabled>{tr("Installed")}</Button>
                <button type="button" onClick={install} disabled={busy} className="text-[12px] text-muted underline-offset-2 hover:text-text hover:underline">{tr("Reinstall / update")}</button>
              </div>
            ) : (
              <Button variant="primary" size="lg" className="shine" icon={Download} loading={busy} disabled={!canInstall} onClick={install}>
                {category === "modpacks" ? tr("Install pack") : tr("Install")}
              </Button>
            )
          ) : (
            <Button variant="secondary" icon={ExternalLink} onClick={() => open(pageUrl)}>{tr("Open on CurseForge")}</Button>
          )}
        </div>
      </div>

      <div className="shrink-0 px-6 pt-4">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "about", label: tr("What it does"), icon: BookOpen },
            { id: "gallery", label: tr("Gallery"), icon: GalleryHorizontal, count: gallery.length || undefined },
            { id: "versions", label: tr("Versions"), icon: History },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4" data-selectable>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {tab === "about" && (
              <>
                <div className="mb-5 rounded-card border border-copper/25 bg-copper/8 p-4">
                  <p className="text-[13px] font-medium text-copper">{tr("In short")}</p>
                  <p className="mt-1 text-[15px]">{ref.description || p?.description}</p>
                </div>
                {projectQ.isLoading && isModrinth ? (
                  <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-4" />)}</div>
                ) : html ? (
                  <div
                    className="prose-ember"
                    dangerouslySetInnerHTML={{ __html: html }}
                    onClick={(e) => {
                      const a = (e.target as HTMLElement).closest("a");
                      if (a?.href) {
                        e.preventDefault();
                        open(a.href);
                      }
                    }}
                  />
                ) : (
                  <p className="text-muted">{tr("No long description.")}</p>
                )}
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => open(pageUrl)}>{tr("Project page")}</Button>
                  {p?.source_url && <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => open(p.source_url!)}>{tr("Source code")}</Button>}
                  {p?.wiki_url && <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => open(p.wiki_url!)}>{tr("Wiki")}</Button>}
                  {p?.discord_url && <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => open(p.discord_url!)}>{tr("Discord")}</Button>}
                </div>
              </>
            )}
            {tab === "gallery" && (gallery.length ? (
              <div className="grid grid-cols-2 gap-3">
                {gallery.map((g) => (
                  <motion.figure key={g.url} whileHover={{ scale: 1.02 }} className="overflow-hidden rounded-card bg-slate-raised">
                    <img src={g.url} alt={g.title ?? ""} className="aspect-video w-full object-cover" loading="lazy" />
                    {g.title && <figcaption className="p-2 text-[13px] text-muted">{g.title}</figcaption>}
                  </motion.figure>
                ))}
              </div>
            ) : <p className="text-muted">{tr("No screenshots for this project.")}</p>)}
            {tab === "versions" && (versionsQ.isLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : (
              <ul className="divide-y divide-slate-line/60 overflow-hidden rounded-card border border-slate-line/60">
                {(versionsQ.data ?? []).slice(0, 40).map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-text">{v.version_number}</span>
                      <span className="block truncate text-muted">{v.loaders.join(", ")} · {v.game_versions.slice(-4).join(", ")}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone={v.version_type === "release" ? "accent" : "gold"}>{v.version_type}</Badge>
                      <span className="text-muted">{ago(v.date_published)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          </motion.div>
        </AnimatePresence>
        {!inTauri && <p className="mt-6 text-[12px] text-muted">{tr("Demo mode: installing needs the desktop app.")}</p>}
      </div>
    </>
  );
}
