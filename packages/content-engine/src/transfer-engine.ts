/**
 * Mod-Version Transfer Engine
 * ===========================
 * Input : inspected files from an old instance (jars, mods-folder zip, .mrpack, CurseForge pack)
 * Output: a TransferPlan the UI renders as a review table with one-click install.
 *
 * Pipeline (every network step is bulk where the API allows it):
 *
 *   1. IDENTIFY   sha1 -> Modrinth  POST /version_files            (1 request for all files)
 *                 murmur2 -> CurseForge POST /fingerprints/432     (1 request for the leftovers)
 *                 manifest refs (CF packs) -> project id directly
 *                 metadata (mod id / name) -> Modrinth project/search (last resort)
 *
 *   2. RESOLVE    Modrinth  POST /version_files/update  {loaders, game_versions}  (1 request)
 *                 CurseForge GET /mods/{id}/files?gameVersion&modLoaderType      (per mod)
 *                 CurseForge-identified mods are also looked up on Modrinth by slug,
 *                 because Modrinth files are always third-party downloadable.
 *
 *   3. FALLBACK   a) curated successor table (OptiFine -> Sodium + Iris, ...)
 *                 b) fork / similar search on Modrinth filtered to target version+loader,
 *                    scored by name, categories, description, popularity, freshness.
 *
 *   4. DEPENDENCIES  required deps of every matched build are added (e.g. Fabric API),
 *                    skipping ones the user already has.
 */
import { cfToResolved, CurseForgeClient, pickBestCfFile, type CfFile } from "./curseforge";
import { mrToResolved, pickBestVersion, type ModrinthClient, type MrProject, type MrVersion } from "./modrinth";
import { functionalCategories, nameSimilarity, scoreAlternative } from "./similarity";
import { findSuccessor } from "./successors";
import type {
  AlternativeCandidate,
  InspectedFile,
  ResolvedFile,
  TransferEntry,
  TransferPlan,
  TransferStatus,
  TransferTarget,
} from "./types";

export interface TransferProgress {
  phase: "identify" | "resolve" | "fallback" | "dependencies" | "done";
  done: number;
  total: number;
  message?: string;
}

export interface TransferEngineOptions {
  modrinth: ModrinthClient;
  /** Optional: without it, only Modrinth is used. */
  curseforge?: CurseForgeClient;
  maxAlternatives?: number;
  /** Minimum confidence for a "similar" suggestion to be shown. */
  minConfidence?: number;
  onProgress?: (p: TransferProgress) => void;
}

/** Internal working state per input file. */
interface Work {
  entry: TransferEntry;
  mrVersion?: MrVersion; // version the old file belongs to (Modrinth)
  mrProject?: MrProject;
  cfFile?: CfFile; // matched CurseForge file
  cfModId?: number;
}

export class TransferEngine {
  private readonly mr: ModrinthClient;
  private readonly cf?: CurseForgeClient;
  private readonly maxAlt: number;
  private readonly minConf: number;
  private readonly progress: (p: TransferProgress) => void;

  constructor(opts: TransferEngineOptions) {
    this.mr = opts.modrinth;
    this.cf = opts.curseforge;
    this.maxAlt = opts.maxAlternatives ?? 3;
    this.minConf = opts.minConfidence ?? 0.3;
    this.progress = opts.onProgress ?? (() => {});
  }

