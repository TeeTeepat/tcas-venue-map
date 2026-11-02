import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const thai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const SITE_URL = "https://tcas.teerapatk.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: "สนามสอบ TGAT/TPAT ใกล้บ้าน · TCAS70",
  description:
    "ค้นหาสนามสอบ TGAT/TPAT2-5 TCAS70 ใกล้บ้าน ดูจำนวนที่นั่ง แอร์ รถไฟฟ้า ของทุกสนามทั่วประเทศ ปักหมุดบ้านแล้วเรียงสนามจากใกล้ไปไกล",
  openGraph: {
    title: "สนามสอบ TGAT/TPAT ใกล้บ้าน · TCAS70",
    description: "ปักหมุดบ้าน ดูสนามสอบที่ใกล้ที่สุด จำนวนที่นั่ง แอร์ รถไฟฟ้า ครบทุกสนามทั่วประเทศ",
    locale: "th_TH",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f5f7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${thai.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
