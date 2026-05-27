"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { marketDataMonths, type TierCohort } from "@/lib/onboarding-tier";
import { StepFooter, StepHeader, WhyBlock, type StepProps } from "./_shared";

interface UploadStatus {
  hasValidatedUpload: boolean;
  factCount?: number;
  neighbourhoodCount?: number;
}

/**
 * Step 2 — Market data. Tier-aware copy (12 vs 24 months). We don't embed the
 * CSV uploader here (the existing UploadPanel is a complex multi-stage form
 * tightly coupled to /member/market-data/setup) — instead we link out to the
 * setup page in a new tab and poll for validated upload status so the
 * Continue button enables as soon as the upload + validation completes.
 */
export default function Step2MarketData({ onContinue, onSkip, cohort }: StepProps) {
  const months = marketDataMonths(cohort);
  const [status, setStatus] = useState<UploadStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/member/market-data/onboarding-status");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        /* ignore */
      }
    }
    check();
    const id = window.setInterval(check, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const long = cohort === "Growth" || cohort === "DWY";

  return (
    <div>
      <StepHeader
        label={`Step 1 of ${long ? "7" : "6"} — Your market data`}
        title="Your market data"
        subtitle="The CSV from your MLS. Pillar 9, Realist, whatever you use."
      />
      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        {long ? (
          <>
            Export the last <strong>{months} months</strong> of sales from your
            MLS. The longer window means we can show year-over-year trajectory
            across neighbourhoods, which lets your scripts speak to where the
            market is heading, not just where it sits today. Drag the file in
            on the setup page.
          </>
        ) : (
          <>
            Export the last <strong>{months} months</strong> of sales from your
            MLS. Drag the file in on the setup page. We handle the rest.
          </>
        )}
      </p>

      <WhyBlock>
        This is the foundation of everything. Every script we generate uses
        your actual sales data, not guesses. Without this, every video you
        make is just another opinion piece.
      </WhyBlock>

      <div className="mt-5 rounded-xl border border-gray-200 dark:border-gray-800 p-5 bg-stone-50 dark:bg-gray-900/40">
        {status?.hasValidatedUpload ? (
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">✓</span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {(status.factCount ?? 0).toLocaleString()} sales loaded
                {status.neighbourhoodCount
                  ? `. ${status.neighbourhoodCount} neighbourhoods detected.`
                  : "."}
              </p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                You can edit, re-upload, or add another month any time from{" "}
                <Link
                  href="/member/market-data/setup"
                  className="underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  market data setup
                </Link>
                .
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Open the setup page in a new tab, drop in your CSV, and come
              back. The button below will light up automatically once the
              upload finishes validating.
            </p>
            <Link
              href="/member/market-data/setup"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2 text-xs font-semibold text-white dark:bg-white dark:text-gray-900"
            >
              Open market data setup
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-3 w-3"
              >
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </Link>
          </div>
        )}
      </div>

      <StepFooter
        time="5-7 minutes (we do the heavy lifting)"
        primaryDisabled={!status?.hasValidatedUpload}
        onPrimary={onContinue}
        onSkip={onSkip}
      />
    </div>
  );
}
