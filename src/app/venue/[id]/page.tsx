import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, SnowIcon, TrainIcon } from "@/components/ui";
import { DirectionsButton, HomeDistance, MiniMapLazy } from "@/components/VenueClientBits";
import { DonateButton } from "@/components/Donate";
import { DATA, EXAMS, VENUES, airconInfo, daySeats, displayName, fmt, thaiDate, transitInfo } from "@/lib/venues";

export const dynamicParams = false;

export function generateStaticParams() {
  return VENUES.map((v) => ({ id: v.id }));
}

const find = (id: string) => VENUES.find((v) => v.id === id);

export async function generateMetadata({ params }: PageProps<"/venue/[id]">): Promise<Metadata> {
  const v = find((await params).id);
  if (!v) return {};
  const name = displayName(v);
  const ac = airconInfo(v.aircon);
  const title = `${name} สนามสอบ TGAT/TPAT ${v.province} · TCAS${DATA.tcasYear}`;
  const description = `${name} ${v.amphur} ${v.province} สนามสอบ ${v.exams.join(", ")} รับสูงสุด ${fmt(v.maxSeats)} ที่นั่ง · ${ac.label} · ${transitInfo(v.transit).label}`;
  return { title, description, alternates: { canonical: `/venue/${v.id}/` }, openGraph: { title, description, locale: "th_TH" } };
}

export default async function VenuePage({ params }: PageProps<"/venue/[id]">) {
  const v = find((await params).id);
  if (!v) notFound();
  const ac = airconInfo(v.aircon);
  const tr = transitInfo(v.transit);
  const examName = (c: string) => EXAMS.find((e) => e.code === c)?.full ?? "";

  return (
    <main className="min-h-dvh bg-[#f5f5f7] pb-16">
      <div className="relative h-[34vh] min-h-[220px] w-full overflow-hidden md:h-[40vh]">
        <MiniMapLazy lat={v.lat} lng={v.lng} />
        <Link
          href="/"
          className="glass absolute top-[max(env(safe-area-inset-top),16px)] left-4 z-10 inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[14px] font-medium text-[#0071e3]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          สนามทั้งหมด
        </Link>
      </div>

      <div className="relative z-10 mx-auto -mt-8 max-w-2xl px-4">
        <section className="rounded-[28px] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,.05),0_12px_40px_rgba(0,0,0,.07)]">
          <p className="text-[13px] font-medium text-[#0071e3]">สนามสอบ TGAT/TPAT · TCAS{DATA.tcasYear}</p>
          <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-[#1d1d1f]">{displayName(v)}</h1>
          <p className="mt-1.5 text-[14px] text-[#6e6e73]">
            {v.amphur} · {v.province}
            <HomeDistance venue={v} />
          </p>
          {v.centre && <p className="mt-0.5 text-[13px] text-[#86868b]">ศูนย์สอบ{v.centre}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip tone={ac.tone}>
              <SnowIcon />
              {ac.label}
            </Chip>
            <Chip tone={tr.tone}>
              <TrainIcon />
              {tr.label}
            </Chip>
            {v.examTypes.includes("cbt") && <Chip tone="unknown">มีห้องสอบคอมพิวเตอร์</Chip>}
            {v.coordPrecision === "approx" && <Chip>ตำแหน่งบนแผนที่โดยประมาณ</Chip>}
          </div>
          <div className="mt-5 flex gap-2">
            <DirectionsButton venue={v} />
          </div>
        </section>

        <section className="mt-4 rounded-[28px] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,.05)]">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f]">วันสอบและจำนวนที่นั่ง</h2>
          <p className="mt-1 text-[12.5px] text-[#86868b]">จำนวนที่นั่งคือความจุของสนามในวันนั้น ไม่ใช่ที่นั่งว่าง</p>
          <ul className="mt-4 divide-y divide-black/5">
            {v.days.map((d) => (
              <li key={d.day} className="flex items-start justify-between gap-4 py-3.5">
                <div>
                  <p className="text-[15px] font-medium text-[#1d1d1f]">{thaiDate(d.date)}</p>
                  <p className="mt-0.5 text-[13px] text-[#6e6e73]">
                    {d.exams.map((e) => `${e} ${examName(e)}`).join(" · ")}
                  </p>
                  {(d.specialSeats > 0 || d.cbtSeats > 0) && (
                    <p className="mt-1 text-[12px] text-[#86868b]">
                      {d.seats > 0 && <>ห้องกระดาษ {fmt(d.seats)}</>}
                      {d.specialSeats > 0 && <> · ห้องผู้ต้องการความช่วยเหลือพิเศษ {fmt(d.specialSeats)}</>}
                      {d.cbtSeats > 0 && <> · ห้องคอมพิวเตอร์ {fmt(d.cbtSeats)}</>}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-right">
                  <span className="text-[20px] font-semibold text-[#1d1d1f] tabular-nums">{fmt(daySeats(d))}</span>
                  <span className="block text-[11.5px] text-[#86868b]">ที่นั่ง</span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-4 rounded-[28px] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,.05)]">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f]">ข้อมูลสนาม</h2>
          <dl className="mt-3 divide-y divide-black/5 text-[14px]">
            <Info label="แอร์ในห้องสอบ" value={ac.label} />
            <Info label="รถไฟฟ้า" value={tr.label} />
            <Info label="ที่จอดรถ" value="ยังไม่มีข้อมูล" muted />
            <Info label="ร้านอาหาร / ร้านสะดวกซื้อใกล้ ๆ" value="ยังไม่มีข้อมูล" muted />
            <Info label="อาคาร / ห้องสอบ" value="ยังไม่มีข้อมูล" muted />
          </dl>
          {v.mapUrl && (
            <a href={v.mapUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-[14px] font-medium text-[#0071e3]">
              เปิดหมุดสนามใน Google Maps
            </a>
          )}
        </section>

        <p className="mt-6 px-2 text-[11.5px] leading-relaxed text-[#86868b]">
          ข้อมูลจาก{" "}
          <a className="underline" href={DATA.source} target="_blank" rel="noreferrer">
            mytcas.com
          </a>{" "}
          (ทปอ.) ทปอ. เป็นผู้จัดสรรที่นั่งสอบ โปรดตรวจสนามจริงจากบัตรที่นั่งสอบ เว็บนี้ไม่ใช่เว็บทางการของ ทปอ.
        </p>
        <p className="mt-3 px-2 text-[12.5px]">
          <DonateButton variant="link" />
        </p>
      </div>
    </main>
  );
}

function Info({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-[#6e6e73]">{label}</dt>
      <dd className={`text-right font-medium ${muted ? "text-[#aeaeb2]" : "text-[#1d1d1f]"}`}>{value}</dd>
    </div>
  );
}
