import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import prisma from "@/lib/prisma";

export const metadata = { title: "Topic Trends" };

export default async function TrendsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  const analyses = await prisma.intelVideoAnalysis.findMany({
    orderBy: { analysedAt: "desc" },
    take: 200,
    select: {
      hookType: true,
      titleFramework: true,
      stressThemes: true,
      patternsDetected: true,
      analysedAt: true,
      video: { select: { views: true, publishedAt: true, outlierMultiple: true } },
    },
  });

  const getThemesFromAnalysis = (a: typeof analyses[0]): string[] => {
    const pd = a.patternsDetected as any;
    if (pd?.stressThemes && Array.isArray(pd.stressThemes)) return pd.stressThemes as string[];
    return a.stressThemes.map((t) => t.toString());
  };

  const allThemes = analyses.flatMap(getThemesFromAnalysis);
  const themeCounts = allThemes.reduce((acc, t) => { acc[t] = (acc[t] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  const allHooks = analyses.map((a) => a.hookType).filter(Boolean) as string[];
  const hookCounts = allHooks.reduce((acc, h) => { acc[h] = (acc[h] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  const allFrameworks = analyses.map((a) => a.titleFramework).filter(Boolean) as string[];
  const frameworkCounts = allFrameworks.reduce((acc, f) => { acc[f] = (acc[f] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  const sortedThemes = Object.entries(themeCounts).sort(([, a], [, b]) => b - a);
  const sortedHooks = Object.entries(hookCounts).sort(([, a], [, b]) => b - a);
  const sortedFrameworks = Object.entries(frameworkCounts).sort(([, a], [, b]) => b - a);

  const maxTheme = sortedThemes[0]?.[1] ?? 1;
  const maxHook = sortedHooks[0]?.[1] ?? 1;
  const maxFramework = sortedFrameworks[0]?.[1] ?? 1;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/intelligence" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Intelligence</Link>
        <h1 className="text-xl font-bold text-[#2f3437] mt-1">Topic Trends</h1>
        <p className="text-sm text-[#2f3437]/60 mt-1">Rising topics and hook patterns across all tracked channels ({analyses.length} outlier analyses)</p>
      </div>

      {analyses.length === 0 ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">📈</p>
          <p className="font-semibold text-[#2f3437]">No trend data yet</p>
          <p className="text-sm text-[#2f3437]/50 mt-1">Run channel intelligence on competitor channels to see topic trends emerge.</p>
          <Link href="/admin/intelligence/new-run" className="mt-4 inline-block px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg hover:bg-[#5490b5]">
            Start a Run →
          </Link>
        </div>
      ) : (
        <div className="grid gap-6">
          {sortedThemes.length > 0 && (
            <div className="bg-white border border-[#2f3437]/10 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-[#f7f6f3] border-b border-[#2f3437]/8">
                <p className="text-sm font-semibold text-[#2f3437]">💥 Stress Themes — Frequency in Outliers</p>
              </div>
              <div className="p-4 space-y-2.5">
                {sortedThemes.map(([theme, count]) => (
                  <div key={theme}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm text-[#2f3437]">{theme}</span>
                      <span className="text-xs font-semibold text-[#2f3437]/50">{count} videos</span>
                    </div>
                    <div className="h-2 bg-[#f7f6f3] rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(count / maxTheme) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sortedHooks.length > 0 && (
            <div className="bg-white border border-[#2f3437]/10 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-[#f7f6f3] border-b border-[#2f3437]/8">
                <p className="text-sm font-semibold text-[#2f3437]">🎣 Hook Types — Frequency in Outliers</p>
              </div>
              <div className="p-4 space-y-2.5">
                {sortedHooks.map(([hook, count]) => (
                  <div key={hook}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm text-[#2f3437]">{hook}</span>
                      <span className="text-xs font-semibold text-[#2f3437]/50">{count} videos</span>
                    </div>
                    <div className="h-2 bg-[#f7f6f3] rounded-full overflow-hidden">
                      <div className="h-full bg-[#6ba3c7] rounded-full" style={{ width: `${(count / maxHook) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sortedFrameworks.length > 0 && (
            <div className="bg-white border border-[#2f3437]/10 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-[#f7f6f3] border-b border-[#2f3437]/8">
                <p className="text-sm font-semibold text-[#2f3437]">📐 Title Frameworks — Frequency in Outliers</p>
              </div>
              <div className="p-4 space-y-2.5">
                {sortedFrameworks.map(([framework, count]) => (
                  <div key={framework}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm text-[#2f3437]">{framework}</span>
                      <span className="text-xs font-semibold text-[#2f3437]/50">{count} videos</span>
                    </div>
                    <div className="h-2 bg-[#f7f6f3] rounded-full overflow-hidden">
                      <div className="h-full bg-purple-400 rounded-full" style={{ width: `${(count / maxFramework) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
