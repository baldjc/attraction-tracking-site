"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";

interface NextStepCardProps {
  emoji: string;
  title: string;
  description: string;
  href: string;
  buttonLabel: string;
}

export default function NextStepCard({ emoji, title, description, href, buttonLabel }: NextStepCardProps) {
  return (
    <div className="bg-[#6ba3c7]/5 dark:bg-[#6ba3c7]/10 border border-[#6ba3c7]/20 rounded-xl p-5 mt-4">
      <div className="flex items-start gap-4">
        <span className="text-2xl shrink-0 mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0]">
            Next: {title}
          </p>
          <p className="text-xs text-[#2f3437]/60 dark:text-[#94a3b8] mt-1 leading-relaxed">
            {description}
          </p>
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg px-4 py-2 mt-3 hover:bg-[#5490b5] transition-colors"
          >
            {buttonLabel}
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
