/**
 * Typed bridge to the Rust core. When the UI runs in a plain browser (`npm run dev`
 * without Tauri) every call falls back to demo data, so designers can work on the UI.
 */
import { invoke } from "@tauri-apps/api/core";
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
  performanceBundle: boolean;
  overlay: boolean;
  createdAt: string;
  lastPlayed: string | null;
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
}

export interface LauncherSettings {
  msaClientId?: string | null;
  defaultMemoryMb?: number | null;
}

export interface SettingsView extends LauncherSettings {
  signInConfigured: boolean;
  usingBuildDefault: boolean;
}

/** Errors from Rust arrive as `{ code, message }`. `String(err)` gives the message. */
export class ApiError extends Error {
  constructor(public readonly code: string, message: string) {
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

export const api = {
  listVersions: () => call<GameVersion[]>("list_versions"),
  listInstances: () => call<Instance[]>("list_instances"),
  createInstance: (req: CreateInstanceReq) => call<{ instance: Instance; reports: HookReport[] }>("create_instance", { req }),
  deleteInstance: (id: string) => call<void>("delete_instance", { id }),
  openFolder: (id: string, sub?: string) => call<void>("open_instance_folder", { id, sub }),
  getSettings: () => call<SettingsView>("get_settings"),
  saveSettings: (settings: LauncherSettings) => call<SettingsView>("save_settings", { settings }),
  loginStart: () => call<DeviceCode>("login_start"),
  loginCancel: () => call<void>("login_cancel"),
  loginFinish: () => call<AccountSummary>("login_finish"),
  currentAccount: () => call<AccountSummary | null>("current_account"),
  logout: () => call<void>("logout"),
  launch: (id: string, server?: string) => call<void>("launch_instance", { id, server }),
  installFiles: (instanceId: string, files: ResolvedFile[], dir = "mods") =>
    call<number>("install_files", {
      instanceId,
      files: files.filter((f) => f.url).map((f) => ({ url: f.url, fileName: f.fileName, sha1: f.sha1, size: f.size, dir })),
    }),
  curseforge: (method: "GET" | "POST", path: string, body?: unknown) => call<unknown>("curseforge_request", { method, path, body }),
};

export function onEvent<T>(name: string, cb: (payload: T) => void): Promise<UnlistenFn> {
  if (!inTauri) return Promise.resolve(() => {});
  return listen<T>(name, (e) => cb(e.payload));
}

// ------------------------------------------------------------------ demo data (browser only)

const days = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
const demoInstances: Instance[] = [
  { id: "survival-9f2c1a", name: "Copper Age Survival", gameVersion: "26.2", loader: "fabric", loaderVersion: "0.17.2", memoryMb: 4096, performanceBundle: true, overlay: true, createdAt: days(40), lastPlayed: days(0.2) },
  { id: "pvp-31aa0e", name: "PvP Practice", gameVersion: "1.21.11", loader: "fabric", loaderVersion: "0.17.2", memoryMb: 3072, performanceBundle: true, overlay: true, createdAt: days(90), lastPlayed: days(3) },
  { id: "create-77b0d2", name: "Create: Above & Beyond", gameVersion: "1.21.1", loader: "neoforge", loaderVersion: "21.1.77", memoryMb: 8192, performanceBundle: true, overlay: false, createdAt: days(120), lastPlayed: days(11) },
  { id: "snap-0c4e9b", name: "Snapshot Testing", gameVersion: "26.3-snapshot-9", loader: "vanilla", loaderVersion: null, memoryMb: 4096, performanceBundle: true, overlay: true, createdAt: days(2), lastPlayed: null },
];

const demoSettings: LauncherSettings = { msaClientId: null };

async function demo(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120));
  switch (cmd) {
    case "list_versions":
      return [
        { id: "26.3-snapshot-9", channel: "snapshot", releaseTime: days(80) },
        { id: "26.2", channel: "release", releaseTime: days(130) },
        { id: "26.2-rc-1", channel: "release-candidate", releaseTime: days(136) },
        { id: "26.2-pre-3", channel: "pre-release", releaseTime: days(140) },
        { id: "26.1.2", channel: "release", releaseTime: days(190) },
        { id: "26.1", channel: "release", releaseTime: days(230) },
        { id: "1.21.11", channel: "release", releaseTime: days(330) },
        { id: "1.21.4", channel: "release", releaseTime: days(700) },
        { id: "1.21.1", channel: "release", releaseTime: days(800) },
        { id: "1.21", channel: "release", releaseTime: days(870) },
      ];
    case "list_instances":
      return demoInstances;
    case "create_instance": {
      const req = args!.req as CreateInstanceReq;
      const instance: Instance = { id: `demo-${Date.now()}`, ...req, loader: req.loader === "vanilla" && req.performanceBundle ? "fabric" : req.loader, loaderVersion: "0.17.2", memoryMb: req.memoryMb ?? 4096, createdAt: new Date().toISOString(), lastPlayed: null };
      demoInstances.unshift(instance);
      return {
        instance,
        reports: [{ hook: "performance-bundle", installed: ["sodium", "lithium", "ferrite-core", "immediatelyfast", "entityculling", "modernfix", "dynamic-fps", "fabric-api"], skipped: ["krypton - no build for this version yet"], warnings: [] }],
      };
    }
    case "current_account":
      return demoSettings.msaClientId ? { username: "Steve", uuid: "demo" } : null;
    case "get_settings":
      return { ...demoSettings, signInConfigured: !!demoSettings.msaClientId, usingBuildDefault: false };
    case "save_settings":
      Object.assign(demoSettings, args!.settings);
      return { ...demoSettings, signInConfigured: !!demoSettings.msaClientId, usingBuildDefault: false };
    case "login_cancel":
      return undefined;
    case "login_start":
      return { user_code: "B7QK-M2XD", verification_uri: "https://microsoft.com/link", message: "", expires_in: 900 };
    case "login_finish":
      await new Promise((r) => setTimeout(r, 1500));
      throw { code: "app_not_approved", message: "Mojang hasn't approved this Azure app for Minecraft sign-in yet. Submit the review form (Settings has the link) and try again once you get the approval email." };
    case "install_files":
      return (args!.files as unknown[]).length;
    case "curseforge_request":
      throw new Error("CurseForge isn't available in browser demo mode");
    default:
      return undefined;
  }
}
