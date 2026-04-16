"use client";

import { useState, useEffect, Suspense } from "react";
import ContentPlannerClient from "./ContentPlannerClient";
import ContentPlannerUpgrade from "@/components/ContentPlannerUpgrade";

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
    return <ContentPlannerUpgrade />;
  }

  return (
    <Suspense fallback={null}>
      <ContentPlannerClient serviceTier={serviceTier} />
    </Suspense>
  );
}
