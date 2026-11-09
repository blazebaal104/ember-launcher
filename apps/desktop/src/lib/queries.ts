/**
 * Cached data hooks. Discover feels instant because:
 *  - every query is cached (5 min fresh, 30 min kept) and shown immediately on revisit,
 *  - the six categories' first pages are prefetched at startup,
 *  - hovering a tab or a card prefetches what clicking it will need,
 *  - previous results stay on screen while new ones load (no blank flashes).
 */
import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import type { ContentCategory, ContentSource, Loader } from "@ember/content-engine";
import { pickBestVersion } from "@ember/content-engine";
import { curseforge, modrinth } from "./clients";
import { api } from "./ipc";

export interface DiscoverOpts {
  query?: string;
  gameVersion?: string;
  loader?: Loader;
  sort: "relevance" | "downloads" | "follows" | "updated";
  page: number;
}

export const PAGE_SIZE = 24;

const discoverKey = (source: ContentSource, category: ContentCategory, o: DiscoverOpts) => ["discover", source, category, o.query ?? "", o.gameVersion ?? "", o.loader ?? "", o.sort, o.page] as const;

async function fetchDiscover(source: ContentSource, category: ContentCategory, o: DiscoverOpts) {
  const opts = { query: o.query || undefined, gameVersion: o.gameVersion, loader: o.loader, limit: PAGE_SIZE, offset: o.page * PAGE_SIZE };
  if (source === "curseforge" && curseforge) return curseforge.search(category, { ...opts, sort: o.sort === "follows" ? "downloads" : o.sort });
  return modrinth.discover(category, { ...opts, sort: o.sort });
}

export function useDiscover(source: ContentSource, category: ContentCategory, o: DiscoverOpts) {
  return useQuery({ queryKey: discoverKey(source, category, o), queryFn: () => fetchDiscover(source, category, o), placeholderData: keepPreviousData });
}

export function prefetchDiscover(qc: QueryClient, source: ContentSource, category: ContentCategory, o: DiscoverOpts) {
  return qc.prefetchQuery({ queryKey: discoverKey(source, category, o), queryFn: () => fetchDiscover(source, category, o) });
}

export function useProject(id: string | undefined) {
  return useQuery({ queryKey: ["project", id], queryFn: () => modrinth.project(id!), enabled: !!id });
}

export function prefetchProject(qc: QueryClient, id: string) {
  return qc.prefetchQuery({ queryKey: ["project", id], queryFn: () => modrinth.project(id) });
}

export function useProjectVersions(id: string | undefined) {
  return useQuery({ queryKey: ["versions", id], queryFn: () => modrinth.projectVersions(id!), enabled: !!id });
}

/** Best version of a project for a game version + loader set. */
export async function bestVersionFor(projectId: string, gameVersion: string, loaders?: string[]) {
  return pickBestVersion(await modrinth.projectVersions(projectId, loaders, [gameVersion]));
}

export const useFavorites = () => useQuery({ queryKey: ["favorites"], queryFn: api.favorites, staleTime: Infinity });
export const useProfiles = () => useQuery({ queryKey: ["profiles"], queryFn: api.profiles, staleTime: Infinity });
export const useServers = () => useQuery({ queryKey: ["servers"], queryFn: api.servers, staleTime: 0, refetchInterval: 5000 });
export const useVersions = () => useQuery({ queryKey: ["gameVersions"], queryFn: api.listVersions, staleTime: 60 * 60_000 });
export const useSystemInfo = () => useQuery({ queryKey: ["system"], queryFn: api.systemInfo, staleTime: Infinity });
export const useContent = (instanceId: string, dir: string) => useQuery({ queryKey: ["content", instanceId, dir], queryFn: () => api.listContent(instanceId, dir), staleTime: 0 });
