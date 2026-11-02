"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { locateMe, useHome, useMyLocation } from "@/lib/home";
import { DonateButton } from "./Donate";
import {
  AIRCON_COLORS,
  DATA,
  EXAMS,
  airconTier,
  VENUES,
  airconInfo,
  directionsUrl,
  displayName,
  distanceKm,
  fmt,
  formatKm,
  searchKey,
  seatsFor,
  thaiDate,
  transitInfo,
  type ExamCode,
  type LatLng,
  type Venue,
} from "@/lib/venues";
import { ArrowIcon, Chip, ChevronIcon, HouseIcon, LocateIcon, LockIcon, SearchIcon, SnowIcon, TrainIcon } from "./ui";

const VenueMap = dynamic(() => import("./VenueMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#f2f2f4]" />,
});

type Snap = "peek" | "half" | "full";
const PEEK = 176;

function useIsDesktop() {
  const [d, setD] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setD(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return d;
}

function useViewportHeight() {
  const [h, setH] = useState(800);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return h;
}

type Row = { v: Venue; km: number | null; seats: number | null; rank?: number | null };

/**
 * In "A/C first" mode, A/C venues only win if they are within this radius:
 * at least 50 km, or 1.5x the distance to the 5th-nearest venue (so rural areas,
 * where venues are far apart, still get A/C picks instead of nothing).
 */
const AC_MIN_RADIUS_KM = 50;
const AC_RADIUS_FACTOR = 1.5;
const TOP_N = 5;

const HAY = new Map(VENUES.map((v) => [v.id, searchKey(`${displayName(v)}${v.name}${v.amphur}${v.province}${v.centre ?? ""}`)]));

function computeRows(exam: ExamCode | null, q: string, home: LatLng | null, acFirst: boolean): Row[] {
  const tokens = q.split(/\s+/).map(searchKey).filter(Boolean);
  let list = VENUES.filter((v) => !exam || v.exams.includes(exam));
  if (tokens.length) list = list.filter((v) => tokens.every((t) => HAY.get(v.id)!.includes(t)));
  const out: Row[] = list.map((v) => ({ v, km: home ? distanceKm(home, v) : null, seats: seatsFor(v, exam), rank: null }));
  if (!home) {
    if (acFirst) out.sort((a, b) => airconTier(a.v.aircon) - airconTier(b.v.aircon));
    return out;
  }
  out.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  if (tokens.length) return out; // searching: plain distance order, no picks
  let picks: Row[];
  if (acFirst) {
    // Nearest all-room A/C venues first; if fewer than 5 nearby, fill with some-room A/C,
    // then with whatever is nearest.
    const fifth = out[Math.min(TOP_N, out.length) - 1]?.km ?? 0;
    const radius = Math.max(AC_MIN_RADIUS_KM, fifth * AC_RADIUS_FACTOR);
    const near = out.filter((r) => (r.km ?? 0) <= radius);
    picks = near.filter((r) => airconTier(r.v.aircon) === 0).slice(0, TOP_N);
    for (const r of near) if (picks.length < TOP_N && airconTier(r.v.aircon) === 1) picks.push(r);
    for (const r of out) if (picks.length < TOP_N && !picks.includes(r)) picks.push(r);
  } else {
    picks = out.slice(0, TOP_N);
  }
  const ranked = picks.map((r, i) => ({ ...r, rank: i + 1 }));
  return [...ranked, ...out.filter((r) => !picks.includes(r))];
}

export default function VenueFinder() {
  const [home, setHome] = useHome();
  const [exam, setExam] = useState<ExamCode | null>(null);
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [homeMenu, setHomeMenu] = useState(false);
  const myLoc = useMyLocation();
  const [gpsState, setGpsState] = useState<"idle" | "busy" | "denied" | "error">("idle");
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; key: number } | null>(null);
  const [snap, setSnap] = useState<Snap>("half");
  const [acFirst, setAcFirst] = useState(false);
  const [fit, setFit] = useState<{ points: { lat: number; lng: number }[]; key: number } | null>(null);
  const isDesktop = useIsDesktop();
  const vh = useViewportHeight();
  const listRef = useRef<HTMLDivElement>(null);

  const rows: Row[] = useMemo(() => computeRows(exam, q, home, acFirst), [exam, q, home, acFirst]);

  const mapVenues = useMemo(() => rows.map((r) => r.v), [rows]);
  const ranks = useMemo(() => Object.fromEntries(rows.filter((r) => r.rank).map((r) => [r.v.id, r.rank!])), [rows]);
  const picksAc = rows.filter((r) => r.rank).map((r) => airconTier(r.v.aircon));

  // After the user changes what "top 5" means, show home + all 5 picks on the map.
  const refit = (nextExam: ExamCode | null, nextAc: boolean) => {
    if (!home) return;
    const picks = computeRows(nextExam, q, home, nextAc)
      .filter((r) => r.rank)
      .map((r) => ({ lat: r.v.lat, lng: r.v.lng }));
    if (picks.length) setFit((f) => ({ points: [home, ...picks], key: (f?.key ?? 0) + 1 }));
  };
  const selected = selectedId ? VENUES.find((v) => v.id === selectedId) ?? null : null;
  const selectedRow = selected ? { v: selected, km: home ? distanceKm(home, selected) : null, seats: seatsFor(selected, exam) } : null;

  // Sheet geometry (mobile).
  const fullH = Math.max(vh - 56, 320);
  const halfH = Math.round(vh * 0.5);
  const snapH = snap === "peek" ? PEEK : snap === "half" ? halfH : fullH;
  const [dragH, setDragH] = useState<number | null>(null);
  const sheetH = dragH ?? snapH;

  const padding = useMemo(
    () =>
      isDesktop
        ? { top: 24, bottom: 24, left: 436, right: 24 }
        : { top: 24, bottom: Math.min(snap === "full" ? halfH : snapH, halfH) + 8, left: 16, right: 16 },
    [isDesktop, snap, snapH, halfH],
  );

  const drag = useRef<{ y: number; h: number } | null>(null);
  const lastDragH = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, h: sheetH };
    lastDragH.current = null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const h = Math.min(fullH, Math.max(PEEK - 40, drag.current.h + (drag.current.y - e.clientY)));
    if (Math.abs(h - drag.current.h) > 4) {
      lastDragH.current = h;
      setDragH(h);
    }
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const h = lastDragH.current;
    drag.current = null;
    lastDragH.current = null;
    setDragH(null);
    if (h == null) {
      // treat as tap on the handle: cycle up
      setSnap((s) => (s === "peek" ? "half" : s === "half" ? "full" : "half"));
      return;
    }
    const opts: [Snap, number][] = [
      ["peek", PEEK],
      ["half", halfH],
      ["full", fullH],
    ];
    setSnap(opts.reduce((best, o) => (Math.abs(o[1] - h) < Math.abs(best[1] - h) ? o : best))[0]);
  };

  const select = useCallback(
    (id: string | null, fly = true) => {
      setSelectedId(id);
      if (id) {
        const v = VENUES.find((x) => x.id === id);
        if (v && fly) setFocus({ lat: v.lat, lng: v.lng, key: Date.now() });
        if (!isDesktop) setSnap((s) => (s === "full" ? "half" : s === "peek" ? "half" : s));
        listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [isDesktop],
  );

  const useGps = async () => {
    setGpsState("busy");
    try {
      const pos = await locateMe();
      setHome(pos);
      myLoc.start(); // permission is granted now, so show the live dot too
      setFocus({ ...pos, zoom: 11.5, key: Date.now() });
      setGpsState("idle");
      setPickMode(false);
    } catch (e) {
      const denied = (e as GeolocationPositionError)?.code === 1;
      setGpsState(denied ? "denied" : "error");
    }
  };

  const onPick = (pos: { lat: number; lng: number }) => {
    setHome(pos);
    setPickMode(false);
    setGpsState("idle");
    setFocus({ ...pos, key: Date.now() });
    if (!isDesktop) setSnap("half");
  };

  const examLabel = exam ? EXAMS.find((e) => e.code === exam)! : null;
  const updated = new Date(DATA.generatedAt);

  const panel = (
    <>
      {/* Header */}
      <div className="px-5 pt-1 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight text-[#1d1d1f]">สนามสอบ TGAT/TPAT</h1>
          <DonateButton />
        </div>
        <p className="mt-0.5 text-[13px] text-[#6e6e73]">
          TCAS{DATA.tcasYear} · {fmt(VENUES.length)} สนาม · 77 จังหวัด · ข้อมูลจาก mytcas
        </p>

        <label className="mt-3 flex items-center gap-2 rounded-xl bg-[#f2f2f4] px-3 py-2 text-[#86868b] focus-within:ring-2 focus-within:ring-[#0071e3]/30">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => !isDesktop && setSnap("full")}
            placeholder="ค้นหาชื่อสนาม เขต หรือจังหวัด"
            className="w-full bg-transparent text-[16px] text-[#1d1d1f] outline-none placeholder:text-[#86868b]"
            inputMode="search"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-[13px] text-[#0071e3]">
              ล้าง
            </button>
          )}
        </label>

        <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-0.5 no-scrollbar" role="tablist" aria-label="เลือกวิชาที่สอบ">
          {[null, ...EXAMS.map((e) => e.code)].map((code) => {
            const active = exam === code;
            return (
              <button
                key={code ?? "all"}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setExam(code);
                  refit(code, acFirst);
                }}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                  active ? "bg-[#1d1d1f] text-white" : "bg-[#f2f2f4] text-[#1d1d1f] hover:bg-[#e8e8ed]"
                }`}
              >
                {code ?? "ทุกวิชา"}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => {
            setAcFirst(!acFirst);
            refit(exam, !acFirst);
          }}
          role="switch"
          aria-checked={acFirst}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-[#f5f5f7] px-3.5 py-2.5 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium text-[#1d1d1f]">เน้นสนามที่มีแอร์</span>
            <span className="block text-[12px] leading-snug text-[#6e6e73]">
              {home
                ? "5 อันดับเลือกแอร์ทุกห้องที่ใกล้สุดก่อน ไม่ครบเติมแอร์บางห้องที่ใกล้สุด"
                : "เรียงแอร์ทุกห้องขึ้นก่อน ปักหมุดบ้านเพื่อดู 5 อันดับแนะนำ"}
            </span>
          </span>
          <span className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition ${acFirst ? "bg-[#30b158]" : "bg-[#e3e3e8]"}`}>
            <span
              className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.2)] transition-all ${acFirst ? "left-[22px]" : "left-[2px]"}`}
            />
          </span>
        </button>
        {examLabel && (
          <p className="mt-2 text-[12px] text-[#6e6e73]">
            {examLabel.code} {examLabel.full} · สอบ{" "}
            {thaiDate(VENUES.find((v) => v.exams.includes(examLabel.code))!.days.find((d) => d.exams.includes(examLabel.code))!.date)}
          </p>
        )}
      </div>

      {/* Home pin */}
      <div className="px-5 pb-3">
        {home ? (
          <div className="flex items-center gap-3 rounded-2xl bg-[#f5f5f7] px-3 py-2.5">
            <button
              onClick={() => setHomeMenu((o) => !o)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1d1d1f] text-white shadow-sm"
              aria-label="ตัวเลือกหมุดบ้าน"
            >
              <HouseIcon />
            </button>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-[14px] font-medium text-[#1d1d1f]">
                ปักหมุดบ้านแล้ว
                {!pickMode && <LockIcon className="h-3 w-3 text-[#86868b]" />}
              </p>
              <p className="text-[12px] text-[#6e6e73]">
                {pickMode ? "แตะหรือลากหมุดบนแผนที่ เสร็จแล้วจะล็อกเอง" : "หมุดล็อกอยู่ · กด ย้าย เพื่อเปลี่ยนตำแหน่ง"}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={useGps}
                disabled={gpsState === "busy"}
                className={`rounded-full p-2 text-[#0071e3] hover:bg-white disabled:opacity-40 ${gpsState === "busy" ? "animate-pulse" : ""}`}
                aria-label="ใช้ GPS อีกครั้ง"
              >
                <LocateIcon />
              </button>
              <button
                onClick={() => {
                  setPickMode((p) => !p);
                  if (!isDesktop && !pickMode) setSnap("peek");
                }}
                className={`rounded-full px-2.5 text-[13px] font-medium ${pickMode ? "bg-[#0071e3] text-white" : "text-[#0071e3] hover:bg-white"}`}
              >
                {pickMode ? "เสร็จ" : "ย้าย"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-gradient-to-br from-[#f5f5f7] to-[#eef4ff] p-4">
            <p className="text-[15px] font-semibold text-[#1d1d1f]">ปักหมุดบ้าน แล้วดูว่าสนามไหนใกล้สุด</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#6e6e73]">
              ตำแหน่งเก็บไว้ในเครื่องคุณเท่านั้น ไม่ถูกส่งไปที่ไหน
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={useGps}
                disabled={gpsState === "busy"}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-[#0077ed] disabled:opacity-60"
              >
                <LocateIcon />
                {gpsState === "busy" ? "กำลังหาตำแหน่ง..." : "ใช้ GPS ปักหมุด"}
              </button>
              <button
                onClick={() => {
                  setPickMode(true);
                  if (!isDesktop) setSnap("peek");
                }}
                className="rounded-full bg-white px-4 py-2 text-[14px] font-medium text-[#0071e3] shadow-sm"
              >
                แตะบนแผนที่เอง
              </button>
            </div>
          </div>
        )}
        {gpsState === "denied" && (
          <p className="mt-2 px-1 text-[12px] text-[#c4271f]">ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง ลองแตะบนแผนที่เพื่อปักเองแทน</p>
        )}
        {myLoc.status === "denied" && gpsState !== "denied" && (
          <p className="mt-2 px-1 text-[12px] text-[#c4271f]">เปิดสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์ เพื่อดูตำแหน่งปัจจุบันของคุณ</p>
        )}
        {gpsState === "error" && <p className="mt-2 px-1 text-[12px] text-[#c4271f]">หาตำแหน่งไม่สำเร็จ ลองอีกครั้งหรือแตะบนแผนที่</p>}
        {homeMenu && home && (
          <div className="mt-2 flex gap-2 rounded-2xl bg-[#f5f5f7] p-2">
            <button
              onClick={() => {
                setFocus({ ...home, zoom: 13, key: Date.now() });
                setHomeMenu(false);
              }}
              className="flex-1 rounded-xl bg-white py-2 text-[13px] font-medium text-[#0071e3] shadow-sm"
            >
              ไปที่บ้าน
            </button>
            <button
              onClick={() => {
                setHome(null);
                setHomeMenu(false);
                setPickMode(false);
              }}
              className="flex-1 rounded-xl bg-white py-2 text-[13px] font-medium text-[#c4271f] shadow-sm"
            >
              ลบหมุดบ้าน
            </button>
          </div>
        )}
      </div>

      {/* Selected venue preview */}
      {selectedRow && (
        <div className="px-5 pb-3">
          <SelectedCard row={selectedRow} exam={exam} home={home} onClose={() => setSelectedId(null)} />
        </div>
      )}

      {/* List */}
      <div className="border-t border-black/5">
        <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[12px] text-[#86868b]">
          <span>
            {fmt(rows.length)} สนาม{exam ? `ที่สอบ ${exam}` : ""}
            {home ? " · ใกล้สุดก่อน" : ""}
          </span>
          {rows.some((r) => r.rank) && (
            <span>
              {acFirst
                ? `แนะนำ: แอร์ทุกห้อง ${picksAc.filter((t) => t === 0).length} · บางห้อง ${picksAc.filter((t) => t === 1).length}${
                    picksAc.some((t) => t > 1) ? ` · อื่นๆ ${picksAc.filter((t) => t > 1).length}` : ""
                  }`
                : "5 อันดับแรก = ใกล้สุด"}
            </span>
          )}
        </div>
        <ul>
          {rows.map((r) => (
            <li key={r.v.id}>
              <VenueRow row={r} rank={r.rank ?? null} active={r.v.id === selectedId} onClick={() => select(r.v.id)} />
            </li>
          ))}
        </ul>
        {rows.length === 0 && <p className="px-5 py-10 text-center text-[14px] text-[#86868b]">ไม่พบสนามที่ตรงกับคำค้น</p>}
        <footer className="px-5 pt-4 pb-10 text-[11.5px] leading-relaxed text-[#86868b]">
          <p>
            ข้อมูลสนามสอบ จำนวนที่นั่ง แอร์ และรถไฟฟ้า จาก{" "}
            <a className="underline" href={DATA.source} target="_blank" rel="noreferrer">
              mytcas.com
            </a>{" "}
            (ทปอ.) ดึงเมื่อ {updated.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" })}
          </p>
          <p className="mt-1">
            จำนวนที่นั่งคือความจุของสนาม ไม่ใช่ที่นั่งว่าง ทปอ. เป็นผู้จัดสรรที่นั่ง โปรดตรวจสนามจริงจากบัตรที่นั่งสอบ ระยะทางเป็นเส้นตรง
          </p>
          <p className="mt-1">เว็บนี้ไม่ใช่เว็บทางการของ ทปอ.</p>
          <p className="mt-3">
            <DonateButton variant="link" />
          </p>
        </footer>
      </div>
    </>
  );

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#f2f2f4]">
      <VenueMap
        venues={mapVenues}
        ranks={ranks}
        fit={fit}
        selectedId={selectedId}
        home={home}
        pickMode={pickMode}
        padding={padding}
        focus={focus}
        onSelect={(id) => select(id, false)}
        onPick={onPick}
        me={myLoc.me}
        onLocate={myLoc.start}
        onHomeDrag={(pos) => {
          setHome(pos);
          setPickMode(false); // re-lock after moving
        }}
      />

      {!pickMode && <Legend isDesktop={isDesktop} />}

      {pickMode && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4 md:left-[436px]">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-[#1d1d1f]/90 py-2 pr-2 pl-4 text-[14px] text-white shadow-lg backdrop-blur">
            แตะหรือลากหมุดไปที่บ้าน
            <button onClick={() => setPickMode(false)} className="rounded-full bg-white/15 px-3 py-1 text-[13px]">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {isDesktop ? (
        <aside className="glass absolute top-3 bottom-3 left-3 z-10 flex w-[412px] flex-col overflow-hidden rounded-[28px]">
          <div ref={listRef} className="flex-1 overflow-y-auto pt-4">
            {panel}
          </div>
        </aside>
      ) : (
        <section
          className="glass absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-[28px]"
          style={{ height: sheetH, transition: dragH == null ? "height 320ms cubic-bezier(.2,.8,.2,1)" : "none" }}
          aria-label="รายการสนามสอบ"
        >
          <div
            className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-2"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="button"
            aria-label="ลากเพื่อขยายหรือย่อรายการ"
          >
            <span className="h-[5px] w-10 rounded-full bg-black/15" />
          </div>
          <div ref={listRef} className={`min-h-0 flex-1 ${snap === "peek" && dragH == null ? "overflow-hidden" : "overflow-y-auto"} overscroll-contain`}>
            {panel}
          </div>
        </section>
      )}
    </main>
  );
}

function SeatLine({ seats, exam }: { seats: number | null; exam: ExamCode | null }) {
  if (seats == null) return <span className="text-[#86868b]">ไม่มีสอบ {exam}</span>;
  return (
    <span>
      <span className="font-semibold text-[#1d1d1f] tabular-nums">{fmt(seats)}</span> <span className="text-[#6e6e73]">ที่นั่ง</span>
    </span>
  );
}

function VenueRow({ row, rank, active, onClick }: { row: Row; rank: number | null; active: boolean; onClick: () => void }) {
  const { v, km, seats } = row;
  const ac = airconInfo(v.aircon);
  const tr = transitInfo(v.transit);
  const top = rank != null && rank <= 5;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 px-5 py-3 text-left transition ${active ? "bg-[#0071e3]/[0.06]" : "hover:bg-black/[0.025]"}`}
    >
      {top ? (
        <span
          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12.5px] font-semibold text-white tabular-nums shadow-sm"
          style={{ background: AIRCON_COLORS[ac.tone] }}
        >
          {rank}
        </span>
      ) : (
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center">
          <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: AIRCON_COLORS[ac.tone] }} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-[#1d1d1f]">{displayName(v)}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-[#6e6e73]">
          {v.amphur} · {v.province}
          {km != null && <> · {formatKm(km)}</>}
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1">
          <Chip tone={ac.tone}>
            <SnowIcon />
            {ac.short}
          </Chip>
          {tr.tone === "good" && (
            <Chip tone="good">
              <TrainIcon />
              รถไฟฟ้า
            </Chip>
          )}
          {v.coordPrecision === "approx" && <Chip>ตำแหน่งโดยประมาณ</Chip>}
        </span>
      </span>
      <span className="shrink-0 pt-0.5 text-right text-[13px]">
        <SeatLine seats={seats} exam={null} />
      </span>
    </button>
  );
}

function SelectedCard({
  row,
  exam,
  home,
  onClose,
}: {
  row: Row;
  exam: ExamCode | null;
  home: { lat: number; lng: number } | null;
  onClose: () => void;
}) {
  const { v, km, seats } = row;
  const ac = airconInfo(v.aircon);
  const tr = transitInfo(v.transit);
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,.06),0_8px_24px_rgba(0,0,0,.06)] ring-1 ring-black/5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-snug font-semibold text-[#1d1d1f]">{displayName(v)}</p>
          <p className="mt-0.5 text-[13px] text-[#6e6e73]">
            {v.amphur} · {v.province}
            {km != null && <> · ห่างบ้าน {formatKm(km)}</>}
          </p>
        </div>
        <button onClick={onClose} className="-mt-1 -mr-1 rounded-full p-1.5 text-[#86868b] hover:bg-black/5" aria-label="ปิด">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label={exam ? `ที่นั่ง ${exam}` : "ที่นั่งสูงสุด"} value={seats == null ? "—" : fmt(seats)} />
        <Stat label="แอร์" value={ac.short.replace("แอร์: ", "")} tone={ac.tone} />
        <Stat label="รถไฟฟ้า" value={tr.tone === "good" ? "ใกล้" : v.transit ? "ไม่มี" : "ไม่ทราบ"} tone={tr.tone} />
      </div>
      <div className="mt-3 flex gap-2">
        <a
          href={directionsUrl(v, home)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#0071e3] py-2.5 text-[14px] font-medium text-white hover:bg-[#0077ed]"
        >
          <ArrowIcon />
          นำทาง
        </a>
        <Link
          href={`/venue/${v.id}/`}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-[#f2f2f4] py-2.5 text-[14px] font-medium text-[#1d1d1f] hover:bg-[#e8e8ed]"
        >
          รายละเอียด
          <ChevronIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const color =
    tone === "good" ? "text-[#1a7f37]" : tone === "mid" ? "text-[#a05a00]" : tone === "bad" ? "text-[#c4271f]" : "text-[#1d1d1f]";
  return (
    <div className="rounded-xl bg-[#f5f5f7] px-2 py-2">
      <p className="text-[11px] text-[#86868b]">{label}</p>
      <p className={`mt-0.5 text-[14px] font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function Legend({ isDesktop }: { isDesktop: boolean }) {
  const items: [string, string][] = [
    [AIRCON_COLORS.good, "แอร์ทุกห้อง"],
    [AIRCON_COLORS.mid, "แอร์บางห้อง"],
    [AIRCON_COLORS.bad, "ไม่มีแอร์"],
    [AIRCON_COLORS.unknown, "ไม่ทราบ"],
  ];
  return (
    <div
      className={`glass pointer-events-none absolute z-10 rounded-2xl px-3 py-2 ${isDesktop ? "top-3 left-[436px]" : "top-[max(env(safe-area-inset-top),12px)] left-3"}`}
      aria-label="สีจุดบอกสถานะแอร์ของสนาม"
    >
      <ul className={isDesktop ? "flex gap-3" : "grid grid-cols-2 gap-x-3 gap-y-1"}>
        {items.map(([c, l]) => (
          <li key={l} className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#1d1d1f]">
            <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: c }} />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
