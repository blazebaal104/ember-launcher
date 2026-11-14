import { AnimatePresence, motion } from "motion/react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowRightLeft, CheckCircle2, Command, Compass, Heart, Home, Info, Layers3, Loader2, PanelLeftClose, PanelLeftOpen, Plus, Search, Server, Settings, X, XCircle } from "lucide-react";
import logoGlyph from "../assets/logo-glyph.svg";
import { useApp } from "../state";
import { AccountButton } from "./AccountButton";
import { click } from "../lib/sounds";
import { tr } from "../lib/i18n";

/** The animated world behind the glass. */
/** Deterministic pseudo-random particles, so the layout is stable between renders. */
const PARTICLES = Array.from({ length: 34 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const size = 2 + Math.round(r(1) * 4);
  return {
    left: `${(r(2) * 100).toFixed(2)}%`,
    size,
    d: `${(11 + r(3) * 16).toFixed(1)}s`,
    delay: `${(-r(4) * 26).toFixed(1)}s`,
    sway: `${Math.round((r(5) - 0.5) * 160)}px`,
    o: (0.25 + r(6) * 0.55).toFixed(2),
  };
});

function Embers({ count = PARTICLES.length }: { count?: number }) {
  return (
    <div className="ember-particles absolute inset-0">
      {PARTICLES.slice(0, count).map((p, i) => (
        <i key={i} style={{ left: p.left, width: p.size, height: p.size, ["--d" as string]: p.d, ["--delay" as string]: p.delay, ["--sway" as string]: p.sway, ["--o" as string]: p.o }} />
      ))}
    </div>
  );
}

