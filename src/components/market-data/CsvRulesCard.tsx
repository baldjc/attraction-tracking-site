"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "mdv_rules_dismissed";

export default function CsvRulesCard() {
  // Default to expanded; useEffect reads localStorage after mount to avoid
  // an SSR/CSR mismatch (localStorage isn't available during SSR).
  const [expanded, setExpanded] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY) === "true";
      if (dismissed) setExpanded(false);
    } catch {
      // localStorage unavailable (private mode etc.) — fall through to default
    }
    setHydrated(true);
  }, []);

  function toggle() {
    setExpanded((v) => !v);
  }

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore — UI still collapses for this session
    }
    setExpanded(false);
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls="mdv-rules-body"
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full"
          style={{ background: "var(--abv-azure-tint)", color: "var(--abv-ink)" }}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v.5a.75.75 0 01-1.5 0v-.5zm0 3.25a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4z"
            />
          </svg>
        </span>
        <span className="flex-1 text-base font-bold text-gray-900 dark:text-gray-100">
          Before you upload — what makes a CSV work
        </span>
        <svg
          className={`h-5 w-5 flex-none text-gray-400 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M7.21 4.47a.75.75 0 011.06 0l5 5a.75.75 0 010 1.06l-5 5a.75.75 0 11-1.06-1.06L11.69 10 7.21 5.53a.75.75 0 010-1.06z"
          />
        </svg>
      </button>

      {hydrated && expanded && (
        <div
          id="mdv-rules-body"
          className="border-t border-gray-100 px-5 py-4 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300"
        >
          <div className="grid gap-5 sm:grid-cols-3">
            <RuleColumn
              title="Required"
              subtitle="Uploads fail without these"
              dotClass="bg-red-500"
              headingClass="text-red-700 dark:text-red-300"
              items={[
                "One calendar month per file",
                "CSV with a header row in row 1",
                "Columns present (names matched flexibly): Status, Property Type, Sale Price, List Price, Days on Market, Neighbourhood, Sale Date",
                "Neighbourhood values are area NAMES (e.g. Crystallina Nera, Windermere) — not MLS zone numbers or area codes",
                "Status values are words (Sold, Closed, Active, Pending, Expired, Withdrawn, Terminated) — not codes (S, C, A)",
                "One row per property listing",
              ]}
            />
            <RuleColumn
              title="Strongly recommended"
              subtitle="Avoid edge cases"
              dotClass="bg-amber-400"
              headingClass="text-amber-700 dark:text-amber-300"
              items={[
                "Floor Area / SqFt — powers price-per-sqft and the appreciation vs. mix-shift check; without it, price-growth claims get downgraded",
                "Year Built — unlocks by-decade neighbourhood breakdowns",
                "Property Type values use full words (Detached, Semi-Detached, Row/Townhouse, Apartment) not abbreviations (DET, TH, APT)",
                "Dates in ISO format (2026-05-15) or month-first (5/15/2026), consistent across the file",
                "Price columns are plain numbers (no $ signs in cells)",
                "File under 25,000 rows",
                "Same export source each month — switching mid-stream changes column names and breaks validation",
              ]}
            />
            <RuleColumn
              title="Nice to know"
              subtitle="Background context"
              dotClass="bg-emerald-500"
              headingClass="text-emerald-700 dark:text-emerald-300"
              items={[
                "UTF-8 encoded (default for most exports)",
                "No Excel formulas in cells (paste-as-values before export)",
                "Backfill window: Foundations = 13 months, Growth + DWY = 25 months",
              ]}
            />
          </div>

          <div
            className="mt-5 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40"
          >
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Your MLS may name these differently — that&apos;s fine
            </p>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              Real MLS exports often use their own header names, and the system
              matches them flexibly. You do <strong>not</strong> have to rename
              your columns — the column mapper auto-matches them, and you can
              confirm or adjust in{" "}
              <span className="font-medium">Edit column mapping</span>. For
              example, a real NTREIS export maps cleanly:
            </p>
            <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-2 dark:text-gray-400">
              {[
                ["Close Price", "Sale Price"],
                ["Original List Price", "List Price"],
                ["Close Date", "Sale Date"],
                ["Property Sub Type", "Property Type"],
                ["Subdivision Name", "Neighbourhood"],
                ["CDOM", "Days on Market"],
                ["Close-List Price Ratio", "Sale-to-List Ratio"],
                ["Baths Total", "Bathrooms"],
                ["ML #", "MLS #"],
              ].map(([from, to]) => (
                <li key={from} className="flex items-center gap-1.5">
                  <code className="rounded bg-gray-200 px-1 py-0.5 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                    {from}
                  </code>
                  <span aria-hidden="true">→</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {to}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <a
              href="/market-data-template.csv"
              download="market-data-template.csv"
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 2a.75.75 0 01.75.75v8.69l2.72-2.72a.75.75 0 111.06 1.06l-4 4a.75.75 0 01-1.06 0l-4-4a.75.75 0 111.06-1.06l2.72 2.72V2.75A.75.75 0 0110 2z" />
                <path d="M3.5 13.25a.75.75 0 01.75.75v1.5c0 .414.336.75.75.75h10a.75.75 0 00.75-.75v-1.5a.75.75 0 011.5 0v1.5A2.25 2.25 0 0115 17.75H5a2.25 2.25 0 01-2.25-2.25v-1.5a.75.75 0 01.75-.75z" />
              </svg>
              Download example CSV
            </a>
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
            >
              Got it, hide this
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function RuleColumn({
  title,
  subtitle,
  items,
  dotClass,
  headingClass,
}: {
  title: string;
  subtitle: string;
  items: string[];
  dotClass: string;
  headingClass: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-block h-2.5 w-2.5 rounded-sm ${dotClass}`}
        />
        <h3
          className={`text-sm font-semibold uppercase tracking-wide ${headingClass}`}
        >
          {title}
        </h3>
      </div>
      <p className="ml-4.5 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        {subtitle}
      </p>
      <ul className="mt-2 space-y-1.5 pl-4">
        {items.map((it, i) => (
          <li
            key={i}
            className="list-disc text-sm text-gray-700 dark:text-gray-300"
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
