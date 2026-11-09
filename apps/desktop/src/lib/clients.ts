/**
 * Wires the content engine to the desktop runtime:
 *  - Modrinth goes through Tauri plugin-http (Rust reqwest), which may set the
 *    User-Agent Modrinth requires. In the browser demo it uses window.fetch.
 *  - CurseForge goes through the Rust `curseforge_request` proxy (API key stays in Rust).
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { CurseForgeClient, ModrinthClient, TransferEngine, type FetchLike, type TransferProgress } from "@ember/content-engine";
import { api, inTauri } from "./ipc";

const USER_AGENT = "ember-launcher/0.1.0 (+https://github.com/your-org/ember-launcher)";

const httpFetch: FetchLike = inTauri ? (tauriFetch as unknown as FetchLike) : (u, i) => window.fetch(u, i);

export const modrinth = new ModrinthClient(httpFetch, USER_AGENT);

/** A FetchLike that tunnels CurseForge calls through the Rust proxy. */
const curseforgeTransport: FetchLike = async (input, init) => {
  const url = new URL(input);
  try {
    const data = await api.curseforge((init?.method as "GET" | "POST") ?? "GET", url.pathname + url.search, init?.body ? JSON.parse(String(init.body)) : undefined);
    return new Response(JSON.stringify(data), { status: 200 });
  } catch (e) {
    const msg = String(e);
    return new Response(msg, { status: msg.startsWith("not found") ? 404 : 502 });
  }
};

export const curseforge = inTauri ? new CurseForgeClient(curseforgeTransport) : undefined;

export function transferEngine(onProgress: (p: TransferProgress) => void) {
  return new TransferEngine({ modrinth, curseforge, onProgress });
}
