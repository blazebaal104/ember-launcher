/**
 * One place that knows how to install each kind of content:
 *  mods → instance/mods (+ required dependencies)
 *  resource packs → instance/resourcepacks
 *  shaders → instance/shaderpacks (+ Iris automatically, shaders need it)
 *  data packs → a chosen world's datapacks folder
 *  modpacks → a brand-new instance
 *  plugins → a Paper server's plugins folder
 */
import type { ContentCategory, ResolvedFile } from "@ember/content-engine";
import { mrToResolved, pickBestVersion } from "@ember/content-engine";
import { modrinth, transferEngine } from "./clients";
import { api, type Instance, type ServerView } from "./ipc";
import { PLUGIN_LOADERS } from "@ember/content-engine";

export interface InstallTarget {
  instance?: Instance;
  server?: ServerView;
  world?: string;
}

export interface ProjectLike {
  id: string;
  slug: string;
  title: string;
  iconUrl?: string;
}

const loadersFor = (i: Instance) => (i.loader === "quilt" ? ["quilt", "fabric"] : i.loader === "vanilla" ? undefined : [i.loader]);

/** Install a project; returns a human summary. Throws with a readable message. */
export async function installProject(category: ContentCategory, project: ProjectLike, target: InstallTarget): Promise<string> {
  if (category === "modpacks") {
    const best = pickBestVersion(await modrinth.projectVersions(project.id));
    if (!best) throw new Error("This modpack has no downloadable release yet.");
    const file = best.files.find((f) => f.primary) ?? best.files[0]!;
    const res = await api.installModpack({ url: file.url, sha1: file.hashes.sha1, name: project.title, icon: project.iconUrl, projectId: project.id, versionId: best.id });
    return `Created “${res.instance.name}” with ${res.files} files.`;
  }

  if (category === "plugins") {
    const server = target.server;
    if (!server) throw new Error("Pick a server to install this plugin on.");
    const loaders = server.kind === "paper" ? PLUGIN_LOADERS : ["fabric"];
    const best = pickBestVersion(await modrinth.projectVersions(project.id, loaders, [server.gameVersion]));
    if (!best) throw new Error(`No build for ${server.kind === "paper" ? "Paper" : "Fabric"} ${server.gameVersion}.`);
    await api.serverInstallFiles(server.id, [mrToResolved(best, project.title, project.slug)]);
    return `Installed on ${server.name}. Restart the server to load it.`;
  }

  const inst = target.instance;
  if (!inst) throw new Error("Pick an instance first.");
  const loaders = category === "mods" ? loadersFor(inst) : undefined;
  const best = pickBestVersion(await modrinth.projectVersions(project.id, loaders, [inst.gameVersion]));
  if (!best) throw new Error(`No build of ${project.title} for Minecraft ${inst.gameVersion}${category === "mods" ? ` (${inst.loader})` : ""}.`);
  const file = mrToResolved(best, project.title, project.slug);

  if (category === "datapacks") {
    if (!target.world) throw new Error("Pick a world for this data pack.");
    await api.installFiles(inst.id, [file], `world:${target.world}`);
    return `Added to the world “${target.world}”.`;
  }

  const dir = category === "mods" ? "mods" : category === "shaders" ? "shaderpacks" : "resourcepacks";
  const files: ResolvedFile[] = [file];
  if (category === "mods") {
    const deps = await transferEngine(() => {}).resolveDependencies([file], { gameVersion: inst.gameVersion, loader: inst.loader === "vanilla" ? "fabric" : inst.loader });
    files.push(...deps);
  }
  await api.installFiles(inst.id, files.filter((f) => f.url), dir);

  let extra = "";
  if (category === "shaders") extra = await ensureIris(inst);
  if (category === "mods" && files.length > 1) extra = ` Also added ${files.slice(1).map((f) => f.projectName).join(", ")}.`;
  return `Installed into ${inst.name}.${extra}`;
}

/** Shader packs need Iris (Fabric/Quilt/NeoForge). Add it if the instance doesn't have it. */
async function ensureIris(inst: Instance): Promise<string> {
  if (inst.loader === "vanilla") return " Note: shaders need a mod loader; this instance is vanilla.";
  const mods = await api.listContent(inst.id, "mods").catch(() => []);
  if (mods.some((m) => /iris|oculus/i.test(`${m.name ?? ""} ${m.fileName}`))) return "";
  const best = pickBestVersion(await modrinth.projectVersions("iris", loadersFor(inst), [inst.gameVersion]));
  if (!best) return " Iris (needed for shaders) has no build for this version yet.";
  const iris = mrToResolved(best, "Iris Shaders", "iris");
  const deps = await transferEngine(() => {}).resolveDependencies([iris], { gameVersion: inst.gameVersion, loader: inst.loader });
  await api.installFiles(inst.id, [iris, ...deps], "mods");
  return " Iris was added too, so the shader works. Pick it in Options → Video → Shader Packs.";
}

/** Which instances can take this category at all. */
export function compatibleInstances(category: ContentCategory, instances: Instance[]): Instance[] {
  if (category === "mods" || category === "shaders") return instances.filter((i) => i.loader !== "vanilla");
  return instances;
}
