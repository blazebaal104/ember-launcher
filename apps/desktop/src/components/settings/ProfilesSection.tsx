import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Keyboard, MonitorPlay, Plus, RotateCcw, Save, SlidersHorizontal, Star, Trash2, Volume2, Wrench } from "lucide-react";
import { api, type GameProfile } from "../../lib/ipc";
import { useProfiles } from "../../lib/queries";
import { KEYBINDS, OPTIONS, codeToMc, mouseToMc, prettyKey, type Group, type KeybindDef } from "../../lib/game-options";
import { useApp } from "../../state";
import { Badge, Button, Empty, Field, Glass, Slider, Tabs, Toggle, inputClass } from "../ui";
import { tr, trn } from "../../lib/i18n";

type Section = Group | "Keybinds" | "Advanced";

export function ProfilesSection() {
  const profiles = useProfiles();
  const qc = useQueryClient();
  const { toast } = useApp();
  const list = profiles.data?.profiles ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<GameProfile | null>(null);
  const [section, setSection] = useState<Section>("Video");
  const current = list.find((p) => p.id === selected) ?? list[0];

  useEffect(() => {
    if (current && current.id !== draft?.id) setDraft(structuredClone(current));
    if (!selected && current) setSelected(current.id);
  }, [current?.id]);

  const dirty = useMemo(() => !!draft && !!current && JSON.stringify(draft) !== JSON.stringify(current), [draft, current]);
  const store = (s: Awaited<ReturnType<typeof api.profiles>>) => qc.setQueryData(["profiles"], s);

  const save = async () => {
    if (!draft) return;
    store(await api.saveProfile(draft));
    toast({ title: tr("Profile saved"), body: tr("Instances using it get these settings on their next launch."), tone: "success" });
  };
  const create = async (from?: GameProfile) => {
    const s = await api.saveProfile({ id: "", name: from ? tr("{name} copy", { name: from.name }) : tr("New profile"), options: { ...(from?.options ?? {}) }, keybinds: { ...(from?.keybinds ?? {}) } });
    store(s);
    const newest = s.profiles[s.profiles.length - 1];
    if (newest) {
      setSelected(newest.id);
      setDraft(structuredClone(newest));
    }
  };
  const remove = async () => {
    if (!current) return;
    store(await api.deleteProfile(current.id));
    setSelected(null);
    setDraft(null);
  };

  if (!profiles.isLoading && list.length === 0) {
    return <Empty icon={SlidersHorizontal} title={tr("No game profiles")} action={<Button variant="primary" icon={Plus} onClick={() => create()}>{tr("Create a profile")}</Button>}>{tr("A profile stores your keybinds, FOV, video and sound settings so every new instance starts the way you like it.")}</Empty>;
  }

  const setOpt = (k: string, v: string) => setDraft((d) => (d ? { ...d, options: { ...d.options, [k]: v } } : d));
  const resetOpt = (k: string) => setDraft((d) => {
    if (!d) return d;
    const { [k]: _gone, ...rest } = d.options;
    return { ...d, options: rest };
  });
  const setKey = (id: string, v: string | null) => setDraft((d) => {
    if (!d) return d;
    const keybinds = { ...d.keybinds };
    if (v === null) delete keybinds[id];
    else keybinds[id] = v;
    return { ...d, keybinds };
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-muted">{tr("A profile is applied to an instance's options.txt: set things up once, every instance gets them.")}</p>
        {list.map((p) => (
          <button key={p.id} type="button" onClick={() => { setSelected(p.id); setDraft(structuredClone(p)); }} className={`press flex items-center gap-2 rounded-card px-3 py-2.5 text-left text-[14px] ${p.id === current?.id ? "bg-copper/15 text-text ring-1 ring-copper/50" : "text-muted hover:bg-slate-raised hover:text-text"}`}>
            <SlidersHorizontal className="size-4 shrink-0" />
            <span className="flex-1 truncate">{p.name}</span>
            {profiles.data?.defaultProfile === p.id && <Star className="size-3.5 text-gold" fill="currentColor" aria-label={tr("Default")} />}
          </button>
        ))}
        <Button icon={Plus} onClick={() => create()}>{tr("New profile")}</Button>
      </div>

      {draft && (
        <Glass className="flex min-w-0 flex-col gap-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={tr("Profile name")}><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${inputClass} w-64`} /></Field>
            <div className="ml-auto flex flex-wrap gap-2">
              {profiles.data?.defaultProfile !== draft.id ? (
                <Button size="sm" icon={Star} onClick={async () => store(await api.setDefaultProfile(draft.id))}>{tr("Use for new instances")}</Button>
              ) : <Badge tone="gold"><Star className="size-3" fill="currentColor" /> {tr("Default for new instances")}</Badge>}
              <Button size="sm" icon={Copy} onClick={() => create(draft)}>{tr("Duplicate")}</Button>
              <Button size="sm" variant="danger" icon={Trash2} onClick={remove}>{tr("Delete")}</Button>
            </div>
          </div>
          <Tabs<Section>
            value={section}
            onChange={setSection}
            tabs={[
              { id: "Video", label: tr("Video"), icon: MonitorPlay },
              { id: "Controls", label: tr("Controls"), icon: SlidersHorizontal },
              { id: "Keybinds", label: tr("Keybinds"), icon: Keyboard },
              { id: "Sound", label: tr("Sound"), icon: Volume2 },
              { id: "Chat & accessibility", label: tr("Chat & more"), icon: SlidersHorizontal },
              { id: "Advanced", label: tr("Advanced"), icon: Wrench },
            ]}
          />
          <AnimatePresence mode="wait">
            <motion.div key={section} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.16 }}>
              {section === "Keybinds" ? (
                <Keybinds draft={draft} setKey={setKey} />
              ) : section === "Advanced" ? (
                <Advanced draft={draft} setDraft={setDraft} />
              ) : (
                <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                  {OPTIONS.filter((o) => o.group === section).map((o) => {
                    const raw = draft.options[o.key];
                    const set = raw !== undefined;
                    const label = (
                      <span className="flex items-center gap-2">
                        {o.label}
                        {set && <button type="button" onClick={() => resetOpt(o.key)} title={tr("Use Minecraft's default")} className="text-muted hover:text-copper"><RotateCcw className="size-3.5" /></button>}
                      </span>
                    ) as unknown as string;
                    if (o.kind === "slider") return <Slider key={o.key} label={label} value={o.toUi(raw ?? o.def)} onChange={(v) => setOpt(o.key, o.fromUi(v))} min={o.min} max={o.max} step={o.step} format={o.format} detail={set ? undefined : tr("Minecraft default")} />;
                    if (o.kind === "toggle") return <Toggle key={o.key} label={o.label} detail={o.detail ?? (set ? undefined : tr("Minecraft default"))} checked={(raw ?? o.def) === "true"} onChange={(v) => setOpt(o.key, String(v))} />;
                    return (
                      <Field key={o.key} label={o.label} hint={set ? undefined : tr("Minecraft default")}>
                        <select value={raw ?? o.def} onChange={(e) => setOpt(o.key, e.target.value)} className={inputClass}>{o.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
                      </Field>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <AnimatePresence>
            {dirty && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-line/60 pt-4">
                <span className="mr-auto text-[13px] text-muted">{tr("Unsaved changes")}</span>
                <Button onClick={() => current && setDraft(structuredClone(current))}>{tr("Discard")}</Button>
                <Button variant="primary" icon={Save} onClick={save}>{tr("Save profile")}</Button>
              </motion.div>
            )}
          </AnimatePresence>
        </Glass>
      )}
    </div>
  );
}

function Keybinds({ draft, setKey }: { draft: GameProfile; setKey: (id: string, v: string | null) => void }) {
  const [capturing, setCapturing] = useState<string | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") return setCapturing(null);
      if (e.code === "Backspace" || e.code === "Delete") {
        setKey(capturing, "key.keyboard.unknown");
        return setCapturing(null);
      }
      const mc = codeToMc(e.code);
      if (mc) {
        setKey(capturing, mc);
        setCapturing(null);
      }
    };
    const onMouse = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-capture]")) return; // the click that started capture
      e.preventDefault();
      setKey(capturing, mouseToMc(e.button));
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onMouse, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onMouse, true);
    };
  }, [capturing, setKey]);

  const groups = [...new Set(KEYBINDS.map((k) => k.group))];
  const conflicts = useMemo(() => {
    const seen = new Map<string, string[]>();
    for (const k of KEYBINDS) {
      const v = draft.keybinds[k.id] ?? k.def;
      if (v === "key.keyboard.unknown") continue;
      seen.set(v, [...(seen.get(v) ?? []), k.id]);
    }
    return new Set([...seen.values()].filter((ids) => ids.length > 1).flat());
  }, [draft.keybinds]);

  const row = (k: KeybindDef) => {
    const value = draft.keybinds[k.id] ?? k.def;
    const changed = draft.keybinds[k.id] !== undefined;
    const isCap = capturing === k.id;
    return (
      <li key={k.id} className="flex items-center justify-between gap-3 py-2">
        <span className="text-[14px]">{k.label}</span>
        <span className="flex items-center gap-2">
          {changed && <button type="button" onClick={() => setKey(k.id, null)} title={tr("Reset")} className="text-muted hover:text-copper"><RotateCcw className="size-3.5" /></button>}
          <motion.button
            data-capture
            type="button"
            onClick={() => setCapturing(isCap ? null : k.id)}
            animate={isCap ? { scale: [1, 1.04, 1] } : { scale: 1 }}
            transition={isCap ? { repeat: Infinity, duration: 1 } : {}}
            className={`press min-w-36 rounded-card border px-3 py-1.5 text-[13px] font-medium ${isCap ? "border-copper bg-copper/15 text-copper" : conflicts.has(k.id) ? "border-gold/60 text-gold" : changed ? "border-copper/50 text-text" : "border-slate-line text-muted"}`}
          >
            {isCap ? tr("Press a key…") : prettyKey(value)}
          </motion.button>
        </span>
      </li>
    );
  };

  return (
    <div>
      <p className="mb-3 text-[13px] text-muted">{tr("Click a key, then press the key or mouse button you want. Backspace clears it, Escape cancels. Yellow means two actions share a key.")}</p>
      <div className="grid gap-x-8 md:grid-cols-2">
        {groups.map((g) => (
          <section key={g} className="mb-4">
            <h4 className="mb-1 text-[13px] font-bold text-copper">{tr(g)}</h4>
            <ul className="divide-y divide-slate-line/50">{KEYBINDS.filter((k) => k.group === g).map(row)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Advanced({ draft, setDraft }: { draft: GameProfile; setDraft: (p: GameProfile) => void }) {
  const known = new Set(OPTIONS.map((o) => o.key));
  const text = Object.entries(draft.options).filter(([k]) => !known.has(k)).map(([k, v]) => `${k}:${v}`).join("\n");
  const [value, setValue] = useState(text);
  useEffect(() => setValue(text), [draft.id]);
  const apply = (t: string) => {
    setValue(t);
    const extra: Record<string, string> = {};
    for (const line of t.split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) extra[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    const base = Object.fromEntries(Object.entries(draft.options).filter(([k]) => known.has(k)));
    setDraft({ ...draft, options: { ...base, ...extra } });
  };
  return (
    <div>
      <p className="mb-2 text-[13px] text-muted">{trn(tr("Any other options.txt line, as {code}. Copy lines from an existing options.txt to bring over settings Ember doesn't show (including mod settings stored there)."), { code: <code>key:value</code> })}</p>
      <textarea value={value} onChange={(e) => apply(e.target.value)} rows={12} spellCheck={false} className={`${inputClass} font-[ui-monospace,monospace] text-[13px]`} placeholder={tr("chatLinks:true\nnarrator:0\ntutorialStep:none")} />
    </div>
  );
}
