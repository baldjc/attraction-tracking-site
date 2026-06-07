"use client";

import PageHeader from "@/components/PageHeader";
import MyWorkLibrary from "@/components/my-work/MyWorkLibrary";

export default function MyWorkPage() {
  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        emoji="📁"
        title="My Work"
        description="Everything you've created, all in one place."
      />
      <MyWorkLibrary />
    </div>
  );
}