  async plan(files: InspectedFile[], target: TransferTarget): Promise<TransferPlan> {
    const types = target.allowedVersionTypes ?? ["release", "beta"];
    const work: Work[] = files.map((input) => ({ entry: { input, status: "unknown", alternatives: [] } }));
    const total = work.length;

    // ---------------------------------------------------------------- 1. IDENTIFY
    this.progress({ phase: "identify", done: 0, total, message: "Looking up file hashes on Modrinth" });
    const hashed = work.filter((w) => w.entry.input.sha1);
    const byHash = await this.mr.versionsFromHashes(hashed.map((w) => w.entry.input.sha1));
    for (const w of hashed) {
      const v = byHash[w.entry.input.sha1];
      if (v) w.mrVersion = v;
    }

    if (this.cf) {
      const leftovers = work.filter((w) => !w.mrVersion && w.entry.input.cfFingerprint > 0);
      if (leftovers.length) {
        this.progress({ phase: "identify", done: total - leftovers.length, total, message: "Matching fingerprints on CurseForge" });
        const matches = await this.cf.matchFingerprints(leftovers.map((w) => w.entry.input.cfFingerprint));
        for (const w of leftovers) {
          const f = matches.get(w.entry.input.cfFingerprint);
          if (f) {
            w.cfFile = f;
            w.cfModId = f.modId;
          }
        }
      }
      for (const w of work) {
        const ref = w.entry.input.manifestRef;
        if (ref?.source === "curseforge") w.cfModId = Number(ref.projectId);
      }
    }

    // Fetch project metadata for everything identified on Modrinth (one bulk call).
    const mrIds = [...new Set(work.filter((w) => w.mrVersion).map((w) => w.mrVersion!.project_id))];
    const projects = new Map((await this.mr.projects(mrIds)).map((p) => [p.id, p]));
    for (const w of work) {
      if (!w.mrVersion) continue;
      const p = projects.get(w.mrVersion.project_id);
      w.mrProject = p;
      w.entry.identifiedAs = { source: "modrinth", projectId: w.mrVersion.project_id, name: p?.title ?? w.mrVersion.name, slug: p?.slug, how: "hash" };
    }

    // CurseForge-identified: get names/slugs, then try to find the same project on Modrinth.
    if (this.cf) {
      const cfIds = [...new Set(work.filter((w) => !w.mrProject && w.cfModId).map((w) => w.cfModId!))];
      const cfMods = new Map((await this.cf.mods(cfIds)).map((m) => [m.id, m]));
      for (const w of work) {
        if (w.mrProject || !w.cfModId) continue;
        const mod = cfMods.get(w.cfModId);
        if (!mod) continue;
        w.entry.identifiedAs = {
          source: "curseforge",
          projectId: String(mod.id),
          name: mod.name,
          slug: mod.slug,
          how: w.entry.input.manifestRef ? "manifest" : "fingerprint",
        };
        const twin = await this.mr.project(mod.slug);
        if (twin && nameSimilarity(twin.title, mod.name) >= 0.6) w.mrProject = twin;
      }
    }

    // Metadata fallback for files neither platform knows (e.g. renamed or self-built jars).
    for (const w of work) {
      if (w.entry.identifiedAs || !w.entry.input.meta) continue;
      const meta = w.entry.input.meta;
      const byId = await this.mr.project(meta.modId.replace(/_/g, "-"));
      let project: MrProject | null = byId && nameSimilarity(byId.title, meta.name) >= 0.5 ? byId : null;
      if (!project) {
        const res = await this.mr.search({ query: meta.name, facets: [["project_type:mod"]], limit: 5 });
        const best = res.hits.find((h) => nameSimilarity(h.title, meta.name) >= 0.85 || h.slug === meta.modId);
        if (best) project = await this.mr.project(best.project_id);
      }
      if (project) {
        w.mrProject = project;
        w.entry.identifiedAs = { source: "modrinth", projectId: project.id, name: project.title, slug: project.slug, how: "metadata" };
      }
    }

    // ---------------------------------------------------------------- 2. RESOLVE
    this.progress({ phase: "resolve", done: 0, total, message: `Finding builds for ${target.gameVersion} (${target.loader})` });
    const exact = await this.mr.latestVersionsFromHashes(
      work.filter((w) => w.mrVersion).map((w) => w.entry.input.sha1),
      [target.loader],
      [target.gameVersion],
      types,
    );

    let resolvedCount = 0;
    for (const w of work) {
      const e = w.entry;
      const hit = w.mrVersion ? exact[e.input.sha1] : undefined;
      if (hit && hit.game_versions.includes(target.gameVersion) && hit.loaders.includes(target.loader)) {
        e.status = "matched";
        e.resolved = mrToResolved(hit, w.mrProject?.title ?? hit.name, w.mrProject?.slug);
      } else if (w.mrProject) {
        // Identified by CF twin / metadata: query versions directly.
        const best = pickBestVersion(await this.mr.projectVersions(w.mrProject.id, [target.loader], [target.gameVersion]), types);
        if (best) {
          e.status = "matched";
          e.resolved = mrToResolved(best, w.mrProject.title, w.mrProject.slug);
        }
      }
      if (e.status !== "matched" && this.cf && w.cfModId) {
        const best = pickBestCfFile(await this.cf.files(w.cfModId, target.gameVersion, target.loader), target.gameVersion, target.loader);
        if (best) {
          const [mod] = await this.cf.mods([w.cfModId]);
          if (mod) {
            e.status = "matched";
            e.resolved = cfToResolved(best, mod);
            if (!best.downloadUrl) e.note = "The author disabled third-party downloads - this one opens in your browser.";
          }
        }
      }
      if (e.status !== "matched" && e.identifiedAs) e.status = "unavailable";
      this.progress({ phase: "resolve", done: ++resolvedCount, total });
    }

    // ---------------------------------------------------------------- 3. FALLBACK
    const needFallback = work.filter((w) => w.entry.status === "unavailable" || w.entry.status === "unknown");
    let fb = 0;
    for (const w of needFallback) {
      this.progress({ phase: "fallback", done: fb++, total: needFallback.length, message: `Finding alternatives for ${displayName(w)}` });
      await this.fallback(w, target, types);
    }

    // ---------------------------------------------------------------- 4. DEPENDENCIES
    this.progress({ phase: "dependencies", done: 0, total: 1, message: "Resolving required dependencies" });
    const resolved = work.map((w) => w.entry.resolved).filter((r): r is ResolvedFile => !!r);
    const dependencies = await this.resolveDependencies(resolved, target);

    const entries = work.map((w) => w.entry);
    const stats = { matched: 0, alternative: 0, obsolete: 0, unavailable: 0, unknown: 0 } as Record<TransferStatus, number>;
    for (const e of entries) stats[e.status]++;
    this.progress({ phase: "done", done: total, total });
    return { target, entries, dependencies, stats };
  }

