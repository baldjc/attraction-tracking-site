"use client";

import { useState } from "react";
import Link from "next/link";
import { StepFooter, StepHeader, WhyBlock, type StepProps } from "./_shared";

/**
 * Step 6 — Knowledge Base. Three sub-parts:
 *   6a. Copy Research Brief button (calls the existing brief endpoint).
 *   6b. Manus / Perplexity callout with external links.
 *   6c. Link to the existing KB upload UI (we don't reinline it — the actual
 *       upload UI is complex and lives on /member/knowledge-base).
 *
 * KB upload is recommended, not required → Continue is always enabled.
 */
export default function Step6KnowledgeBase({ onContinue, onSkip, stepLabel }: StepProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copyBrief() {
    setCopyError(null);
    try {
      const res = await fetch("/api/member/knowledge-base/research-brief");
      if (!res.ok) throw new Error("Could not load research brief.");
      const data = await res.json();
      const text =
        typeof data?.brief === "string"
          ? data.brief
          : typeof data?.text === "string"
            ? data.text
            : null;
      if (!text) throw new Error("Research brief is empty.");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      setCopyError((e as Error).message);
    }
  }

  return (
    <div>
      <StepHeader
        label={stepLabel ? `${stepLabel} — Your neighbourhood research` : "Your neighbourhood research"}
        title="Your neighbourhood research"
        subtitle="The hyper-local context that makes scripts feel like you've walked every block."
      />
      <WhyBlock>
        Your market has dozens or hundreds of neighbourhoods. Generic
        &ldquo;NW Calgary&rdquo; descriptions don&rsquo;t move buyers.
        Specific descriptions — typical floor plan, school catchment,
        demographic, recent development — do. We hand you a research prompt.
        You paste it into an AI tool that can actually do the research. You
        upload the results back. We turn it into structured per-neighbourhood
        profiles every script uses.
      </WhyBlock>

      {/* 6a — Copy Research Brief */}
      <div className="mt-5 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          6a · Copy the Research Brief
        </p>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          One click. Drop the prompt into your AI tool of choice.
        </p>
        <button
          type="button"
          onClick={() => void copyBrief()}
          className="mt-3 rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white dark:bg-white dark:text-gray-900"
        >
          {copied ? "Copied ✓" : "Copy Research Brief"}
        </button>
        {copyError && (
          <p className="mt-2 text-xs text-red-600">{copyError}</p>
        )}
      </div>

      {/* 6b — Manus / Perplexity callout */}
      <div className="mt-4 rounded-xl border border-[var(--abv-azure)] bg-[var(--abv-azure-tint)] p-5">
        <p className="text-sm font-semibold text-[var(--abv-ink)] dark:text-white">
          Strongly recommend Manus AI or Perplexity
        </p>
        <p className="mt-2 text-sm text-[var(--abv-ink)] dark:text-white">
          Both can pull real-time web sources, cite their data, and produce the
          long-form structured output we need. Claude or ChatGPT can do this
          too, but their answers tend to be thinner without the web-search
          step.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <strong>Manus AI →</strong>{" "}
            <a
              href="https://manus.im"
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 dark:text-blue-300 underline underline-offset-2"
            >
              manus.im
            </a>
          </li>
          <li>
            <strong>Perplexity →</strong>{" "}
            <a
              href="https://perplexity.ai"
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 dark:text-blue-300 underline underline-offset-2"
            >
              perplexity.ai
            </a>
          </li>
        </ul>
        <p className="mt-3 text-xs text-blue-800 dark:text-blue-300">
          Either one: paste the research brief, let it work for 20-40 minutes,
          then copy the full response or download as markdown.
        </p>
      </div>

      {/* 6c — Upload the results (link out) */}
      <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          6c · Upload the results
        </p>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          Paste markdown or upload a .md / .txt / .docx / .pdf on the
          Knowledge Base page. Comes back here when you&rsquo;re done — or
          continue now and upload later.
        </p>
        <Link
          href="/member/knowledge-base"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-700 px-5 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Open Knowledge Base
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

      <StepFooter
        time="10 minutes in setup. Plan another 30-60 minutes in your research AI."
        onPrimary={onContinue}
        onSkip={onSkip}
      />
    </div>
  );
}
