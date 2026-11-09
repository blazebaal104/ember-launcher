/**
 * Modrinth API v2 client (https://docs.modrinth.com).
 * Modrinth requires a uniquely identifying User-Agent, so the desktop app must pass
 * a fetch that is allowed to set it (Tauri plugin-http), e.g.
 *   "ember-launcher/0.1.0 (github.com/you/ember-launcher)".
 */
import { JsonClient, qs, type FetchLike, HttpError } from "./http";
import type { ContentCategory, ContentHit, Loader, ResolvedFile } from "./types";

export interface MrFile {
  hashes: { sha1: string; sha512: string };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

export interface MrDependency {
  version_id: string | null;
  project_id: string | null;
  file_name: string | null;
  dependency_type: "required" | "optional" | "incompatible" | "embedded";
}

export interface MrVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  version_type: "release" | "beta" | "alpha";
  game_versions: string[];
  loaders: string[];
  date_published: string;
  downloads: number;
  files: MrFile[];
  dependencies: MrDependency[];
}

export interface MrProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  project_type: string;
  downloads: number;
  followers: number;
  updated: string;
  game_versions: string[];
  loaders: string[];
  icon_url: string | null;
  source_url?: string | null;
}

export interface MrSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  categories: string[];
  display_categories?: string[];
  versions: string[];
  downloads: number;
  follows: number;
  icon_url: string | null;
  date_modified: string;
  project_type: string;
}

export interface MrSearchResult {
  hits: MrSearchHit[];
  offset: number;
  limit: number;
  total_hits: number;
}

/** Server platforms that Modrinth lists plugins under. */
export const PLUGIN_LOADERS = [
  "paper", "purpur", "spigot", "bukkit", "folia", "sponge", "velocity", "waterfall", "bungeecord",
];

/** How each Discover category maps to Modrinth search facets (outer = AND, inner = OR). */
export function categoryFacets(category: ContentCategory): string[][] {
  switch (category) {
    case "mods":
      return [["project_type:mod"], ["categories:fabric", "categories:quilt", "categories:neoforge", "categories:forge"]];
    case "resourcepacks":
      return [["project_type:resourcepack"]];
    case "datapacks":
      return [["categories:datapack"]];
    case "shaders":
      return [["project_type:shader"]];
    case "modpacks":
      return [["project_type:modpack"]];
    case "plugins":
      return [PLUGIN_LOADERS.map((l) => `categories:${l}`)];
  }
}

export class ModrinthClient {
  private readonly http: JsonClient;
  constructor(fetch: FetchLike, userAgent: string, baseUrl = "https://api.modrinth.com/v2") {
    this.http = new JsonClient({ baseUrl, fetch, headers: { "User-Agent": userAgent }, concurrency: 8 });
  }

  /** Bulk: hash -> version that contains that file. Unknown hashes are simply absent. */
  versionsFromHashes(hashes: string[], algorithm: "sha1" | "sha512" = "sha1") {
    if (hashes.length === 0) return Promise.resolve({} as Record<string, MrVersion>);
    return this.http.post<Record<string, MrVersion>>("/version_files", { hashes, algorithm });
  }

  /** Bulk: hash -> newest version of the same project that matches loader + game version. */
  latestVersionsFromHashes(hashes: string[], loaders: string[], gameVersions: string[], versionTypes?: string[]) {
    if (hashes.length === 0) return Promise.resolve({} as Record<string, MrVersion>);
    return this.http.post<Record<string, MrVersion>>("/version_files/update", {
      hashes,
      algorithm: "sha1",
      loaders,
      game_versions: gameVersions,
      ...(versionTypes ? { version_types: versionTypes } : {}),
    });
  }

  async projectVersions(idOrSlug: string, loaders?: string[], gameVersions?: string[]): Promise<MrVersion[]> {
    try {
      return await this.http.get<MrVersion[]>(
        `/project/${encodeURIComponent(idOrSlug)}/version` +
          qs({
            loaders: loaders ? JSON.stringify(loaders) : undefined,
            game_versions: gameVersions ? JSON.stringify(gameVersions) : undefined,
          }),
      );
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return [];
      throw e;
    }
  }

  async project(idOrSlug: string): Promise<MrProject | null> {
    try {
      return await this.http.get<MrProject>(`/project/${encodeURIComponent(idOrSlug)}`);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  }

  projects(ids: string[]): Promise<MrProject[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.http.get<MrProject[]>(`/projects${qs({ ids: JSON.stringify(ids) })}`);
  }

  search(params: { query?: string; facets?: string[][]; index?: "relevance" | "downloads" | "follows" | "newest" | "updated"; limit?: number; offset?: number }) {
    return this.http.get<MrSearchResult>(
      "/search" +
        qs({
          query: params.query,
          facets: params.facets?.length ? JSON.stringify(params.facets) : undefined,
          index: params.index ?? "relevance",
          limit: params.limit ?? 20,
          offset: params.offset ?? 0,
        }),
    );
  }

  /** Discover UI search across one of the six categories, optionally filtered to a game version / loader. */
  async discover(category: ContentCategory, opts: { query?: string; gameVersion?: string; loader?: Loader; sort?: "relevance" | "downloads" | "follows" | "updated"; limit?: number; offset?: number } = {}): Promise<{ hits: ContentHit[]; total: number }> {
    const facets = categoryFacets(category);
    if (opts.gameVersion) facets.push([`versions:${opts.gameVersion}`]);
    if (opts.loader && (category === "mods" || category === "modpacks")) facets.push([`categories:${opts.loader}`]);
    const res = await this.search({ query: opts.query, facets, index: opts.sort ?? (opts.query ? "relevance" : "downloads"), limit: opts.limit, offset: opts.offset });
    return {
      total: res.total_hits,
      hits: res.hits.map((h) => ({
        source: "modrinth" as const,
        id: h.project_id,
        slug: h.slug,
        title: h.title,
        description: h.description,
        author: h.author,
        iconUrl: h.icon_url ?? undefined,
        downloads: h.downloads,
        follows: h.follows,
        categories: h.display_categories ?? h.categories,
        gameVersions: h.versions,
        updatedAt: h.date_modified,
        pageUrl: `https://modrinth.com/${h.project_type}/${h.slug}`,
      })),
    };
  }
}

/** Convert a Modrinth version to the launcher's download descriptor (primary file). */
export function mrToResolved(v: MrVersion, projectName: string, slug?: string): ResolvedFile {
  const file = v.files.find((f) => f.primary) ?? v.files[0]!;
  return {
    source: "modrinth",
    projectId: v.project_id,
    projectName,
    versionId: v.id,
    versionNumber: v.version_number,
    fileName: file.filename,
    url: file.url,
    sha1: file.hashes.sha1,
    sha512: file.hashes.sha512,
    size: file.size,
    pageUrl: `https://modrinth.com/mod/${slug ?? v.project_id}`,
  };
}

/** Pick the best version: prefer release > beta > alpha, then newest. */
export function pickBestVersion(versions: MrVersion[], allowed: Array<"release" | "beta" | "alpha"> = ["release", "beta"]): MrVersion | undefined {
  const rank = { release: 0, beta: 1, alpha: 2 } as const;
  return versions
    .filter((v) => allowed.includes(v.version_type))
    .sort((a, b) => rank[a.version_type] - rank[b.version_type] || b.date_published.localeCompare(a.date_published))[0];
}
