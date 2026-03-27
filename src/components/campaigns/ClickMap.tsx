"use client";

import dynamic from "next/dynamic";

interface LocationMarker {
  city: string;
  province: string | null;
  country: string | null;
  count: number;
}

interface ClickMapProps {
  markers: LocationMarker[];
  height?: number;
}

const ClickMapInner = dynamic(() => import("./ClickMapInner"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full bg-[#f8f9fa] rounded-lg flex items-center justify-center"
      style={{ height: 400 }}
    >
      <p className="text-sm text-[#2f3437]/40">Loading map…</p>
    </div>
  ),
});

export default function ClickMap({ markers, height }: ClickMapProps) {
  return <ClickMapInner markers={markers} height={height} />;
}
