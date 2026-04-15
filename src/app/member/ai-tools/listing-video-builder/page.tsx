"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ListingVideoBuilderTool from "@/components/ai-tools/ListingVideoBuilderTool";

export default function ListingVideoBuilderPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [calendarEnabled, setCalendarEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/admin/feature-visibility")
      .then((r) => r.json())
      .then((flags) => {
        if (flags?.tool_listing_video_builder === false) {
          router.replace("/member/ai-tools");
        }
        setCalendarEnabled(flags?.content_calendar !== false);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <ListingVideoBuilderTool basePath="/member/ai-tools" calendarEnabled={calendarEnabled} />
    </div>
  );
}
