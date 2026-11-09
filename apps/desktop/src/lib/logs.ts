/** Keeps the last lines of every game/server console so logs survive page changes. */
import { useSyncExternalStore } from "react";
import { onEvent } from "./ipc";

const MAX = 3000;
const store = new Map<string, string[]>();
const listeners = new Set<() => void>();
let version = 0;

function push(key: string, line: string) {
  const arr = store.get(key) ?? [];
  arr.push(line);
  if (arr.length > MAX) arr.splice(0, arr.length - MAX);
  store.set(key, arr);
  version++;
  listeners.forEach((l) => l());
}

let started = false;
export function startLogCapture() {
  if (started) return;
  started = true;
  onEvent<{ instanceId: string; line: string }>("game-log", (p) => push(`game:${p.instanceId}`, p.line));
  onEvent<{ serverId: string; line: string }>("server-log", (p) => push(`server:${p.serverId}`, p.line));
}

export function clearLog(key: string) {
  store.set(key, []);
  version++;
  listeners.forEach((l) => l());
}

export function useLog(key: string): string[] {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return store.get(key) ?? [];
}
