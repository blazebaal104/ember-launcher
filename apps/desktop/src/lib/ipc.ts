/**
 * Typed bridge to the Rust core. When the UI runs in a plain browser (`npm run dev` without
 * Tauri) every call falls back to demo data, so the UI can be designed and screenshotted.
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ResolvedFile } from "@ember/content-engine";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type Loader = "vanilla" | "fabric" | "quilt" | "neoforge";
export type Channel = "release" | "release-candidate" | "pre-release" | "snapshot";

export interface GameVersion {
  id: string;
  channel: Channel;
  releaseTime: string;
}

export interface Instance {
  id: string;
  name: string;
  gameVersion: string;
  loader: Loader;
  loaderVersion: string | null;
  memoryMb: number;
  jvmArgs: string[];
  javaPath?: string | null;
  performanceBundle: boolean;
  overlay: boolean;
  createdAt: string;
  lastPlayed: string | null;
  icon?: string | null;
  gameProfile?: string | null;
  profileEveryLaunch?: boolean;
  source?: { kind: string; projectId?: string; versionId?: string; title?: string } | null;
  favorite?: boolean;
  playMinutes?: number;
}

export interface InstancePatch {
  name?: string;
  memoryMb?: number;
  jvmArgs?: string[];
  javaPath?: string | null;
  gameProfile?: string | null;
  profileEveryLaunch?: boolean;
  icon?: string | null;
  favorite?: boolean;
}

export interface HookReport {
  hook: string;
  installed: string[];
  skipped: string[];
  warnings: string[];
}

export interface DeviceCode {
  user_code: string;
  verification_uri: string;
  message: string;
  expires_in: number;
}

export interface AccountSummary {
  username: string;
  uuid: string;
  skinUrl?: string | null;
}

export interface CreateInstanceReq {
  name: string;
  gameVersion: string;
  loader: Loader;
  performanceBundle: boolean;
  overlay: boolean;
  memoryMb?: number;
  gameProfile?: string | null;
  icon?: string | null;
}

export interface LauncherSettings {
  msaClientId?: string | null;
  defaultMemoryMb?: number | null;
  onLaunch?: "keep" | "minimize" | "close" | null;
  defaultJvmArgs?: string[] | null;
  ui?: unknown;
  onboarded?: boolean | null;
}

export interface SettingsView extends LauncherSettings {
  signInConfigured: boolean;
  usingBuildDefault: boolean;
}

export interface ContentFile {
  fileName: string;
  enabled: boolean;
  size: number;
  sha1: string;
  modified: number;
  name?: string | null;
  version?: string | null;
  description?: string | null;
  authors: string[];
  icon?: string | null;
  fromBundle: boolean;
}

export interface LevelInfo {
  name?: string | null;
  gameMode?: string | null;
  hardcore: boolean;
  cheats: boolean;
  difficulty?: string | null;
  version?: string | null;
  seed?: string | null;
  days?: number | null;
  lastPlayed?: number | null;
}

export type PackCategory = "mods" | "resourcepacks" | "datapacks" | "shaders";

export interface PackItem {
  projectId: string;
  slug: string;
  title: string;
  iconUrl?: string | null;
  category: PackCategory;
}

/** A reusable, version-independent bundle of content. Resolved per instance when applied. */
export interface WorldPack {
  id: string;
  name: string;
  description: string;
  items: PackItem[];
  /** Iris settings for the pack's shader. */
  shaderConfig?: string | null;
  gameProfile?: string | null;
  created: number;
}

export interface Activation {
  resourcePacks: string[];
  shader?: string | null;
  shaderConfig?: string | null;
}

export interface World {
  folder: string;
  modified: number;
  sizeMb: number;
  icon?: string | null;
  info?: LevelInfo;
}

export interface Screenshot {
  fileName: string;
  path: string;
  modified: number;
}

export interface Favorite {
  source: "modrinth" | "curseforge";
  id: string;
  slug: string;
  title: string;
  iconUrl?: string | null;
  category: string;
  description?: string | null;
  addedAt?: number;
}

export interface GameProfile {
  id: string;
  name: string;
  options: Record<string, string>;
  keybinds: Record<string, string>;
}

export interface ProfileStore {
  profiles: GameProfile[];
  defaultProfile?: string | null;
}

