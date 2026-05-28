"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Props {
  planId: string;
}

export default function LinkedPlanBanner({ planId }: Props) {
  const [planTitle, setPlanTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/member/content-plans/${planId}`)
      .then((r) => r.json())
      .then((d) => { if (d?.plan?.title) setPlanTitle(d.plan.title); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [planId]);

  if (loading) return null;

  return (
    <div
      className="mb-5 flex items-center gap-3 rounded-lg border px-4 py-3"
      style={{
        borderColor: "var(--abv-azure)",
        background: "var(--abv-azure-tint)",
      }}
    >
      <span aria-hidden="true">📋</span>
      <p className="text-sm flex-1 text-[var(--abv-ink)] dark:text-white">
        Linked to: <strong>{planTitle || "your content plan"}</strong>
      </p>
      <Link
        href={`/member/content-planner?plan=${planId}`}
        className="shrink-0 text-xs font-semibold underline hover:no-underline text-[var(--abv-ink)] dark:text-white"
      >
        View plan →
      </Link>
    </div>
  );
}
