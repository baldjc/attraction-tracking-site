"use client";

import { Suspense } from "react";
import PageHeader from "@/components/PageHeader";
import CampaignsPage from "@/app/member/campaigns/page";
import AnalyticsPage from "@/app/member/analytics/page";

function GenerateLeadsPageInner() {
  return (
    <div>
      <PageHeader
        emoji="🚀"
        title="Generate Leads"
        description="Turn every video into a lead machine."
      />

      <CampaignsPage />
      <div className="mt-8">
        <AnalyticsPage />
      </div>
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
