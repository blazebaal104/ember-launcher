import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { DiscoverMenu } from "./DiscoverMenu";

export function TopBar() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-3 border-b border-slate-line px-8 py-3">
      <form
        className="relative flex-1"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate(`/discover/mods?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search mods, packs and shaders"
          aria-label="Search content"
          className="w-full max-w-md rounded-chip bg-slate-surface py-2 pl-9 pr-3 text-[14px] placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-copper"
        />
      </form>
      <DiscoverMenu />
    </header>
  );
}
