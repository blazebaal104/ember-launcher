import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Compass, Heart, HeartOff } from "lucide-react";
import { useApp } from "../state";
import { useFavorites, prefetchProject } from "../lib/queries";
import { CATEGORIES } from "../lib/categories";
import { api } from "../lib/ipc";
import { Button, Empty, IconButton, Skeleton } from "../components/ui";

export function Favorites() {
  const favs = useFavorites();
  const { openProject } = useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const groups = CATEGORIES.map((c) => ({ c, items: (favs.data ?? []).filter((f) => f.category === c.id) })).filter((g) => g.items.length);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-2">
      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-[30px] font-bold tracking-tight">Favorites</h1>
        <p className="mt-1 text-muted">Everything you've hearted in Discover, ready to install into any instance.</p>
      </motion.header>
      {favs.isLoading ? <Skeleton className="h-40" /> : groups.length === 0 ? (
        <Empty icon={Heart} title="No favorites yet" action={<Button variant="primary" icon={Compass} onClick={() => navigate("/discover/mods")}>Go to Discover</Button>}>
          Tap the heart on any mod, pack or shader to keep it here.
        </Empty>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(({ c, items }) => (
            <section key={c.id}>
              <h2 className="mb-3 flex items-center gap-2 text-[18px] font-bold"><c.icon className="size-5 text-copper" /> {c.label} <span className="text-[13px] font-normal text-muted">{items.length}</span></h2>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                {items.map((f, i) => (
                  <motion.li
                    key={f.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onMouseEnter={() => f.source === "modrinth" && prefetchProject(qc, f.id)}
                    onClick={() => openProject({ source: f.source, id: f.id, slug: f.slug, title: f.title, description: f.description ?? "", iconUrl: f.iconUrl ?? undefined, category: f.category })}
                    className="glass lift group flex cursor-pointer items-center gap-3 rounded-panel p-3"
                  >
                    {f.iconUrl ? <img src={f.iconUrl} alt="" className="size-12 shrink-0 rounded-card object-cover" /> : <div className="size-12 shrink-0 rounded-card bg-slate-raised" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold">{f.title}</p>
                      <p className="line-clamp-1 text-[12px] text-muted">{f.description}</p>
                    </div>
                    <IconButton
                      icon={HeartOff}
                      label="Remove from favorites"
                      onClick={async (e) => {
                        e.stopPropagation();
                        qc.setQueryData(["favorites"], await api.toggleFavorite(f));
                      }}
                    />
                  </motion.li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
