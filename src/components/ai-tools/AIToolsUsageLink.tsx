"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

export default function AIToolsUsageLink({ basePath }: { basePath: string }) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "admin";
  if (!isAdmin) return null;
  return (
    <Link
      href={`${basePath}/usage`}
      className="shrink-0 text-xs text-[#2f3437]/50 dark:text-white/50 hover:text-[#6ba3c7] border border-gray-200 dark:border-white/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
    >
      📊 Usage
    </Link>
  );
}
