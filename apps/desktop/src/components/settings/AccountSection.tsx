import { useEffect, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { api } from "../../lib/ipc";
import { LINKS, open, signInStatus } from "../../lib/links";
import { useApp } from "../../state";
import { AccountButton } from "../AccountButton";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Microsoft sign-in setup. Mojang only lets *approved* Azure apps sign players in, so
 * each launcher build needs its own app id. These steps are the whole process.
 */
export function AccountSection() {
  const { settings, setSettings, account } = useApp();
  const [clientId, setClientId] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setClientId(settings.msaClientId ?? "");
  }, [settings]);

  const save = async () => {
    setError(null);
    try {
      const s = await api.saveSettings({ ...settings, msaClientId: clientId.trim() || null });
      setSettings(s);
      signInStatus.set(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    }
  };

  const valid = GUID.test(clientId.trim());
  const status = account ? "signed_in" : !settings?.signInConfigured ? "not_set_up" : signInStatus.get() === "waiting_approval" ? "waiting" : "ready";
  const statusText = {
    signed_in: `Signed in as ${account?.username}. You're ready to play.`,
    not_set_up: "Not set up yet. Follow the steps below once; it takes about five minutes plus Mojang's review.",
    waiting: "Waiting for Mojang to approve your app. Sign-in will work once they email you (allow up to 24 hours after that).",
    ready: "Your app ID is saved. Try signing in.",
  }[status];

  return (
    <div>
      <section aria-labelledby="signin-h">
        <h2 id="signin-h" className="text-[20px] font-bold">Microsoft sign-in</h2>
        <p className={`mt-2 rounded-card px-4 py-3 text-[14px] ${status === "signed_in" ? "bg-copper/10 text-copper" : status === "waiting" ? "bg-gold/10 text-gold" : "bg-slate-surface text-muted"}`}>{statusText}</p>

        <p className="mt-5 max-w-[68ch] text-[15px] text-muted">
          Minecraft only accepts sign-ins from apps Mojang has approved. Ember can't share one app ID with everyone, so you register your own (free) and ask Mojang to approve it.
          Your password is only ever typed on Microsoft's own page.
        </p>

        {/* A real sequence, so it's numbered. */}
        <ol className="mt-6 space-y-6">
          <Step n={1} title="Create an app in Azure">
            Open App registrations and choose <b className="text-text">New registration</b>. Name it anything (for example "Ember Launcher"). Under <b className="text-text">Supported account types</b> pick
            <b className="text-text"> Personal Microsoft accounts only</b>. Leave Redirect URI empty and press Register. If Azure asks you to create an account first, the free one is enough.
            <Links items={[["Open App registrations", LINKS.azureAppRegistrations], ["Free Azure account", LINKS.azureFreeAccount]]} />
          </Step>

          <Step n={2} title="Allow public client flows">
            In your new app open <b className="text-text">Authentication</b>, scroll to <b className="text-text">Advanced settings</b>, set <b className="text-text">Allow public client flows</b> to Yes and press Save.
            Ember signs in with a short code instead of a password box, and this switch allows that.
          </Step>

          <Step n={3} title="Paste your client ID here">
            On the app's Overview page copy <b className="text-text">Application (client) ID</b>. Keep the <b className="text-text">Directory (tenant) ID</b> handy for step 5.
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <label className="min-w-72 flex-1">
                <span className="sr-only">Application (client) ID</span>
                <input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  spellCheck={false}
                  className="w-full rounded-chip bg-slate-raised px-3 py-2 font-[ui-monospace,monospace] text-[14px] placeholder:text-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-copper"
                />
                {clientId && !valid && <span className="mt-1 block text-[13px] text-redstone">A client ID looks like 8-4-4-4-12 letters and digits.</span>}
              </label>
              <button type="button" onClick={save} disabled={!valid && clientId.trim() !== ""} className="flex items-center gap-1.5 rounded-card bg-copper px-4 py-2 text-[14px] font-medium text-ink-950 disabled:opacity-50">
                {saved ? <><Check className="size-4" /> Saved</> : "Save client ID"}
              </button>
            </div>
            {settings?.usingBuildDefault && <p className="mt-2 text-[13px]">This build already includes an app ID. Only paste one if you want to use your own.</p>}
            {error && <p className="mt-2 text-[13px] text-redstone">{error}</p>}
          </Step>

          <Step n={4} title="Sign in once">
            Press the button below and approve the code on Microsoft's page. Before Mojang approves your app, this ends with a "not approved yet" message. That's expected:
            Mojang needs to see your app try to sign in before you apply.
            <div className="mt-3 max-w-72">
              {settings?.signInConfigured ? <AccountButton /> : <p className="rounded-card border border-dashed border-slate-line px-3 py-2 text-[13px]">Save your client ID in step 3 first.</p>}
            </div>
          </Step>

          <Step n={5} title="Ask Mojang to approve it">
            Fill in Mojang's review form with your app name, client ID and tenant ID. When the approval email arrives, wait up to 24 hours, then sign in again here. From then on Ember keeps you signed in.
            <Links items={[["Open the review form", LINKS.mojangReviewForm], ["Mojang's explanation", LINKS.mojangReviewInfo]]} />
          </Step>
        </ol>
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-raised text-[13px] font-bold text-text">{n}</span>
      <div className="max-w-[66ch] text-[14px] leading-relaxed text-muted">
        <h3 className="mb-1 text-[16px] font-medium text-text">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function Links({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-4">
      {items.map(([label, url]) => (
        <button key={url} type="button" onClick={() => open(url)} className="flex items-center gap-1 text-[14px] text-copper hover:underline">
          <ExternalLink className="size-3.5" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}
