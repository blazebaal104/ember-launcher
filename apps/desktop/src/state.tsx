import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, errorCode, onEvent, type AccountSummary, type Instance, type SettingsView } from "./lib/ipc";
import { applyAppearance, DEFAULT_APPEARANCE, normalise, type Appearance } from "./lib/appearance";
import { setSoundsEnabled, success, failure } from "./lib/sounds";
import type { ContentHit } from "@ember/content-engine";
import { language, languageChosen, rememberLanguage, tr } from "./lib/i18n";

// ---------------------------------------------------------------- query client
/** Discover results stay fresh for 5 minutes and are kept for 30, so revisits are instant. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false, retry: 1 } },
});

// ---------------------------------------------------------------- toasts
export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: "info" | "success" | "error" | "progress";
  progress?: number;
  action?: { label: string; run: () => void };
}

// ---------------------------------------------------------------- launch state
export interface LaunchState {
  stage: "preparing" | "files" | "java" | "running";
  done: number;
  total: number;
}

/** What the project drawer shows. A search hit renders instantly while details load. */
export type ProjectRef = Pick<ContentHit, "id" | "slug" | "title" | "description" | "iconUrl" | "source"> & Partial<ContentHit> & {
  category?: string;
  /** Pre-select this instance as the install target. */
  instanceId?: string;
};

interface AppCtx {
  instances: Instance[];
  refresh: () => Promise<void>;
  account: AccountSummary | null;
  setAccount: (a: AccountSummary | null) => void;
  settings: SettingsView | null;
  setSettings: (s: SettingsView) => void;
  appearance: Appearance;
  setAppearance: (patch: Partial<Appearance>) => void;
  launching: Record<string, LaunchState>;
  play: (instance: Instance, server?: string, world?: string) => Promise<void>;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => number;
  updateToast: (id: number, t: Partial<Toast>) => void;
  dismiss: (id: number) => void;
  newInstanceOpen: boolean;
  setNewInstanceOpen: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  project: ProjectRef | null;
  openProject: (p: ProjectRef | null) => void;
  tourOpen: boolean;
  languageOpen: boolean;
  setLanguageOpen: (v: boolean) => void;
  setTourOpen: (v: boolean) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppState>{children}</AppState>
    </QueryClientProvider>
  );
}

function AppState({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const instancesQ = useQuery({ queryKey: ["instances"], queryFn: api.listInstances, staleTime: 0 });
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [settings, setSettingsState] = useState<SettingsView | null>(null);
  const [appearance, setAppearanceState] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [launching, setLaunching] = useState<Record<string, LaunchState>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newInstanceOpen, setNewInstanceOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [project, openProject] = useState<ProjectRef | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const toastId = useRef(1);
  const saveTimer = useRef<number>(undefined);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["instances"] });
  }, [qc]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = toastId.current++;
    setToasts((s) => [...s.slice(-4), { ...t, id }]);
    if (t.tone === "success") success();
    if (t.tone === "error") failure();
    if (t.tone !== "progress") setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), t.action ? 9000 : 5000);
    return id;
  }, []);
  const updateToast = useCallback((id: number, t: Partial<Toast>) => {
    setToasts((s) => s.map((x) => (x.id === id ? { ...x, ...t } : x)));
    if (t.tone && t.tone !== "progress") setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 5000);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((s) => s.filter((x) => x.id !== id)), []);

  // Load settings + appearance once.
  useEffect(() => {
    api.currentAccount().then(setAccount).catch(() => setAccount(null));
    api.getSettings()
      .then((s) => {
        setSettingsState(s);
        const a = normalise(s.ui);
        setAppearanceState(a);
        applyAppearance(a);
        setSoundsEnabled(a.sounds);
        // Language first: settings.json is the source of truth, localStorage lets the
        // first paint already be in the right language.
        const chosen = a.language ?? (languageChosen() ? language() : undefined);
        if (!chosen) setLanguageOpen(true);
        else if (chosen !== language()) {
          rememberLanguage(chosen);
          window.location.reload();
        } else {
          if (!a.language) api.saveSettings({ ...s, ui: { ...a, language: chosen } }).then(setSettingsState).catch(() => {});
          if (!s.onboarded) setTourOpen(true);
        }
      })
      .catch(() => applyAppearance(DEFAULT_APPEARANCE));
  }, []);

  const setSettings = useCallback((s: SettingsView) => setSettingsState(s), []);

  /** Apply instantly, persist after a short pause (sliders fire many changes). */
  const setAppearance = useCallback(
    (patch: Partial<Appearance>) => {
      setAppearanceState((prev) => {
        const next = normalise({ ...prev, ...patch });
        applyAppearance(next);
        setSoundsEnabled(next.sounds);
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          setSettingsState((cur) => {
            if (cur) api.saveSettings({ ...cur, ui: next }).then(setSettingsState).catch(() => {});
            return cur;
          });
        }, 400);
        return next;
      });
    },
    [],
  );

  // Launch / exit events from Rust.
  useEffect(() => {
    const subs = [
      onEvent<LaunchState & { instanceId: string }>("launch-progress", (p) => setLaunching((s) => ({ ...s, [p.instanceId]: p }))),
      onEvent<{ instanceId: string; code: number | null; minutes: number; crashReport?: string | null }>("game-exit", (p) => {
        setLaunching(({ [p.instanceId]: _gone, ...rest }) => rest);
        refresh();
        if (p.crashReport || (p.code !== null && p.code !== 0)) {
          toast({ title: tr("The game closed unexpectedly"), body: p.crashReport ? tr("A crash report was saved in the instance's crash-reports folder.") : tr("Exit code {code}. Check the Logs tab for details.", { code: p.code }), tone: "error" });
        } else if (p.minutes > 0) {
          toast({ title: tr("Thanks for playing"), body: tr("Session: {minutes} min", { minutes: p.minutes }), tone: "info" });
        }
      }),
    ];
    return () => subs.forEach((s) => s.then((f) => f()));
  }, [refresh, toast]);

  const play = useCallback(
    async (instance: Instance, server?: string, world?: string) => {
      setLaunching((s) => ({ ...s, [instance.id]: { stage: "preparing", done: 0, total: 1 } }));
      try {
        await api.launch(instance.id, server, world);
      } catch (e) {
        setLaunching(({ [instance.id]: _x, ...rest }) => rest);
        const c = errorCode(e);
        toast({
          tone: "error",
          title: c === "not_signed_in" || c === "no_client_id" ? tr("Sign in first") : c === "app_not_approved" ? tr("Waiting for Mojang's approval") : tr("{name} didn't start", { name: instance.name }),
          body: c === "not_signed_in" || c === "no_client_id" ? tr("Sign in with your Microsoft account (bottom left) so Minecraft knows it's you.") : String(e),
        });
      }
    },
    [toast],
  );

  // Ctrl/Cmd+K anywhere opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<AppCtx>(
    () => ({
      instances: instancesQ.data ?? [],
      refresh,
      account,
      setAccount,
      settings,
      setSettings,
      appearance,
      setAppearance,
      launching,
      play,
      toasts,
      toast,
      updateToast,
      dismiss,
      newInstanceOpen,
      setNewInstanceOpen,
      paletteOpen,
      setPaletteOpen,
      project,
      openProject,
      tourOpen,
      setTourOpen,
      languageOpen,
      setLanguageOpen,
    }),
    [instancesQ.data, refresh, account, settings, setSettings, appearance, setAppearance, launching, play, toasts, toast, updateToast, dismiss, newInstanceOpen, paletteOpen, project, tourOpen, languageOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
