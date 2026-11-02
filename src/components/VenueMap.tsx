"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Home, MyLocation } from "@/lib/home";
import { AIRCON_COLORS, airconInfo, type Venue } from "@/lib/venues";

// Free vector tiles, no API key, no usage cap. Swap the style URL here if ever needed.
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const THAILAND_BOUNDS: [[number, number], [number, number]] = [
  [97.3, 5.6],
  [105.7, 20.5],
];

// Versioned URL so browsers that cached a bad copy of the worker fetch a fresh one.
// .js (not .mjs) so Cloudflare caches it at the edge; still loaded as a module worker.
maplibregl.setWorkerUrl(`/maplibre-gl-worker.js?v=${maplibregl.getVersion()}-3`);

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

type Props = {
  venues: Venue[];
  ranks: Record<string, number>;
  selectedId: string | null;
  home: Home | null;
  pickMode: boolean;
  padding: { top: number; bottom: number; left: number; right: number };
  focus: { lat: number; lng: number; zoom?: number; key: number } | null;
  fit: { points: { lat: number; lng: number }[]; key: number } | null;
  onSelect: (id: string | null) => void;
  onPick: (pos: { lat: number; lng: number }) => void;
  onHomeDrag: (pos: { lat: number; lng: number }) => void;
  me: MyLocation | null;
  onLocate: () => void;
};

/** Map button (under zoom) that centres on the user's live location. */
class LocateControl implements maplibregl.IControl {
  private box?: HTMLDivElement;
  constructor(private onClick: () => void) {}
  onAdd() {
    const box = document.createElement("div");
    box.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "locate-btn";
    btn.title = "ตำแหน่งปัจจุบันของฉัน";
    btn.setAttribute("aria-label", "ตำแหน่งปัจจุบันของฉัน");
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M21.4 2.6a.9.9 0 0 0-1-.2L2.9 10a.9.9 0 0 0 .1 1.7l7.2 2.1 2.1 7.2a.9.9 0 0 0 1.7.1l7.6-17.5a.9.9 0 0 0-.2-1z"/></svg>';
    btn.addEventListener("click", () => this.onClick());
    box.appendChild(btn);
    this.box = box;
    return box;
  }
  onRemove() {
    this.box?.remove();
  }
}

function toGeoJSON(venues: Venue[], ranks: Record<string, number>, selectedId: string | null): GeoJSON.FeatureCollection {
  // Ranked venues last so they draw on top.
  const ordered = [...venues].sort((a, b) => (ranks[a.id] ? 1 : 0) - (ranks[b.id] ? 1 : 0));
  return {
    type: "FeatureCollection",
    features: ordered.map((v) => ({
      type: "Feature",
      id: v.id,
      properties: {
        id: v.id,
        selected: v.id === selectedId ? 1 : 0,
        color: AIRCON_COLORS[airconInfo(v.aircon).tone],
        rank: ranks[v.id] ?? 0,
      },
      geometry: { type: "Point", coordinates: [v.lng, v.lat] },
    })),
  };
}

