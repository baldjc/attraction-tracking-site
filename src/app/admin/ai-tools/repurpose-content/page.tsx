"use client";

import { auth } from "@/lib/auth";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import RepurposeContentPage from "@/app/member/content-tools/repurpose-content/page";

export default function AdminRepurposeContentPage() {
  return (
    <div>
      <div className="max-w-2xl mx-auto">
        <Link
          href="/admin/ai-tools"
          className="flex items-center gap-1.5 text-xs text-[var(--abv-text)]/50 hover:text-[var(--abv-azure)] transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to AI Tools
        </Link>
      </div>
      <RepurposeContentPage />
    </div>
  );
}
