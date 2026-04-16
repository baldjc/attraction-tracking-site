"use client";

import Link from "next/link";
import { useUpgradeGate } from "./useUpgradeGate";

interface Props {
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export default function InlineUpgradeBanner({
  message,
  ctaLabel = "See Production →",
  ctaHref = "/member/profile",
}: Props) {
  const gate = useUpgradeGate();
  if (gate.loading || !gate.isFoundations || !gate.flagOn) return null;

  return (
    <div className="bg-[#6ba3c7]/8 border border-[#6ba3c7]/25 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
      <span className="text-base shrink-0">⬆</span>
      <p className="text-sm text-[#2f3437] flex-1">{message}</p>
      <Link
        href={ctaHref}
        className="text-xs font-semibold text-[#6ba3c7] hover:text-[#5490b5] underline shrink-0"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
