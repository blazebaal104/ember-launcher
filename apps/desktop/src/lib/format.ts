export const compact = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function ago(iso: string | null): string {
  if (!iso) return "Never played";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

export const loaderName = { vanilla: "Vanilla", fabric: "Fabric", quilt: "Quilt", neoforge: "NeoForge" } as const;

export const channelName = {
  release: "Release",
  "release-candidate": "Release candidate",
  "pre-release": "Pre-release",
  snapshot: "Snapshot",
} as const;
