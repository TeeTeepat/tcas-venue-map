// Snapshot official TCAS70 TGAT/TPAT2-5 venue data from mytcas into src/data/venues.json.
// Usage: node scripts/build-data.mjs [--refresh-coords]
//
// Sources (public, published by mytcas.com/venues):
//   https://assets.mytcas.com/70/tgattpat/venues.json         seats per venue per exam day
//   https://assets.mytcas.com/70/tgattpat/venue-details.json  map link, transit, aircon
//
// Merge mirrors the logic in mytcas's own venue page script: details are joined on
// `${name}_${exam_type}`, falling back to `โรงเรียน${name}_${exam_type}`.
// Coordinates are resolved from the Google Maps short links once and cached in
// data/coords-cache.json (committed), so builds do not depend on short links staying alive.

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BASE = "https://assets.mytcas.com/70/tgattpat";
const CACHE_FILE = path.join(ROOT, "data/coords-cache.json");
const OUT_FILE = path.join(ROOT, "src/data/venues.json");
const UA = { "User-Agent": "Mozilla/5.0 (tcas-venue-map data snapshot)" };

// Exam day index in venues.json -> date and exams (from mytcas subject <select>: 1_tgat, 1_tpat3, 2_tpat2, 2_tpat5, 3_tpat4)
export const DAYS = {
  1: { date: "2027-01-30", exams: ["TGAT", "TPAT3"] },
  2: { date: "2027-01-31", exams: ["TPAT2", "TPAT5"] },
  3: { date: "2027-02-01", exams: ["TPAT4"] },
};

async function getJson(url) {
  const res = await fetch(`${url}?ts=${Date.now().toString(16)}`, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function parseCoords(url) {
  if (!url) return null;
  // Prefer the place pin (!3d<lat>!4d<lng>) over the camera centre (@lat,lng).
  const pin = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pin) return { lat: +pin[1], lng: +pin[2], precision: "pin" };
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: +at[1], lng: +at[2], precision: "camera" };
  const q = url.match(/[?&](?:q|ll|query)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (q) return { lat: +q[1], lng: +q[2], precision: "pin" };
  return null;
}

async function resolveMapLink(shortUrl) {
  // Follow redirects manually so we can inspect each Location header.
  let url = shortUrl;
  for (let hop = 0; hop < 6; hop++) {
    const direct = parseCoords(url);
    if (direct && direct.precision === "pin") return { ...direct, resolved: url };
    const res = await fetch(url, { headers: UA, redirect: "manual" });
    const loc = res.headers.get("location");
    if (!loc) {
      // Some links land on an HTML page that embeds the final URL.
      if (res.ok) {
        const html = await res.text();
        const m = html.match(/https:\/\/www\.google\.com\/maps\/[^"'\s\\]+/);
        if (m) {
          const c = parseCoords(decodeURIComponent(m[0]));
          if (c) return { ...c, resolved: m[0] };
        }
      }
      return direct ? { ...direct, resolved: url } : null;
    }
    url = new URL(loc, url).toString();
  }
  const c = parseCoords(url);
  return c ? { ...c, resolved: url } : null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
        await new Promise((r) => setTimeout(r, 150));
      }
    }),
  );
  return out;
}

const slugHash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 8);