export type ServerKind = "vanilla" | "fabric" | "paper";

export interface ServerView {
  id: string;
  name: string;
  kind: ServerKind;
  gameVersion: string;
  memoryMb: number;
  port: number;
  eulaAccepted: boolean;
  createdAt: string;
  installed: boolean;
  running: boolean;
  uptimeSecs?: number | null;
  autoNetwork?: boolean;
  playit?: boolean;
  autoBackup?: boolean;
  restartOnCrash?: boolean;
  stopWhenEmptyMins?: number | null;
  pendingPregen?: number | null;
}

export interface ServerPatch {
  name?: string;
  memoryMb?: number;
  autoNetwork?: boolean;
  playit?: boolean;
  autoBackup?: boolean;
  restartOnCrash?: boolean;
  /** 0 = never */
  stopWhenEmptyMins?: number;
}

export interface Pregen {
  percent: number;
  chunks: number;
  eta?: string | null;
  rate?: number | null;
  state: "running" | "paused" | "done" | "cancelled";
}

export interface Backup {
  file: string;
  created: number;
  sizeMb: number;
  reason: string;
}

export interface ServerWorld {
  levelName: string;
  exists: boolean;
  sizeMb: number;
  info: LevelInfo;
  backups: Backup[];
  pendingPregen?: number | null;
}

export interface PlayerLists {
  ops: string[];
  whitelist: string[];
  banned: string[];
  whitelistOn: boolean;
}

export interface Addons {
  chunky: boolean;
  c2me: boolean;
  voxy: boolean;
}

export type ClaimStatus = "waitingForVisit" | "waitingForApproval" | "approved" | "rejected";

export interface PlayitTunnel {
  id: string;
  name?: string | null;
  localPort?: number | null;
  address?: string | null;
  active: boolean;
}

export interface UpdateInfo {
  tag: string;
  version: string;
  build: number;
  notes: string;
  publishedAt: string;
  installerUrl: string;
  installerName: string;
  size: number;
  pageUrl: string;
}

export interface ServerSample {
  t: number;
  cpu: number;
  memoryMb: number;
  players: number;
}

export interface ServerLive {
  ready: boolean;
  port: number;
  players: string[];
  samples: ServerSample[];
  lagWarnings: number;
  lastLag?: string | null;
  network: { checking: boolean; lanIp?: string | null; publicIp?: string | null; upnp: boolean; upnpError?: string | null; sharedIp: boolean };
  pregen?: Pregen | null;
  playit: { state: "off" | "starting" | "online" | "error"; address?: string | null; error?: string | null };
  stopping: boolean;
}

export interface CreateServerReq {
  name: string;
  kind: ServerKind;
  gameVersion: string;
  memoryMb?: number;
  port?: number;
  motd?: string;
  maxPlayers?: number;
  gamemode?: string;
  difficulty?: string;
  seed?: string;
  pregenRadius?: number;
}

export interface PackRequest {
  url: string;
  sha1?: string;
  name?: string;
  icon?: string;
  projectId?: string;
  versionId?: string;
  gameProfile?: string | null;
}

export interface SystemInfo {
  totalMemoryMb: number;
  cpuThreads: number;
  os: string;
}

