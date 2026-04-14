"use client";

import { useState, useEffect } from "react";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import ContentPlannerClient from "./ContentPlannerClient";
import PageHeader from "@/components/PageHeader";

const PRODUCTION_TIERS = ["editing_2", "editing_4", "mastery_2", "mastery_4", "done_with_you"];

export default function ContentPlannerWrapper() {
  const [serviceTier, setServiceTier] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/member/content-plans")
      .then((r) => r.json())
      .then((data) => {
        if (data.serviceTier) setServiceTier(data.serviceTier);
        else setServiceTier("foundations");
      })
      .catch(() => setServiceTier("foundations"));
  }, []);

  if (!serviceTier) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#6ba3c7] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!PRODUCTION_TIERS.includes(serviceTier)) {
    return (
      <div className="space-y-5 pb-10">
        <PageHeader
          emoji="📅"
          title="Content Planner"
          description="Manage your video production pipeline."
        />
        <div className="bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg p-10 text-center">
          <CalendarDaysIcon className="w-10 h-10 text-[#6ba3c7]/40 mx-auto mb-3" />
          <p className="font-medium text-[#2f3437] dark:text-[#e2e8f0] mb-2">Content Planner</p>
          <p className="text-sm text-[#2f3437]/60 dark:text-[#94a3b8]">
            The Content Planner is available for Production, Growth, and Done-With-You members. It&apos;s where you&apos;ll manage your video pipeline once you&apos;re actively creating content.
          </p>
        </div>
      </div>
    );
  }

  return <ContentPlannerClient serviceTier={serviceTier} />;
}
