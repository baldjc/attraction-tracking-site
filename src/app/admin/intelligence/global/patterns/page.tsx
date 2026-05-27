import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import prisma from "@/lib/prisma";

export const metadata = { title: "Pattern Library" };

export default async function PatternsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  const [hookPatterns, titlePatterns, thumbnailPatterns, recentAnalyses] = await Promise.all([
    prisma.hookPattern.findMany({ orderBy: { outlierCount: "desc" }, take: 20 }),
    prisma.titlePattern.findMany({ orderBy: { outlierCount: "desc" }, take: 20 }),
    prisma.thumbnailPattern.findMany({ orderBy: { outlierCount: "desc" }, take: 20 }),
    prisma.intelVideoAnalysis.findMany({
      orderBy: { analysedAt: "desc" },
      take: 20,
      include: {
        video: {
          select: {
            title: true,
            ytVideoId: true,
            outlierMultiple: true,
            views: true,
            channel: { select: { title: true, handle: true } },
          },
        },
      },
    }),
  ]);

  const hookTypeCounts = recentAnalyses.reduce((acc, a) => {
    if (a.hookType) acc[a.hookType] = (acc[a.hookType] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const frameworkCounts = recentAnalyses.reduce((acc, a) => {
    if (a.titleFramework) acc[a.titleFramework] = (acc[a.titleFramework] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const getStressThemesFromAnalysis = (a: typeof recentAnalyses[0]): string[] => {
    const pd = a.patternsDetected as any;
    if (pd?.stressThemes && Array.isArray(pd.stressThemes)) return pd.stressThemes as string[];
    return a.stressThemes.map((t) => t.toString());
  };

  const allThemes = recentAnalyses.flatMap(getStressThemesFromAnalysis);
  const themeCounts = allThemes.reduce((acc, t) => { acc[t] = (acc[t] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/intelligence" className="text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]">← Intelligence</Link>
        <h1 className="text-xl font-bold text-[var(--abv-text)] mt-1">Pattern Library</h1>
        <p className="text-sm text-[var(--abv-text)]/60 mt-1">Hook, title, and thumbnail patterns aggregated from global outlier videos</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Hook Patterns (DB)", count: hookPatterns.length, icon: "🎣" },
          { label: "Title Patterns (DB)", count: titlePatterns.length, icon: "✍️" },
          { label: "Thumbnail Patterns (DB)", count: thumbnailPatterns.length, icon: "🖼️" },
          { label: "Analysed Outliers", count: recentAnalyses.length, icon: "🔬" },
          { label: "Hook Types Found", count: Object.keys(hookTypeCounts).length, icon: "🧲" },
          { label: "Title Frameworks", count: Object.keys(frameworkCounts).length, icon: "📐" },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-4 text-center">
            <p className="text-2xl mb-1">{item.icon}</p>
            <p className="text-2xl font-bold text-[var(--abv-text)]">{item.count}</p>
            <p className="text-xs text-[var(--abv-text)]/50 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {recentAnalyses.length === 0 ? (
        <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">📚</p>
          <p className="font-semibold text-[var(--abv-text)]">No analyses yet</p>
          <p className="text-sm text-[var(--abv-text)]/50 mt-1 max-w-sm mx-auto">
            Run channel intelligence on any channel to generate Claude analyses of outlier videos. Patterns will appear here automatically.
          </p>
          <Link href="/admin/intelligence/new-run" className="mt-4 inline-block px-4 py-2 bg-[var(--abv-dark)] text-white text-sm font-semibold rounded-lg hover:bg-black/85">
            Start a Run →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {Object.keys(hookTypeCounts).length > 0 && (
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-[var(--abv-bg)] border-b border-[var(--abv-text)]/8">
                <p className="text-sm font-semibold text-[var(--abv-text)]">🎣 Hook Types in Outliers</p>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {Object.entries(hookTypeCounts).sort(([, a], [, b]) => b - a).map(([hook, count]) => (
                  <div key={hook} className="px-3 py-2 bg-[var(--abv-bg)] rounded-lg border border-[var(--abv-text)]/8 text-sm">
                    <span className="font-semibold text-[var(--abv-text)]">{hook}</span>
                    <span className="ml-1.5 text-[var(--abv-text)]/40 text-xs">{count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(frameworkCounts).length > 0 && (
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-[var(--abv-bg)] border-b border-[var(--abv-text)]/8">
                <p className="text-sm font-semibold text-[var(--abv-text)]">📐 Title Frameworks in Outliers</p>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {Object.entries(frameworkCounts).sort(([, a], [, b]) => b - a).map(([fw, count]) => (
                  <div key={fw} className="px-3 py-2 bg-[var(--abv-bg)] rounded-lg border border-[var(--abv-text)]/8 text-sm">
                    <span className="font-medium text-[var(--abv-text)]">{fw}</span>
                    <span className="ml-1.5 text-[var(--abv-text)]/40 text-xs">{count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(themeCounts).length > 0 && (
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-[var(--abv-bg)] border-b border-[var(--abv-text)]/8">
                <p className="text-sm font-semibold text-[var(--abv-text)]">💥 Stress Themes Driving Outliers</p>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {Object.entries(themeCounts).sort(([, a], [, b]) => b - a).map(([theme, count]) => (
                  <div key={theme} className="px-3 py-2 bg-amber-50 rounded-lg border border-amber-200/60 text-sm">
                    <span className="font-medium text-amber-800">{theme}</span>
                    <span className="ml-1.5 text-amber-500 text-xs">{count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-[var(--abv-bg)] border-b border-[var(--abv-text)]/8">
              <p className="text-sm font-semibold text-[var(--abv-text)]">🔬 Recent Outlier Analyses</p>
            </div>
            <div className="divide-y divide-[var(--abv-text)]/6">
              {recentAnalyses.map((a) => {
                const stressThemes = getStressThemesFromAnalysis(a);
                const pd = a.patternsDetected as any;
                const whyItWorked = pd?.whyItWorked ?? a.whyItWorked;
                return (
                  <div key={a.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <a
                          href={`https://youtube.com/watch?v=${a.video.ytVideoId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-[var(--abv-text)] hover:text-[var(--abv-azure)] line-clamp-1"
                        >
                          {a.video.title}
                        </a>
                        <p className="text-xs text-[var(--abv-text)]/40 mt-0.5">
                          {a.video.channel.handle ?? a.video.channel.title}
                          {a.video.outlierMultiple && (
                            <span className="ml-2 text-green-600 font-semibold">{a.video.outlierMultiple.toFixed(1)}× median</span>
                          )}
                        </p>
                        <div className="flex gap-2 mt-1.5 flex-wrap">
                          {a.hookType && <span className="px-2 py-0.5 bg-[var(--abv-dark)]/10 text-[var(--abv-azure)] text-xs rounded-full">{a.hookType}</span>}
                          {a.titleFramework && <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">{a.titleFramework}</span>}
                          {stressThemes.map((t) => (
                            <span key={t} className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">{t}</span>
                          ))}
                        </div>
                        {whyItWorked && <p className="text-xs text-[var(--abv-text)]/50 mt-1.5 italic line-clamp-2">{whyItWorked}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
