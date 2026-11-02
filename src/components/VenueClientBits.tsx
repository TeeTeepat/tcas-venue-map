"use client";

import dynamic from "next/dynamic";
import { useHome } from "@/lib/home";
import { directionsUrl, distanceKm, formatKm, type Venue } from "@/lib/venues";
import { ArrowIcon } from "./ui";

export const MiniMapLazy = dynamic(() => import("./MiniMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#ececf0]" />,
});

export function HomeDistance({ venue }: { venue: Venue }) {
  const [home] = useHome();
  if (!home) return null;
  return (
    <span>
      {" "}
      · ห่างบ้าน {home.emoji} {formatKm(distanceKm(home, venue))}
    </span>
  );
}

export function DirectionsButton({ venue }: { venue: Venue }) {
  const [home] = useHome();
  return (
    <a
      href={directionsUrl(venue, home)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#0071e3] py-3 text-[15px] font-medium text-white hover:bg-[#0077ed]"
    >
      <ArrowIcon />
      นำทางด้วย Google Maps
    </a>
  );
}
