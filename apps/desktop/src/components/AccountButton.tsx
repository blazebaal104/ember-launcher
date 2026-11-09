import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy, ExternalLink, LogIn, Settings2 } from "lucide-react";
import { api, errorCode, type DeviceCode } from "../lib/ipc";
import { open, signInStatus } from "../lib/links";
import { useApp } from "../state";

/**
 * Microsoft sign-in via device code: Ember shows a short code, opens microsoft.com/link,
 * and finishes on its own once you approve in the browser. Nothing is typed into Ember.
 */
export function AccountButton() {
  const { account, setAccount, settings } = useApp();
  const navigate = useNavigate();
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setError(null);
    setBusy(true);
    try {
      const c = await api.loginStart();
      setCode(c);
      await navigator.clipboard?.writeText(c.user_code).then(() => setCopied(true), () => {});
      open(c.verification_uri);
      const acc = await api.loginFinish();
      signInStatus.set("ok");
      setAccount(acc);
    } catch (e) {
      const c = errorCode(e);
      if (c === "app_not_approved") signInStatus.set("waiting_approval");
      setError({ code: c, message: String(e) });
    } finally {
      setCode(null);
      setCopied(false);
      setBusy(false);
    }
  };

  const cancel = async () => {
    await api.loginCancel();
    setCode(null);
  };

  if (account) {
    return (
      <div className="flex items-center gap-3 rounded-card px-2 py-2">
        <img
          src={`https://mc-heads.net/avatar/${account.uuid}/32`}
          alt=""
          className="size-8 rounded-chip bg-slate-raised [image-rendering:pixelated]"
          onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{account.username}</div>
          <button type="button" className="text-[12px] text-muted hover:text-text" onClick={() => api.logout().then(() => setAccount(null))}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (settings && !settings.signInConfigured) {
    return (
      <button type="button" onClick={() => navigate("/settings")} className="flex w-full items-center gap-2 rounded-card border border-slate-line px-3 py-2 text-[14px] text-text hover:border-copper">
        <Settings2 className="size-4 text-copper" aria-hidden /> Set up Microsoft sign-in
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {code && (
        <div className="rounded-card bg-slate-surface p-3" aria-live="polite">
          <p className="text-[13px] text-muted">Enter this code on the Microsoft page:</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="font-pixel text-[22px] tracking-wider text-text">{code.user_code}</span>
            <button type="button" aria-label="Copy code" onClick={() => navigator.clipboard?.writeText(code.user_code).then(() => setCopied(true))} className="rounded-chip p-1.5 text-muted hover:bg-slate-raised hover:text-text">
              {copied ? <Check className="size-4 text-copper" /> : <Copy className="size-4" />}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button type="button" onClick={() => open(code.verification_uri)} className="flex items-center gap-1 text-[13px] text-copper hover:underline">
              <ExternalLink className="size-3.5" aria-hidden /> Open {code.verification_uri.replace("https://", "")}
            </button>
            <button type="button" onClick={cancel} className="text-[13px] text-muted hover:text-text">Cancel</button>
          </div>
        </div>
      )}
      {error && (
        <div className="rounded-card bg-slate-surface p-3 text-[12px] leading-snug">
          <p className={error.code === "app_not_approved" ? "text-gold" : "text-redstone"}>{error.message}</p>
          {["app_not_approved", "app_misconfigured", "no_client_id"].includes(error.code) && (
            <button type="button" onClick={() => navigate("/settings")} className="mt-1.5 text-copper hover:underline">Open sign-in setup</button>
          )}
        </div>
      )}
      {!code && (
        <button type="button" onClick={signIn} disabled={busy} className="flex items-center gap-2 rounded-card bg-copper px-3 py-2 text-[14px] font-medium text-ink-950 hover:bg-copper/90 disabled:opacity-60">
          <LogIn className="size-4" aria-hidden /> {busy ? "Starting" : "Sign in with Microsoft"}
        </button>
      )}
    </div>
  );
}
