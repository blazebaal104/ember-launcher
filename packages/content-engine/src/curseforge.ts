/**
 * CurseForge Core API client (https://docs.curseforge.com).
 *
 * An API key is mandatory and must NOT ship inside the frontend bundle. In the
 * desktop app this client is constructed with a transport that calls the Rust
 * command `curseforge_request`, which attaches `x-api-key` and only allows a
 * whitelist of read-only paths.
 *
 * Note: authors can disable third-party distribution. Those files come back
 * with `downloadUrl: null`; the launcher must send the user to the website.
 */
import { JsonClient, qs, type FetchLike, HttpError } from "./http";
import type { ContentCategory, ContentHit, Loader, ResolvedFile } from "./types";

export const CF_GAME_MINECRAFT = 432;

export const CF_CLASS: Record<ContentCategory, number> = {
  mods: 6,
  resourcepacks: 12,
  modpacks: 4471,
  shaders: 6552,
  datapacks: 6945,
  plugins: 5, // "Bukkit Plugins"
};

/** CurseForge ModLoaderType enum. */
export const CF_LOADER: Record<Loader, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };

export interface CfFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  releaseType: 1 | 2 | 3; // release, beta, alpha
  fileDate: string;
  fileLength: number;
  downloadUrl: string | null;
  gameVersions: string[];
  hashes: Array<{ value: string; algo: 1 | 2 }>; // 1 = sha1, 2 = md5
  dependencies: Array<{ modId: number; relationType: number }>; // 3 = required
  fileFingerprint: number;
}

export interface CfMod {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  thumbsUpCount?: number;
  categories: Array<{ name: string; slug: string }>;
  authors: Array<{ name: string }>;
  logo?: { thumbnailUrl: string } | null;
  links: { websiteUrl: string };
  dateModified: string;
  latestFilesIndexes: Array<{ gameVersion: string; fileId: number; modLoader?: number }>;
  classId: number;
}

interface CfFingerprintResponse {
  data: {
    exactMatches: Array<{ id: number; file: CfFile }>;
    exactFingerprints: number[];
    unmatchedFingerprints: number[];
  };
}

export class CurseForgeClient {
  private readonly http: JsonClient;
  /**
   * @param fetch transport. In the app this proxies through Rust; in tests it's a mock.
   * @param apiKey only pass this in trusted server/CLI contexts, never in the webview bundle.
   */
  constructor(fetch: FetchLike, apiKey?: string, baseUrl = "https://api.curseforge.com/v1") {
    this.http = new JsonClient({ baseUrl, fetch, headers: apiKey ? { "x-api-key": apiKey } : {}, concurrency: 4 });
  }

  async matchFingerprints(fingerprints: number[]): Promise<Map<number, CfFile>> {
    const map = new Map<number, CfFile>();
    const fps = fingerprints.filter((f) => f > 0);
    if (fps.length === 0) return map;
    const res = await this.http.post<CfFingerprintResponse>(`/fingerprints/${CF_GAME_MINECRAFT}`, { fingerprints: fps });
    for (const m of res.data.exactMatches) map.set(m.file.fileFingerprint, m.file);
    return map;
  }

  async mods(ids: number[]): Promise<CfMod[]> {
    if (ids.length === 0) return [];
    const res = await this.http.post<{ data: CfMod[] }>("/mods", { modIds: ids });
    return res.data;
  }

  async files(modId: number, gameVersion: string, loader?: Loader): Promise<CfFile[]> {
    try {
      const res = await this.http.get<{ data: CfFile[] }>(
        `/mods/${modId}/files` + qs({ gameVersion, modLoaderType: loader ? CF_LOADER[loader] : undefined, pageSize: 50 }),
      );
      return res.data;
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return [];
      throw e;
    }
  }

  async search(category: ContentCategory, opts: { query?: string; gameVersion?: string; loader?: Loader; sort?: "relevance" | "downloads" | "updated"; limit?: number; offset?: number } = {}): Promise<{ hits: ContentHit[]; total: number }> {
    // sortField: 1 Featured, 2 Popularity, 3 LastUpdated, 6 TotalDownloads;
    const sortField = opts.sort === "updated" ? 3 : opts.sort === "downloads" ? 6 : opts.query ? 2 : 6;
    const res = await this.http.get<{ data: CfMod[]; pagination: { totalCount: number } }>(
      "/mods/search" +
        qs({
          gameId: CF_GAME_MINECRAFT,
          classId: CF_CLASS[category],
          searchFilter: opts.query,
          gameVersion: opts.gameVersion,
          modLoaderType: opts.loader && (category === "mods" || category === "modpacks") ? CF_LOADER[opts.loader] : undefined,
          sortField,
          sortOrder: "desc",
          pageSize: opts.limit ?? 20,
          index: opts.offset ?? 0,
        }),
    );
    return {
      total: res.pagination.totalCount,
      hits: res.data.map((m) => ({
        source: "curseforge" as const,
        id: String(m.id),
        slug: m.slug,
        title: m.name,
        description: m.summary,
        author: m.authors[0]?.name ?? "",
        iconUrl: m.logo?.thumbnailUrl,
        downloads: m.downloadCount,
        follows: m.thumbsUpCount ?? 0,
        categories: m.categories.map((c) => c.slug),
        gameVersions: [...new Set(m.latestFilesIndexes.map((i) => i.gameVersion))],
        updatedAt: m.dateModified,
        pageUrl: m.links.websiteUrl,
      })),
    };
  }
}

export function cfToResolved(file: CfFile, mod: Pick<CfMod, "name" | "links">): ResolvedFile {
  return {
    source: "curseforge",
    projectId: String(file.modId),
    projectName: mod.name,
    versionId: String(file.id),
    versionNumber: file.displayName,
    fileName: file.fileName,
    url: file.downloadUrl,
    sha1: file.hashes.find((h) => h.algo === 1)?.value,
    size: file.fileLength,
    pageUrl: `${mod.links.websiteUrl}/files/${file.id}`,
  };
}

export function pickBestCfFile(files: CfFile[], gameVersion: string, loader: Loader): CfFile | undefined {
  const loaderName = { fabric: "Fabric", quilt: "Quilt", neoforge: "NeoForge", forge: "Forge" }[loader];
  return files
    .filter((f) => f.gameVersions.includes(gameVersion) && f.gameVersions.includes(loaderName))
    .sort((a, b) => a.releaseType - b.releaseType || b.fileDate.localeCompare(a.fileDate))[0];
}
