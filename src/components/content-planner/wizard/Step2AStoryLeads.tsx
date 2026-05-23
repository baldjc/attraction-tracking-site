"use client";

/**
 * Wave 2 wizard — Step 2A: Story Lead browser.
 *
 * Fetches the user's latest validated upload's MarketStoryLead rows from
 * /api/member/content-planner/wizard/story-leads and renders them as
 * cards. "Use this Lead" → Step 3 with ?storyLeadId=<id> pinned.
 */
import { useEffect, useState } from "react";
import Link from "next/link";

interface StoryLead {
  id: string;
  scanType: number;
  pattern: string;
  dataThreads: unknown;
  whyItMatters: string;
  suggestedRotationSlot: string | null;
  suggestedSubPersonas: unknown;
  suggestedFramework: string | null;
  tactileType: string | null;
  label: string | null;
  isThesisLead: boolean;
}

interface Response {
  upload: { id: string; monthYear: string; label: string } | null;
  leads: StoryLead[];
  error?: string;
}

export function Step2AStoryLeads() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/member/content-planner/wizard/story-leads");
        const j = (await r.json()) as Response;
        if (cancelled) return;
        if (!r.ok) {
          setError(j.error ?? `Request failed (${r.status})`);
        } else {
          setData(j);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        Loading your Story Leads…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
        Couldn&apos;t load Story Leads: {error}
      </div>
    );
  }

  if (!data?.leads.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
        Your latest upload doesn&apos;t have any Story Leads yet. Try a different
        starting mode, or re-run validation on your latest month.
        <div className="mt-4">
          <Link
            href="/member/content-planner/wizard?step=1"
            className="text-blue-600 hover:underline"
          >
            Back to mode picker
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {data.upload && (
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          From your <span className="font-medium">{data.upload.label}</span>{" "}
          upload ({data.upload.monthYear}). {data.leads.length} lead(s).
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data.leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}

function LeadCard({ lead }: { lead: StoryLead }) {
  const threads = parseStringList(lead.dataThreads);
  const personas = parseStringList(lead.suggestedSubPersonas);
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {lead.label || lead.pattern.split(".")[0].slice(0, 80)}
        </h3>
        {lead.isThesisLead && (
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
            Thesis
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
        {lead.pattern}
      </p>
      <p className="mt-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Why it matters
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {lead.whyItMatters}
      </p>
      {threads.length > 0 && (
        <>
          <p className="mt-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Data threads
          </p>
          <ul className="list-inside list-disc text-sm text-gray-700 dark:text-gray-300">
            {threads.slice(0, 4).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {lead.suggestedRotationSlot && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {lead.suggestedRotationSlot}
          </span>
        )}
        {lead.suggestedFramework && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {lead.suggestedFramework}
          </span>
        )}
        {lead.tactileType && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {lead.tactileType}
          </span>
        )}
        {personas.slice(0, 3).map((p) => (
          <span
            key={p}
            className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
          >
            {p}
          </span>
        ))}
      </div>
      <div className="mt-5">
        <Link
          href={`/member/content-planner/wizard?step=3&storyLeadId=${lead.id}`}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Use this Lead →
        </Link>
      </div>
    </div>
  );
}

function parseStringList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string");
  }
  return [];
}