async function main() {
  const refresh = process.argv.includes("--refresh-coords");
  const [venues, details] = await Promise.all([
    getJson(`${BASE}/venues.json`),
    getJson(`${BASE}/venue-details.json`),
  ]);

  const detailByKey = {};
  for (const d of details) detailByKey[`${d.name}_${d.exam_type}`] = d;
  const findDetail = (name, type) =>
    detailByKey[`${name}_${type}`] || detailByKey[`โรงเรียน${name}_${type}`] || null;

  // Group rows into physical venues (same university centre + same name).
  const groups = new Map();
  let droppedZero = 0;
  for (const row of venues) {
    const total = (row.seats || 0) + (row.special_seats || 0) + (row.cbt_seats || 0);
    if (total === 0 || !DAYS[row.date]) {
      if (total > 0) console.warn(`WARNING: dropping row with ${total} seats (date=${row.date}): ${row.name}`);
      droppedZero++;
      continue;
    }
    const key = `${row.university_id}|${row.name}`;
    if (!groups.has(key)) groups.set(key, { rows: [], details: [] });
    const g = groups.get(key);
    g.rows.push(row);
    const det = findDetail(row.name, row.exam_type);
    if (det && !g.details.includes(det)) g.details.push(det);
  }

  const cache = existsSync(CACHE_FILE) ? JSON.parse(await readFile(CACHE_FILE, "utf8")) : {};

  const list = [...groups.values()].map(({ rows, details: dets }) => {
    const first = rows[0];
    const det = dets.find((d) => d.exam_type === "pbt") || dets[0] || null;
    const days = {};
    for (const r of rows) {
      const d = (days[r.date] ||= { seats: 0, specialSeats: 0, cbtSeats: 0 });
      d.seats += r.seats || 0;
      d.specialSeats += r.special_seats || 0;
      d.cbtSeats += r.cbt_seats || 0;
    }
    const dayList = Object.keys(days)
      .map(Number)
      .sort()
      .map((n) => ({ day: n, date: DAYS[n].date, exams: DAYS[n].exams, ...days[n] }));
    const id = det?.short_id || `v${slugHash(`${first.university_id}|${first.name}`)}`;
    return {
      id,
      name: first.name,
      province: first.province,
      amphur: first.amphur,
      universityId: first.university_id,
      centre: det?.university_name || null,
      examTypes: [...new Set(rows.map((r) => r.exam_type))].sort(),
      days: dayList,
      exams: [...new Set(dayList.flatMap((d) => d.exams))],
      maxSeats: Math.max(...dayList.map((d) => d.seats + d.specialSeats + d.cbtSeats)),
      transit: det?.transit || null, // "รถไฟฟ้า" | "ไม่มีรถไฟฟ้า" | null
      aircon: det?.aircon || null, // "แอร์ทุกห้อง" | "แอร์บางห้อง" | "ไม่มีแอร์ทุกห้อง" | null
      mapUrl: det?.map && /^https:\/\//.test(det.map) ? det.map : null,
      lat: null,
      lng: null,
      coordPrecision: null,
    };
  });

  // Ensure unique ids (two groups could share a short_id if mytcas reuses it).
  const seen = new Map();
  for (const v of list) {
    const n = seen.get(v.id) || 0;
    seen.set(v.id, n + 1);
    if (n > 0) v.id = `${v.id}-${n + 1}`;
  }

  const toResolve = list.filter((v) => v.mapUrl && (refresh || !cache[v.mapUrl]));
  console.log(`resolving ${toResolve.length} map links...`);
  await mapLimit(toResolve, 4, async (v) => {
    try {
      const c = await resolveMapLink(v.mapUrl);
      cache[v.mapUrl] = c || { failed: true };
    } catch (e) {
      cache[v.mapUrl] = { failed: true, error: String(e.message || e) };
    }
  });
  for (const v of list) {
    const c = v.mapUrl && cache[v.mapUrl];
    if (c && !c.failed) {
      v.lat = c.lat;
      v.lng = c.lng;
      v.coordPrecision = c.precision;
    }
  }

  // Manual/geocoded fallbacks live in data/coords-manual.json keyed by venue id.
  const manualFile = path.join(ROOT, "data/coords-manual.json");
  if (existsSync(manualFile)) {
    const manual = JSON.parse(await readFile(manualFile, "utf8"));
    for (const v of list) {
      const m = manual[v.id];
      if (m && v.lat == null) {
        v.lat = m.lat;
        v.lng = m.lng;
        v.coordPrecision = m.precision || "approx";
      }
    }
  }

  list.sort((a, b) => a.province.localeCompare(b.province, "th") || a.name.localeCompare(b.name, "th"));

  await mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 1));
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        tcasYear: 70,
        generatedAt: new Date().toISOString(),
        source: "https://www.mytcas.com/venues",
        days: DAYS,
        venues: list,
      },
      null,
      1,
    ),
  );

  const stat = (f) => list.filter(f).length;
  console.log({
    rawRows: venues.length,
    droppedZeroSeatRows: droppedZero,
    venues: list.length,
    provinces: new Set(list.map((v) => v.province)).size,
    withDetails: stat((v) => v.transit || v.aircon || v.mapUrl),
    noDetailsMatch: stat((v) => !v.mapUrl && !v.transit && !v.aircon),
    noMapLink: stat((v) => !v.mapUrl),
    withCoords: stat((v) => v.lat != null),
    pinPrecision: stat((v) => v.coordPrecision === "pin"),
    cameraPrecision: stat((v) => v.coordPrecision === "camera"),
    missingCoords: stat((v) => v.lat == null),
    totalMaxSeats: list.reduce((s, v) => s + v.maxSeats, 0),
  });
  const missing = list.filter((v) => v.lat == null);
  if (missing.length) console.log("missing coords:", missing.map((v) => `${v.id} ${v.name} (${v.province})`).join("\n  "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
