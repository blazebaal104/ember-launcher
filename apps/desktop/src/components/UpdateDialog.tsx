import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, Loader2, PartyPopper } from "lucide-react";
import { api, onEvent, type UpdateInfo } from "../lib/ipc";
import { renderMarkdown } from "../lib/markdown";
import { open } from "../lib/links";
import { useApp } from "../state";
import { Button, Modal } from "./ui";
import { locale, tr } from "../lib/i18n";

const SKIP_KEY = "ember.skipUpdate";
const readSkip = () => {
  try {
    return localStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
};

let pendingCheck: ((manual: boolean) => void) | null = null;
/** Ask for an update check from anywhere (Settings → About). */
export const checkForUpdates = () => pendingCheck?.(true);

/** Checks GitHub shortly after launch; if there's a newer Ember, offers a one-click update. */
export function UpdateDialog() {
  const { toast } = useApp();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [state, setState] = useState<"idle" | "downloading" | "installing" | "error">("idle");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async (manual: boolean) => {
    try {
      const u = await api.checkUpdate();
      if (!u) {
        if (manual) toast({ title: tr("You're up to date"), tone: "success" });
        return;
      }
      if (!manual && readSkip() === u.tag) return;
      setInfo(u);
    } catch (e) {
      if (manual) toast({ title: tr("Couldn't check for updates"), body: String(e), tone: "error" });
    }
  }, [toast]);

  useEffect(() => {
    pendingCheck = check;
    const t = setTimeout(() => check(false), 3500);
    const off = onEvent<{ done: number; total: number; installing?: boolean }>("update-progress", (p) => {
      if (p.installing) setState("installing");
      else setPct(p.total ? (p.done / p.total) * 100 : 0);
    });
    return () => {
      clearTimeout(t);
      pendingCheck = null;
      void off.then((u) => u());
    };
  }, [check]);

  const install = async () => {
    if (!info) return;
    setState("downloading");
    setError(null);
    try {
      await api.installUpdate(info.tag);
      setState("installing");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const later = () => setInfo(null);
  const skip = () => {
    try {
      if (info) localStorage.setItem(SKIP_KEY, info.tag);
    } catch {
      /* storage unavailable */
    }
    setInfo(null);
  };
  const busy = state === "downloading" || state === "installing";

  return (
    <Modal
      open={!!info}
      onClose={() => !busy && later()}
      title={tr("Ember {n0} is here", { n0: info?.version ?? "" })}
      width="w-[640px]"
      footer={busy ? (
        <div className="flex flex-1 flex-col gap-2">
          <p className="flex items-center gap-2 text-[14px]"><Loader2 className="size-4 animate-spin text-copper" /> {state === "installing" ? tr("Installing… Ember will reopen by itself.") : tr("Downloading… {n0}%", { n0: pct.toFixed(0) })}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-line"><motion.div className="h-full rounded-full bg-copper" animate={{ width: `${state === "installing" ? 100 : pct}%` }} /></div>
        </div>
      ) : (
        <>
          <button type="button" onClick={skip} className="mr-auto text-[13px] text-muted hover:text-text">{tr("Skip this version")}</button>
          <Button onClick={later}>{tr("Later")}</Button>
          <Button variant="primary" className="shine" icon={Download} onClick={install}>{tr("Update now")}</Button>
        </>
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-copper/15 text-copper"><PartyPopper className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">
            {info && tr("{n0} MB · released {n1}", { n0: (info.size / 1048576).toFixed(1), n1: new Date(info.publishedAt).toLocaleDateString(locale()) })}{tr(". Your instances, worlds and settings stay as they are.")}
          </p>
          <div className="prose-ember mt-3 max-h-[44vh] overflow-y-auto pr-2 text-[14px]" dangerouslySetInnerHTML={{ __html: renderMarkdown((info?.notes ?? "").split("\n---")[0] ?? "") }} />
          {state === "error" && (
            <div className="mt-3 rounded-card bg-redstone/10 p-3 text-[13px]">
              <p>{tr("The update didn't finish: {error}", { error })}</p>
              <button type="button" className="mt-1 inline-flex items-center gap-1 text-copper hover:underline" onClick={() => info && open(info.pageUrl)}><ExternalLink className="size-3.5" /> {tr("Download it from the release page instead")}</button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
