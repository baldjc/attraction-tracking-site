"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StepFooter, StepHeader, WhyBlock, type StepProps } from "./_shared";

/**
 * Step 8 — First content plan.
 *
 * The spec asks us to "reuse the existing Wave 2 idea-generation flow"
 * (content-engine-v2 → idea cards → save as ContentPlan). That pipeline is
 * non-trivial to inline (multi-stage with AiThinking + rotation_slot picker
 * + cited-fact selector) and embedding it here would duplicate a lot of
 * /member/content-planner. To honour the spec's intent without rebuilding
 * that UI, we surface the six video types as cards and hand off to the
 * existing planner — the member picks a type, lands on the planner, and
 * the planner's idea-generation flow does the heavy lifting. Once they save
 * a plan there, they come back here (or click Continue to skip ahead).
 *
 * Trade-off vs. spec: we DON'T directly call content-engine-v2 from the
 * wizard, and we DON'T draw the loading state inline. Surfacing those would
 * require lifting big chunks of /member/content-planner into a wizard-safe
 * embed. Called out in the final report so Jared can decide whether to
 * invest in a true inline flow.
 */
export default function Step8FirstPlan({ onContinue, onSkip }: StepProps) {
  const [picked, setPicked] = useState<string | null>(null);
  // null = still checking; true/false once the status poll resolves. The
  // member can now reach this step while their CSV is still validating (the
  // market-data step is non-blocking), so we must not assume facts exist.
  const [factsReady, setFactsReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/member/market-data/onboarding-status");
        // Any non-OK response (auth/500/etc.) is treated as "not ready" so the
        // degraded path lets the member finish — a status check must never wall
        // off completing onboarding.
        if (!res.ok) {
          if (!cancelled) setFactsReady(false);
          return;
        }
        const data = await res.json();
        if (!cancelled) setFactsReady(!!data?.hasValidatedUpload);
      } catch {
        // Network failure → degrade gracefully, never block completion.
        if (!cancelled) setFactsReady(false);
      }
    }
    check();
    const id = window.setInterval(check, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Degraded path: facts not validated yet. Don't error, don't block — let the
  // member finish onboarding and tell them the briefing is still cooking.
  if (factsReady === false) {
    return (
      <div>
        <StepHeader
          label="Last step — Let's make something"
          title="Let's make something"
          subtitle="You're all set up. One thing is still finishing in the background."
        />
        <div className="mt-5 rounded-xl border border-gray-200 dark:border-gray-800 p-5 bg-stone-50 dark:bg-gray-900/40">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none" aria-hidden>
              ⏳
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Your first data-backed briefing is still generating.
              </p>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                We&rsquo;ll have it on your dashboard shortly. In the meantime,
                here&rsquo;s how the planner works — six video types, each one
                turning your market data into five ready-to-shoot idea cards. As
                soon as your data finishes crunching, your dashboard will show
                your first briefing and you can build from it.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {VIDEO_TYPES.map((vt) => (
            <div
              key={`${vt.slot}-${vt.label}`}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950"
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {vt.label}
              </p>
              <p className="mt-1 text-xs text-gray-500">{vt.hint}</p>
            </div>
          ))}
        </div>

        <StepFooter
          time="Almost done"
          primaryLabel="Take me to my dashboard"
          onPrimary={onContinue}
          onSkip={onSkip}
        />
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        label="Last step — Let's make something"
        title="Let's make something"
        subtitle="Your system is set up. Time to use it."
      />
      <WhyBlock>
        Setup without action is wasted setup. Pick a video type below — your
        content planner will generate five idea cards from your real data, and
        you can save one as your first content plan in about a minute.
      </WhyBlock>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {VIDEO_TYPES.map((vt) => {
          const isPicked = picked === vt.slot;
          return (
            <button
              key={`${vt.slot}-${vt.label}`}
              type="button"
              onClick={() => setPicked(vt.slot)}
              className={[
                "rounded-xl border p-4 text-left transition",
                isPicked
                  ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                  : "border-gray-200 bg-white hover:border-gray-400 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-600",
              ].join(" ")}
            >
              <p className="text-sm font-semibold">{vt.label}</p>
              <p
                className={[
                  "mt-1 text-xs",
                  isPicked
                    ? "text-gray-200 dark:text-gray-700"
                    : "text-gray-500",
                ].join(" ")}
              >
                {vt.hint}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-700 dark:text-gray-300">
        <p>
          Click <strong>Open the planner</strong> below. Your selected video
          type pre-loads. Pick one of the 5 generated ideas, hit save, and
          you&rsquo;re done.
        </p>
      </div>

      <StepFooter
        time="5 minutes"
        primaryLabel="Open the planner"
        primaryDisabled={!picked}
        onPrimary={onContinue}
        onSkip={onSkip}
        extras={
          picked && (
            <Link
              href={`/member/content-planner?onboard=1&slot=${picked}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-gray-300 dark:border-gray-700 px-4 py-2 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Open planner ↗
            </Link>
          )
        }
      />
    </div>
  );
}

const VIDEO_TYPES = [
  {
    slot: "market_update",
    label: "Market Update",
    hint: "Your monthly state-of-the-market.",
  },
  {
    slot: "neighbourhood_fact",
    label: "Neighbourhood Deep-Dive",
    hint: "One area, what the data shows, what it means.",
  },
  {
    slot: "should_you",
    label: "Should You Buy",
    hint: "Argued both ways from the numbers.",
  },
  {
    slot: "do_not",
    label: "Do Not Buy Until…",
    hint: "Pattern-interrupt cautionary tale.",
  },
  {
    slot: "contrarian_take",
    label: "Contrarian Take",
    hint: "The story the headlines are missing.",
  },
  {
    slot: "neighbourhood_fact",
    label: "5 Things About…",
    hint: "List framing, fast pace.",
  },
];