export function Backdrop() {
  const { appearance } = useApp();
  const b = appearance.backdrop;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-slate-base">
      {b === "aurora" && (
        <>
          <div className="bg-aurora">
            <span style={{ left: "8%", top: "6%", width: "46vw", height: "46vw", background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 70%, transparent), transparent 64%)" }} />
            <span style={{ right: "4%", top: "24%", width: "40vw", height: "40vw", animationDelay: "-7s", background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 30%, #6a5cff 45%), transparent 64%)" }} />
            <span style={{ left: "28%", bottom: "-6%", width: "50vw", height: "42vw", animationDelay: "-13s", background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 45%, #1e6a8f), transparent 64%)" }} />
            <span style={{ left: "55%", top: "-8%", width: "30vw", height: "30vw", animationDelay: "-4s", background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 25%, #e07cff 30%), transparent 64%)" }} />
          </div>
          <Embers count={18} />
        </>
      )}
      {b === "embers" && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: "radial-gradient(ellipse at 50% 100%, color-mix(in oklab, var(--accent) 30%, transparent), transparent 70%)" }} />
          <Embers />
        </>
      )}
      {b === "nebula" && <div className="absolute inset-0" style={{ background: "radial-gradient(1200px 700px at 15% 0%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 60%), radial-gradient(900px 600px at 100% 100%, color-mix(in oklab, #7c4dff 22%, transparent), transparent 60%)" }} />}
      {b === "grid" && <div className="block-grid absolute inset-0" style={{ maskImage: "radial-gradient(ellipse at 30% 20%, black, transparent 75%)" }} />}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 60%, color-mix(in oklab, var(--base) 70%, transparent))" }} />
    </div>
  );
}

const NAV = [
  { to: "/", label: tr("Home"), icon: Home, end: true },
  { to: "/discover/mods", match: "/discover", label: tr("Discover"), icon: Compass },
  { to: "/favorites", label: tr("Favorites"), icon: Heart },
  { to: "/packs", label: tr("World packs"), icon: Layers3 },
  { to: "/servers", label: tr("Servers"), icon: Server },
  { to: "/transfer", label: tr("Transfer mods"), icon: ArrowRightLeft },
];

export function Sidebar() {
  const { appearance, setAppearance, setNewInstanceOpen, instances, launching } = useApp();
  const collapsed = appearance.sidebarCollapsed;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const running = Object.keys(launching).length;

  const item = (active: boolean) =>
    `press group relative flex items-center gap-3 rounded-card ${collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2"} text-[14px] ${active ? "text-text" : "text-muted hover:text-text"}`;

  return (
    <motion.aside animate={{ width: collapsed ? 76 : 236 }} transition={{ type: "spring", stiffness: 400, damping: 40 }} className="glass relative z-20 m-3 mr-0 flex shrink-0 flex-col rounded-panel p-3">
      <button type="button" onClick={() => navigate("/")} className={`press mb-5 flex items-center gap-2.5 rounded-card ${collapsed ? "justify-center" : "px-1.5"} py-1`} aria-label={tr("Ember home")}>
        <motion.img src={logoGlyph} alt="" className="h-8 w-auto drop-shadow-[0_0_12px_var(--accent)]" whileHover={{ rotate: [0, -8, 8, 0], scale: 1.08 }} transition={{ duration: 0.5 }} />
        {!collapsed && <span className="text-[19px] font-bold tracking-tight">{tr("Ember")}</span>}
      </button>

      <nav className="flex flex-col gap-1" aria-label={tr("Main")}>
        {NAV.map((n) => {
          const active = n.end ? pathname === "/" : pathname.startsWith(n.match ?? n.to);
          return (
            <NavLink key={n.to} to={n.to} end={n.end} className={item(active)} onClick={click} title={collapsed ? n.label : undefined}>
              {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-card bg-slate-raised/90" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              {active && <motion.span layoutId="nav-bar" className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-copper" />}
              <n.icon className="relative size-[18px] transition-transform group-hover:scale-110" aria-hidden />
              {!collapsed && <span className="relative">{n.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {!collapsed && instances.length > 0 && (
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
          <p className="mb-1.5 px-3 text-[12px] text-muted">{tr("Instances")}</p>
          {instances.slice(0, 8).map((i) => {
            const active = pathname === `/instance/${i.id}`;
            return (
              <NavLink key={i.id} to={`/instance/${i.id}`} className={item(active)} onClick={click}>
                {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-card bg-slate-raised/90" />}
                <span className="relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-chip bg-slate-raised text-[11px] font-bold text-copper">
                  {i.icon ? <img src={i.icon} alt="" className="size-full object-cover" /> : i.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="relative truncate">{i.name}</span>
                {launching[i.id] && <span className="relative ml-auto size-2 shrink-0 animate-pulse rounded-full bg-copper" aria-label="running" />}
              </NavLink>
            );
          })}
        </div>
      )}
      {collapsed && <div className="flex-1" />}

      <div className="mt-3 flex flex-col gap-1.5">
        <button type="button" onClick={() => setNewInstanceOpen(true)} className={`press flex items-center justify-center gap-2 rounded-card border border-dashed border-slate-line py-2.5 text-[14px] text-muted hover:border-copper hover:text-copper`} title={tr("New instance")}>
          <Plus className="size-4" aria-hidden /> {!collapsed && tr("New instance")}
        </button>
        <NavLink to="/settings" className={item(pathname.startsWith("/settings"))} onClick={click} title={collapsed ? tr("Settings") : undefined}>
          {pathname.startsWith("/settings") && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-card bg-slate-raised/90" />}
          <Settings className="relative size-[18px] transition-transform duration-500 group-hover:rotate-90" aria-hidden />
          {!collapsed && <span className="relative">{tr("Settings")}</span>}
        </NavLink>
        {!collapsed && <AccountButton />}
        <button type="button" onClick={() => setAppearance({ sidebarCollapsed: !collapsed })} className="press flex items-center justify-center rounded-card py-1.5 text-muted hover:text-text" aria-label={collapsed ? tr("Expand sidebar") : tr("Collapse sidebar")}>
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && running > 0 && <span className="ml-2 text-[12px]">{tr("{running} running", { running })}</span>}
        </button>
      </div>
    </motion.aside>
  );
}

/** Top bar: the search field opens the command palette, which searches everything. */
export function TopBar() {
  const { setPaletteOpen } = useApp();
  return (
    <header className="flex items-center gap-3 px-6 pb-2 pt-4">
      <button type="button" onClick={() => setPaletteOpen(true)} className="glass press group flex w-full max-w-xl items-center gap-3 rounded-card px-4 py-2.5 text-left text-[14px] text-muted hover:text-text">
        <Search className="size-4 transition-transform group-hover:scale-110" aria-hidden />
        <span className="flex-1">{tr("Search instances, mods, modpacks, settings…")}</span>
        <kbd className="flex items-center gap-0.5 rounded-chip border border-slate-line px-1.5 py-0.5 text-[11px]">
          <Command className="size-3" />K
        </kbd>
      </button>
    </header>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[360px] flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="glass glass-strong pointer-events-auto overflow-hidden rounded-panel p-4"
          >
            <div className="flex items-start gap-3">
              {t.tone === "success" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-copper" /> : t.tone === "error" ? <XCircle className="mt-0.5 size-5 shrink-0 text-redstone" /> : t.tone === "progress" ? <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-copper" /> : <Info className="mt-0.5 size-5 shrink-0 text-muted" />}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[13px] text-muted" data-selectable>{t.body}</p>}
                {t.action && (
                  <button type="button" onClick={() => { t.action!.run(); dismiss(t.id); }} className="press mt-2 rounded-chip bg-copper/15 px-2.5 py-1 text-[13px] font-medium text-copper hover:bg-copper/25">
                    {t.action.label}
                  </button>
                )}
              </div>
              <button type="button" aria-label={tr("Dismiss")} onClick={() => dismiss(t.id)} className="text-muted hover:text-text">
                <X className="size-4" />
              </button>
            </div>
            {t.tone === "progress" && t.progress !== undefined && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-line">
                <motion.div className="h-full rounded-full bg-copper" animate={{ width: `${Math.round(t.progress * 100)}%` }} transition={{ ease: "easeOut" }} />
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
