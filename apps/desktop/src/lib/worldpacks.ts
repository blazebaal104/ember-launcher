/**
 * World packs: apply a saved, version-independent list of content to an instance.
 * Each item is resolved for the instance's exact game version + loader at apply time,
 * so one pack fits every version; items with no build for it are reported, not fatal.
 */
import type { ResolvedFile } from "@ember/content-engine";
import { mrToResolved, pickBestVersion } from "@ember/content-engine";
import { modrinth, transferEngine } from "./clients";
import { api, type Instance, type PackCategory, type PackItem, type WorldPack } from "./ipc";
import { ensureIris } from "./install";
import { isInstalled, loadInstalled } from "./queries";
import { tr } from "./i18n";

export interface ApplyReport {
  added: string[];
  alreadyThere: string[];
  missing: string[];
  notes: string[];
}

const DIR: Record<PackCategory, string> = { mods: "mods", resourcepacks: "resourcepacks", datapacks: "datapacks", shaders: "shaderpacks" };

function loadersFor(item: PackItem, inst: Instance): string[] | undefined {
  if (item.category === "mods") return inst.loader === "quilt" ? ["quilt", "fabric"] : [inst.loader];
  if (item.category === "datapacks") return ["datapack"];
  if (item.category === "resourcepacks") return ["minecraft"];
  return ["iris", "optifine"];
}

export async function applyWorldPack(pack: WorldPack, inst: Instance, onStep?: (done: number, total: number) => void): Promise<ApplyReport> {
  const report: ApplyReport = { added: [], alreadyThere: [], missing: [], notes: [] };
  const needsLoader = (c: PackCategory) => c === "mods" || c === "shaders";
  const items = pack.items.filter((i) => {
    if (needsLoader(i.category) && inst.loader === "vanilla") {
      report.missing.push(tr("{title} (needs a mod loader)", { title: i.title }));
      return false;
    }
    return true;
  });

  const installed = await loadInstalled(inst.id, ["mods", "resourcepacks", "shaderpacks", "datapacks"]);
  let done = 0;
  onStep?.(0, items.length);
  const resolved = await Promise.all(
    items.map(async (item) => {
      try {
        if (isInstalled(installed, { id: item.projectId, title: item.title })) {
          report.alreadyThere.push(item.title);
          return null;
        }
        const best = pickBestVersion(await modrinth.projectVersions(item.projectId, loadersFor(item, inst), [inst.gameVersion]));
        if (!best) {
          report.missing.push(tr("{title} (nothing for {gameVersion} yet)", { title: item.title, gameVersion: inst.gameVersion }));
          return null;
        }
        return { item, file: mrToResolved(best, item.title, item.slug) };
      } catch {
        report.missing.push(tr("{title} (couldn't reach Modrinth)", { title: item.title }));
        return null;
      } finally {
        onStep?.(++done, items.length);
      }
    }),
  );
  const ok = resolved.filter((r): r is { item: PackItem; file: ResolvedFile } => !!r);

  // Mods bring their required dependencies.
  const mods = ok.filter((r) => r.item.category === "mods").map((r) => r.file);
  if (mods.length) {
    const deps = await transferEngine(() => {}).resolveDependencies(mods, { gameVersion: inst.gameVersion, loader: inst.loader === "vanilla" ? "fabric" : inst.loader }).catch(() => []);
    mods.push(...deps);
    await api.installFiles(inst.id, mods, "mods");
  }
  for (const cat of ["resourcepacks", "datapacks", "shaders"] as PackCategory[]) {
    const files = ok.filter((r) => r.item.category === cat).map((r) => r.file);
    if (files.length) await api.installFiles(inst.id, files, DIR[cat]);
  }
  report.added.push(...ok.map((r) => r.item.title));

  // Switch on the new resource packs and the shader at next launch.
  const rps = ok.filter((r) => r.item.category === "resourcepacks").map((r) => r.file.fileName);
  const shader = ok.find((r) => r.item.category === "shaders")?.file.fileName;
  if (rps.length || shader) await api.activatePacks(inst.id, { resourcePacks: rps, shader, shaderConfig: shader ? pack.shaderConfig : null });
  if (ok.some((r) => r.item.category === "shaders")) {
    const n = (await ensureIris(inst)).trim();
    if (n) report.notes.push(n);
  }
  if (ok.some((r) => r.item.category === "datapacks")) report.notes.push(tr("Data packs are added to every world of this instance each time it starts."));
  return report;
}

/** Build a pack from what an instance has right now (its shader settings included). */
export async function packFromInstance(inst: Instance, name: string): Promise<WorldPack> {
  const dirs: Array<[string, PackCategory]> = [["mods", "mods"], ["resourcepacks", "resourcepacks"], ["datapacks", "datapacks"], ["shaderpacks", "shaders"]];
  const items: PackItem[] = [];
  const shader = await api.shaderState(inst.id).catch(() => ({ shader: null, config: null }));
  for (const [dir, category] of dirs) {
    const files = (await api.listContent(inst.id, dir).catch(() => [])).filter((f) => f.enabled && !f.fromBundle && !/^ember-overlay/i.test(f.fileName));
    const hashes = files.map((f) => f.sha1).filter(Boolean);
    if (!hashes.length) continue;
    const byHash = await modrinth.versionsFromHashes(hashes).catch(() => ({}) as Record<string, { project_id: string }>);
    const ids = [...new Set(Object.values(byHash).map((v) => v.project_id))];
    const projects = await Promise.all(ids.map((id) => modrinth.project(id).catch(() => null)));
    for (const p of projects) {
      if (p && !items.some((i) => i.projectId === p.id)) items.push({ projectId: p.id, slug: p.slug, title: p.title, iconUrl: p.icon_url ?? undefined, category });
    }
  }
  // Bundle libraries (Fabric API & co.) are added automatically anyway.
  const filtered = items.filter((i) => !["fabric-api", "cloth-config", "modmenu"].includes(i.slug));
  return {
    id: crypto.randomUUID(),
    name,
    description: tr("Made from “{name}” ({gameVersion}).", { name: inst.name, gameVersion: inst.gameVersion }),
    items: filtered,
    shaderConfig: shader.config ?? null,
    gameProfile: inst.gameProfile ?? null,
    created: Date.now(),
  };
}

export function summarise(r: ApplyReport) {
  const parts = [];
  if (r.added.length) parts.push(tr("Added {n}", { n: r.added.length }));
  if (r.alreadyThere.length) parts.push(tr("{n} already there", { n: r.alreadyThere.length }));
  if (r.missing.length) parts.push(tr("skipped {n}: {list}", { n: r.missing.length, list: r.missing.join(", ") }));
  return [parts.join(" · "), ...r.notes].filter(Boolean).join(". ");
}
