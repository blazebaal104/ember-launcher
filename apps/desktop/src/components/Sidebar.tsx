import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ArrowRightLeft, ChevronDown, Compass, Flame, Home, Plus, Settings as SettingsIcon } from "lucide-react";
import { CATEGORIES } from "../lib/categories";
import { useApp } from "../state";
import { AccountButton } from "./AccountButton";

const item = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-chip px-3 py-2 text-[14px] transition-colors ${
    isActive ? "bg-slate-raised text-text" : "text-muted hover:bg-slate-surface hover:text-text"
  }`;

export function Sidebar() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(true);
  const { setNewInstanceOpen } = useApp();
  const inDiscover = pathname.startsWith("/discover");

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-line bg-ink-950 px-3 py-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <Flame className="size-5 text-copper" aria-hidden />
        <span className="text-[17px] font-bold tracking-tight">Ember</span>
      </div>

      <nav className="flex flex-col gap-1" aria-label="Main">
        <NavLink to="/" end className={item}>
          <Home className="size-4" aria-hidden /> Home
        </NavLink>

        {/* "Discover content" - the primary navigation group from the brief */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="discover-nav"
          className={`flex items-center gap-3 rounded-chip px-3 py-2 text-left text-[14px] transition-colors ${
            inDiscover ? "text-text" : "text-muted hover:bg-slate-surface hover:text-text"
          }`}
        >
          <Compass className="size-4" aria-hidden />
          <span className="flex-1">Discover content</span>
          <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
        </button>
        {open && (
          <div id="discover-nav" className="ml-[22px] flex flex-col gap-0.5 border-l border-slate-line pl-3">
            {CATEGORIES.map((c) => (
              <NavLink key={c.id} to={`/discover/${c.id}`} className={item}>
                <c.icon className="size-4" aria-hidden /> {c.label}
              </NavLink>
            ))}
          </div>
        )}

        <NavLink to="/transfer" className={item}>
          <ArrowRightLeft className="size-4" aria-hidden /> Transfer mods
        </NavLink>
        <NavLink to="/settings" className={item}>
          <SettingsIcon className="size-4" aria-hidden /> Settings
        </NavLink>
      </nav>

      <button
        type="button"
        onClick={() => setNewInstanceOpen(true)}
        className="mt-6 flex items-center justify-center gap-2 rounded-card border border-dashed border-slate-line px-3 py-2.5 text-[14px] text-muted hover:border-copper hover:text-copper"
      >
        <Plus className="size-4" aria-hidden /> New instance
      </button>

      <div className="mt-auto">
        <AccountButton />
      </div>
    </aside>
  );
}
