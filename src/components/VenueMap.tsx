"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Home } from "@/lib/home";
import { AIRCON_COLORS, airconInfo, type Venue } from "@/lib/venues";

// Free vector tiles, no API key, no usage cap. Swap the style URL here if ever needed.
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const THAILAND_BOUNDS: [[number, number], [number, number]] = [
  [97.3, 5.6],
  [105.7, 20.5],
];

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

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
};

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
  const ready = useRef(false);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  // Create map once.
  useEffect(() => {
    if (!el.current) return;
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
    // Top corner so the bottom sheet never hides the required OSM attribution.
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
    map.current = m;

    m.on("load", () => {
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
      ready.current = false;
      m.remove();
      map.current = null;
    };
  }, []);

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

  // Emoji home marker.
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
      node.setAttribute("aria-label", "หมุดบ้าน (ลากเพื่อย้าย)");
      const mk = new maplibregl.Marker({ element: node, draggable: true, anchor: "bottom" }).setLngLat([h.lng, h.lat]).addTo(m);
      mk.on("dragend", () => {
        const ll = mk.getLngLat();
        latest.current.onHomeDrag({ lat: ll.lat, lng: ll.lng });
      });
      homeMarker.current = mk;
    } else {
      homeMarker.current.setLngLat([h.lng, h.lat]);
    }
    const node = homeMarker.current.getElement();
    const emoji = document.createElement("span");
    emoji.className = "home-pin-emoji";
    emoji.textContent = h.emoji;
    const tip = document.createElement("span");
    tip.className = "home-pin-tip";
    node.replaceChildren(emoji, tip);
  }, [props.home]);

  // Crosshair cursor while picking.
  useEffect(() => {
    const m = map.current;
    if (m) m.getCanvas().style.cursor = props.pickMode ? "crosshair" : "";
  }, [props.pickMode]);

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
