import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import prisma from "@/lib/prisma";

export const metadata = { title: "Swipe File" };

export default async function SwipeFilePage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  const entries = await prisma.swipeFileEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/intelligence" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Intelligence</Link>
        <h1 className="text-xl font-bold text-[#2f3437] mt-1">Swipe File</h1>
        <p className="text-sm text-[#2f3437]/60 mt-1">Saved videos, titles, and thumbnails for reference</p>
      </div>

      {entries.length === 0 ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">🗂️</p>
          <p className="font-semibold text-[#2f3437]">Swipe file is empty</p>
          <p className="text-sm text-[#2f3437]/50 mt-1">Save interesting videos from the Outlier Feed and Run Reports here.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl divide-y divide-[#2f3437]/6">
          {entries.map((e) => (
            <div key={e.id} className="p-4 flex items-start gap-3">
              {e.thumbnailUrl && (
                <img src={e.thumbnailUrl} alt={e.title} className="w-24 h-14 object-cover rounded shrink-0" />
              )}
              <div>
                <p className="text-sm font-semibold text-[#2f3437]">{e.title}</p>
                {e.notes && <p className="text-xs text-[#2f3437]/50 mt-0.5">{e.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
