import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { inspectJar, inspectUploads } from "../src/jar-inspector";
import { curseforgeFingerprint, murmur2 } from "../src/hashing";
import { ModrinthClient } from "../src/modrinth";
import { TransferEngine } from "../src/transfer-engine";
import { scoreAlternative } from "../src/similarity";
import { fabricJson, fakeJar, hit, mockFetch, project, version } from "./fixtures";

const TARGET = { gameVersion: "1.21.4", loader: "fabric" as const };

describe("hashing", () => {
  it("murmur2 matches the reference implementation", () => {
    // Values produced by the canonical C MurmurHash2 (see test/murmur2_ref.py).
    expect(murmur2(new Uint8Array([]), 1)).toBe(0x5bd15e36 >>> 0);
    expect(murmur2(strToU8("hello"), 1)).toBe(REF_HELLO);
    expect(murmur2(strToU8("The quick brown fox"), 1)).toBe(REF_FOX);
  });
  it("CurseForge fingerprint ignores whitespace bytes", () => {
    expect(curseforgeFingerprint(strToU8("a b\tc\r\nd"))).toBe(curseforgeFingerprint(strToU8("abcd")));
  });
});

describe("jar inspector", () => {
  it("reads fabric.mod.json and drops platform dependencies", async () => {
    const jar = fakeJar({ "fabric.mod.json": fabricJson("modmenu", "Mod Menu", { depends: { minecraft: "1.20.1", fabricloader: "*", "fabric-api": "*" } }) });
    const f = await inspectJar("modmenu-7.2.2.jar", jar);
    expect(f.meta).toMatchObject({ loader: "fabric", modId: "modmenu", name: "Mod Menu", depends: ["fabric-api"], minecraftConstraint: "1.20.1" });
    expect(f.sha1).toMatch(/^[0-9a-f]{40}$/);
  });

  it("reads NeoForge mods.toml", async () => {
    const toml = `modLoader="javafml"\nloaderVersion="[4,)"\n[[mods]]\nmodId="jei"\ndisplayName="Just Enough Items"\nversion="\${file.jarVersion}"\n[[dependencies.jei]]\nmodId="minecraft"\ntype="required"\nversionRange="[1.20.4,1.21)"\n`;
    const f = await inspectJar("jei.jar", fakeJar({ "META-INF/neoforge.mods.toml": toml }));
    expect(f.meta).toMatchObject({ loader: "neoforge", modId: "jei", name: "Just Enough Items", version: "", minecraftConstraint: "[1.20.4,1.21)" });
  });

  it("expands a zipped mods folder and a .mrpack", async () => {
    const a = fakeJar({ "fabric.mod.json": fabricJson("a", "A") });
    const b = fakeJar({ "fabric.mod.json": fabricJson("b", "B") });
    const folder = zipSync({ "mods/a.jar": a, "mods/b.jar": b, "mods/readme.txt": strToU8("x") });
    const mrpack = zipSync({
      "modrinth.index.json": strToU8(JSON.stringify({ files: [{ path: "mods/sodium.jar", hashes: { sha1: "abc", sha512: "def" }, fileSize: 1, downloads: [] }, { path: "config/x.json", hashes: { sha1: "z", sha512: "z" }, fileSize: 1, downloads: [] }] })),
    });
    const out = await inspectUploads([{ name: "old-mods.zip", bytes: folder }, { name: "pack.mrpack", bytes: mrpack }]);
    expect(out.map((f) => f.fileName).sort()).toEqual(["a.jar", "b.jar", "sodium.jar"]);
  });
});

