import { Blocks, Database, Package, Palette, Plug, Sparkles, type LucideIcon } from "lucide-react";
import type { ContentCategory } from "@ember/content-engine";
import { tr } from "./i18n";

export interface CategoryInfo {
  id: ContentCategory;
  label: string;
  blurb: string;
  icon: LucideIcon;
  /** Instance folder the files go into. */
  dir: "mods" | "resourcepacks" | "datapacks" | "shaderpacks";
}

/** The six "Discover content" categories, in the order the brief specifies. */
export const CATEGORIES: CategoryInfo[] = [
  { id: "mods", label: tr("Mods"), blurb: tr("Add features, fix annoyances, change how the game plays."), icon: Blocks, dir: "mods" },
  { id: "resourcepacks", label: tr("Resource Packs"), blurb: tr("Textures, sounds and fonts."), icon: Palette, dir: "resourcepacks" },
  { id: "datapacks", label: tr("Data Packs"), blurb: tr("Vanilla-compatible changes to worlds, recipes and loot."), icon: Database, dir: "datapacks" },
  { id: "shaders", label: tr("Shaders"), blurb: tr("Lighting, shadows and water. Needs Iris, which Ember adds for you."), icon: Sparkles, dir: "shaderpacks" },
  { id: "modpacks", label: tr("Modpacks"), blurb: tr("Complete, tested collections. Sorted by how many players follow them."), icon: Package, dir: "mods" },
  { id: "plugins", label: tr("Plugins"), blurb: tr("Server-side plugins for Paper, Purpur, Velocity and friends."), icon: Plug, dir: "mods" },
];

export const categoryById = (id: string | undefined) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0]!;
