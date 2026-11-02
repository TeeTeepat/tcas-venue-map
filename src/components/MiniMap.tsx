"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLE } from "./VenueMap";

export default function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: MAP_STYLE,
      center: [lng, lat],
      zoom: 15,
      interactive: false,
      attributionControl: { compact: true },
    });
    const dot = document.createElement("div");
    dot.className = "h-4 w-4 rounded-full border-[3px] border-white bg-[#0071e3] shadow-[0_2px_8px_rgba(0,0,0,.3)]";
    new maplibregl.Marker({ element: dot }).setLngLat([lng, lat]).addTo(m);
    return () => m.remove();
  }, [lat, lng]);
  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
