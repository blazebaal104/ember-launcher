import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { CATEGORIES } from "../lib/categories";

/**
 * "Discover content" dropdown for the top bar. Keyboard: Enter/Space opens,
 * arrows move, Escape closes, focus returns to the trigger.
 */
export function DiscoverMenu() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (open) items.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-discover-menu]")) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const choose = (i: number) => {
    setOpen(false);
    navigate(`/discover/${CATEGORIES[i]!.id}`);
    trigger.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % CATEGORIES.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + CATEGORIES.length) % CATEGORIES.length);
    }
  };

  return (
    <div className="relative" data-discover-menu onKeyDown={onKey}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-chip bg-slate-surface px-3 py-2 text-[14px] font-medium hover:bg-slate-raised"
      >
        Discover content <ChevronDown className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-[360px] rounded-panel border border-slate-line bg-slate-surface p-2 shadow-2xl shadow-black/40">
          {CATEGORIES.map((c, i) => (
            <button
              key={c.id}
              ref={(el) => {
                items.current[i] = el;
              }}
              role="menuitem"
              type="button"
              onClick={() => choose(i)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-start gap-3 rounded-card px-3 py-2.5 text-left outline-none ${i === active ? "bg-slate-raised" : ""}`}
            >
              <c.icon className="mt-0.5 size-[18px] shrink-0 text-copper" aria-hidden />
              <span>
                <span className="block text-[14px] font-medium text-text">{c.label}</span>
                <span className="block text-[13px] leading-snug text-muted">{c.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