export default function VenueMap(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const homeMarker = useRef<Marker | null>(null);
  const meMarker = useRef<Marker | null>(null);
  const flyToMePending = useRef(false);
  const ready = useRef(false);
  const [webglMissing] = useState(() => !hasWebGL());
  const [loadFailed, setLoadFailed] = useState(false);
  const failure = webglMissing ? "webgl" : loadFailed ? "load" : null;
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  // Create map once.
  useEffect(() => {
    if (!el.current || webglMissing) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: MAP_STYLE,
      bounds: THAILAND_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(
      new LocateControl(() => {
        const me = latest.current.me;
        if (me) m.flyTo({ center: [me.lng, me.lat], zoom: Math.max(m.getZoom(), 15), padding: latest.current.padding, speed: 1.6 });
        else {
          flyToMePending.current = true; // fly once the first fix arrives
          latest.current.onLocate();
        }
      }),
      "top-right",
    );
    // Top corner so the bottom sheet never hides the required OSM attribution.
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
    map.current = m;

    // If the map never finishes loading (blocked worker/tiles, bad network), say so instead of a blank area.
    const loadTimer = window.setTimeout(() => {
      if (!ready.current) setLoadFailed(true);
    }, 15000);
    m.on("load", () => {
      window.clearTimeout(loadTimer);
      setLoadFailed(false);
      m.addSource("venues", {
        type: "geojson",
        data: toGeoJSON(latest.current.venues, latest.current.ranks, latest.current.selectedId),
      });
      m.addLayer({
        id: "venue-halo",
        type: "circle",
        source: "venues",
        filter: ["==", ["get", "selected"], 1],
        paint: {
          "circle-radius": 19,
          "circle-color": "#0071e3",
          "circle-opacity": 0.14,
          "circle-stroke-color": "#0071e3",
          "circle-stroke-width": 2.5,
        },
      });
      m.addLayer({
        id: "venue-dot",
        type: "circle",
        source: "venues",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            ["case", [">", ["get", "rank"], 0], 9, ["==", ["get", "selected"], 1], 8, 4.5],
            10,
            ["case", [">", ["get", "rank"], 0], 12, ["==", ["get", "selected"], 1], 10, 7],
            14,
            ["case", [">", ["get", "rank"], 0], 13, ["==", ["get", "selected"], 1], 11, 8.5],
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 1.5, 12, 2.5],
        },
      });
      // Rank numbers 1-5 on the recommended venues.
      m.addLayer({
        id: "venue-rank",
        type: "symbol",
        source: "venues",
        filter: [">", ["get", "rank"], 0],
        layout: {
          "text-field": ["to-string", ["get", "rank"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 10, 14],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff" },
      });
      // Invisible, larger hit area so dots are tappable on phones.
      m.addLayer({
        id: "venue-hit",
        type: "circle",
        source: "venues",
        paint: { "circle-radius": 16, "circle-opacity": 0 },
      });
      m.on("click", "venue-hit", (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id && !latest.current.pickMode) latest.current.onSelect(id);
      });
      m.on("mouseenter", "venue-hit", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "venue-hit", () => (m.getCanvas().style.cursor = ""));
      // Start collapsed to the (i) button; tapping it reveals the attribution.
      el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      ready.current = true;
      m.setPadding(latest.current.padding);
    });

    m.on("click", (e) => {
      const p = latest.current;
      if (p.pickMode) {
        p.onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        return;
      }
      const hits = m.getLayer("venue-hit") ? m.queryRenderedFeatures(e.point, { layers: ["venue-hit"] }) : [];
      if (!hits.length) p.onSelect(null);
    });

    return () => {
      window.clearTimeout(loadTimer);
      ready.current = false;
      m.remove();
      map.current = null;
    };
  }, [webglMissing]);

  // Venue data / selection.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource("venues") as GeoJSONSource | undefined)?.setData(toGeoJSON(props.venues, props.ranks, props.selectedId));
  }, [props.venues, props.ranks, props.selectedId]);

  // Padding follows the bottom sheet / sidebar.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    m.easeTo({ padding: props.padding, duration: 250 });
  }, [props.padding]);

  // Fly to requested focus.
  useEffect(() => {
    const m = map.current;
    const f = props.focus;
    if (!m || !f) return;
    const go = () => m.flyTo({ center: [f.lng, f.lat], zoom: f.zoom ?? Math.max(m.getZoom(), 13), padding: latest.current.padding, speed: 1.6 });
    go();
  }, [props.focus]);

  // Live "you are here" dot with accuracy halo (does not move the camera).
  useEffect(() => {
    const m = map.current;
    const me = props.me;
    if (!m) return;
    if (!me) {
      meMarker.current?.remove();
      meMarker.current = null;
      return;
    }
    if (!meMarker.current) {
      const node = document.createElement("div");
      node.className = "me-dot";
      node.setAttribute("aria-label", "ตำแหน่งปัจจุบันของคุณ");
      node.innerHTML = '<span class="me-halo"></span><span class="me-core"></span>';
      meMarker.current = new maplibregl.Marker({ element: node }).setLngLat([me.lng, me.lat]).addTo(m);
    } else {
      meMarker.current.setLngLat([me.lng, me.lat]);
    }
    if (flyToMePending.current) {
      flyToMePending.current = false;
      m.flyTo({ center: [me.lng, me.lat], zoom: Math.max(m.getZoom(), 15), padding: latest.current.padding, speed: 1.6 });
    }
  }, [props.me]);

  // Fit home + recommended venues.
  useEffect(() => {
    const m = map.current;
    const f = props.fit;
    if (!m || !f || f.points.length < 2) return;
    const b = new maplibregl.LngLatBounds();
    f.points.forEach((p) => b.extend([p.lng, p.lat]));
    // The map already carries the sheet/sidebar padding (setPadding); this is extra margin on top of it.
    m.fitBounds(b, { padding: { top: 90, bottom: 30, left: 40, right: 50 }, maxZoom: 14, duration: 700 });
  }, [props.fit]);

  // Home marker. Locked by default; draggable only while the user is moving it (pick mode).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const h = props.home;
    if (!h) {
      homeMarker.current?.remove();
      homeMarker.current = null;
      return;
    }
    if (!homeMarker.current) {
      const node = document.createElement("div");
      node.className = "home-pin";
      node.setAttribute("aria-label", "หมุดบ้าน");
      // Static markup (no user data), safe to set directly.
      node.innerHTML = `<span class="home-pin-head"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5h4.5v-5.5h4v5.5h4.5V9"/></svg></span><span class="home-pin-tip"></span>`;
      const mk = new maplibregl.Marker({ element: node, draggable: latest.current.pickMode, anchor: "bottom" })
        .setLngLat([h.lng, h.lat])
        .addTo(m);
      mk.on("dragend", () => {
        const ll = mk.getLngLat();
        latest.current.onHomeDrag({ lat: ll.lat, lng: ll.lng });
      });
      homeMarker.current = mk;
    } else {
      homeMarker.current.setLngLat([h.lng, h.lat]);
    }
  }, [props.home]);

  // Crosshair cursor + unlock the home pin only while picking.
  useEffect(() => {
    const m = map.current;
    if (m) m.getCanvas().style.cursor = props.pickMode ? "crosshair" : "";
    const mk = homeMarker.current;
    if (mk) {
      mk.setDraggable(props.pickMode);
      mk.getElement().classList.toggle("is-unlocked", props.pickMode);
    }
  }, [props.pickMode, props.home]);

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
      {failure && (
        <div className="absolute inset-x-0 top-24 z-10 flex justify-center px-6">
          <div className="glass max-w-xs rounded-2xl px-5 py-4 text-center">
            <p className="text-[15px] font-semibold text-[#1d1d1f]">แผนที่โหลดไม่ขึ้น</p>
            <p className="mt-1 text-[12.5px] leading-snug text-[#6e6e73]">
              {failure === "webgl"
                ? "เบราว์เซอร์นี้ปิดการแสดงผลกราฟิก (WebGL) ลองเปิดด้วย Safari หรือ Chrome แทนแอปแชต"
                : "เน็ตช้าหรือเบราว์เซอร์บล็อกไว้ ลองโหลดใหม่ หรือเปิดด้วย Safari / Chrome"}
            </p>
            <button onClick={() => window.location.reload()} className="mt-3 rounded-full bg-[#1d1d1f] px-4 py-2 text-[13px] font-medium text-white">
              โหลดใหม่
            </button>
            <p className="mt-2 text-[11.5px] text-[#86868b]">รายการสนามด้านล่างยังใช้ได้ตามปกติ</p>
          </div>
        </div>
      )}
    </div>
  );
}
