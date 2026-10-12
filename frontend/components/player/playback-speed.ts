import { useSyncExternalStore } from "react";

/** The speeds our controls offer. */
export const SPEEDS: readonly number[] = [0.5, 0.75, 1];

const STORAGE_KEY = "playback-speed";

// YouTube's own menu offers 0.25× to 2×, and those are kept too.
const MIN_SPEED = 0.25;
const MAX_SPEED = 2;

export function formatSpeed(speed: number): string {
  return `${speed}×`;
}

/**
 * One step slower, and back to 1× after the slowest or from a speed only
 * YouTube's menu offers.
 */
export function nextSpeed(speed: number): number {
  const index = SPEEDS.indexOf(speed);
  return index > 0 ? SPEEDS[index - 1] : 1;
}

/**
 * The listener's speed, kept in localStorage across clips and visits. The
 * server and the first render use 1×.
 */
export function usePlaybackSpeed(): [number, (speed: number) => void] {
  const speed = useSyncExternalStore(subscribe, getSpeed, () => 1);
  return [speed, setSpeed];
}

// Kept in memory too, so the speed still changes where storage is blocked.
let current: number | undefined;
const listeners = new Set<() => void>();

function getSpeed(): number {
  current ??= parseSpeed(readStorage());
  return current;
}

function setSpeed(speed: number) {
  if (speed === current) return;
  current = speed;
  try {
    localStorage.setItem(STORAGE_KEY, String(speed));
  } catch {}
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    current = parseSpeed(event.newValue);
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseSpeed(value: string | null): number {
  const speed = Number(value);
  return value && speed >= MIN_SPEED && speed <= MAX_SPEED ? speed : 1;
}
