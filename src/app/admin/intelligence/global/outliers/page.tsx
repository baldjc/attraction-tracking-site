import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import prisma from "@/lib/prisma";

export const metadata = { title: "Outlier Feed" };

export default async function OutlierFeedPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  const outliers = await prisma.intelVideo.findMany({
    where: { isOutlier: true },
    orderBy: { outlierMultiple: "desc" },
    take: 50,
    include: { channel: { select: { title: true, handle: true } } },
  });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/intelligence" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Intelligence</Link>
        <h1 className="text-xl font-bold text-[#2f3437] mt-1">Global Outlier Feed</h1>
        <p className="text-sm text-[#2f3437]/60 mt-1">Top-performing videos (≥2.5× channel median) across all tracked channels</p>
      </div>

      {outliers.length === 0 ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">🚀</p>
          <p className="font-semibold text-[#2f3437]">No outliers yet</p>
          <p className="text-sm text-[#2f3437]/50 mt-1">
            Outliers are identified after running channel intelligence on synced channels.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl divide-y divide-[#2f3437]/6">
          {outliers.map((v) => (
            <div key={v.id} className="p-4 flex items-start gap-4">
              {v.thumbnailUrl && (
                <img src={v.thumbnailUrl} alt={v.title} className="w-28 h-16 object-cover rounded-md shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={`https://youtube.com/watch?v=${v.ytVideoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-[#2f3437] hover:text-[#6ba3c7] line-clamp-2"
                >
                  {v.title}
                </a>
                <p className="text-xs text-[#2f3437]/50 mt-1">
                  {v.channel.handle ?? v.channel.title} · {v.views.toLocaleString()} views
                  {v.outlierMultiple != null && (
                    <span className="ml-2 text-green-600 font-semibold">{v.outlierMultiple.toFixed(1)}× median</span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
