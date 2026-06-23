import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import {
  getMarketConfigForUser,
  getMaxUploadBatchForUser,
} from "@/lib/market-config-server";
import UploadPanel from "@/components/market-data/UploadPanel";
import UploadHistoryTable from "@/components/market-data/UploadHistoryTable";
import UploadProgressBanner from "@/components/market-data/UploadProgressBanner";
import CsvRulesCard from "@/components/market-data/CsvRulesCard";
import MarketSetupCard from "@/components/market-data/MarketSetupCard";
import MethodologySettings from "@/components/market-data/MethodologySettings";

export const dynamic = "force-dynamic";

export default async function MarketDataPage() {
  const user = await resolveUserFromSession();
  if (!user) redirect("/login");

  const flags = await getFeatureFlags({
    userId: user.id,
    userRole: user.role,
  });
  if (!flags.tool_market_data) redirect("/member/dashboard");

  const config = await getMarketConfigForUser(user.id);
  if (!config) redirect("/member/market-data/setup");

  const { limit: maxUploadBatch } = await getMaxUploadBatchForUser(user.id);

  const uploadsRaw = await prisma.marketDataUpload.findMany({
    where: { userId: user.id },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      label: true,
      monthYear: true,
      csvFileName: true,
      rowCount: true,
      status: true,
      uploadedAt: true,
      validationError: true,
      nextAttemptAt: true,
      // Wave 6a — two-phase readiness. On the instant-cutover path `status`
      // flips to `validated` (numbers ready) while `storyStatus` tracks the
      // separate AI story-leads pass. Without these on the initial server
      // render, a row mid-generation arrives with no storyStatus, so the table
      // mis-renders "0 facts · 0 leads" and (worse) treats the row as settled
      // and stops polling. Flag OFF ⇒ storyStatus stays `not_started`, so the
      // mapping below omits these keys and parity is byte-identical.
      storyStatus: true,
      storyError: true,
      _count: {
        select: {
          facts: true,
          storyLeads: true,
        },
      },
    },
  });

  // Lightweight companion query: which uploads have stored validator output.
  // We deliberately DON'T select rawValidatorOutput in the main query above —
  // it's a large blob — so we fetch just the ids of rows that have it and build
  // a Set. Drives the "re-trying persistence only (no cost)" Regenerate copy.
  const withRawRows = await prisma.marketDataUpload.findMany({
    where: { userId: user.id, NOT: { rawValidatorOutput: null } },
    select: { id: true },
  });
  const withRawSet = new Set(withRawRows.map((r) => r.id));

  const uploads = uploadsRaw.map(({ _count, storyStatus, storyError, ...rest }) => ({
    ...rest,
    factCount: _count.facts,
    storyLeadCount: _count.storyLeads,
    hasValidatorOutput: withRawSet.has(rest.id),
    // Wave 6a — only surface the two-phase story fields once the instant-cutover
    // path has actually engaged them. With the flag OFF storyStatus is always
    // "not_started", so these keys are omitted entirely and the initial payload
    // stays byte-identical to before (strict parity), matching the list endpoint.
    ...(storyStatus && storyStatus !== "not_started"
      ? { storyStatus, storyError }
      : {}),
  }));

  const hasColumnMapping =
    !!config.columnMapping &&
    Object.keys(config.columnMapping).length > 0;

  const hasStatusMapping =
    !!config.statusMapping &&
    typeof config.statusMapping === "object" &&
    Object.keys(config.statusMapping as Record<string, unknown>).length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Market Data
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {config.marketName} · {config.mlsSource}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <a
            href="/member/market-data/setup"
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            Edit market settings
          </a>
          <a
            href="/market-data-template.csv"
            download="market-data-template.csv"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400"
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
        </div>
      </header>

      <UploadProgressBanner
        uploads={uploads.map((u) => ({ id: u.id, status: u.status }))}
      />

      <CsvRulesCard />

      <MarketSetupCard
        hasColumnMapping={hasColumnMapping}
        hasStatusMapping={hasStatusMapping}
      />

      <UploadPanel
        existingMapping={config.columnMapping}
        hasColumnMapping={hasColumnMapping}
        maxUploadBatch={maxUploadBatch}
      />

      <section>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
          Upload history
        </h2>
        <UploadHistoryTable
          isAdmin={user.isAdmin}
          initial={uploads.map((u) => ({
            ...u,
            uploadedAt: u.uploadedAt.toISOString(),
            nextAttemptAt: u.nextAttemptAt?.toISOString() ?? null,
          }))}
        />
      </section>

      <MethodologySettings />
    </div>
  );
}
