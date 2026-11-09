/**
 * Offline inspection of uploaded content. Runs inside a Web Worker in the app
 * (pure CPU work: unzip + hash), and directly in Node for tests.
 *
 * Accepts:
 *   - individual .jar files
 *   - a .zip containing .jar files (any folder depth, e.g. an old `mods/` folder)
 *   - a Modrinth modpack (.mrpack -> modrinth.index.json carries hashes)
 *   - a CurseForge modpack zip (manifest.json carries projectID/fileID)
 */
import { strFromU8, unzipSync } from "fflate";
import { parse as parseToml } from "smol-toml";
import { curseforgeFingerprint, sha1, sha512 } from "./hashing";
import type { InspectedFile, Loader, ModMetadata } from "./types";

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

/** Ids that are platforms, not mods - never treat them as dependencies to migrate. */
const PLATFORM_IDS = new Set([
  "minecraft", "java", "fabricloader", "fabric-loader", "quilt_loader", "forge", "neoforge", "javafml",
]);

const METADATA_FILES = [
  "fabric.mod.json",
  "quilt.mod.json",
  "META-INF/neoforge.mods.toml",
  "META-INF/mods.toml",
] as const;

/** Expand archives into a flat list of jar files (or manifest references). */
export async function inspectUploads(files: UploadedFile[]): Promise<InspectedFile[]> {
  const out: InspectedFile[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".jar")) {
      out.push(await inspectJar(f.name, f.bytes));
    } else if (lower.endsWith(".zip") || lower.endsWith(".mrpack")) {
      out.push(...(await inspectArchive(f.bytes)));
    }
  }
  // De-duplicate identical files dropped twice.
  const seen = new Set<string>();
  return out.filter((f) => {
    const key = f.sha1 || `${f.manifestRef?.source}:${f.manifestRef?.projectId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function inspectArchive(bytes: Uint8Array): Promise<InspectedFile[]> {
  const entries = unzipSync(bytes);

  // Modrinth pack: hashes are in the index, jars are downloaded, not bundled.
  const mrIndex = entries["modrinth.index.json"];
  if (mrIndex) return fromModrinthIndex(JSON.parse(strFromU8(mrIndex)));

  // CurseForge pack: project/file ids in manifest.json.
  const cfManifest = entries["manifest.json"];
  if (cfManifest) {
    const manifest = JSON.parse(strFromU8(cfManifest));
    if (manifest?.manifestType === "minecraftModpack") return fromCurseForgeManifest(manifest);
  }

  // Plain zip of a mods folder.
  const jars: InspectedFile[] = [];
  for (const [path, data] of Object.entries(entries)) {
    if (!path.toLowerCase().endsWith(".jar")) continue;
    // Skip jar-in-jar libraries bundled inside other mods' folders.
    if (path.includes("META-INF/jars/")) continue;
    jars.push(await inspectJar(path.split("/").pop()!, data));
  }
  return jars;
}

interface MrIndex {
  files: Array<{ path: string; hashes: { sha1: string; sha512: string }; fileSize: number; downloads: string[] }>;
}

function fromModrinthIndex(index: MrIndex): InspectedFile[] {
  return index.files
    .filter((f) => f.path.startsWith("mods/"))
    .map((f) => ({
      fileName: f.path.slice("mods/".length),
      size: f.fileSize,
      sha1: f.hashes.sha1,
      sha512: f.hashes.sha512,
      cfFingerprint: 0,
      meta: null,
    }));
}

interface CfManifest {
  files: Array<{ projectID: number; fileID: number; required: boolean }>;
}

function fromCurseForgeManifest(m: CfManifest): InspectedFile[] {
  return m.files
    .filter((f) => f.required !== false)
    .map((f) => ({
      fileName: `curseforge-${f.projectID}-${f.fileID}.jar`,
      size: 0,
      sha1: "",
      sha512: "",
      cfFingerprint: 0,
      meta: null,
      manifestRef: { source: "curseforge", projectId: String(f.projectID), fileId: String(f.fileID) },
    }));
}

export async function inspectJar(fileName: string, bytes: Uint8Array): Promise<InspectedFile> {
  const [h1, h512] = await Promise.all([sha1(bytes), sha512(bytes)]);
  let meta: ModMetadata | null = null;
  try {
    const wanted = new Set<string>(METADATA_FILES);
    const entries = unzipSync(bytes, { filter: (f) => wanted.has(f.name) });
    meta = readMetadata(entries);
  } catch {
    // Not a valid zip / corrupted jar: still identifiable by hash.
  }
  return {
    fileName,
    size: bytes.length,
    sha1: h1,
    sha512: h512,
    cfFingerprint: curseforgeFingerprint(bytes),
    meta,
  };
}

export function readMetadata(entries: Record<string, Uint8Array>): ModMetadata | null {
  const fabric = entries["fabric.mod.json"];
  if (fabric) return parseFabric(JSON.parse(stripJsonComments(strFromU8(fabric))));

  const quilt = entries["quilt.mod.json"];
  if (quilt) return parseQuilt(JSON.parse(strFromU8(quilt)));

  const neo = entries["META-INF/neoforge.mods.toml"];
  if (neo) return parseModsToml(strFromU8(neo), "neoforge");

  const forge = entries["META-INF/mods.toml"];
  if (forge) return parseModsToml(strFromU8(forge), "forge");

  return null;
}

/** Some fabric.mod.json files contain // comments or trailing commas despite the spec. */
function stripJsonComments(s: string): string {
  return s
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
}

type Person = string | { name?: string };
const personName = (p: Person) => (typeof p === "string" ? p : p?.name ?? "");

function parseFabric(j: any): ModMetadata {
  const depends = Object.keys(j.depends ?? {}).filter((id) => !PLATFORM_IDS.has(id));
  const mc = j.depends?.minecraft;
  return {
    loader: "fabric",
    modId: String(j.id),
    name: String(j.name ?? j.id),
    version: String(j.version ?? ""),
    description: j.description,
    authors: (j.authors ?? []).map(personName).filter(Boolean),
    homepage: j.contact?.homepage,
    sources: j.contact?.sources,
    depends,
    minecraftConstraint: Array.isArray(mc) ? mc.join(" || ") : mc,
  };
}

function parseQuilt(j: any): ModMetadata {
  const ql = j.quilt_loader ?? {};
  const deps: any[] = ql.depends ?? [];
  const ids = deps.map((d) => (typeof d === "string" ? d : d.id)).filter(Boolean);
  const mc = deps.find((d) => (typeof d === "string" ? d : d.id) === "minecraft");
  return {
    loader: "quilt",
    modId: String(ql.id),
    name: String(ql.metadata?.name ?? ql.id),
    version: String(ql.version ?? ""),
    description: ql.metadata?.description,
    authors: Object.keys(ql.metadata?.contributors ?? {}),
    homepage: ql.metadata?.contact?.homepage,
    sources: ql.metadata?.contact?.sources,
    depends: ids.filter((id: string) => !PLATFORM_IDS.has(id)),
    minecraftConstraint: typeof mc === "object" ? String(mc.versions ?? "") : undefined,
  };
}

function parseModsToml(text: string, loader: Loader): ModMetadata | null {
  const t = parseToml(text) as any;
  const mod = t.mods?.[0];
  if (!mod) return null;
  const modId = String(mod.modId);
  const depList: any[] = t.dependencies?.[modId] ?? [];
  const required = depList.filter((d) =>
    d.mandatory === true || d.type === "required" || (d.type === undefined && d.mandatory === undefined),
  );
  const mc = depList.find((d) => d.modId === "minecraft");
  // ${file.jarVersion} placeholders are common; the real version is in the manifest.
  const version = String(mod.version ?? "");
  return {
    loader,
    modId,
    name: String(mod.displayName ?? modId),
    version: version.startsWith("${") ? "" : version,
    description: typeof mod.description === "string" ? mod.description.trim() : undefined,
    authors: typeof mod.authors === "string" ? mod.authors.split(/,\s*/) : [],
    homepage: mod.displayURL,
    depends: required.map((d) => String(d.modId)).filter((id) => !PLATFORM_IDS.has(id)),
    minecraftConstraint: mc?.versionRange,
  };
}
