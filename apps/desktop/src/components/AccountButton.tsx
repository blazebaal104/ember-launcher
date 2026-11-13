import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/ipc";
import { useApp } from "../state";
import { SignIn } from "./account/SignIn";

function Avatar({ uuid, name, size = 32 }: { uuid: string; name: string; size?: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-chip bg-copper/20 text-[14px] font-bold text-copper" style={{ width: size, height: size }}>
      {name.slice(0, 1).toUpperCase()}
      <img src={`https://mc-heads.net/avatar/${uuid}/${size}`} alt="" className="absolute inset-0 size-full [image-rendering:pixelated]" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
    </span>
  );
}

/**
 * Bottom of the sidebar: who you're playing as. Click to open the Account page; the arrows
 * switch between your accounts. Signed out, it's the Microsoft sign-in button.
 */
export function AccountButton() {
  const { account, setAccount, toast } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accountsList, enabled: !!account });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!account) return <SignIn compact onDone={setAccount} />;

  const switchTo = async (uuid: string, name: string) => {
    setOpen(false);
    try {
      setAccount(await api.accountSwitch(uuid));
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account-details"] });
      qc.invalidateQueries({ queryKey: ["account-stats"] });
      toast({ title: `Playing as ${name}`, tone: "success" });
    } catch (e) {
      toast({ title: "Couldn't switch", body: String(e), tone: "error" });
    }
  };

  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-1 rounded-card hover:bg-slate-raised/70">
        <button type="button" onClick={() => navigate("/account")} className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left" title="Your account">
          <Avatar uuid={account.uuid} name={account.username} />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium">{account.username}</div>
            <div className="text-[12px] text-muted">Account</div>
          </div>
        </button>
        <button type="button" onClick={() => setOpen(!open)} className="mr-1 rounded-chip p-1.5 text-muted hover:bg-slate-line hover:text-text" aria-label="Switch account" aria-expanded={open}>
          <ChevronsUpDown className="size-4" />
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="glass absolute bottom-full left-0 z-50 mb-2 w-full rounded-panel p-1.5 shadow-xl">
            {(accounts.data ?? []).map((a) => (
              <button key={a.uuid} type="button" onClick={() => (a.active ? setOpen(false) : switchTo(a.uuid, a.username))} className="flex w-full items-center gap-2.5 rounded-card px-2 py-1.5 text-left hover:bg-slate-raised">
                <Avatar uuid={a.uuid} name={a.username} size={24} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{a.username}</span>
                {a.active && <Check className="size-4 text-copper" />}
              </button>
            ))}
            <button type="button" onClick={() => { setOpen(false); navigate("/account"); }} className="mt-1 flex w-full items-center gap-2.5 rounded-card px-2 py-1.5 text-left text-[13px] text-muted hover:bg-slate-raised hover:text-text">
              <UserPlus className="size-4" /> Add or manage accounts
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
