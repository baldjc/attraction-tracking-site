import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";

export const metadata = { title: "Topic Trends" };

export default async function TrendsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/intelligence" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Intelligence</Link>
        <h1 className="text-xl font-bold text-[#2f3437] mt-1">Topic Trends</h1>
        <p className="text-sm text-[#2f3437]/60 mt-1">Rising, flat, and falling topics by audience × theme</p>
      </div>
      <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
        <p className="text-3xl mb-3">📈</p>
        <p className="font-semibold text-[#2f3437]">Topic Trends — Phase 10</p>
        <p className="text-sm text-[#2f3437]/50 mt-1">Aggregated after the pattern library (Phase 6) has enough data.</p>
      </div>
    </div>
  );
}