/** Errors from Rust arrive as `{ code, message }`. `String(err)` gives the message. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
  override toString() {
    return this.message;
  }
}

const toApiError = (e: unknown) =>
  e && typeof e === "object" && "code" in e && "message" in e ? new ApiError(String(e.code), String(e.message)) : new ApiError("other", String(e));

export const errorCode = (e: unknown) => (e instanceof ApiError ? e.code : "other");

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  try {
    return inTauri ? await invoke<T>(cmd, args) : ((await demo(cmd, args)) as T);
  } catch (e) {
    throw toApiError(e);
  }
};

const fileJob = (f: ResolvedFile) => ({ url: f.url, fileName: f.fileName, sha1: f.sha1, size: f.size });

export const api = {
  listVersions: () => call<GameVersion[]>("list_versions"),
  listInstances: () => call<Instance[]>("list_instances"),
  createInstance: (req: CreateInstanceReq) => call<{ instance: Instance; reports: HookReport[] }>("create_instance", { req }),
  updateInstance: (id: string, patch: InstancePatch) => call<Instance>("update_instance", { id, patch }),
  deleteInstance: (id: string) => call<void>("delete_instance", { id }),
  openFolder: (id: string, sub?: string) => call<void>("open_instance_folder", { id, sub }),
  systemInfo: () => call<SystemInfo>("system_info"),

  getSettings: () => call<SettingsView>("get_settings"),
  saveSettings: (settings: LauncherSettings) => call<SettingsView>("save_settings", { settings }),

  loginStart: () => call<DeviceCode>("login_start"),
  loginCancel: () => call<void>("login_cancel"),
  loginFinish: () => call<AccountSummary>("login_finish"),
  currentAccount: () => call<AccountSummary | null>("current_account"),
  logout: () => call<void>("logout"),

  launch: (id: string, server?: string, world?: string) => call<void>("launch_instance", { id, server, world }),
  stop: (id: string) => call<void>("stop_instance", { id }),

  installFiles: (instanceId: string, files: ResolvedFile[], dir = "mods") =>
    call<number>("install_files", { instanceId, files: files.filter((f) => f.url).map((f) => ({ ...fileJob(f), dir })) }),
  listContent: (instanceId: string, dir: string) => call<ContentFile[]>("list_content", { instanceId, dir }),
  setContentEnabled: (instanceId: string, dir: string, file: string, enabled: boolean) => call<string>("set_content_enabled", { instanceId, dir, file, enabled }),
  deleteContent: (instanceId: string, dir: string, file: string) => call<void>("delete_content", { instanceId, dir, file }),
  importContent: (instanceId: string, dir: string, paths: string[]) => call<number>("import_content", { instanceId, dir, paths }),
  listWorlds: (instanceId: string) => call<World[]>("list_worlds", { instanceId }),
  listScreenshots: (instanceId: string) => call<Screenshot[]>("list_screenshots", { instanceId }),

  favorites: () => call<Favorite[]>("favorites_list"),
  toggleFavorite: (favorite: Favorite) => call<Favorite[]>("favorites_toggle", { favorite }),

  profiles: () => call<ProfileStore>("profiles_get"),
  saveProfile: (profile: GameProfile) => call<ProfileStore>("profile_save", { profile }),
  deleteProfile: (id: string) => call<ProfileStore>("profile_delete", { id }),
  setDefaultProfile: (id: string | null) => call<ProfileStore>("profile_set_default", { id }),
  profileFromInstance: (instanceId: string, name: string) => call<ProfileStore>("profile_from_instance", { instanceId, name }),

  installModpack: (req: PackRequest) => call<{ instance: Instance; files: number; overrides: number; skipped: string[] }>("install_modpack", { req }),

  servers: () => call<ServerView[]>("server_list"),
  createServer: (req: CreateServerReq) => call<ServerView>("server_create", { req }),
  deleteServer: (id: string) => call<void>("server_delete", { id }),
  acceptEula: (id: string) => call<ServerView>("server_accept_eula", { id }),
  startServer: (id: string) => call<void>("server_start", { id }),
  stopServer: (id: string) => call<void>("server_stop", { id }),
  serverLive: (id: string) => call<ServerLive | null>("server_live", { id }),
  serverContent: (id: string) => call<ContentFile[]>("server_content", { id }),
  setServerContentEnabled: (id: string, file: string, enabled: boolean) => call<string>("server_content_enabled", { id, file, enabled }),
  deleteServerContent: (id: string, file: string) => call<void>("server_content_delete", { id, file }),
  restartServer: (id: string) => call<void>("server_restart", { id }),
  updateServer: (id: string, patch: ServerPatch) => call<ServerView>("server_update", { id, patch }),
  serverWorld: (id: string) => call<ServerWorld>("server_world", { id }),
  backupServer: (id: string) => call<Backup | null>("server_backup", { id }),
  restoreBackup: (id: string, file: string) => call<void>("server_restore", { id, file }),
  deleteBackup: (id: string, file: string) => call<void>("server_delete_backup", { id, file }),
  resetWorld: (id: string) => call<void>("server_reset_world", { id }),
  importWorld: (id: string, instanceId: string, folder: string) => call<void>("server_import_world", { id, instanceId, folder }),
  openBackups: (id: string) => call<void>("server_open_backups", { id }),
  serverPlayers: (id: string) => call<PlayerLists>("server_players", { id }),
  pregen: (id: string, action: "start" | "pause" | "continue" | "cancel", radius?: number) => call<"started" | "queued" | "restart" | "ok">("server_pregen", { id, action, radius }),
  serverAddons: (id: string) => call<Addons>("server_addons", { id }),
  setServerAddon: (id: string, addon: keyof Addons, enabled: boolean) => call<boolean>("server_set_addon", { id, addon, enabled }),
  playitStatus: () => call<{ connected: boolean; bundled: boolean }>("playit_status"),
  playitClaimStart: () => call<{ code: string; url: string }>("playit_claim_start"),
  playitClaimPoll: (code: string) => call<ClaimStatus>("playit_claim_poll", { code }),
  playitDisconnect: () => call<void>("playit_disconnect"),
  playitTunnel: (id: string) => call<PlayitTunnel | null>("playit_tunnel", { id }),
  appVersion: () => call<{ version: string; build: number }>("app_version"),
  checkUpdate: () => call<UpdateInfo | null>("app_update_check"),
  installUpdate: (tag: string) => call<void>("app_update_install", { tag }),
  serverCommand: (id: string, command: string) => call<void>("server_command", { id, command }),
  serverProperties: (id: string) => call<Record<string, string>>("server_properties", { id }),
  setServerProperties: (id: string, changes: Record<string, string>) => call<Record<string, string>>("server_set_properties", { id, changes }),
  serverInstallFiles: (id: string, files: ResolvedFile[]) => call<number>("server_install_files", { id, files: files.filter((f) => f.url).map(fileJob) }),
  openServerFolder: (id: string) => call<void>("server_open_folder", { id }),
  networkInfo: () => call<{ lanIp?: string | null }>("network_info"),

  worldPacks: () => call<WorldPack[]>("world_packs_list"),
  saveWorldPacks: (packs: WorldPack[]) => call<void>("world_packs_save", { packs }),
  activatePacks: (instanceId: string, activation: Activation) => call<void>("world_pack_activate", { instanceId, activation }),
  shaderState: (instanceId: string) => call<{ shader?: string | null; config?: string | null }>("instance_shader_state", { instanceId }),

  curseforge: (method: "GET" | "POST", path: string, body?: unknown) => call<unknown>("curseforge_request", { method, path, body }),
};

export const fileSrc = (path: string) => (inTauri ? convertFileSrc(path) : path);

export function onEvent<T>(name: string, cb: (payload: T) => void): Promise<UnlistenFn> {
  if (!inTauri) return Promise.resolve(() => {});
  return listen<T>(name, (e) => cb(e.payload));
}

// ------------------------------------------------------------------ demo data (browser only)

const days = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
const demoInstances: Instance[] = [
  { id: "survival", name: "Copper Age Survival", gameVersion: "26.3", loader: "fabric", loaderVersion: "0.20.1", memoryMb: 4096, jvmArgs: [], performanceBundle: true, overlay: true, createdAt: days(40), lastPlayed: days(0.2), playMinutes: 1874, favorite: true, gameProfile: "default" },
  { id: "pvp", name: "PvP Practice", gameVersion: "1.21.11", loader: "fabric", loaderVersion: "0.20.1", memoryMb: 3072, jvmArgs: [], performanceBundle: true, overlay: true, createdAt: days(90), lastPlayed: days(3), playMinutes: 412 },
  { id: "create", name: "Create: Above & Beyond", gameVersion: "1.21.1", loader: "neoforge", loaderVersion: "21.1.77", memoryMb: 8192, jvmArgs: [], performanceBundle: false, overlay: false, createdAt: days(120), lastPlayed: days(11), playMinutes: 2290, source: { kind: "modrinth-pack", title: "Create: Above & Beyond" } },
  { id: "snap", name: "Snapshot Testing", gameVersion: "26.4-snapshot-7", loader: "vanilla", loaderVersion: null, memoryMb: 4096, jvmArgs: [], performanceBundle: true, overlay: true, createdAt: days(2), lastPlayed: null },
];
const demoSettings: LauncherSettings = { msaClientId: null, onLaunch: "keep", ui: undefined, onboarded: typeof location !== "undefined" && !location.search.includes("tour") };
let demoFavorites: Favorite[] = [];
let demoPacks: WorldPack[] = [
  {
    id: "cozy",
    name: "Cozy survival",
    description: "Prettier visuals and small quality-of-life touches for a relaxed playthrough.",
    created: Date.now() - 864e5 * 3,
    shaderConfig: "SHADOW_QUALITY=1.0\n",
    items: [
      { projectId: "AANobbMI", slug: "sodium", title: "Sodium", category: "mods", iconUrl: "https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp" },
      { projectId: "YL57xq9U", slug: "iris", title: "Iris Shaders", category: "mods" },
      { projectId: "R6NEzAwj", slug: "complementary-reimagined", title: "Complementary Shaders - Reimagined", category: "shaders" },
      { projectId: "BVzZfTc1", slug: "fresh-animations", title: "Fresh Animations", category: "resourcepacks" },
      { projectId: "terralith", slug: "terralith", title: "Terralith", category: "datapacks" },
    ],
  },
];
let demoProfiles: ProfileStore = {
  defaultProfile: "default",
  profiles: [{ id: "default", name: "My settings", options: { fov: "0.25", renderDistance: "12", guiScale: "0", maxFps: "260", mouseSensitivity: "0.5", autoJump: "false" }, keybinds: { "key.sprint": "key.keyboard.left.control" } }],
};
const demoServers: ServerView[] = [
  { id: "friends", name: "Friends SMP", kind: "fabric", gameVersion: "26.3", memoryMb: 4096, port: 25565, eulaAccepted: true, createdAt: days(5), installed: true, running: true, uptimeSecs: 1260 },
];

async function demo(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 90));
  const a = (args ?? {}) as Record<string, any>;
  switch (cmd) {
    case "list_versions":
      return [
        ["26.4-snapshot-7", "snapshot", 3], ["26.3", "release", 20], ["26.3-rc-3", "release-candidate", 24], ["26.3-pre-3", "pre-release", 30],
        ["26.2", "release", 120], ["26.1.2", "release", 190], ["26.1", "release", 230], ["1.21.11", "release", 330], ["1.21.4", "release", 700], ["1.21.1", "release", 800], ["1.21", "release", 870],
      ].map(([id, channel, d]) => ({ id, channel, releaseTime: days(Number(d)) }));
    case "list_instances":
      return [...demoInstances];
    case "create_instance": {
      const req = a.req as CreateInstanceReq;
      const instance: Instance = { id: `demo-${Date.now()}`, ...req, jvmArgs: [], loader: req.loader === "vanilla" && req.performanceBundle ? "fabric" : req.loader, loaderVersion: "0.20.1", memoryMb: req.memoryMb ?? 4096, createdAt: new Date().toISOString(), lastPlayed: null };
      demoInstances.unshift(instance);
      return { instance, reports: [{ hook: "performance-bundle", installed: ["sodium", "lithium", "ferrite-core", "immediatelyfast", "entityculling", "modernfix", "dynamic-fps", "fabric-api", "ember-overlay"], skipped: [], warnings: [] }] };
    }
    case "update_instance": {
      const i = demoInstances.find((x) => x.id === a.id)!;
      Object.assign(i, a.patch);
      return i;
    }
    case "delete_instance": {
      const idx = demoInstances.findIndex((x) => x.id === a.id);
      if (idx >= 0) demoInstances.splice(idx, 1);
      return undefined;
    }
    case "system_info":
      return { totalMemoryMb: 32768, cpuThreads: 16, os: "windows" };
    case "current_account":
      return { username: "Steve", uuid: "demo" };
    case "get_settings":
      return { ...demoSettings, signInConfigured: !!demoSettings.msaClientId, usingBuildDefault: false };
    case "save_settings":
      Object.assign(demoSettings, a.settings);
      return { ...demoSettings, signInConfigured: !!demoSettings.msaClientId, usingBuildDefault: false };
    case "login_start":
      return { user_code: "B7QK-M2XD", verification_uri: "https://microsoft.com/link", message: "", expires_in: 900 };
    case "login_finish":
      await new Promise((r) => setTimeout(r, 1500));
      throw { code: "app_not_approved", message: "Mojang hasn't approved this Azure app for Minecraft sign-in yet." };
    case "list_content":
      return a.dir === "mods"
        ? [
            { fileName: "sodium-fabric-0.7.2+mc26.3.jar", enabled: true, size: 1_200_000, sha1: "a", modified: 0, name: "Sodium", version: "0.7.2", description: "The fastest rendering optimization mod for Minecraft.", authors: ["CaffeineMC"], fromBundle: true },
            { fileName: "lithium-fabric-0.16.jar", enabled: true, size: 800_000, sha1: "b", modified: 0, name: "Lithium", version: "0.16.0", description: "No-compromises game logic optimization.", authors: ["CaffeineMC"], fromBundle: true },
            { fileName: "xaeros-minimap.jar", enabled: true, size: 2_400_000, sha1: "c", modified: 0, name: "Xaero's Minimap", version: "25.2", description: "Displays your position, nearby terrain and waypoints.", authors: ["xaero96"], fromBundle: false },
            { fileName: "appleskin.jar.disabled", enabled: false, size: 90_000, sha1: "d", modified: 0, name: "AppleSkin", version: "3.0", description: "Food and hunger HUD information.", authors: ["squeek502"], fromBundle: false },
          ]
        : [];
    case "list_worlds":
      return [
        { folder: "New World", modified: Date.now() / 1000 - 3600, sizeMb: 48.2, info: { name: "New World", gameMode: "survival", hardcore: false, cheats: false, difficulty: "normal", version: "26.3", seed: "-4172144997902289642", days: 38 } },
        { folder: "Creative build", modified: Date.now() / 1000 - 86400 * 4, sizeMb: 12.7, info: { name: "Creative build", gameMode: "creative", hardcore: false, cheats: true, difficulty: "peaceful", version: "26.3", seed: "12345", days: 4 } },
      ];
    case "list_screenshots":
      return [];
    case "favorites_list":
      return demoFavorites;
    case "favorites_toggle": {
      const f = a.favorite as Favorite;
      demoFavorites = demoFavorites.some((x) => x.id === f.id) ? demoFavorites.filter((x) => x.id !== f.id) : [f, ...demoFavorites];
      return demoFavorites;
    }
    case "profiles_get":
      return demoProfiles;
    case "profile_save": {
      const p = { ...(a.profile as GameProfile) };
      if (!p.id) p.id = Math.random().toString(36).slice(2, 10);
      demoProfiles = { ...demoProfiles, profiles: [...demoProfiles.profiles.filter((x) => x.id !== p.id), p] };
      return demoProfiles;
    }
    case "profile_delete":
      demoProfiles = { ...demoProfiles, profiles: demoProfiles.profiles.filter((x) => x.id !== a.id) };
      return demoProfiles;
    case "profile_set_default":
      demoProfiles = { ...demoProfiles, defaultProfile: a.id };
      return demoProfiles;
    case "server_list":
      return demoServers;
    case "server_create": {
      const s: ServerView = { id: `srv-${Date.now()}`, ...(a.req as CreateServerReq), memoryMb: 4096, port: 25565, eulaAccepted: false, createdAt: new Date().toISOString(), installed: false, running: false };
      demoServers.unshift(s);
      return s;
    }
    case "server_accept_eula": {
      const s = demoServers.find((x) => x.id === a.id)!;
      s.eulaAccepted = true;
      return s;
    }
    case "server_live": {
      const n = 90;
      const now = Date.now() / 2000;
      return {
        ready: true,
        port: 25565,
        players: ["Alex", "Steve", "Sunny"],
        lagWarnings: 1,
        lastLag: "Can't keep up! Is the server overloaded? Running 2140ms or 42 ticks behind",
        network: { checking: false, lanIp: "192.168.1.42", publicIp: "81.2.69.160", upnp: false, upnpError: "no UPnP router found", sharedIp: false },
        pregen: { percent: 41.7, chunks: 162890, eta: "0:21:08", rate: 128.4, state: "running" },
        playit: { state: "online", address: "bright-fox.joinmc.link" },
        stopping: false,
        samples: Array.from({ length: n }, (_, i) => ({ t: i * 2, cpu: 18 + 9 * Math.sin((i + now) / 6) + (i % 7) * 1.3, memoryMb: 1900 + i * 8 + 120 * Math.sin(i / 9), players: i < 20 ? 1 : i < 55 ? 2 : 3 })),
      };
    }
    case "server_restart":
    case "server_command":
    case "server_stop":
    case "server_start":
    case "server_delete_backup":
    case "server_restore":
    case "server_reset_world":
    case "server_import_world":
    case "server_open_backups":
    case "playit_disconnect":
    case "app_update_install":
      return undefined;
    case "server_update": {
      const s = demoServers.find((x) => x.id === a.id)!;
      Object.assign(s, a.patch);
      return s;
    }
    case "server_world":
      return {
        levelName: "world",
        exists: true,
        sizeMb: 812.4,
        pendingPregen: null,
        info: { name: "world", gameMode: "survival", hardcore: false, cheats: false, difficulty: "normal", version: "26.3", seed: "8812347718", days: 112 },
        backups: [
          { file: "2026-11-10_09-12-03_auto.zip", created: Date.now() / 1000 - 3600 * 4, sizeMb: 402.1, reason: "auto" },
          { file: "2026-11-09_21-40-11_manual.zip", created: Date.now() / 1000 - 3600 * 16, sizeMb: 398.7, reason: "manual" },
          { file: "2026-11-09_13-20-55_before-c2me.zip", created: Date.now() / 1000 - 3600 * 24, sizeMb: 120.2, reason: "before-c2me" },
        ],
      };
    case "server_backup":
      return { file: "now_manual.zip", created: Date.now() / 1000, sizeMb: 410, reason: "manual" };
    case "server_players":
      return { ops: ["Steve"], whitelist: ["Steve", "Alex", "Sunny"], banned: [], whitelistOn: false };
    case "server_pregen":
      return "started";
    case "server_content":
      return [
        { fileName: "lithium-fabric-0.16.0.jar", name: "Lithium", version: "0.16.0", description: "No-compromises game logic optimization.", enabled: true, fromBundle: false, sha1: "", authors: [], size: 812000, modified: 0 },
        { fileName: "chunky-fabric-1.4.40.jar", name: "Chunky", version: "1.4.40", description: "Pre-generates chunks, quickly and efficiently.", enabled: true, fromBundle: false, sha1: "", authors: [], size: 420000, modified: 0 },
      ];
    case "server_content_enabled":
    case "server_content_delete":
      return a.file;
    case "server_addons":
      return { chunky: true, c2me: true, voxy: false };
    case "server_set_addon":
      return true;
    case "playit_status":
      return { connected: false, bundled: true };
    case "playit_claim_start":
      return { code: "a1b2c3d4e5", url: "https://playit.gg/claim/a1b2c3d4e5" };
    case "playit_claim_poll":
      return "approved";
    case "playit_tunnel":
      return { id: "t1", name: "ember-friends", localPort: 25565, address: "bright-fox.joinmc.link", active: true };
    case "app_version":
      return { version: "0.3.0", build: 6 };
    case "app_update_check":
      return new URLSearchParams(location.search).has("update")
        ? { tag: "v0.4.0-build7", version: "0.4.0", build: 7, publishedAt: new Date().toISOString(), installerUrl: "", installerName: "Ember.Launcher_0.4.0_x64-setup.exe", size: 9.8e6, pageUrl: "https://github.com/blazebaal104/ember-launcher/releases", notes: "### Servers, redesigned\n- New **Invite friends** panel with one-click playit.gg\n- Restart button, backups, pre-generation\n\n### Updates\n- Ember now updates itself from here" }
        : null;
    case "server_properties":
      return { motd: "Friends SMP", "max-players": "10", difficulty: "normal", gamemode: "survival", "online-mode": "true", "server-port": "25565", pvp: "true", "view-distance": "10" };
    case "network_info":
      return { lanIp: "192.168.1.42" };
    case "install_files":
    case "server_install_files":
      return (a.files as unknown[]).length;
    case "world_packs_list":
      return demoPacks;
    case "world_packs_save":
      demoPacks = a.packs as WorldPack[];
      return undefined;
    case "world_pack_activate":
      return undefined;
    case "instance_shader_state":
      return { shader: "ComplementaryReimagined_r5.4.zip", config: "SHADOW_QUALITY=1.0\n" };
    case "install_modpack":
      throw { code: "other", message: "Modpack installs need the desktop app." };
    case "curseforge_request":
      throw { code: "other", message: "CurseForge isn't available in browser demo mode" };
    default:
      return undefined;
  }
}
