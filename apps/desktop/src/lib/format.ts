import { locale, tr } from "./i18n";
export const compact = (n: number) =>
  new Intl.NumberFormat(locale(), { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function ago(iso: string | null): string {
  if (!iso) return tr("Never played");
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return tr("{n} min ago", { n: Math.max(1, Math.round(s / 60)) });
  if (s < 86400) return tr("{n} h ago", { n: Math.round(s / 3600) });
  const d = Math.round(s / 86400);
  return d === 1 ? tr("Yesterday") : tr("{n} days ago", { n: d });
}

export const loaderName = { vanilla: "Vanilla", fabric: "Fabric", quilt: "Quilt", neoforge: "NeoForge" } as const;

export const channelName = {
  release: tr("Release"),
  "release-candidate": tr("Release candidate"),
  "pre-release": tr("Pre-release"),
  snapshot: "Snapshot",
} as const;
