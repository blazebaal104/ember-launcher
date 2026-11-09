/** Shared domain types for the content engine (Modrinth + CurseForge + mod transfer). */

export type Loader = "fabric" | "quilt" | "neoforge" | "forge";

/** The six "Discover content" categories shown in the launcher. */
export type ContentCategory =
  | "mods"
  | "resourcepacks"
  | "datapacks"
  | "shaders"
  | "modpacks"
  | "plugins";

export type ContentSource = "modrinth" | "curseforge";

/** Metadata read from inside a mod jar (fabric.mod.json, quilt.mod.json, mods.toml, neoforge.mods.toml). */
export interface ModMetadata {
  loader: Loader;
  modId: string;
  name: string;
  version: string;
  description?: string;
  authors: string[];
  homepage?: string;
  sources?: string;
  /** Required mod ids, excluding platform ids (minecraft, java, fabricloader, ...). */
  depends: string[];
  /** Raw Minecraft version constraint as declared by the mod, e.g. "~1.20.1" or "[1.20,1.21)". */
  minecraftConstraint?: string;
}

/** A mod file after local inspection (done in a worker; no network). */
export interface InspectedFile {
  fileName: string;
  size: number;
  sha1: string;
  sha512: string;
  /** CurseForge fingerprint: murmur2 (seed 1) over the bytes with whitespace removed. */
  cfFingerprint: number;
  meta: ModMetadata | null;
  /** Set when the file came from a modpack manifest rather than a real jar. */
  manifestRef?: { source: ContentSource; projectId: string; fileId?: string };
}

/** Where the migration is going. */
export interface TransferTarget {
  gameVersion: string;
  loader: Loader;
  /** Allow beta/alpha builds when no release exists (default: release + beta). */
  allowedVersionTypes?: Array<"release" | "beta" | "alpha">;
}

/** A downloadable file the Rust core should fetch into the instance. */
export interface ResolvedFile {
  source: ContentSource;
  projectId: string;
  projectName: string;
  versionId: string;
  versionNumber: string;
  fileName: string;
  /** Null when the author blocks third-party downloads (CurseForge). The UI then opens `pageUrl`. */
  url: string | null;
  sha1?: string;
  sha512?: string;
  size?: number;
  pageUrl: string;
}

export type TransferStatus =
  /** Same project, a build exists for the target version + loader. */
  | "matched"
  /** No build for the target; we found alternatives the user must pick from. */
  | "alternative"
  /** Mod is obsolete on the target (e.g. its feature became vanilla). Nothing to install. */
  | "obsolete"
  /** Identified, but nothing for the target and no good alternatives. */
  | "unavailable"
  /** Couldn't identify the file at all. */
  | "unknown";

export interface AlternativeCandidate {
  file: ResolvedFile;
  /** 0..1 */
  confidence: number;
  reason: string;
  kind: "successor" | "fork" | "similar";
}

export interface TransferEntry {
  input: InspectedFile;
  identifiedAs?: { source: ContentSource; projectId: string; name: string; slug?: string; how: "hash" | "fingerprint" | "metadata" | "manifest" };
  status: TransferStatus;
  resolved?: ResolvedFile;
  alternatives: AlternativeCandidate[];
  note?: string;
}

export interface TransferPlan {
  target: TransferTarget;
  entries: TransferEntry[];
  /** Required dependencies pulled in automatically (e.g. Fabric API). */
  dependencies: ResolvedFile[];
  stats: Record<TransferStatus, number>;
}

/** Search hit used by the Discover UI. */
export interface ContentHit {
  source: ContentSource;
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl?: string;
  downloads: number;
  follows: number;
  categories: string[];
  gameVersions: string[];
  updatedAt: string;
  pageUrl: string;
}
