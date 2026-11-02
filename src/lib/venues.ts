import raw from "@/data/venues.json";

export type ExamCode = "TGAT" | "TPAT2" | "TPAT3" | "TPAT4" | "TPAT5";

export type VenueDay = {
  day: number;
  date: string;
  exams: ExamCode[];
  seats: number;
  specialSeats: number;
  cbtSeats: number;
};

export type Venue = {
  id: string;
  name: string;
  province: string;
  amphur: string;
  universityId: string;
  centre: string | null;
  examTypes: string[];
  days: VenueDay[];
  exams: ExamCode[];
  maxSeats: number;
  transit: string | null;
  aircon: string | null;
  mapUrl: string | null;
  lat: number;
  lng: number;
  coordPrecision: "pin" | "camera" | "approx" | null;
};

type Dataset = {
  tcasYear: number;
  generatedAt: string;
  source: string;
  venues: Venue[];
};

export const DATA = raw as unknown as Dataset;
export const VENUES: Venue[] = DATA.venues;

export const EXAMS: { code: ExamCode; label: string; full: string }[] = [
  { code: "TGAT", label: "TGAT", full: "ความถนัดทั่วไป" },
  { code: "TPAT2", label: "TPAT2", full: "ศิลปกรรมศาสตร์" },
  { code: "TPAT3", label: "TPAT3", full: "วิทยาศาสตร์ เทคโนโลยี วิศวกรรมศาสตร์" },
  { code: "TPAT4", label: "TPAT4", full: "สถาปัตยกรรมศาสตร์" },
  { code: "TPAT5", label: "TPAT5", full: "ครุศาสตร์-ศึกษาศาสตร์" },
];

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function thaiDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${TH_MONTH[m - 1]} ${String(y + 543).slice(2)}`;
}

export const daySeats = (d: VenueDay) => d.seats + d.specialSeats + d.cbtSeats;

/** Seat capacity relevant to the chosen exam (or the largest day if none chosen). */
export function seatsFor(v: Venue, exam: ExamCode | null): number | null {
  if (!exam) return v.maxSeats;
  const day = v.days.find((d) => d.exams.includes(exam));
  return day ? daySeats(day) : null;
}

export function displayName(v: Venue) {
  const isSchoolLike = /^(โรงเรียน|มหาวิทยาลัย|วิทยาลัย|สถาบัน|ศูนย์|อาคาร|คณะ)/.test(v.name);
  return isSchoolLike ? v.name : `โรงเรียน${v.name}`;
}

export type Tone = "good" | "mid" | "bad" | "unknown";

export function airconInfo(a: string | null): { label: string; short: string; tone: Tone } {
  switch (a) {
    case "แอร์ทุกห้อง":
      return { label: "แอร์ทุกห้อง", short: "แอร์ทุกห้อง", tone: "good" };
    case "แอร์บางห้อง":
      return { label: "แอร์บางห้อง", short: "แอร์บางห้อง", tone: "mid" };
    case "ไม่มีแอร์ทุกห้อง":
      return { label: "ไม่มีแอร์ (พัดลม)", short: "ไม่มีแอร์", tone: "bad" };
    default:
      return { label: "ยังไม่มีข้อมูลแอร์", short: "แอร์: ไม่ทราบ", tone: "unknown" };
  }
}

export function transitInfo(t: string | null): { label: string; tone: Tone } {
  switch (t) {
    case "รถไฟฟ้า":
      return { label: "ใกล้รถไฟฟ้า", tone: "good" };
    case "ไม่มีรถไฟฟ้า":
      return { label: "ไม่มีรถไฟฟ้าใกล้", tone: "unknown" };
    default:
      return { label: "ยังไม่มีข้อมูลการเดินทาง", tone: "unknown" };
  }
}

export type LatLng = { lat: number; lng: number };

export function distanceKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatKm(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} ม.`;
  if (km < 10) return `${km.toFixed(1)} กม.`;
  return `${Math.round(km).toLocaleString("th-TH")} กม.`;
}

export const fmt = (n: number) => n.toLocaleString("th-TH");

export function directionsUrl(v: Venue, from?: LatLng | null) {
  const p = new URLSearchParams({ api: "1", destination: `${v.lat},${v.lng}` });
  if (from) p.set("origin", `${from.lat},${from.lng}`);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/** Normalise for search: lowercase, Thai digits -> Arabic, strip common prefixes and spaces. */
export function searchKey(s: string) {
  return s
    .toLowerCase()
    .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50))
    .replace(/โรงเรียน|ร\.ร\.|รร\.|มหาวิทยาลัย|ม\./g, "")
    .replace(/\s+/g, "");
}
