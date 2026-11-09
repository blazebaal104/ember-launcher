/**
 * Curated knowledge the APIs can't give us: discontinued mods and their
 * successors. Keys are matched against the jar's mod id AND the Modrinth slug,
 * lower-cased. Ship this as remote JSON in production so it can be updated
 * without a launcher release.
 */
import type { Loader } from "./types";

export interface SuccessorRule {
  /** Modrinth slugs to suggest (all of them together replace the old mod). */
  replacements: string[];
  kind: "successor" | "fork" | "obsolete";
  reason: string;
  /** Only apply when migrating to these loaders (e.g. Fabric API -> NeoForge needs a port). */
  onlyForLoaders?: Loader[];
}

export const SUCCESSORS: Record<string, SuccessorRule> = {
  optifine: { replacements: ["sodium", "iris"], kind: "successor", reason: "OptiFine isn't on Modrinth/CurseForge for modern loaders; Sodium (performance) + Iris (shaders) cover it." },
  optifabric: { replacements: ["sodium", "iris"], kind: "successor", reason: "OptiFabric only bridged OptiFine; Sodium + Iris are the native replacements." },
  rubidium: { replacements: ["sodium"], kind: "successor", reason: "Rubidium was a Forge port of Sodium; Sodium now ships official NeoForge builds." },
  embeddium: { replacements: ["sodium"], kind: "successor", reason: "Embeddium was a Sodium fork for (Neo)Forge; official Sodium now supports NeoForge." },
  oculus: { replacements: ["iris"], kind: "successor", reason: "Oculus was an Iris port for Forge; Iris now ships NeoForge builds." },
  okzoomer: { replacements: ["zoomify"], kind: "successor", reason: "Ok Zoomer is no longer updated; Zoomify is the actively maintained zoom mod." },
  ok_zoomer: { replacements: ["zoomify"], kind: "successor", reason: "Ok Zoomer is no longer updated; Zoomify is the actively maintained zoom mod." },
  starlight: { replacements: ["scalablelux"], kind: "fork", reason: "Starlight is discontinued (vanilla lighting got much faster); ScalableLux continues its approach." },
  phosphor: { replacements: [], kind: "obsolete", reason: "Phosphor's lighting fixes are superseded by vanilla lighting improvements." },
  lazydfu: { replacements: [], kind: "obsolete", reason: "Vanilla already initialises DataFixerUpper lazily; LazyDFU is no longer needed." },
  foamfix: { replacements: ["ferrite-core"], kind: "successor", reason: "FerriteCore is the modern memory-usage optimiser." },
  betterfps: { replacements: ["sodium"], kind: "successor", reason: "BetterFps is long abandoned; Sodium is the modern renderer optimiser." },
  waila: { replacements: ["wthit"], kind: "successor", reason: "Hwyla (Waila) was discontinued; WTHIT (Fabric/NeoForge) and Jade continue it." },
  hwyla: { replacements: ["wthit", "jade"], kind: "successor", reason: "Hwyla was discontinued; WTHIT and Jade continue it." },
  inventorytweaks: { replacements: ["inventory-profiles-next"], kind: "successor", reason: "Inventory Tweaks is abandoned; Inventory Profiles Next offers sorting and more." },
  "fabric-api": { replacements: ["forgified-fabric-api"], kind: "fork", reason: "Fabric API mods on NeoForge need the Forgified Fabric API port (plus Sinytra Connector).", onlyForLoaders: ["neoforge"] },
  fabric: { replacements: ["forgified-fabric-api"], kind: "fork", reason: "Fabric API mods on NeoForge need the Forgified Fabric API port (plus Sinytra Connector).", onlyForLoaders: ["neoforge"] },
};

export function findSuccessor(keys: Array<string | undefined>, targetLoader: Loader): SuccessorRule | undefined {
  for (const k of keys) {
    if (!k) continue;
    const rule = SUCCESSORS[k.toLowerCase()];
    if (rule && (!rule.onlyForLoaders || rule.onlyForLoaders.includes(targetLoader))) return rule;
  }
  return undefined;
}
