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
    <div className="mb-5 flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
      <span className="text-blue-500">📋</span>
      <p className="text-sm text-blue-700 flex-1">
        Linked to: <strong>{planTitle || "your content plan"}</strong>
      </p>
      <Link
        href={`/member/content-planner?plan=${planId}`}
        className="shrink-0 text-xs font-semibold text-blue-600 underline hover:no-underline"
      >
        View plan →
      </Link>
    </div>
  );
}