  /** Successor table first, then fork/similar search. Mutates the entry. */
  private async fallback(w: Work, target: TransferTarget, types: Array<"release" | "beta" | "alpha">) {
    const e = w.entry;
    const meta = e.input.meta;
    const name = displayName(w);

    const rule = findSuccessor([meta?.modId, w.mrProject?.slug, e.identifiedAs?.slug], target.loader);
    if (rule) {
      if (rule.kind === "obsolete") {
        e.status = "obsolete";
        e.note = rule.reason;
        return;
      }
      for (const slug of rule.replacements) {
        const project = await this.mr.project(slug);
        if (!project) continue;
        const best = pickBestVersion(await this.mr.projectVersions(project.id, [target.loader], [target.gameVersion]), types);
        if (best) {
          e.alternatives.push({
            file: mrToResolved(best, project.title, project.slug),
            confidence: 0.95,
            kind: rule.kind === "fork" ? "fork" : "successor",
            reason: rule.reason,
          });
        }
      }
      if (e.alternatives.length) {
        e.status = "alternative";
        return;
      }
    }

    // Search for forks / functionally similar projects that DO support the target.
    const original = {
      name,
      description: w.mrProject?.description ?? meta?.description,
      categories: w.mrProject?.categories ?? [],
    };
    const facets = [["project_type:mod"], [`versions:${target.gameVersion}`], [`categories:${target.loader}`]];
    const queries = new Set([name]);
    // A second query built from functional categories catches mods with different names.
    const cats = [...functionalCategories(original.categories)];
    if (cats.length) queries.add(`${name.split(/\s+/)[0]} ${cats.slice(0, 2).join(" ")}`);

    const seen = new Set<string>([w.mrProject?.id ?? ""]);
    const scored: Array<{ hit: import("./modrinth").MrSearchHit; score: ReturnType<typeof scoreAlternative> }> = [];
    for (const query of queries) {
      const res = await this.mr.search({ query, facets, limit: 10 });
      for (const hit of res.hits) {
        if (seen.has(hit.project_id)) continue;
        seen.add(hit.project_id);
        const score = scoreAlternative({
          original,
          candidate: { title: hit.title, description: hit.description, categories: hit.categories, downloads: hit.downloads, updatedAt: hit.date_modified },
        });
        if (score.confidence >= this.minConf) scored.push({ hit, score });
      }
    }
    scored.sort((a, b) => b.score.confidence - a.score.confidence);

    for (const { hit, score } of scored.slice(0, this.maxAlt)) {
      const best = pickBestVersion(await this.mr.projectVersions(hit.project_id, [target.loader], [target.gameVersion]), types);
      if (!best) continue;
      e.alternatives.push({ file: mrToResolved(best, hit.title, hit.slug), confidence: score.confidence, kind: score.kind, reason: score.reason } satisfies AlternativeCandidate);
    }

    if (e.alternatives.length) e.status = "alternative";
    else if (e.identifiedAs) e.note = `No build of ${name} for ${target.gameVersion} and no close alternative found.`;
  }

