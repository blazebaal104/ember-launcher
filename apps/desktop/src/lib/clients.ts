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

const httpFetch: FetchLike = inTauri ? (tauriFetch as unknown as FetchLike) : demoFetch;

/** Browser preview only: use the real API when reachable, otherwise realistic sample data. */
async function demoFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await window.fetch(url, init);
    if (res.ok) return res;
  } catch {
    /* offline preview */
  }
  const path = new URL(url).pathname;
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const SAMPLE: Array<[string, string, string, number, number, string[]]> = [
    ["Sodium", "jellysquid3", "The fastest and most compatible rendering optimization mod for Minecraft.", 98e6, 31e3, ["optimization"]],
    ["Iris Shaders", "coderbot", "A modern shader pack loader compatible with existing OptiFine shader packs.", 71e6, 22e3, ["decoration", "optimization"]],
    ["Lithium", "jellysquid3", "No-compromises game logic optimization mod.", 54e6, 15e3, ["optimization"]],
    ["Xaero's Minimap", "xaero96", "Displays your position, nearby terrain, players, mobs and waypoints.", 40e6, 9e3, ["adventure", "utility"]],
    ["Zoomify", "isXander", "A zoom mod with infinite customizability.", 12e6, 4e3, ["utility"]],
    ["AppleSkin", "squeek502", "Adds food value information to tooltips and the HUD.", 33e6, 6e3, ["food", "utility"]],
    ["Fabulously Optimized", "robotkoer", "Improved performance and graphics, with a familiar feel.", 18e6, 7e3, ["optimization"]],
    ["Simple Voice Chat", "henkelmax", "Proximity voice chat for your server.", 24e6, 8e3, ["social"]],
    ["Complementary Shaders", "EminGT", "Beautiful, performant shaders with a vanilla feel.", 15e6, 5e3, ["shader"]],
  ];
  if (path.endsWith("/search")) {
    return json({
      total_hits: SAMPLE.length,
      offset: 0,
      limit: 24,
      hits: SAMPLE.map(([title, author, description, downloads, follows, categories], i) => ({
        project_id: `demo${i}`, slug: title.toLowerCase().replace(/[^a-z]+/g, "-"), title, author, description, downloads, follows, categories,
        versions: ["26.3"], icon_url: null, date_modified: new Date(Date.now() - (i + 1) * 864e5 * 3).toISOString(), project_type: "mod",
      })),
    });
  }
  const m = path.match(/\/project\/(demo\d+)$/);
  if (m) {
    const s = SAMPLE[Number(m[1]!.slice(4))]!;
    return json({ id: m[1], slug: s[0].toLowerCase(), title: s[0], description: s[2], categories: s[5], project_type: "mod", downloads: s[3], followers: s[4], updated: new Date().toISOString(), game_versions: ["26.3"], loaders: ["fabric"], icon_url: null, client_side: "required", server_side: "optional", license: { id: "LGPL-3.0", name: "GNU LGPL v3" }, body: `## ${s[0]}\n\n${s[2]}\n\n**Why players install it**\n\n- Works out of the box, no configuration needed\n- Compatible with most other mods\n- Actively maintained for the newest Minecraft versions\n\n> This is sample text shown in the browser preview.`, gallery: [] });
  }
  if (path.includes("/version")) return json([]);
  return new Response("offline preview", { status: 404 });
}

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
