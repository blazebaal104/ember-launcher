import { createElement, Fragment, type ReactNode } from "react";
import { IT } from "./i18n-it";

/**
 * Tiny translation layer. UI text is written in English and wrapped in `tr()`; other
 * languages are dictionaries keyed by the English text, so a missing entry simply
 * shows English.
 *
 * The language is read synchronously at startup (localStorage mirrors settings.json),
 * so text built at module load is translated too. Changing language reloads the window.
 */
export type Language = "en" | "it";

export const LANGUAGES: Array<{ id: Language; name: string; native: string; flag: string }> = [
  { id: "en", name: "English", native: "English", flag: "🇬🇧" },
  { id: "it", name: "Italian", native: "Italiano", flag: "🇮🇹" },
];

const KEY = "ember.language";

function initial(): Language | undefined {
  try {
    const v = localStorage.getItem(KEY);
    return v === "it" || v === "en" ? v : undefined;
  } catch {
    return undefined;
  }
}

let current: Language = initial() ?? "en";
const dicts: Record<Language, Record<string, string>> = { en: {}, it: IT };

export function language(): Language {
  return current;
}

/** True once the user has picked a language on this computer. */
export function languageChosen(): boolean {
  return initial() !== undefined;
}

/** Remember the language locally. Returns true when it differs from the one on screen. */
export function rememberLanguage(lang: Language): boolean {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage unavailable: the setting in settings.json still applies next start */
  }
  const changed = lang !== current;
  current = lang;
  return changed;
}

/** BCP-47 locale for dates and numbers. */
export function locale(): string {
  return current === "it" ? "it-IT" : "en-GB";
}

/**
 * Translate `text`. Placeholders like `{name}` are filled from `vars`, after translating,
 * so the translation can move them around.
 */
export function tr(text: string, vars?: Record<string, unknown>): string {
  const out = dicts[current][text] ?? text;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m));
}

/** Like tr(), but placeholders may be React elements (bold words, links, key caps). */
export function trn(text: string, vars: Record<string, ReactNode>): ReactNode {
  const out = dicts[current][text] ?? text;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of out.matchAll(/\{(\w+)\}/g)) {
    if (m.index! > last) parts.push(out.slice(last, m.index));
    parts.push(m[1]! in vars ? vars[m[1]!] : m[0]);
    last = m.index! + m[0].length;
  }
  if (last < out.length) parts.push(out.slice(last));
  return createElement(Fragment, null, ...parts);
}
