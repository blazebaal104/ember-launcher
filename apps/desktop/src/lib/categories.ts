import { Blocks, Database, Package, Palette, Plug, Sparkles, type LucideIcon } from "lucide-react";
import type { ContentCategory } from "@ember/content-engine";

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
  { id: "mods", label: "Mods", blurb: "Add features, fix annoyances, change how the game plays.", icon: Blocks, dir: "mods" },
  { id: "resourcepacks", label: "Resource Packs", blurb: "Textures, sounds and fonts.", icon: Palette, dir: "resourcepacks" },
  { id: "datapacks", label: "Data Packs", blurb: "Vanilla-compatible changes to worlds, recipes and loot.", icon: Database, dir: "datapacks" },
  { id: "shaders", label: "Shaders", blurb: "Lighting, shadows and water. Needs Iris, which Ember adds for you.", icon: Sparkles, dir: "shaderpacks" },
  { id: "modpacks", label: "Modpacks", blurb: "Complete, tested collections. Sorted by how many players follow them.", icon: Package, dir: "mods" },
  { id: "plugins", label: "Plugins", blurb: "Server-side plugins for Paper, Purpur, Velocity and friends.", icon: Plug, dir: "mods" },
];

export const categoryById = (id: string | undefined) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0]!;
