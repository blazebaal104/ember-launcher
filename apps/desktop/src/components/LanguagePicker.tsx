import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Check } from "lucide-react";
import logo from "../assets/logo-glyph.svg";
import { useApp } from "../state";
import { api } from "../lib/ipc";
import { LANGUAGES, language, rememberLanguage, tr, type Language } from "../lib/i18n";

/** Flags drawn in SVG: Windows has no flag emoji. */
export function Flag({ lang, className = "" }: { lang: Language; className?: string }) {
  if (lang === "it")
    return (
      <svg viewBox="0 0 3 2" className={className} aria-hidden>
        <rect width="1" height="2" fill="#009246" />
        <rect x="1" width="1" height="2" fill="#f4f5f0" />
        <rect x="2" width="1" height="2" fill="#ce2b37" />
      </svg>
    );
  return (
    <svg viewBox="0 0 60 30" className={className} aria-hidden>
      <clipPath id="uk-s"><path d="M0,0 v30 h60 v-30 z" /></clipPath>
      <clipPath id="uk-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <g clipPath="url(#uk-s)">
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#uk-t)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

/**
 * Save the language and apply it. The page reloads when the language changes, so text
 * built when the app started is translated too.
 */
export function useSetLanguage() {
  const { settings, appearance, setTourOpen } = useApp();
  return async (lang: Language, then?: "tour") => {
    const changed = rememberLanguage(lang);
    if (settings) {
      const next = { ...settings, ui: { ...appearance, language: lang } };
      await api.saveSettings(next).catch(() => {});
    }
    if (changed) window.location.reload();
    else if (then === "tour") setTourOpen(true);
  };
}

function Choice({ lang, active, onPick }: { lang: (typeof LANGUAGES)[number]; active: boolean; onPick: () => void }) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onPick}
      className={`glass relative flex flex-col items-center gap-3 rounded-panel border-2 p-6 text-center transition-colors ${active ? "border-copper" : "border-transparent hover:border-slate-line"}`}
    >
      <Flag lang={lang.id} className="h-14 w-[84px] overflow-hidden rounded-[6px] shadow-lg" />
      <span className="text-[18px] font-bold">{lang.native}</span>
      {active && <Check className="absolute right-3 top-3 size-5 text-copper" />}
    </motion.button>
  );
}

/** First start: pick the language before the tour. Written in both languages on purpose. */
export function LanguagePicker() {
  const { languageOpen, setLanguageOpen } = useApp();
  const setLanguage = useSetLanguage();
  const [busy, setBusy] = useState(false);
  const pick = async (l: Language) => {
    if (busy) return;
    setBusy(true);
    setLanguageOpen(false);
    await setLanguage(l, "tour");
    setBusy(false);
  };
  return (
    <AnimatePresence>
      {languageOpen && (
        <motion.div className="fixed inset-0 z-[75] grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <motion.div initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }} className="glass glass-strong relative w-[560px] max-w-full rounded-panel p-8 text-center" role="dialog" aria-label="Language / Lingua">
            <motion.img src={logo} alt="" className="mx-auto h-20 drop-shadow-[0_0_30px_var(--accent)]" animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
            <h2 className="mt-4 font-pixel text-[28px] leading-tight">Choose your language</h2>
            <p className="font-pixel text-[20px] leading-tight text-muted">Scegli la tua lingua</p>
            <div className="mt-6 grid grid-cols-2 gap-4">
              {LANGUAGES.map((l) => <Choice key={l.id} lang={l} active={false} onPick={() => pick(l.id)} />)}
            </div>
            <p className="mt-5 text-[12px] text-muted">You can change it later in Settings · Puoi cambiarla dopo nelle Impostazioni</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The language row used in Settings. */
export function LanguageSetting() {
  const setLanguage = useSetLanguage();
  const cur = language();
  return (
    <div className="grid grid-cols-2 gap-3">
      {LANGUAGES.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => l.id !== cur && setLanguage(l.id)}
          className={`press flex items-center gap-3 rounded-panel border-2 p-3 text-left transition-colors ${l.id === cur ? "border-copper bg-copper/10" : "border-slate-line/60 hover:border-slate-line"}`}
        >
          <Flag lang={l.id} className="h-7 w-[42px] shrink-0 overflow-hidden rounded-[4px]" />
          <span className="flex-1 font-semibold">{l.native}</span>
          {l.id === cur && <Check className="size-4 text-copper" />}
        </button>
      ))}
      <p className="col-span-2 text-[12px] text-muted">{tr("Ember reloads its window to switch language.")}</p>
    </div>
  );
}
