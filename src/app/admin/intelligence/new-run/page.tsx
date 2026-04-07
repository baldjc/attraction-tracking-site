import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";

export const metadata = { title: "New Intelligence Run" };

export default async function NewRunPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/intelligence" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437] flex items-center gap-1">
          ← Intelligence
        </Link>
      </div>
      <h1 className="text-xl font-bold text-[#2f3437] mb-2">New Intelligence Run</h1>
      <p className="text-sm text-[#2f3437]/60 mb-8">
        Paste a YouTube channel URL to run a full channel intelligence report.
      </p>
      <div className="bg-white border border-[#2f3437]/10 rounded-xl p-8 text-center">
        <p className="text-3xl mb-3">🔬</p>
        <p className="font-semibold text-[#2f3437] mb-1">Coming in Phase 8</p>
        <p className="text-sm text-[#2f3437]/50">
          Auto Channel Intelligence Runs — channel resolve, outlier detection, Claude analysis, strategic report.
        </p>
      </div>
    </div>
  );
}
