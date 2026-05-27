"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AcademyHome from "@/components/AcademyHome";
import AcademyTabs from "@/components/AcademyTabs";
import PageHeader from "@/components/PageHeader";

function AcademyContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  if (tab) {
    return (
      <>
        <PageHeader
          emoji="🎓"
          title="Academy"
          description="Master the system that turns viewers into clients."
        />
        <AcademyTabs routePath="/member/academy" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        emoji="🎓"
        title="Academy"
        description="Master the system that turns viewers into clients."
      />
      <AcademyHome />
    </>
  );
}

export default function AcademyPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse bg-[var(--abv-bg)] dark:bg-[#1a2433] rounded-xl" />}>
      <AcademyContent />
    </Suspense>
  );
}
