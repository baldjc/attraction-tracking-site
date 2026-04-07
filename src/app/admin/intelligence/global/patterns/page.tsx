import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import prisma from "@/lib/prisma";

export const metadata = { title: "Pattern Library" };

export default async function PatternsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  const [hookCount, titleCount, thumbnailCount] = await Promise.all([
    prisma.hookPattern.count(),
    prisma.titlePattern.count(),
    prisma.thumbnailPattern.count(),
  ]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/intelligence" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Intelligence</Link>
        <h1 className="text-xl font-bold text-[#2f3437] mt-1">Pattern Library</h1>
        <p className="text-sm text-[#2f3437]/60 mt-1">Hook, title, and thumbnail patterns aggregated from global outlier videos</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Hook Patterns", count: hookCount, icon: "🎣", colour: "#6ba3c7" },
          { label: "Title Patterns", count: titleCount, icon: "✍️", colour: "#8b7ec8" },
          { label: "Thumbnail Patterns", count: thumbnailCount, icon: "🖼️", colour: "#5b9e8c" },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-[#2f3437]/10 rounded-xl p-5 text-center">
            <p className="text-3xl mb-2">{item.icon}</p>
            <p className="text-2xl font-bold text-[#2f3437]">{item.count}</p>
            <p className="text-xs text-[#2f3437]/50 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
        <p className="text-3xl mb-3">📚</p>
        <p className="font-semibold text-[#2f3437]">Pattern library coming in Phase 6</p>
        <p className="text-sm text-[#2f3437]/50 mt-1 max-w-sm mx-auto">
          After channel sync and outlier detection (Phases 3–5), patterns are aggregated automatically from Claude&apos;s video analysis.
        </p>
      </div>
    </div>
  );
}
