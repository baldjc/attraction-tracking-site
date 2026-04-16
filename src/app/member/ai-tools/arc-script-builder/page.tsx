"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ArcScriptBuilderTool from "@/components/ai-tools/ArcScriptBuilderTool";
import ScriptHistoryPanel from "@/components/ai-tools/ScriptHistoryPanel";
import LinkedPlanBanner from "@/components/ai-tools/LinkedPlanBanner";

function ArcScriptBuilderPageContent() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId") ?? undefined;

  return (
    <div className="max-w-2xl mx-auto">
      <ScriptHistoryPanel />
      {planId && <LinkedPlanBanner planId={planId} />}
      <ArcScriptBuilderTool basePath="/member/ai-tools" defaultPlanId={planId} />
    </div>
  );
}

export default function MemberArcScriptBuilderPage() {
  return (
    <Suspense fallback={null}>
      <ArcScriptBuilderPageContent />
    </Suspense>
  );
}