  /** Required dependencies of the given files that aren't already part of the set. */
  async resolveDependencies(files: ResolvedFile[], target: TransferTarget): Promise<ResolvedFile[]> {
    const have = new Set(files.map((f) => f.projectId));
    const out: ResolvedFile[] = [];
    const queue = files.filter((f) => f.source === "modrinth");
    const visited = new Set<string>();

    while (queue.length) {
      const f = queue.shift()!;
      if (visited.has(f.versionId)) continue;
      visited.add(f.versionId);
      const versions = await this.mr.projectVersions(f.projectId, [target.loader], [target.gameVersion]);
      const v = versions.find((x) => x.id === f.versionId) ?? pickBestVersion(versions);
      for (const dep of v?.dependencies ?? []) {
        if (dep.dependency_type !== "required" || !dep.project_id || have.has(dep.project_id)) continue;
        have.add(dep.project_id);
        const project = await this.mr.project(dep.project_id);
        const best = pickBestVersion(await this.mr.projectVersions(dep.project_id, [target.loader], [target.gameVersion]));
        if (best && project) {
          const r = mrToResolved(best, project.title, project.slug);
          out.push(r);
          queue.push(r); // transitive
        }
      }
    }
    return out;
  }

  /**
   * Turn user choices into the final download list.
   * @param choices entry index -> chosen alternative index (or null to skip). Matched entries are always included.
   */
  async finalize(plan: TransferPlan, choices: Record<number, number | null>): Promise<ResolvedFile[]> {
    const files: ResolvedFile[] = [];
    plan.entries.forEach((e, i) => {
      if (e.status === "matched" && e.resolved) files.push(e.resolved);
      if (e.status === "alternative") {
        const pick = choices[i] === undefined ? 0 : choices[i];
        const alt = pick === null ? undefined : e.alternatives[pick];
        if (alt) files.push(alt.file);
      }
    });
    // Alternatives can introduce new dependencies; re-resolve over the final set.
    const deps = await this.resolveDependencies(dedupe(files), plan.target);
    return dedupe([...files, ...deps]);
  }
}

function displayName(w: Work): string {
  return w.entry.identifiedAs?.name ?? w.entry.input.meta?.name ?? w.entry.input.fileName.replace(/[-_+][\d.].*\.jar$|\.jar$/i, "");
}

function dedupe(files: ResolvedFile[]): ResolvedFile[] {
  const seen = new Set<string>();
  return files.filter((f) => (seen.has(f.projectId) ? false : (seen.add(f.projectId), true)));
}
