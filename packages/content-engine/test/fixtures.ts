import { strToU8, zipSync } from "fflate";
import type { MrProject, MrSearchHit, MrVersion } from "../src/modrinth";

export function fakeJar(files: Record<string, string>, salt = ""): Uint8Array {
  const entries: Record<string, Uint8Array> = { "salt.txt": strToU8(salt) };
  for (const [k, v] of Object.entries(files)) entries[k] = strToU8(v);
  return zipSync(entries, { mtime: new Date("2024-01-01") });
}

export const fabricJson = (id: string, name: string, extra: object = {}) =>
  JSON.stringify({ schemaVersion: 1, id, name, version: "1.0.0", depends: { minecraft: "~1.20.1", fabricloader: ">=0.15" }, ...extra });

export function project(id: string, slug: string, title: string, categories: string[] = ["optimization"], description = ""): MrProject {
  return {
    id, slug, title, description, categories, project_type: "mod", downloads: 1_000_000, followers: 100,
    updated: "2026-10-01T00:00:00Z", game_versions: [], loaders: ["fabric"], icon_url: null,
  };
}

export function version(projectId: string, id: string, gameVersions: string[], deps: MrVersion["dependencies"] = []): MrVersion {
  return {
    id, project_id: projectId, name: `${projectId} ${id}`, version_number: id, version_type: "release",
    game_versions: gameVersions, loaders: ["fabric"], date_published: "2026-10-01T00:00:00Z", downloads: 1000,
    files: [{ hashes: { sha1: `sha1-${id}`, sha512: `sha512-${id}` }, url: `https://cdn.modrinth.com/${id}.jar`, filename: `${projectId}-${id}.jar`, primary: true, size: 123 }],
    dependencies: deps,
  };
}

export function hit(p: MrProject): MrSearchHit {
  return {
    project_id: p.id, slug: p.slug, title: p.title, description: p.description, author: "someone",
    categories: [...p.categories, "fabric"], versions: ["1.21.4"], downloads: p.downloads, follows: 10,
    icon_url: null, date_modified: p.updated, project_type: "mod",
  };
}

type Handler = (url: URL, body: any) => unknown | undefined;

/** Tiny router that pretends to be api.modrinth.com and records calls. */
export function mockFetch(handler: Handler) {
  const calls: string[] = [];
  const fetch = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const out = handler(url, body);
    if (out === undefined) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}
