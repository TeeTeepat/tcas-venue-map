"use client";

import { useEffect, useState } from "react";

const QR_SRC = "/donate/promptpay-qr.jpg";

export function CoffeeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3c0 1 1 1.5 1 2.5S8 7 8 7M12 3c0 1 1 1.5 1 2.5S12 7 12 7" />
      <path d="M3 21h14" />
    </svg>
  );
}

/** "Buy me a coffee" button that opens the PromptPay QR. */
export function DonateButton({ variant = "pill" }: { variant?: "pill" | "link" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "pill" ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#fff4e5] px-3 py-1.5 text-[12.5px] font-medium text-[#a0570a] transition hover:bg-[#ffecd2]"
        >
          <CoffeeIcon className="h-3.5 w-3.5" />
          เลี้ยงกาแฟ
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 font-medium text-[#a0570a] underline-offset-2 hover:underline">
          <CoffeeIcon className="h-3.5 w-3.5" />
          เลี้ยงกาแฟคนทำเว็บ
        </button>
      )}
      {open && <DonateSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function DonateSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 backdrop-blur-[2px] sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="เลี้ยงกาแฟผ่านพร้อมเพย์">
      <div
        className="w-full max-w-sm rounded-t-[28px] bg-white px-6 pt-5 pb-[max(env(safe-area-inset-bottom),24px)] shadow-2xl sm:rounded-[28px] sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-[5px] w-10 rounded-full bg-black/10 sm:hidden" />
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#fff4e5] text-[#a0570a]">
            <CoffeeIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold text-[#1d1d1f]">เลี้ยงกาแฟคนทำเว็บ</p>
            <p className="mt-0.5 text-[13px] leading-snug text-[#6e6e73]">ถ้าเว็บนี้ช่วยให้เลือกสนามง่ายขึ้น เลี้ยงกาแฟสักแก้วได้ผ่านพร้อมเพย์ ขอบคุณมากครับ</p>
          </div>
          <button onClick={onClose} className="-mt-1 -mr-2 rounded-full p-2 text-[#86868b] hover:bg-black/5" aria-label="ปิด">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static export, plain img is fine */}
          <img src={QR_SRC} alt="QR พร้อมเพย์ สำหรับโอนเลี้ยงกาแฟ" className="mx-auto block max-h-[52vh] w-auto" />
        </div>

        <a
          href={QR_SRC}
          download="promptpay-tcas-venue-map.jpg"
          className="mt-4 flex w-full items-center justify-center rounded-full bg-[#1d1d1f] py-3 text-[15px] font-medium text-white hover:bg-black"
        >
          บันทึกรูป QR
        </a>
        <p className="mt-2 text-center text-[12px] text-[#86868b]">ใช้บนมือถือ: บันทึกรูป แล้วเปิดแอปธนาคาร เลือกสแกนจากรูปในเครื่อง</p>
      </div>
    </div>
  );
}
