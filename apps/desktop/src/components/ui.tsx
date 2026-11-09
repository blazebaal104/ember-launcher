/**
 * Ember UI kit. Every pressable element uses `press` (lift + light sweep + press-down) and
 * cards use `lift`, so hover feedback is consistent across the app.
 */
import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { click } from "../lib/sounds";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-copper text-on-accent press-accent",
  secondary: "bg-slate-raised text-text hover:bg-slate-line border border-slate-line",
  ghost: "text-muted hover:text-text hover:bg-slate-raised",
  danger: "bg-redstone/12 text-redstone hover:bg-redstone/20 border border-redstone/25",
};
const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[13px] gap-1.5",
  md: "px-4 py-2 text-[14px] gap-2",
  lg: "px-6 py-3 text-[16px] gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, loading, className = "", children, onClick, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      onClick={(e) => {
        click();
        onClick?.(e);
      }}
      className={`press inline-flex select-none items-center justify-center rounded-card font-medium disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : Icon ? <Icon className={size === "lg" ? "size-5" : "size-4"} aria-hidden /> : null}
      {children}
    </button>
  );
});

export function IconButton({ icon: Icon, label, active, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`press grid size-9 place-items-center rounded-chip ${active ? "bg-copper/15 text-copper" : "text-muted hover:bg-slate-raised hover:text-text"} ${className}`}
      {...rest}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-hidden />;
}

export function Glass({ className = "", children, strong, ...rest }: React.HTMLAttributes<HTMLDivElement> & { strong?: boolean }) {
  return (
    <div className={`glass ${strong ? "glass-strong" : ""} rounded-panel ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** Tabs with a sliding active pill (shared layout animation). */
export function Tabs<T extends string>({ tabs, value, onChange, className = "" }: { tabs: Array<{ id: T; label: string; icon?: LucideIcon; count?: number }>; value: T; onChange: (v: T) => void; className?: string }) {
  const group = useId();
  return (
    <div role="tablist" className={`flex flex-wrap gap-1 ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={t.id === value}
          onClick={() => {
            click();
            onChange(t.id);
          }}
          className={`press relative flex items-center gap-2 rounded-chip px-3.5 py-2 text-[14px] ${t.id === value ? "text-text" : "text-muted hover:text-text"}`}
        >
          {t.id === value && <motion.span layoutId={`tab-${group}`} className="absolute inset-0 rounded-chip bg-slate-raised" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          {t.icon && <t.icon className="relative size-4" aria-hidden />}
          <span className="relative">{t.label}</span>
          {t.count !== undefined && <span className="relative rounded-full bg-slate-line px-1.5 text-[11px] tabular-nums text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** The bare on/off switch. Fixed 44×24 box, so it lines up wherever it's placed. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        click();
        onChange(!checked);
      }}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper disabled:opacity-50 ${checked ? "bg-copper" : "bg-slate-line"}`}
    >
      <motion.span
        aria-hidden
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className="block size-5 rounded-full bg-white shadow"
      />
    </button>
  );
}

/** A labelled setting row with a switch on the right. */
export function Toggle({ checked, onChange, label, detail, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; detail?: ReactNode; disabled?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? "opacity-50" : ""}`}>
      <span className="min-w-0 cursor-pointer" onClick={() => !disabled && (click(), onChange(!checked))}>
        <span className="block text-[14px] font-medium">{label}</span>
        {detail && <span className="block text-[13px] text-muted">{detail}</span>}
      </span>
      <span className="mt-0.5"><Switch checked={checked} onChange={onChange} label={label} disabled={disabled} /></span>
    </div>
  );
}

export function Slider({ value, onChange, min, max, step = 1, label, format, detail }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: ReactNode; format?: (v: number) => string; detail?: ReactNode }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-medium">{label}</span>
        <span className="text-[13px] tabular-nums text-copper">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ember-range h-2 w-full cursor-pointer appearance-none rounded-full"
        style={{ background: `linear-gradient(to right, var(--accent) ${pct}%, var(--line) ${pct}%)` }}
      />
      {detail && <span className="mt-1 block text-[12px] text-muted">{detail}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ id: T; label: string; icon?: LucideIcon }>; value: T; onChange: (v: T) => void }) {
  const group = useId();
  return (
    <div className="inline-flex rounded-card bg-slate-raised p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => {
            click();
            onChange(o.id);
          }}
          className={`press relative flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-[13px] ${o.id === value ? "text-on-accent" : "text-muted hover:text-text"}`}
        >
          {o.id === value && <motion.span layoutId={`seg-${group}`} className="absolute inset-0 rounded-chip bg-copper" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
          {o.icon && <o.icon className="relative size-3.5" aria-hidden />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "gold" | "danger" }) {
  const t = { neutral: "bg-slate-raised text-muted", accent: "bg-copper/15 text-copper", gold: "bg-gold/15 text-gold", danger: "bg-redstone/15 text-redstone" }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[12px] ${t}`}>{children}</span>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-card ${className}`} aria-hidden />;
}

export function Empty({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-slate-line px-8 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-copper/12 text-copper">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="text-[17px] font-bold">{title}</h3>
      {children && <p className="max-w-[48ch] text-[14px] text-muted">{children}</p>}
      {action}
    </motion.div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

const fieldBase = "rounded-card border border-slate-line bg-slate-raised/70 px-3 py-2 text-[14px] text-text placeholder:text-muted/70 transition-colors hover:border-muted focus:border-copper focus:outline-none";
export const inputClass = `w-full ${fieldBase}`;
/** For inline filter selects that size to their content. */
export const selectClass = `w-auto cursor-pointer ${fieldBase}`;

/** Animated glass modal. Escape and the backdrop close it. */
export function Modal({ open, onClose, title, children, width = "w-[600px]", footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={`glass glass-strong relative flex max-h-[88vh] ${width} max-w-full flex-col rounded-panel`}
          >
            <div className="flex items-center justify-between border-b border-slate-line/70 px-6 py-4">
              <h2 className="text-[18px] font-bold">{title}</h2>
              <IconButton icon={X} label="Close" onClick={onClose} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-slate-line/70 px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Circular confidence meter used by the transfer tool. */
export function Ring({ value, size = 40 }: { value: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const tone = value >= 0.75 ? "var(--accent)" : value >= 0.5 ? "#e3b341" : "#e5484d";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${Math.round(value * 100)}% match`} role="img">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value) }} transition={{ duration: 0.9, ease: "easeOut" }} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="54%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.28} fill="var(--text)" fontWeight="700">
        {Math.round(value * 100)}
      </text>
    </svg>
  );
}
