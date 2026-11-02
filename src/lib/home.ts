"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Home = { lat: number; lng: number };

const KEY = "tcas-venue-map:home";
const listeners = new Set<() => void>();
let cached: Home | null | undefined;

function read(): Home | null {
  if (cached !== undefined) return cached;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    cached = v && typeof v.lat === "number" && typeof v.lng === "number" ? { lat: v.lat, lng: v.lng } : null;
  } catch {
    cached = null;
  }
  return cached ?? null;
}

function write(h: Home | null) {
  cached = h;
  try {
    if (h) localStorage.setItem(KEY, JSON.stringify(h));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) - keep in memory only */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cached = undefined;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Home pin persisted only in this browser's localStorage. Never sent anywhere. */
export function useHome() {
  const home = useSyncExternalStore(subscribe, read, () => null);
  const setHome = useCallback((h: Home | null) => write(h), []);
  return [home, setHome] as const;
}

export function locateMe(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
