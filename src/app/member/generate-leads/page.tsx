"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import CampaignsPage from "@/app/member/campaigns/page";
import AnalyticsPage from "@/app/member/analytics/page";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

interface TrainingSection {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  lessonCount: number;
  completedCount: number;
}

function TrainingTab({ sections, loading, pct, onSwitchTab }: {
  sections: TrainingSection[];
  loading: boolean;
  pct: number;
  onSwitchTab: (tab: string) => void;
}) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-[#eaeaea] dark:bg-white/10 rounded-xl" />
        ))}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-12 text-center">
        <div className="text-4xl mb-3">🚀</div>
        <h2 className="font-semibold text-[#2f3437] dark:text-white mb-2">Training modules are on the way</h2>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/50 mb-4">
          We&apos;re building training content to help you turn viewers into leads. In the meantime, you can start setting up campaigns to track your content performance.
        </p>
        <button
          onClick={() => onSwitchTab("campaigns")}
          className="inline-flex items-center gap-2 bg-[#6ba3c7] text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-[#5490b5] transition-colors"
        >
          Explore Campaigns →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const sectionPct = section.lessonCount > 0
          ? Math.round((section.completedCount / section.lessonCount) * 100)
          : 0;
        const complete = sectionPct === 100;

        return (
          <Link
            key={section.id}
            href={`/member/generate-leads/training/${section.slug}`}
            className="group bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-xl p-5 flex items-start gap-4 hover:border-[#6ba3c7]/40 hover:shadow-sm transition-all"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
              complete
                ? "bg-green-100 dark:bg-green-900/30"
                : sectionPct > 0
                ? "bg-[#6ba3c7]/10"
                : "bg-[#f7f6f3] dark:bg-white/5"
            }`}>
              {complete ? (
                <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <span className="text-sm font-bold text-[#2f3437]/40 dark:text-white/40">
                  {section.lessonCount}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[#2f3437] dark:text-white group-hover:text-[#6ba3c7] transition-colors">
                    {section.title}
                  </h3>
                  {section.description && (
                    <p className="text-sm text-[#2f3437]/50 dark:text-white/50 mt-0.5 line-clamp-2">
                      {section.description}
                    </p>
                  )}
                </div>
                <span className="text-xs font-medium text-[#2f3437]/40 dark:text-white/40 shrink-0 mt-0.5">
                  {section.completedCount}/{section.lessonCount} lessons
                </span>
              </div>
              {section.lessonCount > 0 && (
                <div className="mt-3 h-1.5 bg-[#eaeaea] dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${complete ? "bg-green-500" : "bg-[#6ba3c7]"}`}
                    style={{ width: `${sectionPct}%` }}
                  />
                </div>
              )}
            </div>
          </Link>
        );
      })}

      {pct === 100 && (
        <div className="bg-[#6ba3c7]/5 dark:bg-[#6ba3c7]/10 border border-[#6ba3c7]/20 rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <h3 className="font-semibold text-[#2f3437] dark:text-white mb-1">Training Complete!</h3>
          <p className="text-sm text-[#2f3437]/60 dark:text-[#94a3b8] mb-4">
            Now put it into practice — set up your first campaign to start tracking results.
          </p>
          <button
            onClick={() => onSwitchTab("campaigns")}
            className="inline-flex items-center gap-2 bg-[#6ba3c7] text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-[#5490b5] transition-colors"
          >
            Set Up Your First Campaign →
          </button>
        </div>
      )}
    </div>
  );
}

function GenerateLeadsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("section") ?? "campaigns";

  const [sections, setSections] = useState<TrainingSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [hasCampaigns, setHasCampaigns] = useState(false);
  const [campaignsLoading, setCampaignsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/generate-leads/training/sections")
      .then((r) => r.ok ? r.json() : { sections: [] })
      .then((d) => setSections(d.sections ?? []))
      .catch(() => setSections([]))
      .finally(() => setSectionsLoading(false));

    fetch("/api/campaigns")
      .then((r) => r.ok ? r.json() : { campaigns: [] })
      .then((d) => setHasCampaigns((d.campaigns ?? d ?? []).length > 0))
      .catch(() => setHasCampaigns(false))
      .finally(() => setCampaignsLoading(false));
  }, []);

  const switchTab = useCallback((tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", tab);
    router.push(`/member/generate-leads?${params.toString()}`);
  }, [router, searchParams]);

  const totalLessons = sections.reduce((s, sec) => s + sec.lessonCount, 0);
  const completedLessons = sections.reduce((s, sec) => s + sec.completedCount, 0);
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const showHeroCard = !sectionsLoading && !campaignsLoading;

  return (
    <div>
      <PageHeader
        emoji="🚀"
        title="Generate Leads"
        description="Turn every video into a lead machine."
      />

      {/* Hero card — 4 states */}
      {showHeroCard && !hasCampaigns && (
        pct === 0 ? (
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-6 mb-6">
            <h2 className="text-lg font-bold text-[#2f3437] dark:text-[#e2e8f0] mb-2">Welcome to Generate Leads</h2>
            <p className="text-sm text-[#2f3437]/60 dark:text-[#94a3b8] mb-5">
              This is where your content starts converting into real business. We recommend starting with the training to understand how lead generation works, but you can jump into campaigns anytime.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => switchTab("training")}
                className="inline-flex items-center justify-center gap-2 bg-[#6ba3c7] text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-[#5490b5] transition-colors"
              >
                📚 Start with Training
              </button>
              <button
                onClick={() => switchTab("campaigns")}
                className="inline-flex items-center justify-center gap-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] text-[#2f3437] dark:text-[#e2e8f0] rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-[#222] transition-colors"
              >
                🚀 Jump into Campaigns
              </button>
            </div>
          </div>
        ) : pct === 100 ? (
          <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 rounded-xl p-6 mb-6 text-center">
            <div className="text-3xl mb-2">🎉</div>
            <h3 className="font-semibold text-[#2f3437] dark:text-[#e2e8f0] mb-1">Training Complete!</h3>
            <p className="text-sm text-[#2f3437]/60 dark:text-[#94a3b8] mb-4">
              You&apos;ve learned how lead generation works. Now put it into practice.
            </p>
            <button
              onClick={() => switchTab("campaigns")}
              className="inline-flex items-center gap-2 bg-[#6ba3c7] text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-[#5490b5] transition-colors"
            >
              Set Up Your First Campaign →
            </button>
          </div>
        ) : (
          <div className="bg-[#6ba3c7]/5 dark:bg-[#6ba3c7]/10 border border-[#6ba3c7]/20 rounded-lg px-5 py-3 mb-6 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-[#2f3437] dark:text-[#e2e8f0]">
                Training Progress: {pct}%
              </span>
            </div>
            <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shrink-0">
              <div className="h-full bg-[#6ba3c7] rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[#2f3437]/10 dark:border-white/10 mb-6">
        {["campaigns", "training"].map((tab) => (
          <button
            key={tab}
            onClick={() => switchTab(tab)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors capitalize ${
              activeTab === tab
                ? "border-[#6ba3c7] text-[#6ba3c7]"
                : "border-transparent text-[#2f3437]/50 dark:text-white/50 hover:text-[#2f3437] dark:hover:text-white"
            }`}
          >
            {tab === "training" ? "Training" : "Campaigns"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "training" ? (
        <TrainingTab
          sections={sections}
          loading={sectionsLoading}
          pct={pct}
          onSwitchTab={switchTab}
        />
      ) : (
        <div>
          <CampaignsPage />
          <div className="mt-8">
            <AnalyticsPage />
          </div>
        </div>
      )}
    </div>
  );
}

export default function GenerateLeadsPage() {
  return (
    <Suspense fallback={
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-[#eaeaea] dark:bg-white/10 rounded w-1/3" />
        <div className="h-4 bg-[#eaeaea] dark:bg-white/10 rounded w-1/2" />
      </div>
    }>
      <GenerateLeadsPageInner />
    </Suspense>
  );
}
