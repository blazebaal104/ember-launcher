import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AccountSummary, type Instance, type SettingsView } from "./lib/ipc";

interface AppCtx {
  instances: Instance[];
  account: AccountSummary | null;
  setAccount: (a: AccountSummary | null) => void;
  refresh: () => Promise<void>;
  settings: SettingsView | null;
  setSettings: (s: SettingsView) => void;
  newInstanceOpen: boolean;
  setNewInstanceOpen: (v: boolean) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [newInstanceOpen, setNewInstanceOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsView | null>(null);

  const refresh = useCallback(async () => setInstances(await api.listInstances()), []);

  useEffect(() => {
    refresh();
    api.currentAccount().then(setAccount).catch(() => setAccount(null));
    api.getSettings().then(setSettings).catch(() => {});
  }, [refresh]);

  return <Ctx.Provider value={{ instances, account, setAccount, refresh, settings, setSettings, newInstanceOpen, setNewInstanceOpen }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
