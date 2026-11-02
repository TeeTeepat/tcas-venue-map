"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { HOME_EMOJIS, locateMe, useHome } from "@/lib/home";
import {
  DATA,
  EXAMS,
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
  type Venue,
} from "@/lib/venues";
import { ArrowIcon, Chip, ChevronIcon, LocateIcon, SearchIcon, SnowIcon, TrainIcon } from "./ui";

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

type Row = { v: Venue; km: number | null; seats: number | null };

const HAY = new Map(VENUES.map((v) => [v.id, searchKey(`${displayName(v)}${v.name}${v.amphur}${v.province}${v.centre ?? ""}`)]));

export default function VenueFinder() {
  const [home, setHome] = useHome();
  const [exam, setExam] = useState<ExamCode | null>(null);
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gpsState, setGpsState] = useState<"idle" | "busy" | "denied" | "error">("idle");
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; key: number } | null>(null);
  const [snap, setSnap] = useState<Snap>("half");
  const isDesktop = useIsDesktop();
  const vh = useViewportHeight();
  const listRef = useRef<HTMLDivElement>(null);

  const rows: Row[] = useMemo(() => {
    const tokens = q.split(/\s+/).map(searchKey).filter(Boolean);
    let list = VENUES.filter((v) => !exam || v.exams.includes(exam));
    if (tokens.length) list = list.filter((v) => tokens.every((t) => HAY.get(v.id)!.includes(t)));
    const out = list.map((v) => ({ v, km: home ? distanceKm(home, v) : null, seats: seatsFor(v, exam) }));
    if (home) out.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
    return out;
  }, [exam, q, home]);

  const mapVenues = useMemo(() => rows.map((r) => r.v), [rows]);
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
      setHome({ ...pos, emoji: home?.emoji ?? "🏠" });
      setFocus({ ...pos, zoom: 11.5, key: Date.now() });
      setGpsState("idle");
      setPickMode(false);
    } catch (e) {
      const denied = (e as GeolocationPositionError)?.code === 1;
      setGpsState(denied ? "denied" : "error");
    }
  };

  const onPick = (pos: { lat: number; lng: number }) => {
    setHome({ ...pos, emoji: home?.emoji ?? "🏠" });
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
          <span className="shrink-0 text-[12px] text-[#86868b]">TCAS{DATA.tcasYear}</span>
        </div>
        <p className="mt-0.5 text-[13px] text-[#6e6e73]">
          {fmt(VENUES.length)} สนาม · 77 จังหวัด · ข้อมูลจาก mytcas
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
                onClick={() => setExam(code)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                  active ? "bg-[#1d1d1f] text-white" : "bg-[#f2f2f4] text-[#1d1d1f] hover:bg-[#e8e8ed]"
                }`}
              >
                {code ?? "ทุกวิชา"}
              </button>
            );
          })}
        </div>
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
              onClick={() => setEmojiOpen((o) => !o)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[22px] shadow-sm"
              aria-label="เปลี่ยนอีโมจิหมุดบ้าน"
            >
              {home.emoji}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-[#1d1d1f]">ปักหมุดบ้านแล้ว</p>
              <p className="text-[12px] text-[#6e6e73]">เรียงสนามจากใกล้ไปไกล · ลากหมุดบนแผนที่เพื่อย้าย</p>
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
                {pickMode ? "แตะแผนที่" : "ย้าย"}
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
        {gpsState === "error" && <p className="mt-2 px-1 text-[12px] text-[#c4271f]">หาตำแหน่งไม่สำเร็จ ลองอีกครั้งหรือแตะบนแผนที่</p>}
        {emojiOpen && home && (
          <div className="mt-2 grid grid-cols-6 gap-1 rounded-2xl bg-[#f5f5f7] p-2">
            {HOME_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  setHome({ ...home, emoji: e });
                  setEmojiOpen(false);
                }}
                className={`grid h-10 place-items-center rounded-xl text-[22px] transition hover:bg-white ${home.emoji === e ? "bg-white shadow-sm" : ""}`}
              >
                {e}
              </button>
            ))}
            <button
              onClick={() => {
                setHome(null);
                setEmojiOpen(false);
              }}
              className="col-span-6 mt-1 rounded-xl py-1.5 text-[12.5px] text-[#c4271f] hover:bg-white"
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
          {home && rows.length >= 5 && <span>5 อันดับแรก = แนะนำให้เลือก</span>}
        </div>
        <ul>
          {rows.map((r, i) => (
            <li key={r.v.id}>
              <VenueRow row={r} rank={home && !q ? i + 1 : null} active={r.v.id === selectedId} onClick={() => select(r.v.id)} />
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
        </footer>
      </div>
    </>
  );

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#f2f2f4]">
      <VenueMap
        venues={mapVenues}
        selectedId={selectedId}
        home={home}
        pickMode={pickMode}
        padding={padding}
        focus={focus}
        onSelect={(id) => select(id, false)}
        onPick={onPick}
        onHomeDrag={(pos) => home && setHome({ ...home, ...pos })}
      />

      {pickMode && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4 md:left-[436px]">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-[#1d1d1f]/90 py-2 pr-2 pl-4 text-[14px] text-white shadow-lg backdrop-blur">
            แตะตำแหน่งบ้านบนแผนที่
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
      <span
        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums ${
          top ? "bg-[#0071e3] text-white" : "bg-[#f2f2f4] text-[#86868b]"
        }`}
      >
        {rank ?? "•"}
      </span>
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
