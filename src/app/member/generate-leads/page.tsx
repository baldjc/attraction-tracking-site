"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircleIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";
import PageHeader from "@/components/PageHeader";
import CampaignsPage from "@/app/member/campaigns/page";
import AnalyticsPage from "@/app/member/analytics/page";

interface Section {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  lessonCount: number;
  completedCount: number;
}

const TABS = [
  { id: "training", label: "How To Generate Leads" },
  { id: "campaigns", label: "Campaigns" },
  { id: "analytics", label: "Lead Analytics" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function TrainingTab() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/generate-leads/training/sections")
      .then((r) => r.json())
      .then((d) => setSections(d.sections ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-[#eaeaea] dark:bg-white/10 rounded-lg" />
        ))}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-12 text-center">
        <div className="text-4xl mb-3">🚀</div>
        <h2 className="font-semibold text-[#2f3437] dark:text-white mb-2">Training coming soon</h2>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/50">
          Lead generation training modules will appear here once published.
        </p>
      </div>
    );
  }

  const totalLessons = sections.reduce((sum, s) => sum + s.lessonCount, 0);
  const totalCompleted = sections.reduce((sum, s) => sum + s.completedCount, 0);
  const pct = totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Progress summary */}
      {totalLessons > 0 && (
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-[#2f3437] dark:text-white">Overall Progress</span>
            <span className="text-sm font-bold text-[#6ba3c7]">{pct}%</span>
          </div>
          <div className="h-2 bg-[#eaeaea] dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#6ba3c7] rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-[#2f3437]/50 dark:text-white/50 mt-2">
            {totalCompleted} of {totalLessons} lessons completed
          </p>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-3">
        {sections.map((section) => {
          const sectionPct = section.lessonCount > 0
            ? Math.round((section.completedCount / section.lessonCount) * 100)
            : 0;
          return (
            <Link
              key={section.id}
              href={`/member/generate-leads/training/${section.slug}`}
              className="block bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-5 hover:border-[#6ba3c7]/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[#2f3437] dark:text-white group-hover:text-[#6ba3c7] transition-colors">
                    {section.title}
                  </h3>
                  {section.description && (
                    <p className="text-sm text-[#2f3437]/50 dark:text-white/50 mt-1 line-clamp-2">
                      {section.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex-1 h-1.5 bg-[#eaeaea] dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#6ba3c7] rounded-full transition-all"
                        style={{ width: `${sectionPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-[#2f3437]/50 dark:text-white/50 shrink-0">
                      {section.completedCount}/{section.lessonCount}
                    </span>
                  </div>
                </div>
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  sectionPct === 100
                    ? "border-green-500 bg-green-500"
                    : sectionPct > 0
                    ? "border-[#6ba3c7] bg-[#6ba3c7]/10"
                    : "border-[#2f3437]/20 dark:border-white/20"
                }`}>
                  {sectionPct === 100 ? (
                    <CheckCircleIcon className="w-5 h-5 text-white" />
                  ) : (
                    <span className={`text-xs font-bold ${sectionPct > 0 ? "text-[#6ba3c7]" : "text-[#2f3437]/40 dark:text-white/40"}`}>
                      {sectionPct}%
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function GenerateLeadsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sectionParam = searchParams.get("section");
  const activeTab: TabId =
    sectionParam === "campaigns" ? "campaigns"
    : sectionParam === "analytics" ? "analytics"
    : "training";

  function switchTab(id: TabId) {
    const url = new URL(window.location.href);
    if (id === "training") {
      url.searchParams.delete("section");
    } else {
      url.searchParams.set("section", id);
    }
    router.push(url.pathname + url.search);
  }

  return (
    <div>
      <PageHeader
        icon={RocketLaunchIcon}
        title="Generate Leads"
        description="Turn every video into a lead machine."
        colour="#E63946"
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-[#111]/5 dark:bg-white/5 rounded-lg p-1 w-fit overflow-x-auto scrollbar-hide mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-white dark:bg-[#1a1a1a] text-[#2f3437] dark:text-white shadow-sm"
                : "text-[#2f3437]/50 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "training" && <TrainingTab />}
      {activeTab === "campaigns" && <CampaignsPage />}
      {activeTab === "analytics" && <AnalyticsPage />}
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
