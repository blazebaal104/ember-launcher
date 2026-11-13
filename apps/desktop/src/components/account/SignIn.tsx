import { useState } from "react";
import { Check, Copy, ExternalLink, LogIn } from "lucide-react";
import { api, errorCode, type AccountSummary, type DeviceCode } from "../../lib/ipc";
import { open } from "../../lib/links";
import { Button } from "../ui";

/**
 * Microsoft sign-in (device code): Ember copies a short code and opens microsoft.com/link;
 * you paste it there and pick your account, and Ember finishes by itself.
 */
export function SignIn({ onDone, label = "Sign in with Microsoft", compact }: { onDone: (a: AccountSummary) => void; label?: string; compact?: boolean }) {
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      const c = await api.loginStart();
      setCode(c);
      await navigator.clipboard?.writeText(c.user_code).then(() => setCopied(true), () => {});
      open(c.verification_uri);
      onDone(await api.loginFinish());
    } catch (e) {
      if (errorCode(e) !== "auth" || !String(e).includes("cancelled")) setError(String(e));
    } finally {
      setCode(null);
      setCopied(false);
      setBusy(false);
    }
  };

  if (code) {
    return (
      <div className="rounded-card border border-slate-line bg-slate-surface/80 p-4" aria-live="polite">
        <p className="text-[13px] text-muted">On the Microsoft page, paste this code{copied ? " (it's already copied)" : ""}, then choose your account:</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="font-pixel text-[26px] tracking-[0.15em] text-text">{code.user_code}</span>
          <button type="button" aria-label="Copy code" onClick={() => navigator.clipboard?.writeText(code.user_code).then(() => setCopied(true))} className="rounded-chip p-2 text-muted hover:bg-slate-raised hover:text-text">
            {copied ? <Check className="size-4 text-copper" /> : <Copy className="size-4" />}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={() => open(code.verification_uri)} className="flex items-center gap-1.5 text-[13px] text-copper hover:underline">
            <ExternalLink className="size-3.5" aria-hidden /> Open {code.verification_uri.replace("https://", "")}
          </button>
          <button type="button" onClick={() => api.loginCancel()} className="text-[13px] text-muted hover:text-text">Cancel</button>
        </div>
        <p className="mt-3 flex items-center gap-2 text-[12px] text-muted"><span className="size-1.5 animate-pulse rounded-full bg-copper" /> Waiting for you to finish in the browser</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="primary" size={compact ? "md" : "lg"} icon={LogIn} loading={busy} onClick={start}>{label}</Button>
      {error && <p className="text-[13px] leading-snug text-redstone">{error}</p>}
    </div>
  );
}
