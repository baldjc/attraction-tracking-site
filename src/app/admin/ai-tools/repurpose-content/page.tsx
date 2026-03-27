"use client";

import { auth } from "@/lib/auth";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import RepurposeContentPage from "@/app/member/ai-tools/repurpose-content/page";

export default function AdminRepurposeContentPage() {
  return (
    <div>
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-0">
        <Link
          href="/admin/ai-tools"
          className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to AI Tools
        </Link>
      </div>
      <RepurposeContentPage />
    </div>
  );
}