describe("similarity", () => {
  it("recognises a continuation fork", () => {
    const s = scoreAlternative({
      original: { name: "Cool Minimap", categories: ["utility"] },
      candidate: { title: "Cool Minimap Continued", description: "", categories: ["utility"], downloads: 5000, updatedAt: new Date().toISOString() },
    });
    expect(s.kind).toBe("fork");
    expect(s.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

describe("TransferEngine end-to-end (mocked Modrinth)", () => {
  it("matches, pulls dependencies, applies successors, flags obsolete, finds forks", async () => {
    // --- old instance (1.20.1) ---------------------------------------------------------
    const files = await inspectUploads([
      { name: "modmenu.jar", bytes: fakeJar({ "fabric.mod.json": fabricJson("modmenu", "Mod Menu") }, "modmenu") },
      { name: "okzoomer.jar", bytes: fakeJar({ "fabric.mod.json": fabricJson("okzoomer", "Ok Zoomer") }, "okz") },
      { name: "lazydfu.jar", bytes: fakeJar({ "fabric.mod.json": fabricJson("lazydfu", "LazyDFU") }, "ldfu") },
      { name: "coolmap.jar", bytes: fakeJar({ "fabric.mod.json": fabricJson("coolmap", "Cool Minimap", { description: "A minimap with waypoints" }) }, "cm") },
      { name: "mystery.jar", bytes: strToU8("not even a zip") },
    ]);
    const sha = Object.fromEntries(files.map((f) => [f.fileName, f.sha1]));

    // --- fake Modrinth ----------------------------------------------------------------
    const P = {
      modmenu: project("MM", "modmenu", "Mod Menu", ["utility"]),
      fapi: project("FAPI", "fabric-api", "Fabric API", ["library"]),
      okz: project("OKZ", "ok-zoomer", "Ok Zoomer", ["utility"]),
      zoomify: project("ZMF", "zoomify", "Zoomify", ["utility"]),
      ldfu: project("LDFU", "lazydfu", "LazyDFU"),
      fork: project("CMC", "cool-minimap-continued", "Cool Minimap Continued", ["utility", "adventure"], "A minimap with waypoints, updated"),
    };
    const old = {
      [sha["modmenu.jar"]!]: version("MM", "mm-old", ["1.20.1"]),
      [sha["okzoomer.jar"]!]: version("OKZ", "okz-old", ["1.20.1"]),
      [sha["lazydfu.jar"]!]: version("LDFU", "ldfu-old", ["1.20.1"]),
    };
    const mmNew = version("MM", "mm-new", ["1.21.4"], [{ project_id: "FAPI", version_id: null, file_name: null, dependency_type: "required" }]);
    const versionsByProject: Record<string, any[]> = {
      MM: [mmNew], FAPI: [version("FAPI", "fapi-new", ["1.21.4"])], ZMF: [version("ZMF", "zmf-new", ["1.21.4"])],
      CMC: [version("CMC", "cmc-new", ["1.21.4"])], OKZ: [], LDFU: [],
    };
    const bySlugOrId = new Map(Object.values(P).flatMap((p) => [[p.id, p], [p.slug, p]] as const));

    const { fetch, calls } = mockFetch((url, body) => {
      const p = url.pathname.replace("/v2", "");
      if (p === "/version_files") return Object.fromEntries(body.hashes.filter((h: string) => old[h]).map((h: string) => [h, old[h]]));
      if (p === "/version_files/update") return body.hashes[0] && old[body.hashes[0]] ? { [sha["modmenu.jar"]!]: mmNew } : {};
      if (p === "/projects") return JSON.parse(url.searchParams.get("ids")!).map((id: string) => bySlugOrId.get(id)).filter(Boolean);
      const ver = p.match(/^\/project\/([^/]+)\/version$/);
      if (ver) {
        const proj = bySlugOrId.get(decodeURIComponent(ver[1]!));
        return proj ? versionsByProject[proj.id] ?? [] : undefined;
      }
      const proj = p.match(/^\/project\/([^/]+)$/);
      if (proj) return bySlugOrId.get(decodeURIComponent(proj[1]!));
      if (p === "/search") {
        const q = url.searchParams.get("query") ?? "";
        const hits = /minimap/i.test(q) ? [hit(P.fork)] : [];
        return { hits, offset: 0, limit: 10, total_hits: hits.length };
      }
      return undefined;
    });

    const engine = new TransferEngine({ modrinth: new ModrinthClient(fetch, "ember-test/0.0") });
    const plan = await engine.plan(files, TARGET);
    const by = (name: string) => plan.entries.find((e) => e.input.fileName === name)!;

    expect(by("modmenu.jar").status).toBe("matched");
    expect(by("modmenu.jar").resolved?.versionId).toBe("mm-new");
    expect(plan.dependencies.map((d) => d.projectName)).toEqual(["Fabric API"]);

    expect(by("okzoomer.jar").status).toBe("alternative");
    expect(by("okzoomer.jar").alternatives[0]).toMatchObject({ kind: "successor", file: { projectName: "Zoomify" } });

    expect(by("lazydfu.jar").status).toBe("obsolete");

    expect(by("coolmap.jar").status).toBe("alternative");
    expect(by("coolmap.jar").alternatives[0]).toMatchObject({ kind: "fork", file: { projectName: "Cool Minimap Continued" } });

    expect(by("mystery.jar").status).toBe("unknown");
    expect(plan.stats).toEqual({ matched: 1, alternative: 2, obsolete: 1, unavailable: 0, unknown: 1 });

    // Bulk endpoints used once each, not per file.
    expect(calls.filter((c) => c === "POST /v2/version_files")).toHaveLength(1);
    expect(calls.filter((c) => c === "POST /v2/version_files/update")).toHaveLength(1);

    const final = await engine.finalize(plan, {});
    expect(final.map((f) => f.projectName).sort()).toEqual(["Cool Minimap Continued", "Fabric API", "Mod Menu", "Zoomify"]);
  });
});

// Filled in from the Python reference implementation.
const REF_HELLO = 0xa631918e;
const REF_FOX = 0x160f4ec9;
