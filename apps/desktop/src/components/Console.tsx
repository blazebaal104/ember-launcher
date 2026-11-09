import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Search, Trash2 } from "lucide-react";
import { clearLog, useLog } from "../lib/logs";
import { IconButton, inputClass } from "./ui";

/** Live console with filter, copy, clear and level colouring. Optional command input (servers). */
export function Console({ logKey, onCommand, placeholder }: { logKey: string; onCommand?: (cmd: string) => void; placeholder?: string }) {
  const lines = useLog(logKey);
  const [filter, setFilter] = useState("");
  const [cmd, setCmd] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const shown = useMemo(() => (filter ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())) : lines).slice(-1500), [lines, filter]);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [shown]);

  const tone = (l: string) => (/\b(ERROR|FATAL|Exception|\[stderr\])/.test(l) ? "text-redstone" : /\bWARN/.test(l) ? "text-gold" : /\bINFO/.test(l) ? "text-text/85" : "text-muted");

  return (
    <div className="flex h-full min-h-[360px] flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter lines" className={`${inputClass} pl-9`} />
        </div>
        <IconButton icon={Copy} label="Copy log" onClick={() => navigator.clipboard?.writeText(lines.join("\n"))} />
        <IconButton icon={Trash2} label="Clear" onClick={() => clearLog(logKey)} />
      </div>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 overflow-auto rounded-card border border-slate-line bg-black/40 p-3 font-[ui-monospace,Consolas,monospace] text-[12px] leading-[1.55]"
        data-selectable
      >
        {shown.length === 0 ? <p className="text-muted">Nothing here yet. Output appears when it starts.</p> : shown.map((l, i) => <div key={i} className={`whitespace-pre-wrap break-all ${tone(l)}`}>{l}</div>)}
      </div>
      {onCommand && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (cmd.trim()) onCommand(cmd.trim());
            setCmd("");
          }}
        >
          <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder={placeholder ?? "Type a command, e.g. op YourName"} className={`${inputClass} font-[ui-monospace,Consolas,monospace]`} />
        </form>
      )}
    </div>
  );
}
