"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

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

export type MyLocation = { lat: number; lng: number; accuracy: number };

/**
 * Live "you are here" position. Starts automatically if location permission was
 * already granted; otherwise only after start() (a user tap), so we never prompt on load.
 */
export function useMyLocation() {
  const [me, setMe] = useState<MyLocation | null>(null);
  const [status, setStatus] = useState<"off" | "watching" | "denied" | "error">("off");
  const watchId = useRef<number | null>(null);

  const start = useCallback(() => {
    if (!("geolocation" in navigator) || watchId.current != null) return;
    setStatus("watching");
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setMe({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setStatus("watching");
      },
      (e) => {
        setStatus(e.code === 1 ? "denied" : "error");
        if (e.code === 1 && watchId.current != null) {
          navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null;
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((r) => {
        if (!cancelled && r.state === "granted") start();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [start]);

  return { me, status, start };
}
