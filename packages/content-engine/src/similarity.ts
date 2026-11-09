/**
 * Lightweight, explainable similarity scoring for "closest functional match".
 * We deliberately avoid opaque ML: users see *why* something was suggested.
 */

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "your", "you", "is", "it", "this", "that",
  "mod", "mods", "minecraft", "fabric", "forge", "neoforge", "quilt", "adds", "add", "makes", "make", "game", "new",
  "lib", "api", "by", "from", "into", "be", "are", "can", "more", "all",
]);

/** Loader / platform tags carry no functional meaning. */
const NON_FUNCTIONAL_CATEGORIES = new Set(["fabric", "forge", "neoforge", "quilt", "liteloader", "modloader", "rift", "datapack", "minecraft"]);

export function tokens(s: string | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function trigrams(s: string): Set<string> {
  const n = ` ${s.toLowerCase().replace(/[^a-z0-9]/g, "")} `;
  const out = new Set<string>();
  for (let i = 0; i < n.length - 2; i++) out.add(n.slice(i, i + 3));
  return out;
}

/** 0..1 similarity of two display names, robust to "Foo Reforged" vs "Foo". */
export function nameSimilarity(a: string, b: string): number {
  return Math.max(jaccard(trigrams(a), trigrams(b)), jaccard(tokens(a), tokens(b)));
}

export function functionalCategories(cats: string[]): Set<string> {
  return new Set(cats.filter((c) => !NON_FUNCTIONAL_CATEGORIES.has(c)));
}

const FORK_WORDS = /\b(reforged|continued|unofficial|port|fork|revived|reborn|updated|fabric|neo|community|edition|plus|extended)\b/i;

export interface ScoreInput {
  original: { name: string; description?: string; categories: string[] };
  candidate: { title: string; description: string; categories: string[]; downloads: number; updatedAt: string };
  now?: Date;
}

export interface ScoreResult {
  confidence: number;
  kind: "fork" | "similar";
  reason: string;
}

export function scoreAlternative({ original, candidate, now = new Date() }: ScoreInput): ScoreResult {
  const name = nameSimilarity(original.name, candidate.title);
  const cats = jaccard(functionalCategories(original.categories), functionalCategories(candidate.categories));
  const desc = jaccard(tokens(original.description), tokens(candidate.description));
  const popularity = Math.min(1, Math.log10(candidate.downloads + 1) / 7); // 10M downloads ~ 1.0

  const monthsStale = (now.getTime() - new Date(candidate.updatedAt).getTime()) / (30 * 864e5);
  const freshness = monthsStale <= 12 ? 1 : Math.max(0, 1 - (monthsStale - 12) / 24);

  const containsOriginal =
    candidate.title.toLowerCase().includes(original.name.toLowerCase()) && candidate.title.length > original.name.length;
  const isFork = containsOriginal && FORK_WORDS.test(candidate.title);

  let confidence = 0.35 * name + 0.25 * cats + 0.25 * desc + 0.1 * popularity + 0.05 * freshness;
  if (isFork) confidence = Math.max(confidence, 0.8);
  confidence = Math.round(Math.min(1, confidence) * 100) / 100;

  const why: string[] = [];
  if (isFork) why.push(`looks like a continuation of "${original.name}"`);
  else if (name > 0.5) why.push("very similar name");
  if (cats > 0.3) why.push("same categories");
  if (desc > 0.15) why.push("similar description");
  if (popularity > 0.7) why.push("widely used");
  if (why.length === 0) why.push("closest search result for this functionality");

  return { confidence, kind: isFork ? "fork" : "similar", reason: why.join(", ") };
}
